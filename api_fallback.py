"""
API Fallback Module for Speech-to-Text
三层 API fallback 策略，确保服务不中断

优先级：
1. AI Builder Space (OpenAI Whisper) - 免费 $100
2. OpenAI Whisper API (直接调用) - 付费 $0.006/min
3. Google Cloud Speech-to-Text - 付费 $0.016/min
"""

import os
import time
import json
import base64
import requests
from typing import Tuple, Dict, Any, Optional
from logging_helper import TranscriptionLogger

# ================================================================================
# 全局状态管理（服务器重启后重置）
# ================================================================================

API_FALLBACK_STATUS = {
    "ai_builder_quota_exceeded": False,
    "ai_builder_last_check": None,
    "openai_quota_exceeded": False,
    "openai_last_check": None,
    "last_successful_api": "ai_builder",
    "api_usage_count": {
        "ai_builder": 0,
        "openai": 0,
        "google": 0
    }
}

# 每小时检查一次主 API 是否恢复（秒）
QUOTA_RECHECK_INTERVAL = 3600  # 1 小时


# ================================================================================
# 错误检测辅助函数
# ================================================================================

def is_quota_exceeded(status_code: Optional[int], error_message: str) -> bool:
    """
    判断是否是 quota 耗尽错误
    
    Args:
        status_code: HTTP 状态码
        error_message: 错误信息
    
    Returns:
        bool: True 表示 quota 耗尽
    """
    if not error_message:
        return False
    
    error_lower = str(error_message).lower()
    
    # 常见的 quota 耗尽指示符
    quota_keywords = [
        "quota",
        "exceeded",
        "insufficient",
        "limit reached",
        "out of credits",
        "insufficient_quota",
        "rate_limit_exceeded",
        "billing",
        "payment required"
    ]
    
    # 检查关键词
    has_quota_keyword = any(keyword in error_lower for keyword in quota_keywords)
    
    # 检查 HTTP 状态码
    is_quota_status = status_code in [402, 429]  # 402: Payment Required, 429: Too Many Requests
    
    return has_quota_keyword or is_quota_status


def is_temporary_error(status_code: Optional[int], error_message: str) -> bool:
    """
    判断是否是临时错误（值得重试）
    
    Args:
        status_code: HTTP 状态码
        error_message: 错误信息
    
    Returns:
        bool: True 表示是临时错误
    """
    if not error_message:
        return False
    
    error_lower = str(error_message).lower()
    
    # 临时错误关键词
    temp_keywords = [
        "timeout",
        "connection",
        "network",
        "temporary",
        "unavailable",
        "try again"
    ]
    
    # 检查关键词
    has_temp_keyword = any(keyword in error_lower for keyword in temp_keywords)
    
    # 检查 HTTP 状态码
    is_temp_status = status_code in [500, 502, 503, 504]  # 服务器错误
    
    return has_temp_keyword or is_temp_status


def should_retry_api(api_name: str) -> bool:
    """
    判断是否应该重试某个 API
    
    Args:
        api_name: API 名称 ("ai_builder", "openai")
    
    Returns:
        bool: True 表示应该重试
    """
    if api_name == "ai_builder":
        # 如果标记为 quota 耗尽
        if API_FALLBACK_STATUS["ai_builder_quota_exceeded"]:
            # 检查是否过了重新检查间隔
            last_check = API_FALLBACK_STATUS["ai_builder_last_check"]
            if last_check and (time.time() - last_check) < QUOTA_RECHECK_INTERVAL:
                return False  # 还没到重新检查的时间
            # 过了间隔，可以重试一次
            print(f"[FALLBACK] AI Builder Space quota 检查间隔已过，尝试重新检测")
            return True
        return True
    
    elif api_name == "openai":
        if API_FALLBACK_STATUS["openai_quota_exceeded"]:
            last_check = API_FALLBACK_STATUS["openai_last_check"]
            if last_check and (time.time() - last_check) < QUOTA_RECHECK_INTERVAL:
                return False
            print(f"[FALLBACK] OpenAI quota 检查间隔已过，尝试重新检测")
            return True
        return True
    
    return True


# ================================================================================
# API 调用函数 - AI Builder Space
# ================================================================================

async def _transcribe_ai_builder(
    audio_content: bytes,
    filename: str,
    language: Optional[str] = None,
    duration: Optional[int] = None,
    logger: Optional[TranscriptionLogger] = None
) -> Tuple[str, Dict[str, Any]]:
    """
    调用 AI Builder Space API 进行转录
    
    Returns:
        Tuple[str, dict]: (转录文本, 元数据)
    """
    from server2 import AI_BUILDER_TOKEN, AI_BUILDER_API_BASE
    
    if not AI_BUILDER_TOKEN:
        raise Exception("AI_BUILDER_TOKEN 未配置")
    
    if logger:
        logger.log_info(f"[FALLBACK] 尝试使用 AI Builder Space API")
    else:
        print(f"[FALLBACK] 尝试使用 AI Builder Space API")
    
    # 准备请求
    api_url = f"{AI_BUILDER_API_BASE}/audio/transcriptions"
    
    # 构建 multipart/form-data
    files = {
        'file': (filename, audio_content, 'audio/wav')
    }
    
    form_data = {
        'model': 'whisper-1',
        'response_format': 'json'
    }
    
    if language:
        form_data['language'] = language
    
    # 发送请求
    response = requests.post(
        api_url,
        headers={
            "Authorization": f"Bearer {AI_BUILDER_TOKEN}",
            "Accept": "application/json"
        },
        files=files,
        data=form_data,
        timeout=120
    )
    
    # 检查响应
    if response.status_code != 200:
        error_msg = f"AI Builder Space API 错误 [{response.status_code}]: {response.text}"
        raise Exception(error_msg)
    
    # 解析响应
    result = response.json()
    text = result.get('text', '')
    
    if not text:
        raise Exception("AI Builder Space API 返回空文本")
    
    metadata = {
        "api": "ai_builder",
        "model": "whisper-1",
        "status_code": response.status_code
    }
    
    return text, metadata


# ================================================================================
# API 调用函数 - OpenAI Whisper
# ================================================================================

async def _transcribe_openai(
    audio_content: bytes,
    filename: str,
    language: Optional[str] = None,
    logger: Optional[TranscriptionLogger] = None
) -> Tuple[str, Dict[str, Any]]:
    """
    直接调用 OpenAI Whisper API 进行转录
    
    Returns:
        Tuple[str, dict]: (转录文本, 元数据)
    """
    openai_api_key = os.environ.get("OPENAI_API_KEY")
    
    if not openai_api_key:
        raise Exception("OPENAI_API_KEY 未配置")
    
    if logger:
        logger.log_info(f"[FALLBACK] 尝试使用 OpenAI Whisper API")
    else:
        print(f"[FALLBACK] 尝试使用 OpenAI Whisper API")
    
    # OpenAI API endpoint
    api_url = "https://api.openai.com/v1/audio/transcriptions"
    
    # 准备请求
    files = {
        'file': (filename, audio_content, 'audio/wav')
    }
    
    data = {
        'model': 'whisper-1',
        'response_format': 'json'
    }
    
    if language:
        data['language'] = language
    
    # 发送请求
    response = requests.post(
        api_url,
        headers={
            "Authorization": f"Bearer {openai_api_key}"
        },
        files=files,
        data=data,
        timeout=120
    )
    
    # 检查响应
    if response.status_code != 200:
        error_msg = f"OpenAI API 错误 [{response.status_code}]: {response.text}"
        raise Exception(error_msg)
    
    # 解析响应
    result = response.json()
    text = result.get('text', '')
    
    if not text:
        raise Exception("OpenAI API 返回空文本")
    
    metadata = {
        "api": "openai",
        "model": "whisper-1",
        "status_code": response.status_code
    }
    
    return text, metadata


# ================================================================================
# API 调用函数 - Google Cloud Speech-to-Text
# ================================================================================

async def _transcribe_google(
    audio_content: bytes,
    filename: str,
    language: Optional[str] = None,
    logger: Optional[TranscriptionLogger] = None
) -> Tuple[str, Dict[str, Any]]:
    """
    调用 Google Cloud Speech-to-Text API 进行转录
    
    Returns:
        Tuple[str, dict]: (转录文本, 元数据)
    """
    from server2 import get_access_token, get_project_id
    
    if logger:
        logger.log_info(f"[FALLBACK] 尝试使用 Google Cloud Speech-to-Text API")
    else:
        print(f"[FALLBACK] 尝试使用 Google Cloud Speech-to-Text API")
    
    # 获取访问令牌和项目 ID
    access_token = get_access_token()
    project_id = get_project_id()
    
    # Google API endpoint
    api_url = f"https://speech.googleapis.com/v1/speech:recognize"
    
    # 编码音频
    audio_base64 = base64.b64encode(audio_content).decode('utf-8')
    
    # 构建请求体
    request_body = {
        "config": {
            "encoding": "LINEAR16",
            "sampleRateHertz": 48000,
            "languageCode": language or "zh-CN",
            "enableAutomaticPunctuation": True,
            "model": "default"
        },
        "audio": {
            "content": audio_base64
        }
    }
    
    # 发送请求
    response = requests.post(
        api_url,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        },
        json=request_body,
        timeout=120
    )
    
    # 检查响应
    if response.status_code != 200:
        error_msg = f"Google API 错误 [{response.status_code}]: {response.text}"
        raise Exception(error_msg)
    
    # 解析响应
    result = response.json()
    
    # 提取转录文本
    text = ""
    if "results" in result and len(result["results"]) > 0:
        for r in result["results"]:
            if "alternatives" in r and len(r["alternatives"]) > 0:
                text += r["alternatives"][0].get("transcript", "")
    
    if not text:
        raise Exception("Google API 返回空文本")
    
    metadata = {
        "api": "google",
        "model": "default",
        "status_code": response.status_code
    }
    
    return text, metadata


# ================================================================================
# 核心 Fallback 函数
# ================================================================================

async def transcribe_with_fallback(
    audio_content: bytes,
    filename: str,
    language: Optional[str] = None,
    duration: Optional[int] = None,
    logger: Optional[TranscriptionLogger] = None
) -> Tuple[str, str, Dict[str, Any]]:
    """
    智能 fallback 转录
    
    Args:
        audio_content: 音频文件内容（字节）
        filename: 文件名
        language: 语言代码（可选）
        duration: 音频时长（秒，可选）
        logger: 日志记录器（可选）
    
    Returns:
        Tuple[str, str, dict]: (转录文本, 使用的API, 元数据)
    """
    errors = []
    
    # ============================================================================
    # 1. 尝试 AI Builder Space
    # ============================================================================
    if should_retry_api("ai_builder"):
        try:
            text, metadata = await _transcribe_ai_builder(
                audio_content, filename, language, duration, logger
            )
            
            # 成功！更新状态
            API_FALLBACK_STATUS["last_successful_api"] = "ai_builder"
            API_FALLBACK_STATUS["api_usage_count"]["ai_builder"] += 1
            
            # 如果之前标记为 quota 耗尽，现在成功了，清除标记
            if API_FALLBACK_STATUS["ai_builder_quota_exceeded"]:
                print(f"[FALLBACK] ✅ AI Builder Space 已恢复！")
                API_FALLBACK_STATUS["ai_builder_quota_exceeded"] = False
                API_FALLBACK_STATUS["ai_builder_last_check"] = None
            
            if logger:
                logger.log_info(f"[FALLBACK] ✅ 使用 AI Builder Space 成功")
            else:
                print(f"[FALLBACK] ✅ 使用 AI Builder Space 成功")
            
            return text, "ai_builder", metadata
            
        except Exception as e:
            error_msg = str(e)
            errors.append(f"AI Builder: {error_msg}")
            
            # 检查是否是 quota 耗尽
            status_code = None
            if "错误 [" in error_msg:
                try:
                    status_code = int(error_msg.split("[")[1].split("]")[0])
                except:
                    pass
            
            if is_quota_exceeded(status_code, error_msg):
                print(f"[FALLBACK] ❌ AI Builder Space quota 耗尽，永久切换到备用 API")
                API_FALLBACK_STATUS["ai_builder_quota_exceeded"] = True
                API_FALLBACK_STATUS["ai_builder_last_check"] = time.time()
                if logger:
                    logger.log_error("API_FALLBACK", "AI Builder Space quota 耗尽")
            elif is_temporary_error(status_code, error_msg):
                print(f"[FALLBACK] ⚠️ AI Builder Space 临时错误: {error_msg}")
                if logger:
                    logger.log_error("API_TEMPORARY_ERROR", f"AI Builder: {error_msg}")
            else:
                print(f"[FALLBACK] ❌ AI Builder Space 错误: {error_msg}")
                if logger:
                    logger.log_error("API_ERROR", f"AI Builder: {error_msg}")
    else:
        print(f"[FALLBACK] ⏭️ 跳过 AI Builder Space（quota 耗尽）")
        errors.append("AI Builder: quota 耗尽（已跳过）")
    
    # ============================================================================
    # 2. 尝试 OpenAI Whisper
    # ============================================================================
    if should_retry_api("openai"):
        try:
            text, metadata = await _transcribe_openai(
                audio_content, filename, language, logger
            )
            
            # 成功！更新状态
            API_FALLBACK_STATUS["last_successful_api"] = "openai"
            API_FALLBACK_STATUS["api_usage_count"]["openai"] += 1
            
            # 如果之前标记为 quota 耗尽，现在成功了，清除标记
            if API_FALLBACK_STATUS["openai_quota_exceeded"]:
                print(f"[FALLBACK] ✅ OpenAI 已恢复！")
                API_FALLBACK_STATUS["openai_quota_exceeded"] = False
                API_FALLBACK_STATUS["openai_last_check"] = None
            
            if logger:
                logger.log_info(f"[FALLBACK] ✅ 使用 OpenAI Whisper 成功")
            else:
                print(f"[FALLBACK] ✅ 使用 OpenAI Whisper 成功")
            
            return text, "openai", metadata
            
        except Exception as e:
            error_msg = str(e)
            errors.append(f"OpenAI: {error_msg}")
            
            # 检查是否是 quota 耗尽
            status_code = None
            if "错误 [" in error_msg:
                try:
                    status_code = int(error_msg.split("[")[1].split("]")[0])
                except:
                    pass
            
            if is_quota_exceeded(status_code, error_msg):
                print(f"[FALLBACK] ❌ OpenAI quota 耗尽，切换到 Google API")
                API_FALLBACK_STATUS["openai_quota_exceeded"] = True
                API_FALLBACK_STATUS["openai_last_check"] = time.time()
                if logger:
                    logger.log_error("API_FALLBACK", "OpenAI quota 耗尽")
            elif is_temporary_error(status_code, error_msg):
                print(f"[FALLBACK] ⚠️ OpenAI 临时错误: {error_msg}")
                if logger:
                    logger.log_error("API_TEMPORARY_ERROR", f"OpenAI: {error_msg}")
            else:
                print(f"[FALLBACK] ❌ OpenAI 错误: {error_msg}")
                if logger:
                    logger.log_error("API_ERROR", f"OpenAI: {error_msg}")
    else:
        print(f"[FALLBACK] ⏭️ 跳过 OpenAI（quota 耗尽）")
        errors.append("OpenAI: quota 耗尽（已跳过）")
    
    # ============================================================================
    # 3. 最终回退：Google Cloud Speech-to-Text
    # ============================================================================
    try:
        text, metadata = await _transcribe_google(
            audio_content, filename, language, logger
        )
        
        # 成功！更新状态
        API_FALLBACK_STATUS["last_successful_api"] = "google"
        API_FALLBACK_STATUS["api_usage_count"]["google"] += 1
        
        if logger:
            logger.log_info(f"[FALLBACK] ✅ 使用 Google Cloud STT 成功")
        else:
            print(f"[FALLBACK] ✅ 使用 Google Cloud STT 成功")
        
        return text, "google", metadata
        
    except Exception as e:
        error_msg = str(e)
        errors.append(f"Google: {error_msg}")
        
        if logger:
            logger.log_error("API_ALL_FAILED", f"所有 API 均失败")
        else:
            print(f"[FALLBACK] ❌ 所有 API 均失败")
    
    # ============================================================================
    # 所有 API 都失败
    # ============================================================================
    all_errors = " | ".join(errors)
    raise Exception(f"所有转录 API 均失败: {all_errors}")


# ================================================================================
# 状态查询函数
# ================================================================================

def get_api_status() -> Dict[str, Any]:
    """
    获取当前 API fallback 状态
    
    Returns:
        dict: API 状态信息
    """
    return {
        "ai_builder": {
            "available": not API_FALLBACK_STATUS["ai_builder_quota_exceeded"],
            "quota_exceeded": API_FALLBACK_STATUS["ai_builder_quota_exceeded"],
            "last_check": API_FALLBACK_STATUS["ai_builder_last_check"],
            "usage_count": API_FALLBACK_STATUS["api_usage_count"]["ai_builder"]
        },
        "openai": {
            "available": not API_FALLBACK_STATUS["openai_quota_exceeded"],
            "quota_exceeded": API_FALLBACK_STATUS["openai_quota_exceeded"],
            "last_check": API_FALLBACK_STATUS["openai_last_check"],
            "usage_count": API_FALLBACK_STATUS["api_usage_count"]["openai"]
        },
        "google": {
            "available": True,
            "usage_count": API_FALLBACK_STATUS["api_usage_count"]["google"]
        },
        "last_successful_api": API_FALLBACK_STATUS["last_successful_api"]
    }
