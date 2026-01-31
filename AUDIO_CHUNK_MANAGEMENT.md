# 音频块管理功能说明

## 功能概述

当录音时长超过60秒时，系统会自动清理旧的音频数据，只保留最后60秒的音频，以节省内存空间。

## 工作原理

### 1. 时间戳跟踪

- 每个音频块（chunk）都有一个时间戳，记录它相对于录音开始的时间
- `chunkTimestamps` 数组与 `audioChunks` 数组一一对应

### 2. 自动清理机制

当录音时长超过60秒时：

1. **计算截止时间**：
   ```javascript
   const cutoffTime = elapsed - maxRecordingDuration; // elapsed - 60秒
   ```

2. **删除旧数据**：
   - 删除所有时间戳 < cutoffTime 的音频块
   - 同时删除对应的时间戳记录

3. **保持数据一致性**：
   - 确保 `audioChunks` 和 `chunkTimestamps` 数组长度始终一致
   - 只保留最后60秒的音频数据

### 3. 日志输出

清理时会输出详细的日志信息：

```
[INFO] 清理了 15 个旧音频块
[INFO] 清理后状态:
  - 保留的音频块数量: 60
  - 保留的音频时长: 60.00秒
  - 保留的数据大小: 850.23 KB
  - 总录音时长: 75.00秒（仅保留最后60秒）
```

## 使用场景示例

### 场景1: 录音30秒
- **总录音时长**: 30秒
- **保留的音频块**: 30个
- **保留的音频时长**: 30秒
- **清理操作**: 无（未超过60秒）

### 场景2: 录音90秒
- **总录音时长**: 90秒（显示在UI上）
- **保留的音频块**: 60个
- **保留的音频时长**: 60秒
- **清理操作**: 自动清理前30秒的数据

### 场景3: 录音30分钟
- **总录音时长**: 30分钟（显示在UI上）
- **保留的音频块**: 60个
- **保留的音频时长**: 60秒
- **清理操作**: 持续清理，只保留最后60秒

## 内存优化

### 优化前
- 录音30分钟：可能占用数MB甚至数十MB内存
- 所有音频数据都保存在内存中

### 优化后
- 录音30分钟：只占用约1MB内存（最后60秒的数据）
- 旧数据被及时清理，释放内存

## 技术细节

### MediaRecorder 配置

```javascript
// 每1秒保存一次数据
mediaRecorder.start(1000);
```

- `start(1000)` 表示每1000毫秒（1秒）触发一次 `ondataavailable` 事件
- 每个chunk大约对应1秒的音频数据
- 这使得时间戳管理更加精确

### 时间戳计算

```javascript
const elapsed = Date.now() - recordingStartTime;
const chunkTimestamp = elapsed;
```

- `elapsed`: 从录音开始到现在经过的时间（毫秒）
- `chunkTimestamp`: 当前chunk的时间戳（相对于录音开始）

### 清理逻辑

```javascript
const cutoffTime = elapsed - maxRecordingDuration; // 60秒前的截止时间

// 删除所有时间戳小于cutoffTime的chunk
while (chunkTimestamps.length > 0 && chunkTimestamps[0] < cutoffTime) {
    audioChunks.shift();
    chunkTimestamps.shift();
    removedCount++;
}
```

## 注意事项

1. **UI显示 vs 实际数据**：
   - UI上显示的是总录音时长（可能很长）
   - 实际内存中只保留最后60秒的数据

2. **转录功能**：
   - 转录时使用的是实际保留的音频数据
   - 如果请求转录最后60秒，会使用保留的60秒数据
   - 如果请求转录最后10秒，会从保留的60秒中截取最后10秒

3. **性能考虑**：
   - 清理操作在每次 `ondataavailable` 事件时执行
   - 由于MediaRecorder每1秒触发一次，清理频率适中
   - 不会影响录音性能

## 调试信息

### 录音停止时的日志

```
[INFO] 录音停止:
  - 总录音时长: 1800.00秒
  - 保留的音频块数量: 60
  - 保留的音频时长: 60.00秒
  - 保留的数据大小: 850.23 KB
```

### 转录开始时的日志

```
[INFO] 音频块数量: 60
[INFO] 录音总时长: 30:00 (1800.00秒)
[INFO] 实际保留的音频时长: 60.00秒
[INFO] 实际保留的数据大小: 850.23 KB
```

## 相关代码

- `static/script.js`: 主要实现文件
- `mediaRecorder.ondataavailable`: 音频块接收和清理逻辑
- `stopRecording()`: 录音停止时的状态记录
