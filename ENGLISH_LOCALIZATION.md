# English Localization Changes for script.js

## User-facing Text Updates (v21)

### Button Text
```javascript
// Recording button
"开始录音" → "Record"
"转录" → "Transcribe"  
"取消录音" → "Cancel"

// Copy button  
"复制" → "Copy"
```

### Status Messages
```javascript
// Ready state
"准备就绪" → "Ready"

// Recording states
"正在录音中..." → "Recording..."
"录音中（仅保留最后5分钟）..." → "Recording (5min max)..."

// Transcription states
"正在转录中... ⏳" → "Transcribing... ⏳"

// Placeholder
"录音完成后，点击右侧按钮进行转录..." → "Start recording, then click Transcribe..."
"正在转录..." → "Transcribing..."
```

### Notification Dialog
```javascript
"开启转录完成提醒？" → "Enable Completion Notifications?"
"当您切换到其他标签页时，我们会在转录完成后发送浏览器通知提醒您，避免您错过转录结果。" 
→ "Receive browser notifications when transcription completes, even when you're on another tab."

"暂不需要" → "Not Now"
"开启提醒" → "Enable"
```

### Browser Notification
```javascript
"🎤 转录完成" → "🎤 Transcription Complete"
"您的转录已完成，点击查看结果" → "Your transcript is ready. Click to view."
```

### Warning Messages
```javascript
"转录任务进行中，请稍等转录完成再点击转录" 
→ "Transcription in progress. Please wait..."

"内存使用过高，建议停止录音" 
→ "High memory usage. Consider stopping."
```

### Error Messages  
```javascript
"麦克风权限未授予，无法开始录音" 
→ "Microphone permission required"

"音频文件太大 (...) MB)，超过限制 (25 MB)。请尝试转录更短的片段。"
→ "Audio file too large (...MB). Limit is 25MB. Try shorter duration."

"转录失败" → "Transcription failed"
"错误" → "Error"
```

### Console Logs (Keep in English or Chinese - Developer only)
No changes needed - these are for developers

---

## Icon/Emoji Usage

### Existing Icons (Keep)
- 🎤 Microphone
- 📋 Clipboard/Copy
- 🔔 Bell/Notification
- 🔁 Loop/Repeat (Auto-record)
- 🎙️ Microphone source
- 🔊 System audio
- 🎵 Mixed audio
- ⏱️ Duration/Time
- ✕ Cancel/Close
- ⏳ Hourglass/Processing

### Additional Icons to Consider
- ⏹️ Stop button
- ⏸️ Pause button
- ▶️ Play button
- 📁 File/Save
- 🌐 Language/Global
- ⚙️ Settings
- ℹ️ Information
- ⚠️ Warning
- ✓ Success/Check
- 📊 Statistics
