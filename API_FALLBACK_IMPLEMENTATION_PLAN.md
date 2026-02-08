# API Fallback 实现方案

**日期：** 2026-02-08  
**优先级：** ⭐⭐⭐⭐⭐ 关键（Product Hunt Launch 前必须完成）  
**目标：** 防止 AI Builder Space quota 用完导致服务中断

---

## 🎯 需求总结

### 核心目标
**当 AI Builder Space API 不可用时，自动切换到备用 API，确保服务不中断。**

### 关键要求
1. ✅ **主 API：** AI Builder Space (OpenAI Whisper)
2. ✅ **备用 API 1：** OpenAI Whisper API (直接调用)
3. ✅ **备用 API 2：** Google Cloud Speech-to-Text API
4. ✅ **智能检测：** 自动识别 quota 耗尽 vs 临时错误
5. ✅ **永久切换：** quota 耗尽后，停止尝试主 API
6. ✅ **临时重试：** 网络错误等临时问题，继续尝试主 API

---

## 🔍 当前架构分析

### 现有 API 端点

#### 1. `/transcribe-segment` (主要使用)
- **当前实现：** AI Builder Space Audio API
- **使用场景：** 前端 `script.js` 的主要转录端点
- **特点：** 
  - 支持超长音频（5分钟）
  - 可能需要分段
  - 需要 fallback

#### 2. `/speech-to-text-aibuilder`
- **当前实现：** AI Builder Space Audio API
- **使用场景：** 备用端点
- **需要 fallback**

#### 3. `/speech-to-text` (已实现)
- **当前实现：** Google Cloud Speech-to-Text API
- **使用场景：** 已有的备用方案
- **特点：** 可直接作为 fallback

---

## 🏗️ 实现方案

### 方案 A：三层 Fallback 策略（推荐）

```
尝试顺序：
1. AI Builder Space (OpenAI Whisper) - 免费 $100
   ↓ 失败
2. OpenAI Whisper API (直接) - 付费，但便宜 ($0.006/min)
   ↓ 失败
3. Google Cloud Speech-to-Text - 付费 ($0.016/min)
```

**优势：**
- ✅ 最大化免费额度使用
- ✅ 第二层仍然使用 Whisper（保持一致性）
- ✅ 第三层作为最终保障

---

### 方案 B：两层 Fallback（简化版）

```
尝试顺序：
1. AI Builder Space (OpenAI Whisper) - 免费 $100
   ↓ 失败
2. Google Cloud Speech-to-Text - 付费
```

**优势：**
- ✅ 实现简单（Google API 已集成）
- ✅ 减少一个外部依赖
- ⚠️ 缺点：失去 Whisper 的一致性

---

## 💡 推荐实现：方案 A（三层 Fallback）

### 错误检测逻辑

#### 1. Quota 耗尽检测
```python
def is_quota_exceeded(response, error_message):
    """判断是否是 quota 耗尽"""
    quota_indicators = [
        "quota",
        "exceeded",
        "insufficient",
        "limit reached",
        "out of credits",
        response.status_code == 429,  # Too Many Requests
        response.status_code == 402,  # Payment Required
    ]
    
    error_lower = str(error_message).lower()
    return any(indicator in error_lower for indicator in quota_indicators if isinstance(indicator, str))
```

#### 2. 临时错误检测
```python
def is_temporary_error(response, error_message):
    """判断是否是临时错误（值得重试）"""
    temporary_indicators = [
        response.status_code == 500,  # Internal Server Error
        response.status_code == 502,  # Bad Gateway
        response.status_code == 503,  # Service Unavailable
        response.status_code == 504,  # Gateway Timeout
        "timeout",
        "connection",
        "network",
    ]
    
    error_lower = str(error_message).lower()
    return any(indicator in error_lower for indicator in temporary_indicators if isinstance(indicator, str))
```

---

### Fallback 状态管理

#### 使用简单的内存缓存（无需数据库）
```python
# 全局状态（服务器重启后重置）
API_FALLBACK_STATUS = {
    "ai_builder_quota_exceeded": False,
    "ai_builder_last_check": None,
    "openai_quota_exceeded": False,
    "openai_last_check": None,
    "last_successful_api": "ai_builder",  # ai_builder, openai, google
}

# 每小时检查一次主 API 是否恢复
QUOTA_RECHECK_INTERVAL = 3600  # 1小时
```

---

### 核心 Fallback 函数

```python
import time
from typing import Tuple, Dict, Any

async def transcribe_with_fallback(
    audio_content: bytes,
    filename: str,
    language: str = None,
    duration: int = None
) -> Tuple[str, str, Dict[str, Any]]:
    """
    智能 fallback 转录
    
    返回：
    - transcription: str - 转录文本
    - api_used: str - 使用的 API ("ai_builder", "openai", "google")
    - metadata: dict - API 响应元数据
    """
    
    # 1. 尝试 AI Builder Space (如果未被标记为 quota 耗尽)
    if not API_FALLBACK_STATUS["ai_builder_quota_exceeded"]:
        try:
            result = await _transcribe_ai_builder(audio_content, filename, language, duration)
            API_FALLBACK_STATUS["last_successful_api"] = "ai_builder"
            return result, "ai_builder", {}
        except Exception as e:
            # 检查是否是 quota 耗尽
            if is_quota_exceeded(None, str(e)):
                print("[FALLBACK] AI Builder Space quota 耗尽，永久切换到备用 API")
                API_FALLBACK_STATUS["ai_builder_quota_exceeded"] = True
                API_FALLBACK_STATUS["ai_builder_last_check"] = time.time()
            elif not is_temporary_error(None, str(e)):
                # 如果不是临时错误，也不重试
                print(f"[FALLBACK] AI Builder Space 非临时错误: {str(e)}")
            else:
                print(f"[FALLBACK] AI Builder Space 临时错误: {str(e)}，将在下次请求重试")
    
    # 2. 尝试 OpenAI Whisper API (如果未被标记为 quota 耗尽)
    if not API_FALLBACK_STATUS["openai_quota_exceeded"]:
        try:
            result = await _transcribe_openai(audio_content, filename, language)
            API_FALLBACK_STATUS["last_successful_api"] = "openai"
            return result, "openai", {}
        except Exception as e:
            if is_quota_exceeded(None, str(e)):
                print("[FALLBACK] OpenAI quota 耗尽，切换到 Google API")
                API_FALLBACK_STATUS["openai_quota_exceeded"] = True
                API_FALLBACK_STATUS["openai_last_check"] = time.time()
            else:
                print(f"[FALLBACK] OpenAI API 错误: {str(e)}")
    
    # 3. 最终回退：Google Cloud Speech-to-Text
    try:
        result = await _transcribe_google(audio_content, filename, language)
        API_FALLBACK_STATUS["last_successful_api"] = "google"
        return result, "google", {}
    except Exception as e:
        # 所有 API 都失败
        raise Exception(f"所有转录 API 均失败。AI Builder: {API_FALLBACK_STATUS['ai_builder_quota_exceeded']}, OpenAI: {API_FALLBACK_STATUS['openai_quota_exceeded']}, Google: {str(e)}")
```

---

### 各 API 实现函数

#### AI Builder Space (已有，封装)
```python
async def _transcribe_ai_builder(audio_content, filename, language, duration):
    """调用 AI Builder Space API"""
    # 使用现有的实现逻辑
    # ... (从 /transcribe-segment 提取)
    pass
```

#### OpenAI Whisper API (新增)
```python
import openai

async def _transcribe_openai(audio_content, filename, language):
    """直接调用 OpenAI Whisper API"""
    
    openai.api_key = os.environ.get("OPENAI_API_KEY")
    if not openai.api_key:
        raise Exception("OPENAI_API_KEY 未配置")
    
    # 创建临时文件（OpenAI SDK 需要文件对象）
    import io
    audio_file = io.BytesIO(audio_content)
    audio_file.name = filename
    
    # 调用 Whisper API
    transcript = openai.Audio.transcribe(
        model="whisper-1",
        file=audio_file,
        language=language if language else None
    )
    
    return transcript.text
```

#### Google Cloud STT (已有，封装)
```python
async def _transcribe_google(audio_content, filename, language):
    """调用 Google Cloud Speech-to-Text API"""
    # 使用现有的 /speech-to-text 实现逻辑
    # ... (从 /speech-to-text 提取)
    pass
```

---

## 📊 API 成本对比

| API | 免费额度 | 付费价格 | 质量 | 速度 |
|-----|---------|---------|------|------|
| **AI Builder Space** | $100 | 无 (用完即止) | ⭐⭐⭐⭐⭐ | ⚡⚡⚡ |
| **OpenAI Whisper** | $5 | $0.006/min | ⭐⭐⭐⭐⭐ | ⚡⚡⚡ |
| **Google Cloud STT** | $300 (60min免费/月) | $0.016/min | ⭐⭐⭐⭐ | ⚡⚡ |

**推荐顺序理由：**
1. **AI Builder Space：** 免费 $100，先用完
2. **OpenAI Whisper：** 质量和速度与 AI Builder 相同，价格便宜
3. **Google Cloud STT：** 最终保障，稳定可靠

---

## 🚀 实施步骤

### Phase 1: 核心 Fallback 逻辑（1-2小时）
- [ ] 创建 `api_fallback.py` 模块
- [ ] 实现错误检测函数
- [ ] 实现状态管理
- [ ] 实现 `transcribe_with_fallback` 函数

### Phase 2: API 集成（1-2小时）
- [ ] 封装 AI Builder Space 调用
- [ ] 实现 OpenAI Whisper 调用
- [ ] 封装 Google Cloud STT 调用
- [ ] 配置环境变量（`OPENAI_API_KEY`）

### Phase 3: 端点更新（30分钟）
- [ ] 更新 `/transcribe-segment` 使用 fallback
- [ ] 更新 `/speech-to-text-aibuilder` 使用 fallback
- [ ] 保留 `/speech-to-text` 作为直接 Google API 端点

### Phase 4: 测试（1小时）
- [ ] 测试正常流程（AI Builder Space）
- [ ] 模拟 quota 耗尽（手动标记）
- [ ] 测试 OpenAI fallback
- [ ] 测试 Google fallback
- [ ] 测试错误处理

### Phase 5: 部署和监控（30分钟）
- [ ] 部署到 dev 测试
- [ ] 部署到 production
- [ ] 添加日志监控
- [ ] 文档更新

**总预计时间：4-6小时**

---

## 📝 配置需求

### 环境变量
```bash
# 现有
AI_BUILDER_TOKEN=your_ai_builder_token
GOOGLE_APPLICATION_CREDENTIALS_JSON={"type":"service_account",...}

# 新增
OPENAI_API_KEY=sk-...  # 需要创建 OpenAI 账户并获取 API Key
```

---

## 🎯 优先级建议

### Option 1: 简化实现（先上线）
**只实现两层：AI Builder + Google**
- ✅ 快速（1-2小时）
- ✅ Google API 已集成
- ✅ 满足基本需求
- ⚠️ 失去 Whisper 一致性

### Option 2: 完整实现（最优方案）
**三层：AI Builder + OpenAI + Google**
- ✅ 最优成本
- ✅ 保持 Whisper 一致性
- ⚠️ 需要额外时间（4-6小时）
- ⚠️ 需要 OpenAI API Key

---

## 🤔 决策点

请回答以下问题，我将据此调整实现方案：

1. **优先级：** 
   - [ ] 简化版（2层，快速上线）
   - [ ] 完整版（3层，最优成本）

2. **OpenAI API Key：**
   - [ ] 已有 OpenAI 账户
   - [ ] 需要创建（我可以提供指引）
   - [ ] 暂时跳过 OpenAI，只用 Google

3. **时间：**
   - [ ] 立即实现（今天）
   - [ ] Product Hunt Launch 前实现（本周内）
   - [ ] 上线后再优化

---

需要我开始实现吗？请告诉我你的选择！🚀