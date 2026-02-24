"""
统一的日志记录工具
用于调试音频转录 API 请求
"""
import json
import datetime
import traceback
from typing import Dict, Any, Optional


class TranscriptionLogger:
    """转录请求日志记录器"""
    
    def __init__(self, endpoint_name: str = "transcription"):
        self.endpoint_name = endpoint_name
        self.log_data: Dict[str, Any] = {
            "endpoint": endpoint_name,
            "timestamp": datetime.datetime.now().isoformat(),
        }
    
    def log_request_info(self, filename: str, content_type: str, file_size: int, duration: Optional[int] = None):
        """记录请求基本信息"""
        self.log_data["request"] = {
            "filename": filename,
            "content_type": content_type,
            "file_size_bytes": file_size,
            "file_size_kb": round(file_size / 1024, 2),
            "file_size_mb": round(file_size / 1024 / 1024, 2),
        }
        if duration is not None:
            self.log_data["request"]["requested_duration_seconds"] = duration
    
    def log_file_analysis(self, file_header_hex: str, detected_format: str, final_content_type: str, final_filename: str):
        """记录文件分析结果"""
        self.log_data["file_analysis"] = {
            "file_header_hex": file_header_hex,
            "detected_format": detected_format,
            "final_content_type": final_content_type,
            "final_filename": final_filename,
        }
    
    def log_api_config(self, api_url: str, api_base: str, field_name: str, form_data: Dict[str, Any], 
                       has_model_param: bool, model_value: Optional[str] = None):
        """记录 API 配置信息（关键调试信息）"""
        self.log_data["api_config"] = {
            "api_url": api_url,
            "api_base": api_base,
            "field_name": field_name,  # 'file' 或 'audio_file'
            "form_data": form_data,
            "has_model_param": has_model_param,  # ⚠️ 关键：是否包含 model 参数
            "model_value": model_value,
            "form_data_keys": list(form_data.keys()),
        }
    
    def log_request_headers(self, headers: Dict[str, str], token_length: int):
        """记录请求头信息"""
        # 不记录完整的 token，只记录长度和前几个字符
        safe_headers = {k: (v[:20] + "..." if k == "Authorization" and len(v) > 20 else v) 
                       for k, v in headers.items()}
        self.log_data["request_headers"] = safe_headers
        self.log_data["token_info"] = {
            "token_length": token_length,
            "token_preview": headers.get("Authorization", "")[:30] + "..." if len(headers.get("Authorization", "")) > 30 else ""
        }
    
    def log_api_request(self, files_info: Dict[str, Any]):
        """记录发送到 API 的文件信息"""
        self.log_data["api_request"] = {
            "files": files_info,
            "request_timestamp": datetime.datetime.now().isoformat(),
        }
    
    def log_api_response(self, status_code: int, response_headers: Dict[str, str], 
                         response_body: Optional[Any] = None, duration_seconds: float = 0):
        """记录 API 响应信息"""
        self.log_data["api_response"] = {
            "status_code": status_code,
            "response_headers": dict(response_headers),
            "response_timestamp": datetime.datetime.now().isoformat(),
            "duration_seconds": round(duration_seconds, 2),
        }
        
        if response_body:
            if isinstance(response_body, dict):
                self.log_data["api_response"]["response_body"] = response_body
            else:
                self.log_data["api_response"]["response_body_preview"] = str(response_body)[:500]
    
    def log_error(self, error_type: str, error_message: str, error_detail: Optional[str] = None, 
                  error_response: Optional[Any] = None, traceback_str: Optional[str] = None):
        """记录错误信息"""
        self.log_data["error"] = {
            "type": error_type,
            "message": error_message,
            "timestamp": datetime.datetime.now().isoformat(),
        }
        
        if error_detail:
            self.log_data["error"]["detail"] = error_detail
        
        if error_response:
            if isinstance(error_response, dict):
                self.log_data["error"]["response"] = error_response
            else:
                self.log_data["error"]["response_preview"] = str(error_response)[:1000]
        
        if traceback_str:
            self.log_data["error"]["traceback"] = traceback_str
    
    def log_success(self, transcript_text: str, transcript_length: int, language: Optional[str] = None):
        """记录成功信息"""
        self.log_data["success"] = {
            "transcript_length": transcript_length,
            "transcript_preview": transcript_text[:200] if transcript_text else "",
            "language": language,
            "timestamp": datetime.datetime.now().isoformat(),
        }
    
    def print_log(self, level: str = "INFO"):
        """打印日志"""
        separator = "=" * 80
        print(f"\n{separator}")
        print(f"[{level}] {self.endpoint_name.upper()} - {self.log_data.get('timestamp', 'N/A')}")
        print(f"{separator}")
        print(json.dumps(self.log_data, ensure_ascii=False, indent=2))
        print(f"{separator}\n")
    
    def get_log_dict(self) -> Dict[str, Any]:
        """获取日志字典"""
        return self.log_data
    
    def add_warning(self, warning_message: str):
        """添加警告信息"""
        if "warnings" not in self.log_data:
            self.log_data["warnings"] = []
        self.log_data["warnings"].append({
            "message": warning_message,
            "timestamp": datetime.datetime.now().isoformat(),
        })


def format_file_header_hex(content: bytes, max_bytes: int = 16) -> str:
    """格式化文件头为十六进制字符串"""
    header_bytes = content[:max_bytes] if len(content) >= max_bytes else content
    return header_bytes.hex()


def detect_audio_format(content: bytes, filename: str, content_type: str) -> tuple[str, str]:
    """
    检测音频格式
    返回: (detected_format, final_content_type)
    """
    # 根据文件头判断格式
    if len(content) >= 12:
        if content[:4] == b'RIFF' and content[8:12] == b'WAVE':
            return ('WAV', 'audio/wav')
        elif content[:4] == b'\xff\xfb' or content[:3] == b'ID3':
            return ('MP3', 'audio/mpeg')
        elif content[:4] in (b'\x1aE\xdf\xa3', b'\x1a\x45\xdf\xa3'):
            return ('WebM', 'audio/webm')
        elif len(content) >= 8 and content[4:8] == b'ftyp':
            return ('MP4', 'audio/mp4')
    
    # 如果文件头无法识别，根据文件名和 content_type 判断
    filename_lower = filename.lower() if filename else ''
    content_type_lower = content_type.lower() if content_type else ''
    
    if filename_lower.endswith('.wav') or 'wav' in content_type_lower:
        return ('WAV', 'audio/wav')
    elif filename_lower.endswith('.mp3') or 'mp3' in content_type_lower or 'mpeg' in content_type_lower:
        return ('MP3', 'audio/mpeg')
    elif filename_lower.endswith('.webm') or 'webm' in content_type_lower:
        return ('WebM', 'audio/webm')
    elif filename_lower.endswith('.flac') or 'flac' in content_type_lower:
        return ('FLAC', 'audio/flac')
    elif filename_lower.endswith('.mp4') or filename_lower.endswith('.m4a') or 'mp4' in content_type_lower or 'm4a' in content_type_lower:
        return ('MP4', 'audio/mp4')
    else:
        return ('Unknown', content_type or 'application/octet-stream')
