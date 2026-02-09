# 🌍 语言选择器功能 - v106

## 更新日期
2026-02-09

## 功能概述

新增**语言选择器**，支持 **98+ 种语言**的转录，用户可以根据录音内容选择合适的语言，提高转录准确度。

---

## 更新内容

### 1. 前端更新 ✅

#### 新增 UI 元素
- **位置**：控制面板中，"Duration Selector" 下方，录音按钮上方
- **类型**：下拉选择框（dropdown select）
- **默认语言**：英文（English）

#### 语言分组
```
🔥 常用语言（10 种）
├─ English (en) - 默认
├─ 中文 (zh)
├─ Español (es)
├─ Français (fr)
├─ Deutsch (de)
├─ 日本語 (ja)
├─ 한국어 (ko)
├─ Português (pt)
├─ Русский (ru)
└─ العربية (ar)

🌍 全部语言（98+ 种，按字母排序）
├─ Afrikaans
├─ Albanian
├─ ...
└─ Zulu
```

#### 样式特点
- ✅ 精美的下拉样式
- ✅ 悬停效果（hover）
- ✅ 焦点效果（focus）
- ✅ 自定义下拉箭头
- ✅ 与现有控件风格一致

#### 文件修改
- `static/index.html` - 添加语言选择器 HTML
- `static/style.css` - 添加样式（`.language-selector-section`, `.language-select`）
- `static/script.js` - 添加事件监听器和语言切换逻辑

---

### 2. JavaScript 更新 ✅

#### 新增变量
```javascript
let selectedLanguage = 'en'; // 默认英文
```

#### 事件监听
```javascript
languageSelect.addEventListener('change', () => {
    selectedLanguage = languageSelect.value;
    console.log('[INFO] 转录语言已切换:', selectedLanguage);
    
    // Google Analytics 追踪
    gtag('event', 'language_changed', {
        'language': selectedLanguage
    });
});
```

#### 请求参数
```javascript
formData.append('language', selectedLanguage); // v106: 添加语言参数
```

---

### 3. 后端更新 ✅

#### server2.py
```python
@app.post("/transcribe-segment")
async def transcribe_segment(
    audio_file: UploadFile = File(...),
    duration: int = 60,
    needs_segmentation: str = None,
    language: str = None  # 🌍 v106: 新增语言参数
):
    ...
    transcription_text, api_used, metadata = await transcribe_with_fallback(
        audio_content=audio_content,
        filename=filename,
        language=language or 'en',  # v106: 使用前端传来的语言，默认英文
        duration=duration,
        logger=logger
    )
```

---

### 4. API 更新 ✅

#### api_fallback.py

**新增函数：Google 语言代码转换**
```python
def convert_language_code_for_google(lang_code: str) -> str:
    """
    将标准语言代码转换为 Google Cloud Speech-to-Text 格式
    
    'en' -> 'en-US'
    'zh' -> 'zh-CN'
    'es' -> 'es-ES'
    ...
    """
    google_lang_map = {
        'en': 'en-US',
        'zh': 'zh-CN',
        # ... 50+ 种语言映射
    }
    
    return google_lang_map.get(lang_code, f'{lang_code}-{lang_code.upper()}')
```

**AI Builder Space API**
```python
form_data = {
    'model': 'whisper-1',
    'response_format': 'json',
    'language': language or 'en'  # 使用传入的语言参数
}
```

**OpenAI Whisper API**
```python
data = {
    'model': 'whisper-1',
    'response_format': 'json',
    'language': language or 'en'  # 使用传入的语言参数
}
```

**Google Cloud Speech-to-Text API**
```python
request_body = {
    "config": {
        "languageCode": convert_language_code_for_google(language) if language else "en-US",
        # ...
    }
}
```

---

## 使用场景 🎯

### 场景 1：纯英文内容
```
设置：Language = English (en)
内容：YouTube 英文视频
结果：✅ 准确转录英文
```

### 场景 2：纯中文内容
```
设置：Language = 中文 (zh)
内容：你自己的中文语音
结果：✅ 准确转录中文
```

### 场景 3：混合语言内容（⚠️ 限制）
```
设置：Language = English (en)
内容：中文 + 英文混合
结果：⚠️ 主要转录英文，中文可能被忽略

设置：Language = 中文 (zh)
内容：中文 + 英文混合
结果：⚠️ 主要转录中文，英文可能被忽略

建议：分开录制
- 第1次：系统音频 → Language = English → 录 YouTube
- 第2次：麦克风 → Language = 中文 → 录你的评论
```

---

## 技术细节 ⚙️

### 语言代码标准
- **ISO 639-1** 双字母代码（如 `en`, `zh`, `es`）
- **Google API** 需要区域代码（如 `en-US`, `zh-CN`）
- **自动转换**：系统会自动将 `en` 转换为 `en-US`

### 支持的语言列表（部分）

| 语言 | 代码 | Google 代码 |
|-----|------|------------|
| English | en | en-US |
| 中文 | zh | zh-CN |
| Español | es | es-ES |
| Français | fr | fr-FR |
| Deutsch | de | de-DE |
| 日本語 | ja | ja-JP |
| 한국어 | ko | ko-KR |
| Português | pt | pt-BR |
| Русский | ru | ru-RU |
| العربية | ar | ar-SA |
| ... | ... | ... |

完整列表：98+ 种语言

---

## Google Analytics 追踪 📊

### 事件类型
```javascript
gtag('event', 'language_changed', {
    'event_category': 'Settings',
    'event_label': 'Changed to zh',
    'language': 'zh',
    'environment': 'development'
});
```

### 可追踪数据
- 用户最常使用的语言
- 语言切换频率
- 不同语言的转录成功率

---

## UI/UX 设计 🎨

### 视觉层次
```
Audio Source Selector   ← 第1步：选择音频源
    ↓
Duration Selector       ← 第2步：选择时长
    ↓
Language Selector       ← 第3步：选择语言 ✨ 新增
    ↓
Record Button           ← 第4步：开始录音
```

### 样式规范
- **字体大小**：0.95em
- **内边距**：10px 12px
- **边框**：2px solid #e0e0e0
- **圆角**：8px
- **悬停**：背景色 #f8f9fa
- **焦点**：边框色 #3498db + 阴影

### 下拉箭头
- **类型**：SVG data URI
- **颜色**：#333
- **位置**：右侧 12px

---

## 向后兼容 ✅

### 默认行为
- 如果前端未传 `language` 参数 → 默认使用 `'en'`
- 如果后端未收到 `language` 参数 → 默认使用 `'en'`

### 旧版本兼容
- v104 及更早版本的 API 调用仍然有效
- 自动使用英文作为默认语言

---

## 测试建议 ✅

### 测试 1：英文转录
```
步骤：
1. Language = English
2. 选择"系统音频"
3. 播放英文 YouTube 视频
4. 录音 + 转录

预期：✅ 准确转录英文内容
```

### 测试 2：中文转录
```
步骤：
1. Language = 中文
2. 选择"麦克风"
3. 说一段中文
4. 录音 + 转录

预期：✅ 准确转录中文内容
```

### 测试 3：其他语言
```
步骤：
1. Language = Español (西班牙语)
2. 选择"麦克风"
3. 播放西班牙语音频
4. 录音 + 转录

预期：✅ 准确转录西班牙语内容
```

### 测试 4：语言切换
```
步骤：
1. 切换语言选择器
2. 检查控制台日志
3. 检查 Google Analytics

预期：
- ✅ 控制台显示 "[INFO] 转录语言已切换: xx"
- ✅ GA 追踪到语言切换事件
```

### 测试 5：混合语言（已知限制）
```
步骤：
1. Language = English
2. 选择"麦克风+系统音频"
3. 你说中文 + 播放英文 YouTube
4. 录音 + 转录

预期：
- ⚠️ 主要转录英文，中文可能被忽略
- 这是 Whisper API 的已知限制（单语言设计）
```

---

## 已知限制 ⚠️

### 1. 混合语言转录
**问题**：Whisper API 是单语言设计，无法原生支持混合语言

**解决方案**：
- **方案 A**：分开录制（推荐）
- **方案 B**：选择主要语言
- **方案 C**：不指定语言（自动检测，但不保证）

### 2. 语言检测准确度
**问题**：自动检测可能误判主要语言

**解决方案**：
- 用户手动选择语言
- 提供常用语言快捷选项

### 3. 区域口音
**问题**：某些语言有多个区域变体（如 en-US vs en-GB）

**当前方案**：
- 使用最常见的区域代码
- 英文默认 `en-US`
- 中文默认 `zh-CN`

**未来改进**：
- 可以添加区域选择（如"英语 (美国)" vs "英语 (英国)"）

---

## 未来改进 🚀

### 短期（1-2 周）
1. ✅ 添加语言选择器（已完成）
2. 📊 收集用户使用数据
3. 🐛 修复可能的 bug

### 中期（1-2 月）
1. 🔍 添加语言自动检测
2. 🎯 优化常用语言列表
3. 🌐 添加区域变体支持

### 长期（3+ 月）
1. 🤖 使用 GPT-4o-mini-transcribe（可能更好支持混合语言）
2. 🧠 智能分段转录（检测语言切换点）
3. 📝 混合语言后处理

---

## 文件变更清单 📝

### 修改的文件
```
✅ static/index.html      - 添加语言选择器 UI
✅ static/style.css       - 添加样式
✅ static/script.js       - 添加事件监听和语言切换逻辑
✅ server2.py            - 添加语言参数接收
✅ api_fallback.py       - 添加语言代码转换函数
```

### 新增的文件
```
✅ LANGUAGE_SELECTOR_V106.md           - 本文档
✅ TRANSCRIPTION_API_COMPARISON_2026.md - API 对比文档
```

---

## 部署检查清单 ✅

### 前端
- [x] HTML 添加语言选择器
- [x] CSS 添加样式
- [x] JavaScript 添加事件监听
- [x] 版本号更新（v106）

### 后端
- [x] server2.py 接收语言参数
- [x] api_fallback.py 处理语言代码
- [x] Google API 语言代码转换

### 测试
- [ ] 本地测试英文转录
- [ ] 本地测试中文转录
- [ ] 本地测试语言切换
- [ ] 检查控制台日志
- [ ] 检查 Google Analytics

### 部署
- [ ] 提交到 Git
- [ ] 推送到 dev 分支
- [ ] Railway 自动部署
- [ ] 生产环境测试

---

## 回滚方案 🔄

如果发现严重 bug，可以快速回滚：

```bash
# 回滚到 v105
git checkout v105

# 或者注释掉语言选择器相关代码
# HTML: 注释掉 <div class="language-selector-section">
# JS: 注释掉语言切换事件监听
# server2.py: 恢复 language=None
```

---

## 总结 ✨

### 核心价值
1. ✅ **提高准确度**：用户可以根据内容选择语言
2. ✅ **用户体验**：直观的下拉选择，98+ 种语言
3. ✅ **智能分组**：常用语言优先，全部语言按字母排序
4. ✅ **向后兼容**：不影响旧版本，默认英文

### 技术亮点
1. ✅ **智能转换**：自动处理 Google API 的区域代码
2. ✅ **全栈实现**：前端 + 后端 + API 全面支持
3. ✅ **数据追踪**：Google Analytics 追踪语言使用情况
4. ✅ **优雅降级**：语言参数可选，默认值合理

### 已知限制
1. ⚠️ **混合语言**：单语言设计，混合语言效果有限
2. ⚠️ **区域口音**：未支持区域变体选择

### 下一步
- 部署到 dev 环境
- 收集用户反馈
- 根据数据优化常用语言列表
- 考虑添加区域变体支持

---

**版本**：v106  
**更新日期**：2026-02-09  
**作者**：AI Assistant  
**状态**：✅ 已完成，待测试
