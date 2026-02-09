# 🚨 紧急问题：Whisper API 内容截断

## 问题报告
**日期**：2026-02-09  
**报告人**：用户测试  
**严重程度**：⚠️⚠️⚠️ 高危（核心功能失效）

---

## 问题描述

### 用户场景
```
录音内容（全英文）：
1. 开头：用户说话（10秒）
2. 中间：YouTube 英文视频（60秒）
3. 结尾：用户说话（10秒）

录音结果：
✅ 音频文件完整（播放确认）
✅ 包含所有3段内容

转录结果：
✅ 转录了开头部分（10秒）
❌ YouTube 中间部分丢失（60秒）
❌ 结尾部分丢失（10秒）
```

### 问题类型
**Whisper API 内容截断**（Content Truncation）

---

## 根因分析

### OpenAI 社区已知问题

根据搜索结果：

**问题 1：长音频丢失片段**
```
标题："Whisper leaves out chunks of speech in longer transcript"
来源：OpenAI Developer Community (2024)

描述：
- Whisper API 在转录长音频时
- 会丢失 10-40 秒的音频片段
- 多个片段可能完全缺失
```

**问题 2：提示（Prompt）影响**
```
发现：prompt 参数的长度会影响哪些内容被丢失
机制：不明确（API 内部问题）
```

### 最可能的原因

#### 原因 1：VAD（语音活动检测）⭐⭐⭐
```
Whisper 的 Voice Activity Detection:
- 设计为识别"人声"
- YouTube 音频可能被判断为"非人声"
- 被归类为"背景噪音"
- 结果：跳过不转录

你的场景：
开头：你的人声 → ✅ 识别 → 转录
中间：YouTube 视频音频 → ❌ 判断为非人声 → 跳过
结尾：你的人声 → ❌ 已停止处理 → 跳过
```

#### 原因 2：API 内部限制 ⭐⭐
```
可能的限制：
- 最大输出 token 数
- 最大转录片段数
- 内部处理缓冲区限制
```

#### 原因 3：v108-TEST 强制英文的副作用 ⭐
```
可能：
- 强制英文模式对 YouTube 音频敏感
- 判断为"非英文"而跳过
```

---

## 🔧 解决方案

### 方案 1：添加 Prompt 参数 ⭐⭐⭐（最简单）

```python
# api_fallback.py

form_data = {
    'model': 'whisper-1',
    'response_format': 'json',
    'language': 'en',
    'prompt': 'This is a continuous recording containing both human speech and video audio. Please transcribe all audio content completely, including background audio and video sound.'
}
```

**原理**：
- Prompt 可以引导 Whisper 行为
- 明确告诉它"包含视频音频"
- 提示"转录所有内容"

**预期效果**：
- 可能减少片段丢失
- 提高对 YouTube 音频的识别

---

### 方案 2：使用 verbose_json ⭐⭐（获取更多信息）

```python
form_data = {
    'model': 'whisper-1',
    'response_format': 'verbose_json',  # 改为 verbose
    'language': 'en'
}
```

**优点**：
- 返回时间戳信息
- 返回段落信息
- 可以看到哪部分被识别了

**返回格式**：
```json
{
  "text": "完整转录文本",
  "segments": [
    {
      "id": 0,
      "seek": 0,
      "start": 0.0,
      "end": 3.5,
      "text": " First segment text",
      "tokens": [...],
      "temperature": 0.0,
      "avg_logprob": -0.3,
      "compression_ratio": 1.5,
      "no_speech_prob": 0.01
    }
  ],
  "language": "en"
}
```

**关键字段**：
- `no_speech_prob`: 判断为非语音的概率
- 如果 > 0.5，可能被跳过

---

### 方案 3：增加超时时间 ⭐（简单）

```python
# 当前
timeout=120  # 2 分钟

# 修改
timeout=300  # 5 分钟
```

**原理**：
- 给 API 更多处理时间
- 避免提前截断

---

### 方案 4：切换到 Google API ⭐⭐（对比测试）

```python
# 临时修改 API 优先级
API_PRIORITY = [
    "google",      # 第一优先
    "ai_builder",
    "openai"
]
```

**目的**：
- 验证是否是 Whisper 特有问题
- Google API 可能没有 VAD 限制

---

### 方案 5：回滚到 v107（自动语言识别）⭐⭐

```bash
git revert HEAD
git push origin dev
```

**原理**：
- v108 强制英文可能有副作用
- v107 自动识别可能效果更好

**测试**：
- 回滚后重新测试
- 对比效果

---

## 📝 诊断 Checklist

### 需要确认的信息

- [ ] 音频总时长：____ 秒
- [ ] 文件大小：____ MB
- [ ] 使用的 API：□ AI Builder □ OpenAI □ Google
- [ ] 控制台显示的处理时间：____ 秒
- [ ] 转录文本长度：____ 字符
- [ ] 开头部分是否转录：□ 是 □ 否
- [ ] 中间 YouTube 是否转录：□ 是 □ 否
- [ ] 结尾部分是否转录：□ 是 □ 否
- [ ] 播放音频确认完整：□ 是 □ 否

---

## 🎯 推荐的立即行动

### 第一步：添加 Prompt（最快）

我可以立即修改代码，添加 prompt 参数：

```python
# 所有 API 都添加
prompt = 'Continuous recording. Transcribe all speech and audio completely.'
```

这是**最简单、最可能有效**的修复。

### 第二步：如果无效，切换到 Google

临时优先使用 Google API，验证是否是 Whisper 问题。

### 第三步：如果仍无效，实现分段

这是最可靠的方案，但需要更多开发时间。

---

**你想让我立即实施方案 1（添加 Prompt）吗？** 这可能快速解决问题！
