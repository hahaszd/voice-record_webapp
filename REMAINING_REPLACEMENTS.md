# Remaining Text Replacements for script.js

## To be replaced manually or in batch:

### Error Messages
```javascript
Line ~472: '麦克风权限未授予，无法开始录音' 
→ 'Microphone permission required'

Line ~1234, 1241: '音频文件太大 (...) MB)，超过限制 (25 MB)。请尝试转录更短的片段。'
→ 'Audio file too large (...MB). Limit: 25MB. Try shorter duration.'

Line ~1366-1367: '转录失败'
→ 'Transcription failed'

Line ~1366: '错误: '
→ 'Error: '
```

### Alert/User Messages  
```javascript
alert('没有可用的音频数据');
→ alert('No audio data available');

alert('没有符合条件的音频数据');
→ alert('No matching audio data');
```

### These can be done via find and replace all:
- 转录失败 → Transcription failed
- 错误 → Error  
- 没有可用的音频数据 → No audio data available
- 没有符合条件的音频数据 → No matching audio data
- 音频文件太大 → Audio file too large
- 超过限制 → Limit exceeded
- 请尝试转录更短的片段 → Try shorter duration
