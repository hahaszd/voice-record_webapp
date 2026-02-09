# System Audio Tab Switching Fix - v104

## 问题诊断 🔍

### 用户报告的问题
用户在测试系统音频录制时发现：
1. ✅ 录音开始前说的话被成功录制
2. ❌ 切换到 YouTube 标签页播放视频后，系统音频没有被录制
3. ❌ 切换回录音页面后说的话也没有被录制

### 日志分析
```javascript
[MONITOR] 麦克风: 1.8 %, 系统音频: 22.6 %  // YouTube 播放期间
[MONITOR] 麦克风: 1.6 %, 系统音频: 20.5 %
...
[FOCUS] Window gained focus  // 切换回录音页面
[INFO] MediaRecorder已停止，音频流保持活跃
```

### 根本原因
**浏览器在后台标签页会限制或暂停 MediaRecorder 的录制功能！**

当用户：
1. 在录音页面开始录音
2. **切换到其他标签页**（如 YouTube）
3. 录音页面失去焦点，浏览器可能暂停录制
4. 即使系统音频信号有检测到，实际录制可能已被暂停

## v104 解决方案 ✅

### 1. 实时页面可见性检测增强

**位置：** `script.js` 行 215-254

**改进内容：**
```javascript
let pageHiddenStartTime = null;

document.addEventListener('visibilitychange', () => {
    if (document.hidden && isRecording) {
        pageHiddenStartTime = Date.now();
        console.warn('⚠️ [RECORDING WARNING] Page hidden during recording!');
        console.warn('⚠️ Browser may pause or stop recording when page is in background');
        
        // 显示用户可见的警告
        showBackgroundRecordingWarning();
    } else if (!document.hidden && isRecording) {
        const hiddenDuration = (Date.now() - pageHiddenStartTime) / 1000;
        console.log(`Page visible again after ${hiddenDuration.toFixed(1)}s hidden`);
        console.warn(`⚠️ Recording may have been paused for ${hiddenDuration.toFixed(1)} seconds`);
        
        hideBackgroundRecordingWarning();
    }
});
```

**功能：**
- ✅ 检测页面何时进入后台
- ✅ 记录后台持续时间
- ✅ 显示实时警告提示
- ✅ 在控制台输出详细诊断信息

### 2. 后台录音红色警告条

**位置：** `script.js` 行 256-326

**新增函数：**
```javascript
function showBackgroundRecordingWarning()
function hideBackgroundRecordingWarning()
```

**效果：**
- 🔴 在页面顶部显示红色警告条
- ⚠️ 明确告知用户"Browser may pause recording"
- 📍 提示用户"Keep this tab active"
- 🎨 动画效果：平滑滑入/滑出

**样式：**
- 位置：固定顶部（top: 80px）
- 颜色：#ff6b6b（红色）
- 动画：slideDown 0.3s
- 层级：z-index: 10000

### 3. 系统音频录制提示

**位置：** `script.js` 行 258-326

**新增函数：**
```javascript
function showSystemAudioRecordingTip()
```

**触发时机：**
- 仅在录制系统音频或混合音频时显示
- 每个会话只显示一次
- 录音开始后立即显示

**提示内容：**
```
🎵 System Audio Recording Tips

⚠️ Keep this tab active! Browser may pause recording if you switch tabs.

💡 Recommended workflow:
  • Use split-screen or picture-in-picture mode
  • Or: Play content, then quickly switch back here
```

**交互：**
- "Got it!" 按钮手动关闭
- 10秒后自动淡出消失

### 4. 帮助页面内容更新

**位置：** `script.js` 行 1461-1475

**新增内容：**
```markdown
Q: 如何录制系统音频？

⚠️ 重要：务必勾选"同时分享标签页音频"或"Share tab audio"选项！

🔴 关键限制：录音期间必须保持录音页面激活！

建议操作流程：
1. 在一个标签页打开要录制的内容（如 YouTube 视频）
2. 在另一个标签页打开 VoiceSpark
3. 在 VoiceSpark 中开始录音，选择 YouTube 标签页
4. 使用分屏或画中画模式同时查看两个标签页
5. 或者：先播放内容，再快速切回 VoiceSpark 标签页
```

## 技术细节 📊

### 页面可见性 API

```javascript
// 页面状态
document.hidden // true = 后台, false = 前台

// 事件监听
document.addEventListener('visibilitychange', () => {
    // 检测状态变化
});
```

### 录音状态追踪

```javascript
let pageHiddenStartTime = null;

// 页面隐藏时
pageHiddenStartTime = Date.now();

// 页面恢复时
const hiddenDuration = (Date.now() - pageHiddenStartTime) / 1000;
console.warn(`Recording may have been paused for ${hiddenDuration}s`);
```

## 用户体验改进 🎨

### Before v104
- ❌ 用户不知道切换标签页会影响录音
- ❌ 没有实时警告
- ❌ 录音失败后才发现问题
- ❌ 帮助文档缺少关键信息

### After v104
- ✅ 录音开始时显示明确提示
- ✅ 切换标签页立即显示红色警告
- ✅ 控制台记录详细诊断信息
- ✅ 帮助页面提供完整操作流程
- ✅ 推荐使用分屏/画中画模式

## 建议的使用流程 📝

### 方案 1：分屏模式（推荐）
```
1. Windows 用户：Win + 左/右箭头分屏
2. Mac 用户：拖动窗口到屏幕边缘
3. 一边是 VoiceSpark 录音页面（必须可见）
4. 另一边是 YouTube 播放页面
```

### 方案 2：画中画模式
```
1. YouTube 启用画中画功能
2. VoiceSpark 保持全屏激活
3. 画中画窗口浮动在上方
```

### 方案 3：快速切换
```
1. 播放 YouTube 内容
2. 立即切回 VoiceSpark 标签页
3. 保持在 VoiceSpark 直到录音结束
4. ⚠️ 不要切换回 YouTube 查看进度
```

## 已知限制 ⚠️

### 浏览器行为
- 所有主流浏览器都会限制后台标签页的媒体录制
- 这是浏览器的安全和性能策略，无法完全绕过
- Chrome、Edge、Firefox、Safari 行为一致

### 为什么不能在后台录音？
1. **安全性**：防止恶意网站在后台秘密录音
2. **性能**：降低后台标签页的资源消耗
3. **电池**：节省移动设备电量
4. **隐私**：用户明确知道何时在录音

## 未来可能的改进方向 🚀

### 短期（可实现）
1. ✅ 使用 Screen Capture API 尝试保持录制
2. ✅ 检测到页面隐藏时自动暂停录音
3. ✅ 页面恢复时提示用户重新开始录音

### 长期（需要研究）
1. 🔬 使用 Service Worker 尝试后台录制
2. 🔬 使用 Web Workers 处理音频流
3. 🔬 研究浏览器扩展的可行性

### 不可行的方案
1. ❌ 完全在后台标签页录制（浏览器限制）
2. ❌ 绕过浏览器安全策略（违反规范）

## 测试建议 🧪

### 测试场景 1：分屏模式
```
1. 打开两个浏览器窗口并排
2. 左边：VoiceSpark 录音
3. 右边：YouTube 播放
4. ✅ 预期：录音正常工作
```

### 测试场景 2：标签页切换
```
1. VoiceSpark 开始录音
2. 切换到 YouTube 标签页
3. ⚠️ 应看到红色警告（在切换回来时）
4. ⚠️ 预期：录音可能中断
```

### 测试场景 3：画中画
```
1. YouTube 启用画中画
2. VoiceSpark 保持激活
3. ✅ 预期：录音正常工作
```

## 版本信息 📌

- **版本号：** v104
- **修改日期：** 2026-02-09
- **修改文件：** `static/script.js`
- **影响范围：** 系统音频录制、页面可见性检测、用户提示

## 相关文档 📚

- [Chrome Page Lifecycle API](https://developers.google.com/web/updates/2018/07/page-lifecycle-api)
- [Page Visibility API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)
- [MediaRecorder API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)
- [Screen Capture API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Capture_API)

## 总结 ✨

v104 通过多层次的用户提示和实时警告，明确告知用户系统音频录制的限制和最佳实践。虽然无法完全解决浏览器后台限制问题，但大大提升了用户体验和问题诊断能力。

**关键要点：**
1. 🔴 实时红色警告条
2. 💡 录音开始时的操作提示
3. 📊 详细的控制台诊断日志
4. 📖 完善的帮助文档
5. 💪 推荐分屏/画中画工作流程
