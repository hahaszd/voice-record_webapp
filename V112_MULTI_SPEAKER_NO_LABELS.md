# 🎯 V112: 多说话人转录（无标签模式）

## 📋 更新内容

### 问题背景
用户反映：在录制 YouTube 视频时（视频中有 2-3 个人轮流对话），OpenAI Whisper API 只转录了一个人的声音，其他人说的话被当作"噪音"丢弃了。

**核心需求：**
- ✅ 转录所有说话人的话（不管有多少人）
- ✅ 不需要标注"这是谁说的"
- ✅ 只需要一段完整的连续文本
- ❌ 不需要 "Speaker A:", "Speaker B:" 等标签

---

## 🎤 技术方案

### 1️⃣ **OpenAI gpt-4o-transcribe-diarize（首选）**

**API 参数：**
```python
{
    'model': 'gpt-4o-transcribe-diarize',
    'response_format': 'diarized_json',  # 🔥 获取 segments 数据
    'chunking_strategy': 'auto',  # 自动分段
}
```

**处理逻辑：**
```python
# 1. API 返回 segments（带说话人标签）
# 2. 提取所有 segment 的文本
# 3. 按时间顺序合并
# 4. 返回完整文本（不含标签）

all_texts = []
for segment in result['segments']:
    text = segment.get('text', '').strip()
    if text:
        all_texts.append(text)

transcription_text = " ".join(all_texts)  # 合并为一段文本
```

**优点：**
- ✅ 原生多说话人识别
- ✅ 准确率高
- ✅ 支持中英文混合
- ✅ 自动检测说话人数量

**参考文档：**
https://platform.openai.com/docs/api-reference/audio/createTranscription

---

### 2️⃣ **Google Cloud Speech-to-Text（次选）**

**API 参数：**
```python
config = {
    "encoding": "LINEAR16",
    "sampleRateHertz": 48000,
    "enableAutomaticPunctuation": True,
    "languageCode": "en-US",
    "alternativeLanguageCodes": ["zh-CN"],  # 双语支持
    "diarizationConfig": {
        "enableSpeakerDiarization": True,
        "minSpeakerCount": 1,  # 最少 1 人
        "maxSpeakerCount": 10  # 最多 10 人
    }
}
```

**处理逻辑：**
```python
# 启用 remove_speaker_labels 参数
text = parse_diarization_result(result, remove_speaker_labels=True)

# parse_diarization_result 函数会：
# 1. 提取所有 word-level 数据
# 2. 按时间顺序拼接所有单词
# 3. 返回完整文本（不含标签）

all_text = " ".join([word_info["word"] for word_info in all_words])
```

**优点：**
- ✅ 成熟稳定
- ✅ 支持多说话人识别（最多 10 人）
- ✅ 双语自动检测
- ✅ Word-level 精度

**参考文档：**
https://cloud.google.com/speech-to-text/v2/docs/multiple-voices

---

## 📊 代码改动摘要

### 1. `api_fallback.py` - OpenAI Diarize 函数

**改动：**
- 将 `response_format` 从 `'json'` 改为 `'diarized_json'`
- 提取 `segments` 数据
- 合并所有 segment 文本，不包含说话人标签

**关键代码：**
```python
# v112: 合并所有说话人的文本，不包含说话人标签
all_texts = []
for segment in result['segments']:
    text = segment.get('text', '').strip()
    if text:
        all_texts.append(text)

transcription_text = " ".join(all_texts)
```

---

### 2. `api_fallback.py` - Google 函数

**改动：**
- 添加 `remove_speaker_labels` 参数
- 修改 `parse_diarization_result` 函数支持无标签模式
- 在 `_transcribe_google` 中传递 `remove_speaker_labels=True`

**关键代码：**
```python
def parse_diarization_result(result, remove_speaker_labels=False):
    # ...
    if remove_speaker_labels:
        # 直接拼接所有单词，不分说话人
        all_text = " ".join([word_info["word"] for word_info in all_words])
        return all_text
    # ...
```

---

### 3. `transcribe_system_audio` 函数

**改动：**
- 更新日志输出，说明"无标签模式"
- 调用 `_transcribe_google` 时传递 `remove_speaker_labels=True`

---

## 🧪 测试步骤

### 1. **录制测试音频**
- 播放一段 YouTube 视频（包含 2-3 个人对话）
- 选择"仅系统音频"或"两者都录"模式
- 录制 30-60 秒

### 2. **检查转录结果**
**期望结果：**
```
✅ 所有人说的话都被转录
✅ 没有 "Speaker A:", "Speaker B:" 标签
✅ 完整的连续文本
✅ 正确的标点符号
```

**检查方法：**
1. 查看 Console Log，确认使用了 `openai_diarize` 或 `google`
2. 查看转录文本长度是否合理
3. 对比原音频，确认没有遗漏

---

## 📝 API 优先级

### 系统音频 / 混合音频场景：

| 优先级 | API | 说明 |
|-------|-----|------|
| 1️⃣ | OpenAI gpt-4o-transcribe-diarize | 主力，多说话人识别 |
| 2️⃣ | Google Cloud Speech-to-Text | 次选，成熟稳定 |
| 3️⃣ | Deepgram Nova-2 | 备用（仍保留标签） |

### 麦克风场景：

| 优先级 | API | 说明 |
|-------|-----|------|
| 1️⃣ | AI Builder Space | 免费额度 |
| 2️⃣ | OpenAI Whisper API | 标准转录 |
| 3️⃣ | Deepgram Nova-2 | 备用 |

---

## ✅ 技术验证

### OpenAI API 文档验证：
- ✅ `response_format: 'diarized_json'` 返回 `segments` 数组
- ✅ 每个 segment 包含 `speaker`, `text`, `start`, `end`
- ✅ `chunking_strategy: 'auto'` 自动分段（>30秒音频必需）

### Google API 文档验证：
- ✅ `enableSpeakerDiarization: true` 启用多说话人识别
- ✅ `minSpeakerCount` 和 `maxSpeakerCount` 控制说话人数量
- ✅ Word-level 数据包含 `speakerTag`
- ✅ 可以提取所有单词并拼接

---

## 🚀 部署步骤

### 1. **本地测试**
```bash
# 启动本地服务器
python server2.py
```

### 2. **部署到 Railway**
```bash
# 确保代码已推送到 dev 分支
git add api_fallback.py
git commit -m "v112: Add multi-speaker transcription without labels"
git push origin dev
```

### 3. **验证环境变量**
Railway 上需要配置：
- ✅ `OPENAI_API_KEY` - OpenAI API key
- ✅ `GOOGLE_APPLICATION_CREDENTIALS_JSON` - Google 认证
- ✅ `DEEPGRAM_API_KEY` - Deepgram API key（备用）

---

## 📚 参考文档

1. **OpenAI Transcription API:**
   https://platform.openai.com/docs/api-reference/audio/createTranscription

2. **OpenAI Speech-to-Text Guide:**
   https://platform.openai.com/docs/guides/speech-to-text

3. **Google Cloud Speech-to-Text Diarization:**
   https://cloud.google.com/speech-to-text/v2/docs/multiple-voices

4. **Google Diarization Config:**
   https://cloud.google.com/python/docs/reference/speech/2.25.1/google.cloud.speech_v2.types.SpeakerDiarizationConfig

---

## 🎯 预期效果

### 录制 YouTube 视频（3 人对话）：

**输入音频：**
- Person A: "欢迎来到我的频道。"
- Person B: "今天我们要讨论 AI 技术。"
- Person A: "这个话题很有意思。"
- Person C: "我觉得未来 AI 会改变世界。"

**转录结果（v112）：**
```
欢迎来到我的频道。今天我们要讨论 AI 技术。这个话题很有意思。我觉得未来 AI 会改变世界。
```

✅ **所有人的话都被转录**
✅ **没有标签**
✅ **完整连续**

---

## 📞 支持

如有问题，请查看：
- Console Log（查看具体使用的 API）
- Railway Logs（查看服务器端日志）
- 测试音频的实际内容（确认多人对话）

---

**更新时间：** 2026-02-06
**版本号：** v112
**状态：** ✅ 已完成，待测试
