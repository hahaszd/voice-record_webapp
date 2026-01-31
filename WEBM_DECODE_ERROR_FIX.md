# WebM 解码错误修复文档

## 问题描述

录音86分钟后停止时出现以下错误：
- `Unable to decode audio data` - Web Audio API 解码失败
- `500 Internal Server Error` - 转录 API 返回服务器错误
- 提示 "WebM 格式可能不被 API 完全支持，或文件结构损坏"

## 根本原因

在之前的内存泄漏修复中，为了防止内存无限增长，在 `ondataavailable` 事件处理器中实现了内存清理机制：

```javascript
// script.js:505 (旧代码)
allChunks = allChunks.slice(toRemove); // 裁剪掉旧的chunks
```

然后在 `stopRecording` 中，从裁剪后的 `allChunks` 创建 `finalRecordingBlob`：

```javascript
// script.js:592 (旧代码)
finalRecordingBlob = new Blob(allChunks, { type: recordedMimeType });
```

**问题**：WebM 格式的音频文件必须以头部信息开始。当 `allChunks` 被裁剪后，最初包含 WebM 头部的 chunks 被删除，导致生成的 blob 缺少头部信息，因此无法被解码。

## 解决方案

### 1. 修改 `audio-storage.js` - 返回完整的 chunk 对象

修改 `getAllChunks()` 方法，返回包含 timestamp 的完整对象，而不仅仅是 Blob 数据：

```javascript
// 返回: [{timestamp, data, type, size}, ...]
async getAllChunks() {
    // ...
    const allChunks = sortedData.map(item => ({
        timestamp: item.timestamp,
        data: new Blob([item.data], { type: item.type }),
        type: item.type,
        size: item.size
    }));
    return allChunks;
}
```

### 2. 修改 `audio-storage.js` - 优化 `cleanupOldChunks`

使用 `Date.now()` 作为基准来计算 cutoff 时间，并**始终保留第一个 chunk**（包含 WebM 头部）：

```javascript
async cleanupOldChunks(recordingStartTime) {
    const currentTime = Date.now();
    const elapsed = currentTime - recordingStartTime;
    const cutoffTime = Math.max(0, elapsed - this.maxDuration);
    
    // 始终保留第一个 chunk（包含 WebM 头部）
    const firstChunkTimestamp = sortedData[0].timestamp;
    const toDelete = sortedData.filter(item => 
        item.timestamp < cutoffTime && item.timestamp !== firstChunkTimestamp
    );
    // ...
}
```

### 3. 修改 `script.js` - 移除 `finalRecordingBlob`

移除全局变量 `finalRecordingBlob`，改为使用 `firstRecordedChunk` 来保存第一个 chunk：

```javascript
// 旧代码
let finalRecordingBlob = null; // ❌ 删除

// 新代码
let firstRecordedChunk = null; // ✅ 保存第一个 chunk（WebM 头部）
```

### 4. 修改 `script.js` - 在 `ondataavailable` 中保存第一个 chunk

```javascript
mediaRecorder.ondataavailable = async (event) => {
    if (event.data.size > 0) {
        // 保存第一个 chunk 到全局变量
        if (!firstRecordedChunk) {
            firstRecordedChunk = event.data;
            console.log(`[INFO] 保存第一个chunk（WebM头部）`);
        }
        
        // 内存清理时保留第一个 chunk
        if (elapsed > maxRecordingDuration) {
            const maxChunks = Math.ceil(maxRecordingDuration / 1000);
            if (allChunks.length > maxChunks + 1) { // +1 for the first chunk
                allChunks = [firstRecordedChunk, ...allChunks.slice(toRemove + 1)];
            }
        }
    }
};
```

### 5. 修改 `script.js` - 重构 `generateAndPlayAudio`

始终从 IndexedDB 获取 chunks，并确保包含第一个 chunk（WebM 头部）：

```javascript
async function generateAndPlayAudio(requestedDuration = 10) {
    // 从 IndexedDB 获取所有 chunks（包含 timestamp）
    const allChunksFromDB = await audioStorage.getAllChunks();
    
    // 计算时间窗口
    const currentElapsed = Date.now() - recordingStartTime;
    const cutoffTime = Math.max(0, currentElapsed - effectiveDurationMs);
    
    // 构建音频 blob，确保包含第一个 chunk（WebM 头部）
    const firstChunk = allChunksFromDB[0];
    const recentChunks = allChunksFromDB.filter(chunk => chunk.timestamp >= cutoffTime);
    
    if (recentChunks[0].timestamp !== firstChunk.timestamp) {
        chunksToUse = [firstChunk, ...recentChunks];
    } else {
        chunksToUse = recentChunks;
    }
    
    const audioBlob = new Blob(chunksToUse.map(c => c.data), { type: recordedMimeType });
    
    // 验证 WebM 格式完整性
    const audioContext = new AudioContext();
    const audioBuffer = await audioContext.decodeAudioData(await audioBlob.arrayBuffer());
    await audioContext.close();
    
    // 继续处理和转录...
}
```

## 关键修复点总结

1. **IndexedDB 保留策略**：始终保留第一个 chunk，即使它超过了 5 分钟限制
2. **内存清理策略**：在内存中也保留第一个 chunk 的引用
3. **Blob 构建策略**：从 IndexedDB 获取 chunks 时，确保第一个 chunk 总是包含在最终的 blob 中
4. **格式验证**：在转录前使用 Web Audio API 解码验证 WebM 格式的完整性

## 预期效果

- ✅ 长时间录音（如 86 分钟）后停止不再报错
- ✅ 生成的 WebM blob 格式完整，可以被 Web Audio API 解码
- ✅ 转录 API 能够成功处理音频文件
- ✅ 内存使用保持在合理范围内（最多保留 5 分钟 + 第一个 chunk）
- ✅ IndexedDB 存储也保持在合理范围内（5 分钟滚动窗口 + 第一个 chunk）

## 测试建议

1. 录音超过 5 分钟后停止，检查是否能成功转录
2. 录音 1-2 小时后停止，检查内存使用和转录功能
3. 多次录音和停止，验证第一个 chunk 的保留逻辑
4. 在浏览器开发者工具中监控内存使用和 IndexedDB 存储大小

## 修改的文件

- `d:\Cursor voice record web\static\audio-storage.js`
  - `getAllChunks()` - 返回完整对象
  - `cleanupOldChunks()` - 优化清理逻辑
  - `startCleanupTimer()` - 更新参数传递

- `d:\Cursor voice record web\static\script.js`
  - 全局变量：移除 `finalRecordingBlob`，添加 `firstRecordedChunk`
  - `ondataavailable` - 保存第一个 chunk
  - `startRecording()` - 清空 `firstRecordedChunk`
  - `stopRecording()` - 移除创建 `finalRecordingBlob` 的逻辑
  - `generateAndPlayAudio()` - 完全重构，从 IndexedDB 获取并确保 WebM 头部完整性
