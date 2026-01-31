# WebM 格式支持分析与代码检查

## OpenAI Whisper API 官方文档要点

根据 OpenAI 官方文档（https://platform.openai.com/docs/guides/speech-to-text）：

### 支持的音频格式
OpenAI Whisper API **明确支持**以下格式：
- `mp3`
- `mp4`
- `mpeg`
- `mpga`
- `m4a`
- `wav`
- **`webm`** ✅

### API 请求格式要求

根据官方 API 参考文档（https://platform.openai.com/docs/api-reference/audio/createTranscription）：

1. **字段名**：应该使用 `file`（不是 `audio_file`）
2. **必需参数**：
   - `file`: 音频文件对象
   - `model`: 模型 ID（如 `whisper-1`, `gpt-4o-transcribe` 等）
3. **可选参数**：
   - `language`: 语言代码（ISO-639-1 格式，如 `zh-CN`）
   - `response_format`: 响应格式（`json`, `text`, `srt`, `verbose_json`, `vtt`）
   - `prompt`: 提示文本
   - `temperature`: 采样温度

### 标准请求示例（curl）

```bash
curl https://api.openai.com/v1/audio/transcriptions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: multipart/form-data" \
  -F file="@/path/to/file/audio.mp3" \
  -F model="whisper-1"
```

注意：字段名是 `file`，不是 `audio_file`。

## 当前代码实现检查

### 1. `/transcribe-segment` 端点（server2.py:615-893）

**当前实现**：
```python
files = {
    'audio_file': (filename, audio_content, content_type)  # ❌ 使用 'audio_file'
}

form_data = {
    'language': 'zh-CN'  # ✅ 正确
    # ❌ 缺少 'model' 参数
}
```

**问题**：
1. ❌ 字段名使用了 `audio_file`，而不是标准的 `file`
2. ❌ **缺少必需的 `model` 参数**

### 2. `/speech-to-text-aibuilder` 端点（server2.py:379-510）

**当前实现**：
```python
files = {
    'audio_file': (audio_file.filename, audio_content, audio_file.content_type or 'audio/mpeg')  # ❌ 使用 'audio_file'
}

form_data = {}
if language:
    form_data['language'] = language  # ✅ 正确
# ❌ 缺少 'model' 参数
```

**问题**：
1. ❌ 字段名使用了 `audio_file`，而不是标准的 `file`
2. ❌ **缺少必需的 `model` 参数**

## AI Builder Space API 兼容性分析

AI Builder Space 可能：
1. **使用自己的字段名规范**：如果他们的 API 文档明确要求使用 `audio_file`，那么当前实现是正确的
2. **遵循 OpenAI 标准**：如果他们完全遵循 OpenAI API 规范，那么应该使用 `file` 字段名

**需要确认**：
- AI Builder Space 的 API 文档是否明确要求使用 `audio_file`？
- 是否必须提供 `model` 参数？如果必须，应该使用哪个模型（`whisper-1`？）？

## WebM 格式处理建议

### 当前代码的 WebM 检测逻辑（server2.py:686-703）

```python
elif audio_content[:4] == b'\x1aE\xdf\xa3' or (len(audio_content) > 4 and audio_content[:4] == b'\x1a\x45\xdf\xa3'):
    detected_format = 'WebM'
    content_type = 'audio/webm'
```

**WebM 文件头检测**：
- WebM 文件通常以 `1a 45 df a3` 开头（EBML 标识符）
- 当前检测逻辑是正确的 ✅

### MIME 类型处理

```python
if detected_format == 'WebM':
    log_info["note"] = "WebM 格式已检测到，根据 OpenAI 文档应该被支持"
    if 'codecs' not in content_type.lower():
        content_type = 'audio/webm'  # 保持简单，让 API 自动检测
```

**建议**：
- ✅ 使用简单的 `audio/webm` MIME 类型是正确的
- ✅ 不需要添加 codecs 参数，让 API 自动检测

## 潜在问题与解决方案

### 问题 1: 字段名不匹配

**如果 AI Builder Space 遵循 OpenAI 标准**：
- 需要将 `audio_file` 改为 `file`

**如果 AI Builder Space 使用自己的规范**：
- 保持 `audio_file` 不变
- 但需要确认他们的 API 文档

### 问题 2: 缺少 model 参数

**如果 model 是必需的**：
```python
form_data = {
    'model': 'whisper-1',  # 或 AI Builder Space 指定的模型
    'language': 'zh-CN'
}
```

**如果 model 是可选的或由服务器默认**：
- 当前实现可能可以工作，但最好明确指定

### 问题 3: WebM 500 错误

可能的原因：
1. **字段名错误**：如果 API 期望 `file` 但收到 `audio_file`，可能导致解析失败
2. **缺少 model 参数**：如果 model 是必需的，缺少它可能导致 500 错误
3. **WebM 编码问题**：浏览器生成的 WebM 可能使用了不兼容的编码
4. **AI Builder Space 代理限制**：他们的代理可能对 WebM 有特殊限制

## 建议的修复步骤

1. **检查 AI Builder Space API 文档**：
   - 确认字段名是 `file` 还是 `audio_file`
   - 确认是否需要 `model` 参数
   - 确认 WebM 格式是否完全支持

2. **如果确认使用 OpenAI 标准**：
   ```python
   files = {
       'file': (filename, audio_content, content_type)  # 改为 'file'
   }
   
   form_data = {
       'model': 'whisper-1',  # 添加 model 参数
       'language': 'zh-CN'
   }
   ```

3. **测试 WebM 格式**：
   - 使用标准的 WebM 测试文件
   - 检查服务器日志中的详细错误信息
   - 如果仍然失败，考虑服务器端转换为 WAV/MP3

## 参考链接

- OpenAI Speech-to-Text 指南：https://platform.openai.com/docs/guides/speech-to-text
- OpenAI API 参考：https://platform.openai.com/docs/api-reference/audio/createTranscription
- OpenAI Audio API FAQ：https://help.openai.com/en/articles/7031512-whisper-audio-api-faq
