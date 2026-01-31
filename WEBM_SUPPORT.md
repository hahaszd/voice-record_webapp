# WebM 格式支持说明

## OpenAI Whisper API 对 WebM 的支持

根据 OpenAI 官方文档，**Whisper API 完全支持 WebM 格式**。

### 支持的音频格式

OpenAI Whisper API 支持以下格式：
- **mp3**
- **mp4**
- **mpeg**
- **mpga**
- **m4a**
- **wav**
- **webm** ✅

### 文件限制

- **最大文件大小**: 25 MB
- **必须直接上传文件**: API 不接受音频文件的链接

## WebM 格式说明

### WebM 音频编码

WebM 容器可以包含不同的音频编码：
- **Opus** (推荐，高质量)
- **Vorbis**
- **PCM** (较少使用)

### MediaRecorder API 生成的 WebM

浏览器 `MediaRecorder` API 通常生成：
- **容器**: WebM
- **音频编码**: Opus
- **MIME 类型**: `audio/webm` 或 `audio/webm;codecs=opus`

## 问题诊断

如果遇到 WebM 文件转录失败，可能的原因：

1. **文件编码问题**
   - WebM 文件可能使用了不常见的编码
   - 某些浏览器生成的 WebM 可能有兼容性问题

2. **文件损坏**
   - 录音过程中断可能导致文件不完整
   - 网络传输问题可能导致文件损坏

3. **API 服务器问题**
   - 临时服务器故障
   - API 版本或配置问题

## 解决方案

### 方案1: 使用正确的 MIME 类型

确保使用正确的 Content-Type：

```python
# 正确的 WebM MIME 类型
content_type = 'audio/webm'  # 或 'audio/webm;codecs=opus'
```

### 方案2: 在浏览器中转换格式

如果 WebM 解码失败，可以在浏览器中转换为 WAV：

```javascript
// 使用 Web Audio API 将 WebM 转换为 WAV
async function convertWebMToWAV(webmBlob) {
    const arrayBuffer = await webmBlob.arrayBuffer();
    const audioContext = new AudioContext();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    return audioBufferToWav(audioBuffer);
}
```

### 方案3: 使用 Google Speech-to-Text API

Google Speech-to-Text API 也支持 WebM，可以作为备选方案：

```python
# Google Speech-to-Text 支持 WebM
# 使用 /speech-to-text 端点
```

### 方案4: 服务器端格式转换

如果需要，可以在服务器端使用 ffmpeg 转换格式：

```python
import subprocess

def convert_webm_to_wav(webm_path, wav_path):
    subprocess.run([
        'ffmpeg', '-i', webm_path,
        '-ar', '16000',  # 采样率
        '-ac', '1',      # 单声道
        wav_path
    ])
```

## 代码示例

### Python: 使用 OpenAI Whisper API 转录音频

```python
from openai import OpenAI

client = OpenAI()

# WebM 文件可以直接使用
with open("audio.webm", "rb") as audio_file:
    transcription = client.audio.transcriptions.create(
        model="whisper-1",
        file=audio_file
    )
    print(transcription.text)
```

### JavaScript: 使用 MediaRecorder 录制 WebM

```javascript
// 开始录音
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
const mediaRecorder = new MediaRecorder(stream, {
    mimeType: 'audio/webm;codecs=opus'
});

mediaRecorder.start();
// ... 录音逻辑
mediaRecorder.stop();
```

## 最佳实践

1. **使用标准编码**
   - 优先使用 Opus 编码的 WebM
   - 确保采样率和声道数合理

2. **文件完整性检查**
   - 确保文件完整上传
   - 检查文件大小是否合理

3. **错误处理**
   - 捕获并记录详细的错误信息
   - 提供备选方案（如格式转换）

4. **测试不同浏览器**
   - Chrome/Edge: 通常支持最好
   - Firefox: 支持良好
   - Safari: 可能使用不同格式（MP4）

## 参考资料

- [OpenAI Whisper API 文档](https://platform.openai.com/docs/guides/speech-to-text)
- [OpenAI Audio API 参考](https://platform.openai.com/docs/api-reference/audio)
- [MediaRecorder API 文档](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)
