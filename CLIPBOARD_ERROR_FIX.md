# 🔧 剪贴板错误修复说明

## 📋 问题描述

用户在 console 中发现了以下错误：

```
[ERROR] ❌ Pending auto-copy failed: Failed to execute 'writeText' on 'Clipboard': Document is not focused.

[WARNING] Clipboard API failed, trying fallback method: Failed to execute 'writeText' on 'Clipboard': Document is not focused.

[ERROR] Auto-copy fallback failed
```

## 🔍 问题根源

### 问题 1：页面激活时的自动复制失败

**发生场景**：
1. 用户在另一个App中
2. 网站在后台完成转录
3. 用户切换回网站
4. `visibilitychange` 事件触发
5. 尝试复制 `pendingAutoCopyText`
6. **失败原因**：页面虽然可见，但还未完全获得焦点

**原代码问题**：
```javascript
// 页面变为可见时立即尝试复制
if (!document.hidden && pendingAutoCopyText) {
    navigator.clipboard.writeText(textToCopy).then(...)
}
```

### 问题 2：转录完成后的自动复制失败

**发生场景**：
1. 转录完成
2. 尝试自动复制文本到剪贴板
3. **失败原因**：页面可能刚失去焦点（用户点击了通知、切换了App等）

**原代码问题**：
```javascript
// 转录完成后立即复制
await navigator.clipboard.writeText(result.text);
```

## ✅ 解决方案

### 修复 1：延迟复制，等待页面获得焦点

**修改位置**：`visibilitychange` 事件监听器

**新逻辑**：
```javascript
if (!document.hidden && pendingAutoCopyText) {
    const textToCopy = pendingAutoCopyText;
    pendingAutoCopyText = null;
    
    // 延迟500ms，等待页面完全激活
    setTimeout(() => {
        // 再次检查页面是否仍然可见
        if (document.hidden) {
            pendingAutoCopyText = textToCopy; // 恢复待复制文本
            return;
        }
        
        // 尝试复制
        navigator.clipboard.writeText(textToCopy)
            .then(...)
            .catch(err => {
                // 不再恢复文本，避免无限重试
                console.warn('[WARNING] ⚠️ Pending auto-copy failed');
            });
    }, 500);
}
```

**改进点**：
1. ✅ 延迟500ms，给页面时间获得焦点
2. ✅ 二次检查页面可见性
3. ✅ 失败后不恢复文本（避免无限重试）
4. ✅ 错误级别从 `ERROR` 降为 `WARNING`

### 修复 2：智能检测焦点丢失

**修改位置**：转录完成后的自动复制逻辑

**新逻辑**：
```javascript
if (autoCopyToggle.checked) {
    if (document.hidden) {
        // 页面不可见，存储待复制文本
        pendingAutoCopyText = result.text;
    } else {
        // 延迟300ms，确保页面有焦点
        setTimeout(async () => {
            try {
                await navigator.clipboard.writeText(result.text);
                console.log('[INFO] ✅ Auto-copy successful');
                // 显示成功提示
            } catch (err) {
                // 检查是否是焦点问题
                if (err.message.includes('Document is not focused')) {
                    console.warn('[WARNING] ⚠️ Auto-copy failed (document not focused)');
                    // 存储为待复制文本，等用户激活页面时重试
                    pendingAutoCopyText = result.text;
                    return;
                }
                
                // 尝试 fallback 方法
                try {
                    // textarea + execCommand('copy')
                } catch (fallbackErr) {
                    console.warn('[WARNING] ⚠️ Auto-copy failed (user can copy manually)');
                    // 不显示错误提示
                }
            }
        }, 300);
    }
}
```

**改进点**：
1. ✅ 延迟300ms，给页面时间稳定
2. ✅ 检测 "Document is not focused" 错误
3. ✅ 焦点丢失时自动存储为 `pendingAutoCopyText`
4. ✅ 降级错误提示（`ERROR` → `WARNING`）
5. ✅ 失败时不显示红色错误提示（用户可手动复制）

## 📊 错误级别调整

### 之前
```
[ERROR] ❌ Pending auto-copy failed
[ERROR] Auto-copy fallback failed
```

### 现在
```
[WARNING] ⚠️ Pending auto-copy failed (document may not be focused)
[WARNING] ⚠️ Auto-copy failed (user can copy manually)
```

**为什么降级？**
- 这不是应用程序错误
- 这是浏览器安全限制导致的预期行为
- 用户仍然可以手动点击复制按钮
- 不应该用红色 `ERROR` 惊吓用户

## 🎯 用户体验改进

### 场景 1：后台完成转录

**之前**：
1. 用户切换回App
2. 看到红色错误
3. 担心出问题了 ❌

**现在**：
1. 用户切换回App
2. 延迟500ms后自动复制
3. 如果仍然失败，下次激活页面时再试
4. 最坏情况：用户手动点击复制按钮 ✅

### 场景 2：刚完成转录但焦点丢失

**之前**：
1. 转录完成
2. 弹出通知（焦点转移到通知）
3. 自动复制失败，显示错误 ❌

**现在**：
1. 转录完成
2. 弹出通知（焦点转移）
3. 检测到焦点丢失
4. 自动存储为 `pendingAutoCopyText`
5. 用户点击通知返回页面
6. 自动复制成功 ✅

## 🧪 测试场景

### 测试 1：后台转录

1. 开始录音
2. 立即切换到另一个App（让页面进入后台）
3. 等待转录完成（后台）
4. 切换回网站
5. **预期**：500ms后自动复制成功，没有错误

### 测试 2：转录完成时收到通知

1. 开始录音
2. 停止录音
3. 转录过程中故意让页面失去焦点（点击地址栏等）
4. 转录完成
5. **预期**：文本存储为待复制，下次激活页面时自动复制

### 测试 3：快速切换

1. 开始录音
2. 快速切换到另一个App再切回来
3. 重复几次
4. **预期**：不应该有任何错误日志

## 📝 技术细节

### 为什么使用 setTimeout？

**浏览器事件顺序**：
```
visibilitychange (页面可见)
  ↓
焦点恢复 (focus)
  ↓
完全激活
```

`visibilitychange` 触发时，页面可见但可能还没获得焦点。延迟让浏览器有时间完成焦点恢复。

### 为什么是 500ms 和 300ms？

- **500ms**（页面激活）：移动端切换App较慢，需要更长时间
- **300ms**（转录完成）：页面已经激活，只需短暂延迟

这些是经验值，平衡了用户体验和成功率。

### 为什么不无限重试？

如果用户真的拒绝了剪贴板权限，或者设备不支持，无限重试会：
- 产生大量日志
- 消耗性能
- 让用户困惑

更好的策略是：
1. 尝试一次
2. 失败则存储为待复制
3. 下次激活页面时再试一次
4. 仍然失败就放弃，用户可手动复制

## 🔍 调试信息

### 成功的日志
```
[INFO] ✨ Page became visible, attempting pending auto-copy
[INFO] ✅✅✅ Pending auto-copy successful after page became visible
```

### 失败的日志（新的友好版本）
```
[WARNING] ⚠️ Pending auto-copy failed (document may not be focused)
[WARNING] ⚠️ Auto-copy failed (document not focused), will retry when page gains focus
[WARNING] ⚠️ Auto-copy failed (user can copy manually)
```

### 如何区分

- `[INFO]`：正常操作
- `[WARNING]`：预期的失败（浏览器限制）
- `[ERROR]`：真正的错误（需要修复）

## ✅ 部署信息

- **版本**：v53
- **Commit**：`08c0baf`
- **分支**：`dev`
- **部署时间**：2026-02-04
- **修改文件**：
  - `static/script.js`（自动复制逻辑）
  - `static/index.html`（版本号 v52 → v53）

---

## 🎉 总结

### 修复前
- ❌ 频繁的 `[ERROR]` 日志
- ❌ 红色错误提示
- ❌ 用户担心应用出问题

### 修复后
- ✅ 智能延迟，等待焦点
- ✅ 友好的 `[WARNING]` 日志
- ✅ 自动重试机制
- ✅ 失败时不显示错误提示
- ✅ 更好的用户体验

**关键改进**：
1. 从 "错误" 变成 "预期行为"
2. 从 "失败" 变成 "稍后重试"
3. 从 "显示错误" 变成 "静默处理"
