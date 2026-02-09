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
    
    print(f"[FALLBACK] 尝试使用 AI Builder Space API")
    print(f"[v108-TEST] 🔴 强制使用英文模式（测试中文效果）")
    print(f"[v109-FIX] 🔧 添加 Prompt 参数，尝试解决内容截断问题")
    print(f"[v109-FIX] 🔧 超时增加到 300 秒，response_format 改为 verbose_json")
    
    # 准备请求
    api_url = f"{AI_BUILDER_API_BASE}/audio/transcriptions"
    
    # 🔥 AI Builder Space 使用 'audio_file' 作为字段名（不是 'file'）
    files = {
        'audio_file': (filename, audio_content, 'audio/wav')
    }
    
    # 🔥 添加 language 参数 - v108: 强制英文（用于测试中文效果）
    # 🔧 v109: 添加 prompt 参数，解决内容截断问题
    form_data = {
        'model': 'whisper-1',
        'response_format': 'verbose_json',  # v109: 改为 verbose 获取更多信息
        'language': 'en',  # 强制英文
        'prompt': 'This is a continuous recording containing both human speech and video/audio playback (such as YouTube). Please transcribe all audio content completely and accurately, including all speech, video audio, and background sounds throughout the entire recording.'  # v109: 引导完整转录
    }
    
    # v108: 忽略传入的 language 参数，始终使用英文
    # if language:
    #     form_data['language'] = language
    
    # 发送请求
    response = requests.post(
        api_url,
        headers={
            "Authorization": f"Bearer {AI_BUILDER_TOKEN}",
            "Accept": "application/json"
        },
        files=files,
        data=form_data,
        timeout=300  # v109: 增加超时到 5 分钟，避免长音频被截断
    )
    
    # 检查响应
    if response.status_code != 200:
        error_msg = f"AI Builder Space API 错误 [{response.status_code}]: {response.text}"
        raise Exception(error_msg)
    
    # 解析响应
    result = response.json()
    
    # v109: 支持 verbose_json 格式
    if isinstance(result, dict) and 'text' in result:
        text = result.get('text', '')
    else:
        text = result if isinstance(result, str) else str(result)
    
    if not text:
        raise Exception("AI Builder Space API 返回空文本")
    
    # v109: 记录 verbose 信息（如果有）
    if 'segments' in result:
        segments_count = len(result['segments'])
        print(f"[v109-DEBUG] 转录包含 {segments_count} 个音频段落")
        
        # 检查是否有段落被标记为"非语音"
        for i, seg in enumerate(result['segments']):
            no_speech_prob = seg.get('no_speech_prob', 0)
            if no_speech_prob > 0.5:
                print(f"[v109-WARNING] 段落 {i} 被判断为非语音 (概率: {no_speech_prob:.2f})")
    
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
    
    print(f"[FALLBACK] 尝试使用 OpenAI Whisper API")
    print(f"[v108-TEST] 🔴 强制使用英文模式（测试中文效果）")
    print(f"[v109-FIX] 🔧 添加 Prompt 参数，尝试解决内容截断问题")
    
    # OpenAI API endpoint
    api_url = "https://api.openai.com/v1/audio/transcriptions"
    
    # 准备请求
    files = {
        'file': (filename, audio_content, 'audio/wav')
    }
    
    data = {
        'model': 'whisper-1',
        'response_format': 'verbose_json',  # v109: 改为 verbose
        'language': 'en',  # v108: 强制英文（用于测试中文效果）
        'prompt': 'This is a continuous recording containing both human speech and video/audio playback (such as YouTube). Please transcribe all audio content completely and accurately, including all speech, video audio, and background sounds throughout the entire recording.'  # v109: 引导完整转录
    }
    
    # v108: 忽略传入的 language 参数，始终使用英文
    # if language:
    #     data['language'] = language
    
    # 发送请求
    response = requests.post(
        api_url,
        headers={
            "Authorization": f"Bearer {openai_api_key}"
        },
        files=files,
        data=data,
        timeout=300  # v109: 增加超时到 5 分钟
    )
    
    # 检查响应
    if response.status_code != 200:
        error_msg = f"OpenAI API 错误 [{response.status_code}]: {response.text}"
        raise Exception(error_msg)
    
    # 解析响应
    result = response.json()
    
    # v109: 支持 verbose_json 格式
    if isinstance(result, dict) and 'text' in result:
        text = result.get('text', '')
    else:
        text = result if isinstance(result, str) else str(result)
    
    if not text:
        raise Exception("OpenAI API 返回空文本")
    
    # v109: 记录 verbose 信息（如果有）
    if 'segments' in result:
        segments_count = len(result['segments'])
        print(f"[v109-DEBUG] OpenAI 转录包含 {segments_count} 个音频段落")
        
        # 检查是否有段落被标记为"非语音"
        for i, seg in enumerate(result['segments']):
            no_speech_prob = seg.get('no_speech_prob', 0)
            if no_speech_prob > 0.5:
                start = seg.get('start', 0)
                end = seg.get('end', 0)
                print(f"[v109-WARNING] 段落 {i} ({start:.1f}s-{end:.1f}s) 被判断为非语音 (概率: {no_speech_prob:.2f})")
    
    metadata = {
        "api": "openai",
        "model": "whisper-1",
        "status_code": response.status_code
    }
    
    return text, metadata


# ================================================================================
# API 调用函数 - Google Cloud Speech-to-Text
# ================================================================================

def convert_language_code_for_google(lang_code: str) -> str:
    """
    将标准语言代码转换为 Google Cloud Speech-to-Text 格式
    
    Args:
        lang_code: 标准语言代码（如 'en', 'zh'）
    
    Returns:
        str: Google 格式的语言代码（如 'en-US', 'zh-CN'）
    """
    # 常见语言映射
    google_lang_map = {
        'en': 'en-US',
        'zh': 'zh-CN',
        'es': 'es-ES',
        'fr': 'fr-FR',
        'de': 'de-DE',
        'ja': 'ja-JP',
        'ko': 'ko-KR',
        'pt': 'pt-BR',
        'ru': 'ru-RU',
        'ar': 'ar-SA',
        'it': 'it-IT',
        'nl': 'nl-NL',
        'tr': 'tr-TR',
        'pl': 'pl-PL',
        'sv': 'sv-SE',
        'da': 'da-DK',
        'fi': 'fi-FI',
        'no': 'no-NO',
        'cs': 'cs-CZ',
        'el': 'el-GR',
        'he': 'he-IL',
        'hi': 'hi-IN',
        'id': 'id-ID',
        'ms': 'ms-MY',
        'th': 'th-TH',
        'vi': 'vi-VN',
        'uk': 'uk-UA',
        'ro': 'ro-RO',
        'sk': 'sk-SK',
        'bg': 'bg-BG',
        'hr': 'hr-HR',
        'sr': 'sr-RS',
        'ca': 'ca-ES',
        'hu': 'hu-HU',
        'lt': 'lt-LT',
        'lv': 'lv-LV',
        'et': 'et-EE',
        'sl': 'sl-SI',
    }
    
    # 如果已经是正确格式（如 'en-US'），直接返回
    if '-' in lang_code:
        return lang_code
    
    # 查找映射
    return google_lang_map.get(lang_code, f'{lang_code}-{lang_code.upper()}')


# ================================================================================
# 🎙️ v110: 多说话人分离辅助函数
# ================================================================================

def count_unique_speakers(result: Dict[str, Any]) -> int:
    """
    统计检测到的说话人数量
    
    Args:
        result: Google API 返回的结果
    
    Returns:
        int: 说话人数量
    """
    speakers = set()
    
    if "results" in result:
        for r in result["results"]:
            if "alternatives" in r and len(r["alternatives"]) > 0:
                words = r["alternatives"][0].get("words", [])
                for word in words:
                    speaker_tag = word.get("speakerTag")
                    if speaker_tag:
                        speakers.add(speaker_tag)
    
    return len(speakers)


def parse_diarization_result(result: Dict[str, Any]) -> str:
    """
    解析多说话人分离结果，格式化输出
    
    Args:
        result: Google API 返回的结果
    
    Returns:
        str: 格式化的转录文本（包含说话人标签）
    """
    # 收集所有 words 及其 speaker tag
    all_words = []
    
    if "results" in result:
        for r in result["results"]:
            if "alternatives" in r and len(r["alternatives"]) > 0:
                words = r["alternatives"][0].get("words", [])
                for word in words:
                    all_words.append({
                        "word": word.get("word", ""),
                        "speaker": word.get("speakerTag", 0),
                        "startTime": word.get("startTime", "0s"),
                        "endTime": word.get("endTime", "0s")
                    })
    
    if not all_words:
        # 如果没有 word-level 数据，退回到标准格式
        text = ""
        if "results" in result:
            for r in result["results"]:
                if "alternatives" in r and len(r["alternatives"]) > 0:
                    text += r["alternatives"][0].get("transcript", "")
        return text
    
    # 按说话人分组
    current_speaker = None
    segments = []
    current_segment = []
    
    for word_info in all_words:
        speaker = word_info["speaker"]
        word = word_info["word"]
        
        if speaker != current_speaker:
            # 说话人切换
            if current_segment:
                segments.append({
                    "speaker": current_speaker,
                    "text": " ".join(current_segment)
                })
            current_speaker = speaker
            current_segment = [word]
        else:
            current_segment.append(word)
    
    # 添加最后一个 segment
    if current_segment:
        segments.append({
            "speaker": current_speaker,
            "text": " ".join(current_segment)
        })
    
    # 格式化输出
    if len(segments) == 1:
        # 只有一个说话人，直接返回文本（不添加标签）
        return segments[0]["text"]
    else:
        # 多个说话人，添加标签
        formatted_lines = []
        for seg in segments:
            formatted_lines.append(f"Speaker {seg['speaker']}: {seg['text']}")
        return "\n".join(formatted_lines)


async def _transcribe_google(
    audio_content: bytes,
    filename: str,
    language: Optional[str] = None,
    logger: Optional[TranscriptionLogger] = None,
    enable_diarization: bool = False  # 🎙️ v110: 是否启用说话人分离
) -> Tuple[str, Dict[str, Any]]:
    """
    调用 Google Cloud Speech-to-Text API 进行转录
    🎙️ v110: 支持多说话人分离（Speaker Diarization）
    
    Args:
        audio_content: 音频内容
        filename: 文件名
        language: 语言代码（可选，默认自动识别）
        logger: 日志记录器
        enable_diarization: 是否启用多说话人分离
    
    Returns:
        Tuple[str, dict]: (转录文本, 元数据)
    """
    from server2 import get_access_token, get_project_id
    
    print(f"[FALLBACK] 尝试使用 Google Cloud Speech-to-Text API")
    if enable_diarization:
        print(f"[v110-DIARIZATION] 🎙️ 启用多说话人分离（Speaker Diarization）")
    
    # 获取访问令牌和项目 ID
    access_token = get_access_token()
    project_id = get_project_id()
    
    # Google API endpoint
    api_url = f"https://speech.googleapis.com/v1/speech:recognize"
    
    # 编码音频
    audio_base64 = base64.b64encode(audio_content).decode('utf-8')
    
    # 构建基础配置
    config = {
        "encoding": "LINEAR16",
        "sampleRateHertz": 48000,
        "enableAutomaticPunctuation": True,
        "model": "default"
    }
    
    # 🌍 语言设置（支持英文+中文双语自动检测）
    if language:
        # 用户指定了语言
        config["languageCode"] = convert_language_code_for_google(language)
        print(f"[v110-GOOGLE] 指定语言: {config['languageCode']}")
    else:
        # 默认使用英文+中文双语支持（自动检测）
        config["languageCode"] = "en-US"  # 主要语言
        config["alternativeLanguageCodes"] = ["zh-CN"]  # 备选中文
        print(f"[v110-GOOGLE] 🌍 双语模式: 主语言 en-US, 备选 zh-CN（自动检测）")
    
    # 🎙️ v110: 添加多说话人分离配置
    if enable_diarization:
        config["diarizationConfig"] = {
            "enableSpeakerDiarization": True,
            "minSpeakerCount": 1,
            "maxSpeakerCount": 10  # 支持最多 10 个说话人
        }
        print(f"[v110-DIARIZATION] 配置: minSpeakers=1, maxSpeakers=10")
    
    # 构建请求体
    request_body = {
        "config": config,
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
        timeout=300  # v109: 增加超时到 5 分钟
    )
    
    # 检查响应
    if response.status_code != 200:
        error_msg = f"Google API 错误 [{response.status_code}]: {response.text}"
        raise Exception(error_msg)
    
    # 解析响应
    result = response.json()
    
    # 🌍 检测实际使用的语言（如果 Google API 返回了 languageCode）
    detected_language = None
    if "results" in result and len(result["results"]) > 0:
        detected_language = result["results"][0].get("languageCode")
        if detected_language:
            print(f"[v110-GOOGLE] 🌍 检测到的语言: {detected_language}")
    
    # 🎙️ v110: 处理多说话人分离结果
    if enable_diarization and "results" in result:
        print(f"[v110-DIARIZATION] 开始处理多说话人转录结果")
        text = parse_diarization_result(result)
        speaker_count = count_unique_speakers(result)
        print(f"[v110-DIARIZATION] ✅ 检测到 {speaker_count} 个说话人")
    else:
        # 标准转录（无说话人分离）
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
        "status_code": response.status_code,
        "diarization_enabled": enable_diarization,
        "detected_language": detected_language  # 🌍 添加检测到的语言
    }
    
    if enable_diarization:
        metadata["speaker_count"] = count_unique_speakers(result)
    
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
            audio_content, filename, language, logger,
            enable_diarization=False  # fallback 链中默认不启用 diarization
        )
        
        # 成功！更新状态
        API_FALLBACK_STATUS["last_successful_api"] = "google"
        API_FALLBACK_STATUS["api_usage_count"]["google"] += 1
        
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
# 🎙️ v110: Google-Only 转录（用于系统音频/混合音频）
# ================================================================================

async def transcribe_google_only(
    audio_content: bytes,
    filename: str,
    language: Optional[str] = None,
    duration: Optional[int] = None,
    logger: Optional[TranscriptionLogger] = None
) -> Tuple[str, str, Dict[str, Any]]:
    """
    仅使用 Google API 进行转录，启用多说话人分离
    
    用于系统音频或混合音频场景（需要识别多个说话人）
    
    Args:
        audio_content: 音频文件内容（字节）
        filename: 文件名
        language: 语言代码（可选）
        duration: 音频时长（秒，可选）
        logger: 日志记录器（可选）
    
    Returns:
        Tuple[str, str, dict]: (转录文本, 使用的API, 元数据)
    """
    print(f"[v110-ROUTING] 🎙️ 强制使用 Google API（多说话人支持）")
    
    try:
        # 调用 Google API，启用多说话人分离
        text, metadata = await _transcribe_google(
            audio_content=audio_content,
            filename=filename,
            language=language,
            logger=logger,
            enable_diarization=True  # 🎙️ 启用多说话人分离
        )
        
        # 成功！更新状态
        API_FALLBACK_STATUS["last_successful_api"] = "google"
        API_FALLBACK_STATUS["api_usage_count"]["google"] += 1
        
        print(f"[v110-ROUTING] ✅ Google API 转录成功（多说话人）")
        
        return text, "google", metadata
        
    except Exception as e:
        error_msg = str(e)
        
        if logger:
            logger.log_error("API_GOOGLE_FAILED", f"Google API 失败: {error_msg}")
        
        print(f"[v110-ROUTING] ❌ Google API 失败: {error_msg}")
        
        raise Exception(f"Google API 转录失败: {error_msg}")


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
