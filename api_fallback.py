"""
API Fallback Module for Speech-to-Text
🔥 v112: 多说话人转录（无标签模式）

优先级策略：
麦克风场景：
1. AI Builder Space (OpenAI Whisper) - 免费 $100
2. OpenAI Whisper API - $0.006/min
3. Deepgram Nova-2 - $0.0077/min (备用)

系统/混合场景（多说话人识别）：
1. OpenAI gpt-4o-transcribe-diarize - 多说话人识别，无标签
2. Google Cloud Speech-to-Text - $0.016/min + Diarization，无标签
3. Deepgram Nova-2 - $0.0077/min (备用)

🎯 v112 新特性:
- ✅ 转录所有说话人的话（包括 YouTube 视频中的多人对话）
- ✅ 不显示 "Speaker A:", "Speaker B:" 等标签
- ✅ 返回完整的连续文本
- ✅ 确保不会丢失任何说话人的内容
"""

import os
import time
import json
import base64
import requests
from typing import Tuple, Dict, Any, Optional
from logging_helper import TranscriptionLogger


def get_audio_content_type(filename: str) -> str:
    """根据文件名推断正确的音频 MIME 类型"""
    name = (filename or '').lower()
    if name.endswith('.mp4') or name.endswith('.m4a'):
        return 'audio/mp4'
    elif name.endswith('.webm'):
        return 'audio/webm'
    elif name.endswith('.mp3'):
        return 'audio/mpeg'
    elif name.endswith('.flac'):
        return 'audio/flac'
    elif name.endswith('.wav'):
        return 'audio/wav'
    else:
        return 'audio/wav'


def detect_google_encoding(audio_content: bytes, filename: str) -> tuple:
    """
    根据音频内容和文件名检测 Google STT 所需的编码格式。
    返回 (encoding, sample_rate_hertz)，sample_rate_hertz 为 None 时不设置该字段。
    """
    # 通过文件头字节检测格式
    if len(audio_content) >= 12:
        if audio_content[:4] == b'RIFF' and audio_content[8:12] == b'WAVE':
            return ('LINEAR16', 48000)
        elif audio_content[:4] in (b'\x1aE\xdf\xa3', b'\x1a\x45\xdf\xa3'):
            return ('WEBM_OPUS', None)  # WEBM_OPUS 不需要指定采样率
    # fallback：根据文件名判断
    name = (filename or '').lower()
    if name.endswith('.webm'):
        return ('WEBM_OPUS', None)
    elif name.endswith('.mp3'):
        return ('MP3', None)
    return ('LINEAR16', 48000)

# ================================================================================
# 全局状态管理（服务器重启后重置）
# ================================================================================

API_FALLBACK_STATUS = {
    "ai_builder_quota_exceeded": False,
    "ai_builder_last_check": None,
    "openai_quota_exceeded": False,
    "openai_last_check": None,
    "deepgram_quota_exceeded": False,  # v111: Deepgram
    "deepgram_last_check": None,
    "last_successful_api": "ai_builder",  # v111: 回到 AI Builder 为主力
    "api_usage_count": {
        "ai_builder": 0,
        "openai": 0,
        "deepgram": 0,  # v111: Deepgram
        "google": 0,
        "openai_diarize": 0  # v111: OpenAI 多说话人模型
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
        api_name: API 名称 ("deepgram", "ai_builder", "openai")
    
    Returns:
        bool: True 表示应该重试
    """
    # 🆕 v111: Deepgram
    if api_name == "deepgram":
        if API_FALLBACK_STATUS["deepgram_quota_exceeded"]:
            last_check = API_FALLBACK_STATUS["deepgram_last_check"]
            if last_check and (time.time() - last_check) < QUOTA_RECHECK_INTERVAL:
                return False
            print(f"[v111-FALLBACK] Deepgram quota 检查间隔已过，尝试重新检测")
            return True
        return True
    
    elif api_name == "ai_builder":
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
# 🆕 v111: API 调用函数 - OpenAI gpt-4o-transcribe-diarize (多说话人)
# ================================================================================

async def _transcribe_openai_diarize(
    audio_content: bytes,
    filename: str,
    language: Optional[str] = None,
    duration: Optional[int] = None,
    logger: Optional[TranscriptionLogger] = None
) -> Tuple[str, Dict[str, Any]]:
    """
    调用 OpenAI gpt-4o-transcribe-diarize 进行多说话人转录
    
    特点：
    - 原生多说话人识别（Speaker Diarization）
    - 支持中英文混合
    - ✅ 返回完整转录文本（不包含说话人标签）
    - ✅ 确保所有说话人的话都被转录
    
    Args:
        audio_content: 音频文件的二进制内容
        filename: 音频文件名
        language: 语言代码（可选）
        duration: 音频时长（秒）
        logger: 日志记录器
    
    Returns:
        Tuple[str, dict]: (转录文本, 元数据)
    """
    openai_api_key = os.environ.get("OPENAI_API_KEY")
    
    if not openai_api_key:
        raise Exception("OPENAI_API_KEY 未配置")
    
    print(f"[v112-OPENAI-DIARIZE] 🎤 开始调用 OpenAI gpt-4o-transcribe-diarize（多说话人识别）")
    print(f"[v112-OPENAI-DIARIZE] - 文件名: {filename}")
    print(f"[v112-OPENAI-DIARIZE] - 音频大小: {len(audio_content) / 1024:.2f} KB")
    if duration:
        print(f"[v112-OPENAI-DIARIZE] - 时长: {duration}秒")
    
    # OpenAI API endpoint
    api_url = "https://api.openai.com/v1/audio/transcriptions"
    
    # 准备请求
    files = {
        'file': (filename, audio_content, get_audio_content_type(filename))
    }
    
    # 🔥 v112: 使用 diarized_json 格式以获取完整的多说话人转录
    # 参考文档: https://platform.openai.com/docs/api-reference/audio/createTranscription
    data = {
        'model': 'gpt-4o-transcribe-diarize',
        'response_format': 'diarized_json',  # 🔥 使用 diarized_json 获取 segments
        'chunking_strategy': 'auto',  # 自动分段（音频>30秒时必需）
    }
    
    # 如果指定了语言，添加语言参数
    if language:
        data['language'] = language
        print(f"[v112-OPENAI-DIARIZE] 指定语言: {language}")
    else:
        print(f"[v112-OPENAI-DIARIZE] 🌍 使用自动语言识别")
    
    print(f"[v112-OPENAI-DIARIZE] 📤 发送转录请求（diarized_json 格式）...")
    start_time = time.time()
    
    # 发送请求
    response = requests.post(
        api_url,
        headers={
            "Authorization": f"Bearer {openai_api_key}"
        },
        files=files,
        data=data,
        timeout=300
    )
    
    api_time = time.time() - start_time
    print(f"[v112-OPENAI-DIARIZE] ⏱️ API 响应耗时: {api_time:.2f}秒")
    
    # 检查响应
    if response.status_code != 200:
        error_msg = f"OpenAI Diarize API 错误 [{response.status_code}]: {response.text}"
        raise Exception(error_msg)
    
    # 解析响应
    result = response.json()
    
    # 提取转录文本（根据 diarized_json 格式）
    if 'segments' in result and result['segments']:
        print(f"[v112-OPENAI-DIARIZE] 🎤 检测到多说话人信息")
        
        # 统计说话人数量
        speakers = set()
        for segment in result['segments']:
            if 'speaker' in segment:
                speakers.add(segment['speaker'])
        
        print(f"[v112-OPENAI-DIARIZE] - 检测到 {len(speakers)} 个说话人")
        
        # 🔥 v112: 合并所有说话人的文本，不包含说话人标签
        # 按时间顺序拼接所有 segment 的文本
        all_texts = []
        for segment in result['segments']:
            text = segment.get('text', '').strip()
            if text:  # 只添加非空文本
                all_texts.append(text)
        
        # 合并为一段完整文本
        transcription_text = " ".join(all_texts)
        print(f"[v112-OPENAI-DIARIZE] ✅ 已合并所有说话人文本（无标签）")
        print(f"[v112-OPENAI-DIARIZE] - {len(speakers)} 个说话人的 {len(all_texts)} 个语句片段")
        
        metadata = {
            "api": "openai_diarize",
            "model": "gpt-4o-transcribe-diarize",
            "num_speakers": len(speakers),
            "num_segments": len(result['segments']),
            "api_response_time": round(api_time, 2),
            "status_code": response.status_code,
            "note": "All speakers transcribed without labels"
        }
    else:
        # 没有 segments，使用普通文本（fallback）
        transcription_text = result.get('text', '')
        if not transcription_text:
            raise Exception("OpenAI Diarize API 返回空文本")
        
        print(f"[v112-OPENAI-DIARIZE] ⚠️ 未检测到 segments，使用完整文本")
        
        metadata = {
            "api": "openai_diarize",
            "model": "gpt-4o-transcribe-diarize",
            "api_response_time": round(api_time, 2),
            "status_code": response.status_code
        }
    
    print(f"[v112-OPENAI-DIARIZE] ✅ 转录成功")
    print(f"[v112-OPENAI-DIARIZE] - 文本长度: {len(transcription_text)} 字符")
    
    # 记录日志
    if logger:
        logger.log_api_response(
            status_code=200,
            response_headers={},
            response_body={"text": transcription_text, "metadata": metadata},
            duration_seconds=api_time
        )
    
    # 更新全局状态
    API_FALLBACK_STATUS["api_usage_count"]["openai_diarize"] += 1
    API_FALLBACK_STATUS["last_successful_api"] = "openai_diarize"
    
    return transcription_text, metadata


# ================================================================================
# 🆕 v111: API 调用函数 - Deepgram Nova-2 (备用)
# ================================================================================

async def _transcribe_deepgram(
    audio_content: bytes,
    filename: str,
    language: Optional[str] = None,
    duration: Optional[int] = None,
    enable_diarization: bool = False,
    logger: Optional[TranscriptionLogger] = None
) -> Tuple[str, Dict[str, Any]]:
    """
    调用 Deepgram Nova-3 Multilingual API 进行转录
    
    特点：
    - 多语言支持（90+ 语言）
    - 可选多说话人识别（Diarization）
    - 高准确率（最新 Nova-3 模型）
    - 快速响应
    
    Args:
        audio_content: 音频文件的二进制内容
        filename: 音频文件名
        language: 语言代码（可选，Deepgram 支持自动检测）
        duration: 音频时长（秒）
        enable_diarization: 是否启用多说话人识别
        logger: 日志记录器
    
    Returns:
        Tuple[str, dict]: (转录文本, 元数据)
    """
    print(f"[v111-DEEPGRAM-DEBUG] ========== 进入 _transcribe_deepgram 函数 ==========")
    
    from server2 import DEEPGRAM_API_KEY
    
    print(f"[v111-DEEPGRAM-DEBUG] DEEPGRAM_API_KEY 存在: {bool(DEEPGRAM_API_KEY)}")
    print(f"[v111-DEEPGRAM-DEBUG] DEEPGRAM_API_KEY 长度: {len(DEEPGRAM_API_KEY) if DEEPGRAM_API_KEY else 0}")
    
    if not DEEPGRAM_API_KEY:
        raise Exception("DEEPGRAM_API_KEY 未配置")
    
    try:
        print(f"[v111-DEEPGRAM-DEBUG] 使用 REST API 直接调用 Deepgram")
        
        print(f"[v111-DEEPGRAM] 🚀 开始调用 Deepgram Nova-3 Multilingual API")
        print(f"[v111-DEEPGRAM] - 文件名: {filename}")
        print(f"[v111-DEEPGRAM] - 音频大小: {len(audio_content) / 1024:.2f} KB")
        if duration:
            print(f"[v111-DEEPGRAM] - 时长: {duration}秒")
        print(f"[v111-DEEPGRAM] - 多说话人识别: {'启用' if enable_diarization else '禁用'}")
        
        # 使用 REST API 直接调用
        api_url = "https://api.deepgram.com/v1/listen"
        
        # 🌍 使用 Nova-2 支持自动语言识别或指定语言
        # Nova-2 支持多种语言，可以自动检测或指定语言代码
        params = {
            "model": "nova-2",
            "smart_format": "true",
            "punctuate": "true",
            "paragraphs": "true",
        }
        
        # 🔥 v113: 支持自动语言识别
        if language:
            # 用户指定了语言，使用指定语言
            params["language"] = language
            print(f"[v113-DEEPGRAM] 指定语言: {language}")
        else:
            # 不指定语言，让Deepgram自动检测（推荐）
            # Deepgram Nova-2 支持自动语言检测
            print(f"[v113-DEEPGRAM] 🌍 使用自动语言识别")
        
        if enable_diarization:
            params["diarize"] = "true"
        
        headers = {
            "Authorization": f"Token {DEEPGRAM_API_KEY}",
            "Content-Type": "audio/wav"
        }
        
        print(f"[v111-DEEPGRAM] 📤 发送转录请求...")
        start_time = time.time()
        
        # 发送请求
        response = requests.post(
            api_url,
            headers=headers,
            params=params,
            data=audio_content,
            timeout=300
        )
        
        api_time = time.time() - start_time
        print(f"[v111-DEEPGRAM] ⏱️ API 响应耗时: {api_time:.2f}秒")
        
        if response.status_code != 200:
            error_msg = f"Deepgram API 错误 [{response.status_code}]: {response.text}"
            raise Exception(error_msg)
        
        # 解析响应
        result = response.json()
        
        # 提取转录文本
        try:
            transcription_text = result['results']['channels'][0]['alternatives'][0]['transcript']
        except (KeyError, IndexError) as e:
            raise Exception(f"无法解析 Deepgram 响应: {e}")
        
        if not transcription_text or not transcription_text.strip():
            raise Exception("Deepgram 返回空转录结果")
        
        print(f"[v111-DEEPGRAM] ✅ 转录成功")
        print(f"[v111-DEEPGRAM] - 文本长度: {len(transcription_text)} 字符")
        
        # 提取元数据
        metadata = {
            "api": "deepgram_nova2_chinese",
            "model": "nova-2",
            "language": "zh-CN",
            "api_response_time": round(api_time, 2),
            "audio_duration": duration,
            "diarization_enabled": enable_diarization,
        }
        
        # 如果启用了多说话人识别，处理说话人标签
        if enable_diarization:
            try:
                words = result['results']['channels'][0]['alternatives'][0].get('words', [])
                if words:
                    print(f"[v111-DEEPGRAM] 🎤 检测到多说话人信息")
                    speakers = set()
                    for word in words:
                        if 'speaker' in word:
                            speakers.add(word['speaker'])
                    
                    if len(speakers) > 1:
                        print(f"[v111-DEEPGRAM] - 检测到 {len(speakers)} 个说话人")
                        metadata["num_speakers"] = len(speakers)
                        
                        # 格式化带说话人标签的文本
                        formatted_text = []
                        current_speaker = None
                        current_text = []
                        
                        for word in words:
                            word_speaker = word.get('speaker')
                            word_text = word.get('punctuated_word', word.get('word', ''))
                            
                            if current_speaker is None:
                                current_speaker = word_speaker
                            elif word_speaker != current_speaker:
                                # 切换说话人
                                if current_text:
                                    formatted_text.append(f"Speaker {current_speaker}: {' '.join(current_text)}")
                                current_speaker = word_speaker
                                current_text = []
                            
                            current_text.append(word_text)
                        
                        # 添加最后一个说话人的文本
                        if current_text:
                            formatted_text.append(f"Speaker {current_speaker}: {' '.join(current_text)}")
                        
                        if formatted_text:
                            transcription_text = "\n".join(formatted_text)
                            print(f"[v111-DEEPGRAM] ✅ 已格式化多说话人文本")
            except Exception as e:
                print(f"[v111-DEEPGRAM] ⚠️ 多说话人处理失败: {e}")
        
        # 记录日志
        if logger:
            logger.log_api_response(
                status_code=200,
                response_headers={},
                response_body={"text": transcription_text, "metadata": metadata},
                duration_seconds=api_time
            )
        
        # 更新全局状态
        API_FALLBACK_STATUS["api_usage_count"]["deepgram"] += 1
        API_FALLBACK_STATUS["last_successful_api"] = "deepgram"
        
        return transcription_text, metadata
        
    except Exception as e:
        error_msg = str(e)
        print(f"[v111-DEEPGRAM] ❌ Deepgram API 调用失败: {error_msg}")
        
        # 记录失败日志
        if logger:
            logger.log_error(
                error_type="DEEPGRAM_API_ERROR",
                error_message=error_msg
            )
        
        raise Exception(f"Deepgram API 转录失败: {error_msg}")


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
    
    print(f"[v111-AI-BUILDER-DEBUG] ========== 进入 _transcribe_ai_builder 函数 ==========")
    print(f"[v111-AI-BUILDER-DEBUG] AI_BUILDER_TOKEN 存在: {bool(AI_BUILDER_TOKEN)}")
    print(f"[v111-AI-BUILDER-DEBUG] audio_content 类型: {type(audio_content)}")
    print(f"[v111-AI-BUILDER-DEBUG] audio_content 是否为 None: {audio_content is None}")
    if audio_content:
        print(f"[v111-AI-BUILDER-DEBUG] audio_content 长度: {len(audio_content)}")
    else:
        print(f"[v111-AI-BUILDER-DEBUG] ❌❌❌ audio_content 是 None！这是错误的根源！")
        raise Exception("audio_content 是 None，无法进行转录")
    
    if not AI_BUILDER_TOKEN:
        raise Exception("AI_BUILDER_TOKEN 未配置")
    
    print(f"[FALLBACK] 尝试使用 AI Builder Space API")
    print(f"[v109-FIX] 🔧 添加 Prompt 参数，尝试解决内容截断问题")
    print(f"[v109-FIX] 🔧 超时增加到 300 秒，response_format 改为 verbose_json")
    
    # 准备请求
    api_url = f"{AI_BUILDER_API_BASE}/audio/transcriptions"
    
    # 🔥 AI Builder Space 使用 'audio_file' 作为字段名（不是 'file'）
    files = {
        'audio_file': (filename, audio_content, get_audio_content_type(filename))
    }
    
    # 🔧 v109: 添加 prompt 参数，解决内容截断问题
    # 🌍 v110: 恢复自动语言识别（移除 v108-TEST 强制英文）
    form_data = {
        'model': 'whisper-1',
        'response_format': 'verbose_json',  # v109: 改为 verbose 获取更多信息
        'prompt': 'This is a continuous recording containing both human speech and video/audio playback (such as YouTube). Please transcribe all audio content completely and accurately, including all speech, video audio, and background sounds throughout the entire recording.'  # v109: 引导完整转录
    }
    
    # 🌍 v110: 如果指定了语言，则使用指定语言；否则自动检测
    if language:
        form_data['language'] = language
        print(f"[v110-WHISPER] 指定语言: {language}")
    else:
        print(f"[v110-WHISPER] 🌍 使用自动语言识别")
    
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
    
    # 解析响应 - 先记录原始响应便于调试
    raw_text = response.text
    print(f"[AI-BUILDER-RAW] 原始响应前200字符: {repr(raw_text[:200])}")
    
    result = response.json()
    print(f"[AI-BUILDER-RAW] JSON解析后类型: {type(result)}, 值: {repr(str(result)[:200])}")
    
    # v109: 支持多种响应格式，兼容不同 key 名称
    if isinstance(result, dict) and 'text' in result:
        text = result.get('text', '')
    elif isinstance(result, dict) and 'query' in result:
        text = result.get('query', '')
    elif isinstance(result, str):
        text = result
    else:
        text = str(result)
    
    # 清理文本：去除首尾引号、\n转义符号等格式残留
    text = text.strip()
    # 去除首尾的引号（如果整个字符串被引号包裹）
    if text.startswith('"') and text.endswith('"') and len(text) > 2:
        text = text[1:-1]
    elif text.startswith('"') and '"}' in text:
        # 处理如 "\n\ntext"} 的格式
        text = text.lstrip('"').rstrip('}"').strip()
    # 去除开头的 \n 转义字符（字面量 backslash-n）
    text = text.lstrip('\\n').strip()
    # 去除开头的实际换行符
    text = text.lstrip('\n').strip()
    
    print(f"[AI-BUILDER-CLEANED] 清理后文本前100字符: {repr(text[:100])}")
    
    if not text:
        raise Exception("AI Builder Space API 返回空文本")
    
    # v109: 记录 verbose 信息（如果有）
    if 'segments' in result and result['segments'] is not None:
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
    duration: Optional[int] = None,  # 🆕 v111: 添加 duration 参数
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
    print(f"[v109-FIX] 🔧 添加 Prompt 参数，尝试解决内容截断问题")
    
    # OpenAI API endpoint
    api_url = "https://api.openai.com/v1/audio/transcriptions"
    
    # 准备请求
    files = {
        'file': (filename, audio_content, get_audio_content_type(filename))
    }
    
    # 🔧 v109: 添加 prompt 参数
    # 🌍 v110: 恢复自动语言识别（移除 v108-TEST 强制英文）
    data = {
        'model': 'whisper-1',
        'response_format': 'verbose_json',  # v109: 改为 verbose
        'prompt': 'This is a continuous recording containing both human speech and video/audio playback (such as YouTube). Please transcribe all audio content completely and accurately, including all speech, video audio, and background sounds throughout the entire recording.'  # v109: 引导完整转录
    }
    
    # 🌍 v110: 如果指定了语言，则使用指定语言；否则自动检测
    if language:
        data['language'] = language
        print(f"[v110-WHISPER] 指定语言: {language}")
    else:
        print(f"[v110-WHISPER] 🌍 使用自动语言识别")
    
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
    if 'segments' in result and result['segments'] is not None:
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


def parse_diarization_result(result: Dict[str, Any], remove_speaker_labels: bool = False) -> str:
    """
    解析多说话人分离结果，格式化输出
    
    Args:
        result: Google API 返回的结果
        remove_speaker_labels: 是否移除说话人标签（True = 只返回文本，False = 包含标签）
    
    Returns:
        str: 格式化的转录文本
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
    
    # 🔥 v112: 如果只需要完整文本（不需要标签），直接拼接所有单词
    if remove_speaker_labels:
        all_text = " ".join([word_info["word"] for word_info in all_words])
        return all_text
    
    # 以下是原有的带标签逻辑
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
    enable_diarization: bool = False,  # 🎙️ v110: 是否启用说话人分离
    remove_speaker_labels: bool = False  # 🔥 v112: 是否移除说话人标签
) -> Tuple[str, Dict[str, Any]]:
    """
    调用 Google Cloud Speech-to-Text API 进行转录
    🎙️ v110: 支持多说话人分离（Speaker Diarization）
    🔥 v112: 支持移除说话人标签（转录所有人但不显示标签）
    
    Args:
        audio_content: 音频内容
        filename: 文件名
        language: 语言代码（可选，默认自动识别）
        logger: 日志记录器
        enable_diarization: 是否启用多说话人分离
        remove_speaker_labels: 是否移除说话人标签（True = 只返回完整文本）
    
    Returns:
        Tuple[str, dict]: (转录文本, 元数据)
    """
    from server2 import get_access_token, get_project_id
    
    print(f"[FALLBACK] 尝试使用 Google Cloud Speech-to-Text API")
    if enable_diarization:
        print(f"[v112-GOOGLE-DIARIZATION] 🎙️ 启用多说话人分离（Speaker Diarization）")
        if remove_speaker_labels:
            print(f"[v112-GOOGLE-DIARIZATION] ✅ 模式: 转录所有说话人，但不显示标签")
        else:
            print(f"[v112-GOOGLE-DIARIZATION] 📋 模式: 转录所有说话人并显示标签")
    
    # 获取访问令牌和项目 ID
    access_token = get_access_token()
    project_id = get_project_id()
    
    # Google API endpoint
    api_url = f"https://speech.googleapis.com/v1/speech:recognize"
    
    # 编码音频
    audio_base64 = base64.b64encode(audio_content).decode('utf-8')
    
    # 自动检测编码格式（支持 WAV/LINEAR16 和 WebM/WEBM_OPUS）
    google_encoding, sample_rate = detect_google_encoding(audio_content, filename)
    print(f"[GOOGLE-STT] 检测到编码格式: {google_encoding}" + (f", 采样率: {sample_rate}Hz" if sample_rate else "（采样率自动检测）"))
    
    # 构建基础配置
    config = {
        "encoding": google_encoding,
        "enableAutomaticPunctuation": True,
        "model": "default"
    }
    if sample_rate:
        config["sampleRateHertz"] = sample_rate
    
    # 🌍 语言设置（支持英文+中文双语自动检测）
    if language:
        # 用户指定了语言
        config["languageCode"] = convert_language_code_for_google(language)
        print(f"[v112-GOOGLE] 指定语言: {config['languageCode']}")
    else:
        # 默认使用英文+中文双语支持（自动检测）
        config["languageCode"] = "en-US"  # 主要语言
        config["alternativeLanguageCodes"] = ["zh-CN"]  # 备选中文
        print(f"[v112-GOOGLE] 🌍 双语模式: 主语言 en-US, 备选 zh-CN（自动检测）")
    
    # 🎙️ v110/v112: 添加多说话人分离配置
    # 参考文档: https://cloud.google.com/speech-to-text/v2/docs/multiple-voices
    # 🔥 v112: 优化为 maxSpeakers=6（YouTube 视频很少超过 6 人，更准确）
    if enable_diarization:
        config["diarizationConfig"] = {
            "enableSpeakerDiarization": True,
            "minSpeakerCount": 1,  # 最少 1 个说话人
            "maxSpeakerCount": 6   # 🔥 最多 6 个说话人（优化准确率）
        }
        print(f"[v112-GOOGLE-DIARIZATION] 配置: minSpeakers=1, maxSpeakers=6（优化准确率）")
    
    # 构建请求体
    request_body = {
        "config": config,
        "audio": {
            "content": audio_base64
        }
    }
    
    print(f"[v112-GOOGLE] 📤 发送转录请求...")
    start_time = time.time()
    
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
    
    api_time = time.time() - start_time
    print(f"[v112-GOOGLE] ⏱️ API 响应耗时: {api_time:.2f}秒")
    
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
            print(f"[v112-GOOGLE] 🌍 检测到的语言: {detected_language}")
    
    # 🎙️ v110/v112: 处理多说话人分离结果
    if enable_diarization and "results" in result:
        print(f"[v112-GOOGLE-DIARIZATION] 开始处理多说话人转录结果")
        
        # 🔥 v112: 使用新参数控制是否显示标签
        text = parse_diarization_result(result, remove_speaker_labels=remove_speaker_labels)
        speaker_count = count_unique_speakers(result)
        
        if remove_speaker_labels:
            print(f"[v112-GOOGLE-DIARIZATION] ✅ 检测到 {speaker_count} 个说话人，已合并完整文本（无标签）")
        else:
            print(f"[v112-GOOGLE-DIARIZATION] ✅ 检测到 {speaker_count} 个说话人（带标签）")
    else:
        # 标准转录（无说话人分离）
        text = ""
        if "results" in result and len(result["results"]) > 0:
            for r in result["results"]:
                if "alternatives" in r and len(r["alternatives"]) > 0:
                    text += r["alternatives"][0].get("transcript", "")
    
    if not text:
        raise Exception("Google API 返回空文本")
    
    print(f"[v112-GOOGLE] ✅ 转录成功")
    print(f"[v112-GOOGLE] - 文本长度: {len(text)} 字符")
    
    metadata = {
        "api": "google",
        "model": "default",
        "status_code": response.status_code,
        "diarization_enabled": enable_diarization,
        "speaker_labels_removed": remove_speaker_labels,  # 🔥 v112: 新增标识
        "detected_language": detected_language,  # 🌍 添加检测到的语言
        "api_response_time": round(api_time, 2)
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
    🎤 v111: 麦克风场景智能 fallback 转录
    
    优先级：
    1️⃣ AI Builder Space (OpenAI Whisper)
    2️⃣ OpenAI Whisper API
    3️⃣ Deepgram Nova-2 (备用)
    
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
    
    print(f"[v111-DEBUG] ========== 开始麦克风场景 Fallback ==========")
    print(f"[v111-DEBUG] 音频大小: {len(audio_content) if audio_content else 'None'} bytes")
    print(f"[v111-DEBUG] 文件名: {filename}")
    print(f"[v111-DEBUG] 语言: {language}")
    print(f"[v111-DEBUG] 时长: {duration}")
    
    # ============================================================================
    # 1️⃣ 尝试 AI Builder Space
    # ============================================================================
    print(f"[v111-DEBUG] 检查 AI Builder 是否可用...")
    ai_builder_should_retry = should_retry_api("ai_builder")
    print(f"[v111-DEBUG] should_retry_api('ai_builder') = {ai_builder_should_retry}")
    
    if ai_builder_should_retry:
        print(f"[v111-DEBUG] ✅ 开始尝试 AI Builder API...")
        try:
            text, metadata = await _transcribe_ai_builder(
                audio_content, filename, language, duration, logger
            )
            
            print(f"[v111-FALLBACK] ✅ AI Builder Space 转录成功")
            print(f"[v111-DEBUG] 返回文本长度: {len(text)}")
            return text, "ai_builder", metadata
            
        except Exception as e:
            error_msg = str(e)
            errors.append(f"AI Builder: {error_msg}")
            print(f"[v111-FALLBACK] ❌ AI Builder 失败: {error_msg}")
            print(f"[v111-DEBUG] AI Builder 异常详情: {type(e).__name__}: {e}")
            import traceback
            print(f"[v111-DEBUG] AI Builder 堆栈跟踪:\n{traceback.format_exc()}")
            
            # 检查是否是配额问题
            if is_quota_exceeded(None, error_msg):
                API_FALLBACK_STATUS["ai_builder_quota_exceeded"] = True
                API_FALLBACK_STATUS["ai_builder_last_check"] = time.time()
                print(f"[v111-FALLBACK] 🚨 AI Builder 配额耗尽，切换到下一个 API")
    else:
        print(f"[v111-FALLBACK] ⏭️ 跳过 AI Builder（配额已耗尽）")
        print(f"[v111-DEBUG] AI Builder quota_exceeded: {API_FALLBACK_STATUS['ai_builder_quota_exceeded']}")
        errors.append("AI Builder: 配额已耗尽，跳过")
    
    # ============================================================================
    # 2️⃣ 尝试 OpenAI Whisper API
    # ============================================================================
    print(f"[v111-DEBUG] 检查 OpenAI 是否可用...")
    openai_should_retry = should_retry_api("openai")
    print(f"[v111-DEBUG] should_retry_api('openai') = {openai_should_retry}")
    
    if openai_should_retry:
        print(f"[v111-DEBUG] ✅ 开始尝试 OpenAI Whisper API...")
        try:
            text, metadata = await _transcribe_openai(
                audio_content, filename, language, duration, logger
            )
            
            print(f"[v111-FALLBACK] ✅ OpenAI Whisper 转录成功 (Fallback #2)")
            print(f"[v111-DEBUG] 返回文本长度: {len(text)}")
            return text, "openai_whisper", metadata
            
        except Exception as e:
            error_msg = str(e)
            errors.append(f"OpenAI: {error_msg}")
            print(f"[v111-FALLBACK] ❌ OpenAI Whisper 失败: {error_msg}")
            
            # 检查是否是配额问题
            if is_quota_exceeded(None, error_msg):
                API_FALLBACK_STATUS["openai_quota_exceeded"] = True
                API_FALLBACK_STATUS["openai_last_check"] = time.time()
    else:
        print(f"[v111-FALLBACK] ⏭️ 跳过 OpenAI（配额已耗尽）")
        errors.append("OpenAI: 配额已耗尽，跳过")
    
    # ============================================================================
    # 3️⃣ 尝试 Deepgram Nova-2（备用）
    # ============================================================================
    print(f"[v111-DEBUG] 检查 Deepgram 是否可用...")
    deepgram_should_retry = should_retry_api("deepgram")
    print(f"[v111-DEBUG] should_retry_api('deepgram') = {deepgram_should_retry}")
    
    if deepgram_should_retry:
        print(f"[v111-DEBUG] ✅ 开始尝试 Deepgram API (Fallback #3 - 备用)...")
        try:
            text, metadata = await _transcribe_deepgram(
                audio_content, filename, language, duration, 
                enable_diarization=False,  # 麦克风场景不需要多说话人识别
                logger=logger
            )
            
            print(f"[v111-FALLBACK] ✅ Deepgram Nova-2 转录成功 (Fallback #3 - 备用)")
            print(f"[v111-DEBUG] 返回文本长度: {len(text)}")
            return text, "deepgram_nova2_chinese", metadata
            
        except Exception as e:
            error_msg = str(e)
            errors.append(f"Deepgram: {error_msg}")
            print(f"[v111-FALLBACK] ❌ Deepgram 失败: {error_msg}")
            print(f"[v111-DEBUG] Deepgram 异常详情: {type(e).__name__}: {e}")
            import traceback
            print(f"[v111-DEBUG] Deepgram 堆栈跟踪:\n{traceback.format_exc()}")
            
        except Exception as e:
            error_msg = str(e)
            errors.append(f"OpenAI: {error_msg}")
            print(f"[v111-FALLBACK] ❌ OpenAI Whisper 失败: {error_msg}")
            
            # 检查是否是配额问题
            if is_quota_exceeded(None, error_msg):
                API_FALLBACK_STATUS["openai_quota_exceeded"] = True
                API_FALLBACK_STATUS["openai_last_check"] = time.time()
    else:
        print(f"[v111-FALLBACK] ⏭️ 跳过 OpenAI（配额已耗尽）")
        errors.append("OpenAI: 配额已耗尽，跳过")
    
    # ============================================================================
    # ❌ 所有 API 都失败
    # ============================================================================
    error_summary = " | ".join(errors)
    print(f"[v111-FALLBACK] 💥 所有 API 都失败了")
    print(f"[v111-FALLBACK] 错误汇总: {error_summary}")
    
    raise Exception(f"所有转录 API 都失败了: {error_summary}")


# ================================================================================
# 🆕 v111: 系统/混合音频专用函数（Deepgram + Google 双保险）
# ================================================================================

async def transcribe_system_audio(
    audio_content: bytes,
    filename: str,
    language: Optional[str] = None,
    duration: Optional[int] = None,
    logger: Optional[TranscriptionLogger] = None
) -> Tuple[str, str, Dict[str, Any]]:
    """
    🔊 v112: 系统/混合音频转录（支持多说话人识别，不显示标签）
    
    优先级：
    1️⃣ OpenAI gpt-4o-transcribe-diarize (多说话人，无标签)
    2️⃣ Google Cloud Speech-to-Text + Diarization (多说话人，无标签)
    3️⃣ Deepgram Nova-2 (备用)
    
    ✅ 特性：转录所有说话人的话，但不显示"Speaker A:", "Speaker B:"等标签
    
    Args:
        audio_content: 音频文件内容（字节）
        filename: 文件名
        language: 语言代码（可选）
        duration: 音频时长（秒，可选）
        logger: 日志记录器（可选）
    
    Returns:
        Tuple[str, str, dict]: (转录文本, 使用的API, 元数据)
    """
    print(f"[v112-SYSTEM] 🔊 系统/混合音频场景 → 启用多说话人识别（无标签模式）")
    errors = []
    
    # ============================================================================
    # 1️⃣ 尝试 OpenAI gpt-4o-transcribe-diarize（主力）
    # ============================================================================
    try:
        text, metadata = await _transcribe_openai_diarize(
            audio_content=audio_content,
            filename=filename,
            language=language,
            duration=duration,
            logger=logger
        )
        
        # 成功！更新状态
        API_FALLBACK_STATUS["last_successful_api"] = "openai_diarize"
        API_FALLBACK_STATUS["api_usage_count"]["openai_diarize"] += 1
        
        print(f"[v112-SYSTEM] ✅ OpenAI Diarize 转录成功（多说话人，无标签）")
        
        return text, "openai_diarize", metadata
        
    except Exception as e:
        error_msg = str(e)
        errors.append(f"OpenAI Diarize: {error_msg}")
        print(f"[v112-SYSTEM] ❌ OpenAI Diarize 失败: {error_msg}")
    
    # ============================================================================
    # 2️⃣ 尝试 Google Cloud Speech-to-Text + Diarization（无标签）
    # ============================================================================
    try:
        text, metadata = await _transcribe_google(
            audio_content=audio_content,
            filename=filename,
            language=language,
            logger=logger,
            enable_diarization=True,  # 🎤 启用多说话人识别
            remove_speaker_labels=True  # 🔥 v112: 不显示说话人标签
        )
        
        # 成功！更新状态
        API_FALLBACK_STATUS["last_successful_api"] = "google"
        API_FALLBACK_STATUS["api_usage_count"]["google"] += 1
        
        print(f"[v112-SYSTEM] ✅ Google API 转录成功（多说话人，无标签）(Fallback #2)")
        
        return text, "google", metadata
        
    except Exception as e:
        error_msg = str(e)
        errors.append(f"Google: {error_msg}")
        print(f"[v112-SYSTEM] ❌ Google API 失败: {error_msg}")
    
    # ============================================================================
    # 3️⃣ 尝试 Deepgram Nova-2 + Diarization（备用）
    # ============================================================================
    if should_retry_api("deepgram"):
        try:
            text, metadata = await _transcribe_deepgram(
                audio_content=audio_content,
                filename=filename,
                language=language,
                duration=duration,
                enable_diarization=True,  # 🎤 启用多说话人识别
                logger=logger
            )
            
            # 成功！更新状态
            API_FALLBACK_STATUS["last_successful_api"] = "deepgram"
            API_FALLBACK_STATUS["api_usage_count"]["deepgram"] += 1
            
            print(f"[v112-SYSTEM] ✅ Deepgram Nova-2 转录成功（多说话人）(Fallback #3 - 备用)")
            
            return text, "deepgram_nova2_chinese", metadata
            
        except Exception as e:
            error_msg = str(e)
            errors.append(f"Deepgram: {error_msg}")
            print(f"[v112-SYSTEM] ❌ Deepgram 失败: {error_msg}")
            
            # 检查是否是配额问题
            if is_quota_exceeded(None, error_msg):
                API_FALLBACK_STATUS["deepgram_quota_exceeded"] = True
                API_FALLBACK_STATUS["deepgram_last_check"] = time.time()
                print(f"[v112-SYSTEM] 🚨 Deepgram 配额耗尽")
    else:
        print(f"[v112-SYSTEM] ⏭️ 跳过 Deepgram（配额已耗尽）")
        errors.append("Deepgram: 配额已耗尽，跳过")
    
    # ============================================================================
    # ❌ 所有 API 都失败
    # ============================================================================
    error_summary = " | ".join(errors)
    print(f"[v112-SYSTEM] 💥 所有系统音频 API 都失败了")
    print(f"[v112-SYSTEM] 错误汇总: {error_summary}")
    
    raise Exception(f"系统音频转录失败（所有 API）: {error_summary}")


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
        "deepgram": {  # 🆕 v111
            "available": not API_FALLBACK_STATUS["deepgram_quota_exceeded"],
            "quota_exceeded": API_FALLBACK_STATUS["deepgram_quota_exceeded"],
            "last_check": API_FALLBACK_STATUS["deepgram_last_check"],
            "usage_count": API_FALLBACK_STATUS["api_usage_count"]["deepgram"]
        },
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
