import os
import json
import base64
import requests
import datetime
from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from google.oauth2 import service_account
from logging_helper import TranscriptionLogger, detect_audio_format, format_file_header_hex

# 🔥 支持环境变量部署（Railway/Heroku等）
# 优先从环境变量读取 Google Cloud 凭证
if os.getenv('GOOGLE_APPLICATION_CREDENTIALS_JSON'):
    print("[INFO] 从环境变量加载 Google Cloud 凭证")
    try:
        credentials_json = json.loads(os.getenv('GOOGLE_APPLICATION_CREDENTIALS_JSON'))
        # 在临时目录创建凭证文件
        CREDENTIALS_FILE = '/tmp/gcp-credentials.json'
        with open(CREDENTIALS_FILE, 'w') as f:
            json.dump(credentials_json, f)
        print(f"[INFO] 凭证文件已创建: {CREDENTIALS_FILE}")
    except Exception as e:
        print(f"[ERROR] 无法从环境变量加载凭证: {str(e)}")
        CREDENTIALS_FILE = "oceanic-hook-453405-u5-9e4b90fc923f.json"
else:
    # 本地开发时使用文件
    print("[INFO] 使用本地凭证文件")
    CREDENTIALS_FILE = "oceanic-hook-453405-u5-9e4b90fc923f.json"

# 缓存访问令牌，避免重复获取
_access_token_cache = None
_token_expiry = None

# 加载凭证并获取访问令牌
def get_access_token():
    """获取 Google Cloud 访问令牌"""
    global _access_token_cache, _token_expiry
    import time
    
    # 如果令牌还有效，直接返回缓存的令牌
    if _access_token_cache and _token_expiry and time.time() < _token_expiry:
        return _access_token_cache
    
    try:
        # 使用 service_account 加载凭证
        credentials = service_account.Credentials.from_service_account_file(
            CREDENTIALS_FILE,
            scopes=['https://www.googleapis.com/auth/cloud-platform']
        )
        
        # 刷新令牌
        if not credentials.valid:
            # 创建一个简单的请求对象来刷新令牌
            from google.auth.transport.requests import Request as GoogleRequest
            credentials.refresh(GoogleRequest())
        
        # 缓存令牌（设置过期时间为1小时，实际令牌有效期可能更长）
        _access_token_cache = credentials.token
        _token_expiry = time.time() + 3600  # 1小时后过期
        
        return _access_token_cache
    except Exception as e:
        raise Exception(f"无法获取访问令牌: {str(e)}")

# 读取项目ID（从凭证文件中）
def get_project_id():
    """从凭证文件中获取项目ID"""
    with open(CREDENTIALS_FILE, 'r') as f:
        creds = json.load(f)
        return creds.get('project_id', '')

app = FastAPI(title="Simple Hello API", description="一个简单的Hello API服务器，包含语音转文字功能（Google Speech-to-Text 和 AI Builder Space Audio API）")

# 挂载静态文件目录
try:
    app.mount("/static", StaticFiles(directory="static"), name="static")
except Exception as e:
    print(f"警告: 无法挂载静态文件目录: {e}")

# 处理favicon请求，避免404错误
@app.get("/favicon.ico")
async def favicon():
    """返回favicon（使用SVG格式的data URI）"""
    from fastapi.responses import Response
    # 返回一个简单的SVG favicon（1x1透明像素）
    svg_favicon = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <text y="0.9em" font-size="90">🎤</text>
    </svg>"""
    return Response(content=svg_favicon, media_type="image/svg+xml")

# SEO: robots.txt
@app.get("/robots.txt")
async def robots():
    """返回robots.txt"""
    from fastapi.responses import PlainTextResponse
    robots_path = os.path.join("static", "robots.txt")
    if os.path.exists(robots_path):
        with open(robots_path, 'r', encoding='utf-8') as f:
            content = f.read()
        return PlainTextResponse(content=content)
    else:
        return PlainTextResponse(content="User-agent: *\nAllow: /", status_code=404)

# SEO: sitemap.xml
@app.get("/sitemap.xml")
async def sitemap():
    """返回sitemap.xml"""
    from fastapi.responses import Response
    sitemap_path = os.path.join("static", "sitemap.xml")
    if os.path.exists(sitemap_path):
        with open(sitemap_path, 'r', encoding='utf-8') as f:
            content = f.read()
        return Response(content=content, media_type="application/xml")
    else:
        return Response(content='<?xml version="1.0" encoding="UTF-8"?><urlset></urlset>', 
                       media_type="application/xml", status_code=404)

# SEO: About page
@app.get("/about.html")
async def about():
    """返回About页面"""
    from fastapi.responses import HTMLResponse
    about_path = os.path.join("static", "about.html")
    if os.path.exists(about_path):
        with open(about_path, 'r', encoding='utf-8') as f:
            content = f.read()
        return HTMLResponse(content=content)
    else:
        return HTMLResponse(content="<h1>Page Not Found</h1>", status_code=404)

# SEO: FAQ page
@app.get("/faq.html")
async def faq():
    """返回FAQ页面"""
    from fastapi.responses import HTMLResponse
    faq_path = os.path.join("static", "faq.html")
    if os.path.exists(faq_path):
        with open(faq_path, 'r', encoding='utf-8') as f:
            content = f.read()
        return HTMLResponse(content=content)
    else:
        return HTMLResponse(content="<h1>Page Not Found</h1>", status_code=404)

# 首先定义根路由，返回录音界面（必须在其他路由之前）
@app.get("/")
async def root():
    """返回录音界面"""
    from fastapi.responses import HTMLResponse
    import os
    
    html_path = os.path.join("static", "index.html")
    if os.path.exists(html_path):
        with open(html_path, 'r', encoding='utf-8') as f:
            html_content = f.read()
        return HTMLResponse(content=html_content)
    else:
        return HTMLResponse(
            content=f"<h1>错误</h1><p>录音界面文件未找到：{os.path.abspath(html_path)}</p>",
            status_code=404
        )

# AI Builder Space API 配置
# Token 获取优先级：
# 1. 环境变量 AI_BUILDER_TOKEN（推荐，可通过 MCP 或其他方式设置）
# 2. 配置文件 .env、config.json 或 aibuilder_config.json
# 3. 如果未找到，返回 None（程序会在使用时给出明确错误）
# 
# 注意：Token 不应该硬编码在代码中，应该通过环境变量或配置文件设置
# 参考 CONFIG.md 了解如何配置 token
#
# API 基础 URL：根据 API 文档，正确的 base URL 是：
# https://space.ai-builders.com/backend/v1
# 注意：这是完整的 base URL，包含 /backend/v1 路径
AI_BUILDER_API_BASE = os.environ.get("AI_BUILDER_API_BASE", "https://space.ai-builders.com/backend/v1")

def get_ai_builder_token():
    """获取 AI Builder Token，支持多种来源"""
    # 1. 优先从环境变量获取
    token = os.environ.get("AI_BUILDER_TOKEN")
    if token:
        return token
    
    # 2. 尝试从配置文件读取
    config_files = [".env", "config.json", "aibuilder_config.json"]
    for config_file in config_files:
        if os.path.exists(config_file):
            try:
                if config_file.endswith('.json'):
                    with open(config_file, 'r', encoding='utf-8') as f:
                        config = json.load(f)
                        token = config.get("AI_BUILDER_TOKEN") or config.get("ai_builder_token")
                        if token:
                            return token
                else:  # .env file
                    with open(config_file, 'r', encoding='utf-8') as f:
                        for line in f:
                            line = line.strip()
                            if line.startswith('AI_BUILDER_TOKEN=') or line.startswith('ai_builder_token='):
                                token = line.split('=', 1)[1].strip().strip('"').strip("'")
                                if token:
                                    return token
            except Exception:
                continue
    
    # 3. 如果没有找到 token，返回 None（程序会在使用时检查并给出明确错误）
    return None

# 获取 AI Builder Token（如果未配置，会在使用时给出明确错误）
AI_BUILDER_TOKEN = get_ai_builder_token()

# v111: 获取 Deepgram API Key
DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY")
if not DEEPGRAM_API_KEY:
    print("[v111-CONFIG] WARNING: DEEPGRAM_API_KEY not configured, Deepgram service will be unavailable")
else:
    print("[v111-CONFIG] SUCCESS: DEEPGRAM_API_KEY configured")


class NameRequest(BaseModel):
    name: str


class ChatMessage(BaseModel):
    role: str  # "system", "user", "assistant"
    content: str


class ChatRequest(BaseModel):
    model: str = "deepseek"  # 默认使用 deepseek
    messages: list[ChatMessage]
    temperature: float = 0.7
    max_tokens: int = None
    max_completion_tokens: int = None  # 用于 gpt-5 模型
    stream: bool = False


# 原来的根路由已移动到 /api，现在 / 返回录音界面
@app.get("/api")
async def api_root():
    return {"message": "欢迎使用Simple Hello API！请访问 /hello 端点"}


@app.post("/hello")
async def hello(name_request: NameRequest):
    """
    接收一个名字，返回Hello消息
    
    - **name**: 用户输入的名字
    """
    return {"message": f"Hello, {name_request.name}"}


@app.get("/hello/{name}")
async def hello_get(name: str):
    """
    通过GET请求接收名字参数
    
    - **name**: 用户输入的名字（作为URL路径参数）
    """
    return {"message": f"Hello, {name}"}


@app.post("/speech-to-text")
async def speech_to_text(audio_file: UploadFile = File(...)):
    """
    将语音文件转换为文字
    
    - **audio_file**: 上传的语音文件（支持常见音频格式如 wav, mp3, flac 等）
    
    返回识别出的文字内容
    """
    try:
        # 读取上传的音频文件
        audio_content = await audio_file.read()
        
        # 将音频内容编码为 base64
        audio_base64 = base64.b64encode(audio_content).decode('utf-8')
        
        # 根据文件扩展名确定音频编码格式
        file_extension = audio_file.filename.split('.')[-1].lower() if audio_file.filename else 'wav'
        
        # 映射文件扩展名到 Google Speech API 的编码格式
        # 注意：MP3 只在 v1p1beta1 API 中可用（Beta 功能）
        # 对于 MP3，需要指定 sampleRateHertz
        encoding_map = {
            'wav': 'LINEAR16',
            'flac': 'FLAC',
            'mp3': 'MP3',  # 需要 v1p1beta1 API 和 sampleRateHertz
            'ogg': 'OGG_OPUS',
            'amr': 'AMR',
            'amr-wb': 'AMR_WB',
        }
        
        # 获取编码格式
        audio_encoding = encoding_map.get(file_extension, None)
        
        # 判断是否需要使用 v1p1beta1 API（MP3 需要）
        use_beta_api = (file_extension == 'mp3')
        
        # 构建请求体
        request_body = {
            "config": {
                "language_code": "zh-CN",  # 中文，可以改为 "en-US" 等
                "enable_automatic_punctuation": True,
            },
            "audio": {
                "content": audio_base64
            }
        }
        
        # 如果编码格式已知，添加到配置中
        if audio_encoding:
            request_body["config"]["encoding"] = audio_encoding
            
            # 对于 MP3，需要指定 sampleRateHertz
            # 尝试从音频文件检测采样率
            if file_extension == 'mp3':
                sample_rate = None
                try:
                    # 尝试使用 mutagen 检测采样率
                    from mutagen.mp3 import MP3 as MutagenMP3
                    import tempfile
                    import os
                    
                    # 创建临时文件来检测采样率
                    with tempfile.NamedTemporaryFile(delete=False, suffix='.mp3') as tmp_file:
                        tmp_file.write(audio_content)
                        tmp_path = tmp_file.name
                    
                    try:
                        audio_info = MutagenMP3(tmp_path)
                        sample_rate = audio_info.info.sample_rate
                    finally:
                        # 清理临时文件
                        try:
                            os.unlink(tmp_path)
                        except:
                            pass
                except ImportError:
                    # 如果没有安装 mutagen，使用默认值
                    sample_rate = 44100
                except Exception:
                    # 如果检测失败，使用默认值
                    sample_rate = 44100
                
                # 如果无法检测，使用默认值（44100 是大多数 MP3 文件的采样率）
                if sample_rate is None:
                    sample_rate = 44100
                
                request_body["config"]["sampleRateHertz"] = sample_rate
        
        # 对于 OGG_OPUS，也需要指定 sampleRateHertz
        elif file_extension == 'ogg':
            # OGG_OPUS 支持的采样率：8000, 12000, 16000, 24000, 48000
            request_body["config"]["sampleRateHertz"] = 48000  # 默认值
        
        # 对于 AMR，sampleRateHertz 必须是 8000
        elif file_extension == 'amr':
            request_body["config"]["sampleRateHertz"] = 8000
        
        # 对于 AMR_WB，sampleRateHertz 必须是 16000
        elif file_extension == 'amr-wb':
            request_body["config"]["sampleRateHertz"] = 16000
        
        # 获取访问令牌
        access_token = get_access_token()
        
        # 构建 API URL
        # MP3 需要使用 v1p1beta1 API（Beta 功能）
        if use_beta_api:
            api_url = "https://speech.googleapis.com/v1p1beta1/speech:recognize"
        else:
            api_url = "https://speech.googleapis.com/v1/speech:recognize"
        
        # 发送请求到 Google Speech-to-Text REST API
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }
        
        response = requests.post(api_url, json=request_body, headers=headers)
        
        # 检查响应状态
        if response.status_code != 200:
            try:
                error_data = response.json()
                error_detail = error_data.get('error', {})
                error_message = error_detail.get('message', 'Unknown error')
                error_code = error_detail.get('code', response.status_code)
                
                # 对于 webm 格式的特殊错误处理
                if file_extension == 'webm' and 'sample rate' in error_message.lower():
                    full_error = (
                        f"WebM 格式的音频文件可能无法被 Google Speech API 正确识别。"
                        f"错误详情: {error_message}。"
                        f"建议：请将 WebM 文件转换为 WAV 或 FLAC 格式后再试。"
                        f"可以使用在线转换工具或 ffmpeg: ffmpeg -i input.webm -ar 16000 output.wav"
                    )
                else:
                    # 添加更详细的错误信息用于调试
                    full_error = f"Google Speech API 错误 (code {error_code}): {error_message}"
                    if 'details' in error_detail:
                        full_error += f" | Details: {error_detail['details']}"
            except:
                error_message = response.text
                full_error = f"Google Speech API 错误: {error_message}"
            
            raise HTTPException(
                status_code=response.status_code,
                detail=full_error
            )
        
        # 解析响应
        result_data = response.json()
        
        # 提取识别结果
        transcriptions = []
        # 检查是否有 results 字段
        if 'results' in result_data:
            if len(result_data['results']) > 0:
                for result in result_data['results']:
                    if 'alternatives' in result and len(result['alternatives']) > 0:
                        transcriptions.append(result['alternatives'][0]['transcript'])
            # 如果有 results 字段但为空，说明没有识别出语音
            if not transcriptions:
                return {
                    "success": False,
                    "message": "未能识别出任何文字。可能原因：1) 音频中没有清晰的语音内容 2) 音频质量太低或音量太小 3) 语言设置不匹配（当前设置为中文 zh-CN，如果音频是英文请修改 language_code）",
                    "text": "",
                    "api_info": {
                        "total_billed_time": result_data.get('totalBilledTime', 'N/A'),
                        "request_id": result_data.get('requestId', 'N/A')
                    }
                }
        else:
            # 没有 results 字段，说明 Google API 没有识别出任何语音
            return {
                "success": False,
                "message": "未能识别出任何文字。可能原因：1) 音频中没有清晰的语音内容 2) 音频质量太低或音量太小 3) 语言设置不匹配（当前设置为中文 zh-CN，如果音频是英文请修改 language_code）",
                "text": "",
                "api_info": {
                    "total_billed_time": result_data.get('totalBilledTime', 'N/A'),
                    "request_id": result_data.get('requestId', 'N/A')
                }
            }
        
        # 合并所有识别结果
        full_text = " ".join(transcriptions)
        
        return {
            "success": True,
            "message": "语音识别成功",
            "text": full_text,
            "filename": audio_file.filename
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"语音识别失败: {str(e)}"
        )


@app.post("/speech-to-text-aibuilder")
async def speech_to_text_aibuilder(
    audio_file: UploadFile = File(...),
    language: str = None
):
    """
    使用 AI Builder Space Audio API 将语音文件转换为文字
    
    - **audio_file**: 上传的语音文件（支持 MP3, WAV, FLAC, M4A 等格式）
    - **language**: 语言代码提示（可选，BCP-47 格式，如 'zh-CN', 'en'）。如果不提供，API 会自动检测语言
    
    返回识别出的文字内容，包括：
    - 完整转录文本
    - 检测到的语言
    - 分段信息（如果可用）
    - 置信度分数（如果可用）
    """
    import datetime
    import traceback
    
    # 初始化日志记录器
    logger = TranscriptionLogger("speech-to-text-aibuilder")
    
    try:
        # 检查是否配置了 AI Builder Token
        if not AI_BUILDER_TOKEN:
            logger.log_error("CONFIG_ERROR", "AI Builder Token 未配置")
            logger.print_log("ERROR")
            raise HTTPException(
                status_code=500,
                detail=(
                    "AI Builder Token 未配置。"
                    "请通过以下方式之一设置："
                    "1) 设置环境变量 AI_BUILDER_TOKEN"
                    "2) 创建 .env 文件并添加 AI_BUILDER_TOKEN=your_token"
                    "3) 创建 aibuilder_config.json 文件并添加 AI_BUILDER_TOKEN 字段"
                    "参考 .env.example 或 aibuilder_config.example.json"
                )
            )
        
        # 读取上传的音频文件
        audio_content = await audio_file.read()
        file_size = len(audio_content)
        filename = audio_file.filename or 'audio.mp3'
        content_type = audio_file.content_type or 'audio/mpeg'
        
        # 记录请求基本信息
        logger.log_request_info(filename, content_type, file_size)
        logger.log_request_headers(
            {"Authorization": f"Bearer {AI_BUILDER_TOKEN}", "Accept": "application/json"},
            len(AI_BUILDER_TOKEN)
        )
        
        # 检测音频格式
        file_header_hex = format_file_header_hex(audio_content)
        detected_format, final_content_type = detect_audio_format(audio_content, filename, content_type)
        
        # 记录文件分析结果
        logger.log_file_analysis(file_header_hex, detected_format, final_content_type, filename)
        
        # AI Builder Space Audio API 端点
        api_url = f"{AI_BUILDER_API_BASE}/audio/transcriptions"
        
        # ⚠️ 关键调试信息：字段名和 model 参数
        field_name = 'audio_file'  # 根据代码注释，AI Builder Space 使用 'audio_file'
        
        # 准备表单字段（language 作为表单字段，BCP-47 格式，可选）
        form_data = {}
        if language:
            form_data['language'] = language
        
        # ⚠️ 注意：当前代码没有 model 参数
        has_model_param = 'model' in form_data
        model_value = form_data.get('model', None)
        
        # 记录 API 配置（关键调试信息）
        logger.log_api_config(
            api_url=api_url,
            api_base=AI_BUILDER_API_BASE,
            field_name=field_name,
            form_data=form_data,
            has_model_param=has_model_param,
            model_value=model_value
        )
        
        # 准备 multipart/form-data
        files = {
            field_name: (filename, audio_content, final_content_type)
        }
        
        logger.log_api_request({
            field_name: {
                'filename': filename,
                'content_type': final_content_type,
                'size': file_size
            }
        })
        
        # 打印请求前的日志
        logger.print_log("INFO")
        
        # 发送请求到 AI Builder Space Audio API
        request_start_time = datetime.datetime.now()
        response = requests.post(
            api_url,
            headers={"Authorization": f"Bearer {AI_BUILDER_TOKEN}", "Accept": "application/json"},
            files=files,
            data=form_data,
            timeout=120
        )
        request_end_time = datetime.datetime.now()
        request_duration = (request_end_time - request_start_time).total_seconds()
        
        # 记录 API 响应
        response_body = None
        if response.status_code == 200:
            try:
                response_body = response.json()
            except:
                response_body = response.text[:500]
        else:
            try:
                response_body = response.json()
            except:
                response_body = response.text[:1000]
        
        logger.log_api_response(
            status_code=response.status_code,
            response_headers=response.headers,
            response_body=response_body,
            duration_seconds=request_duration
        )
        
        # 检查响应状态
        if response.status_code != 200:
            # 检查响应内容类型
            content_type_header = response.headers.get('content-type', '')
            
            error_detail = None
            error_response = None
            try:
                # 尝试解析 JSON 错误响应
                error_response = response.json()
                error_detail = error_response.get('detail', 'Unknown error')
                if isinstance(error_detail, list):
                    error_detail = error_detail[0].get('msg', 'Unknown error') if error_detail else 'Unknown error'
            except:
                # 如果不是 JSON，检查是否是 HTML（说明 URL 可能不正确）
                if 'text/html' in content_type_header or response.text.strip().startswith('<!DOCTYPE'):
                    error_detail = (
                        f"API 返回了 HTML 页面而不是 JSON，说明 API URL 可能不正确。"
                        f"当前使用的 URL: {api_url}"
                        f"请检查 AI_BUILDER_API_BASE 环境变量是否正确设置。"
                    )
                    error_response = response.text[:1000]
                else:
                    error_detail = response.text[:500]
                    error_response = error_detail
            
            logger.log_error(
                error_type=f"API_ERROR_{response.status_code}",
                error_message=f"API 请求失败，状态码: {response.status_code}",
                error_detail=error_detail,
                error_response=error_response
            )
            logger.print_log("ERROR")
            
            raise HTTPException(
                status_code=response.status_code,
                detail=f"AI Builder Space API 错误: {error_detail}"
            )
        
        # 解析响应
        result_data = response.json()
        
        # 提取转录文本
        transcript_text = result_data.get('text', '')
        transcript_length = len(transcript_text) if transcript_text else 0
        
        if not transcript_text or transcript_text.strip() == "":
            logger.log_error("EMPTY_RESULT", "转录结果为空")
            logger.print_log("WARNING")
            return {
                "success": False,
                "message": "未能识别出任何文字，请检查音频文件格式和质量",
                "text": "",
                "request_id": result_data.get('request_id', ''),
                "detected_language": result_data.get('detected_language'),
                "debug_info": logger.get_log_dict()
            }
        
        # 记录成功信息
        logger.log_success(
            transcript_text=transcript_text,
            transcript_length=transcript_length,
            language=result_data.get('detected_language')
        )
        logger.print_log("SUCCESS")
        
        # 构建返回结果
        result = {
            "success": True,
            "message": "语音识别成功",
            "text": transcript_text.strip(),
            "filename": audio_file.filename,
            "request_id": result_data.get('request_id', ''),
            "detected_language": result_data.get('detected_language'),
            "duration_seconds": result_data.get('duration_seconds'),
            "confidence": result_data.get('confidence'),
            "debug_info": logger.get_log_dict()
        }
        
        # 如果有分段信息，也包含进去
        if result_data.get('segments'):
            result["segments"] = result_data.get('segments')
        
        # 如果有计费信息，也包含进去
        if result_data.get('billing'):
            result["billing"] = result_data.get('billing')
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        error_trace = traceback.format_exc()
        logger.log_error(
            "EXCEPTION",
            f"发生异常: {str(e)}",
            traceback_str=error_trace
        )
        logger.print_log("EXCEPTION")
        raise HTTPException(
            status_code=500,
            detail=f"语音识别失败: {str(e)}"
        )


@app.post("/chat/completions")
async def chat_completions(request: ChatRequest):
    """
    使用 AI Builder Space Chat API 进行对话
    
    - **model**: 模型名称（deepseek, gpt-5, supermind-agent-v1, gemini-2.5-pro 等）
    - **messages**: 对话消息列表，每个消息包含 role 和 content
    - **temperature**: 温度参数（0.0-2.0），gpt-5 只支持 1.0
    - **max_tokens**: 最大生成 token 数（deepseek 等模型使用）
    - **max_completion_tokens**: 最大完成 token 数（gpt-5 模型使用）
    - **stream**: 是否流式返回（暂不支持）
    
    返回 AI 模型的回复
    """
    try:
        # 检查是否配置了 AI Builder Token
        if not AI_BUILDER_TOKEN:
            raise HTTPException(
                status_code=500,
                detail=(
                    "AI Builder Token 未配置。"
                    "请通过以下方式之一设置："
                    "1) 设置环境变量 AI_BUILDER_TOKEN"
                    "2) 创建 .env 文件并添加 AI_BUILDER_TOKEN=your_token"
                    "3) 创建 aibuilder_config.json 文件并添加 AI_BUILDER_TOKEN 字段"
                    "参考 .env.example 或 aibuilder_config.example.json"
                )
            )
        
        # 构建请求体
        request_body = {
            "model": request.model,
            "messages": [{"role": msg.role, "content": msg.content} for msg in request.messages],
            "temperature": request.temperature
        }
        
        # 根据模型类型设置 token 限制
        if request.model == "gpt-5":
            # gpt-5 使用 max_completion_tokens，temperature 固定为 1.0
            request_body["temperature"] = 1.0
            if request.max_completion_tokens:
                request_body["max_completion_tokens"] = request.max_completion_tokens
            elif request.max_tokens:
                request_body["max_completion_tokens"] = request.max_tokens
        else:
            # 其他模型使用 max_tokens
            if request.max_tokens:
                request_body["max_tokens"] = request.max_tokens
        
        # 流式响应暂不支持
        if request.stream:
            raise HTTPException(
                status_code=400,
                detail="流式响应暂不支持，请设置 stream=false"
            )
        
        # AI Builder Space Chat API 端点
        # API base URL 已经包含 /backend/v1，所以直接拼接端点路径
        api_url = f"{AI_BUILDER_API_BASE}/chat/completions"
        
        # 准备请求头
        headers = {
            "Authorization": f"Bearer {AI_BUILDER_TOKEN}",
            "Content-Type": "application/json",
            "Accept": "application/json"
        }
        
        # 调试：打印实际请求信息（仅在开发时启用）
        # print(f"DEBUG: API URL: {api_url}")
        # print(f"DEBUG: Request body: {json.dumps(request_body, indent=2, ensure_ascii=False)}")
        
        # 发送请求到 AI Builder Space Chat API
        # 使用 requests.post 的 json 参数会自动设置 Content-Type 为 application/json
        response = requests.post(api_url, headers=headers, json=request_body, timeout=120)
        
        # 检查响应状态
        if response.status_code != 200:
            try:
                error_data = response.json()
                error_detail = error_data.get('detail', 'Unknown error')
            except:
                error_detail = response.text[:500]
            
            raise HTTPException(
                status_code=response.status_code,
                detail=f"AI Builder Space Chat API 错误: {error_detail}"
            )
        
        # 返回响应
        result = response.json()
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Chat API 调用失败: {str(e)}"
        )

@app.post("/transcribe-segment")
async def transcribe_segment(
    audio_file: UploadFile = File(...),
    duration: int = Form(default=60),
    needs_segmentation: str = Form(default=None),
    language: str = Form(default=None),  # 🌍 v107: 语言参数（保留但默认自动识别）
    audio_source: str = Form(default='microphone'),  # 🎙️ v110: 音频源（microphone/system/both）
    preferred_api: str = Form(default=None)  # 🆕 用户手动指定 API（openai/ai_builder/google）
):
    """
    转录音频片段（用于录音界面的转录功能）
    🔥 v96: 使用智能 API fallback 系统
    🌍 v107: 默认自动识别语言（不指定语言）
    🎙️ v110: 根据音频源智能选择 API（麦克风=Whisper fallback，系统/混合=Google only）
    🆕 支持 preferred_api，允许前端重试时手动指定 API
    
    - **audio_file**: 上传的音频文件
    - **duration**: 音频时长（秒），用于信息显示
    - **language**: 转录语言代码（如 'en', 'zh'），默认为 None（自动识别）
    - **audio_source**: 音频源类型（'microphone', 'system', 'both'），默认 'microphone'
    - **preferred_api**: 指定 API（'openai'/'ai_builder'/'google'），默认 None（自动 fallback）
    
    返回转录结果
    """
    import datetime
    import traceback
    from api_fallback import (
        transcribe_with_fallback,
        transcribe_system_audio,
        transcribe_with_preferred_api,
        get_api_status
    )
    
    # 初始化日志记录器
    logger = TranscriptionLogger("transcribe-segment-fallback")
    
    try:
        # 读取上传的音频文件
        audio_content = await audio_file.read()
        file_size = len(audio_content)
        filename = audio_file.filename or 'recording.webm'
        content_type = audio_file.content_type or 'audio/webm'
        
        # 记录请求基本信息
        logger.log_request_info(filename, content_type, file_size, duration)
        print(f"[API_FALLBACK] 开始智能 API fallback 转录")
        print(f"[v110-ROUTING] 🎙️ 音频源: {audio_source}")
        if preferred_api:
            print(f"[v114-ROUTING] 🎯 手动指定 API: {preferred_api}")
        print(f"[API_FALLBACK] 当前 API 状态: {get_api_status()}")
        
        # 🎙️ v110: 根据音频源智能路由
        if audio_source in ['system', 'both']:
            print(f"[v110-ROUTING] 🔄 系统音频/混合音频 → 强制使用 Google API（支持多说话人）")
            use_google_only = True
        else:
            print(f"[v110-ROUTING] 🎤 纯麦克风录音 → 使用标准 Fallback（AI Builder → OpenAI → Google）")
            use_google_only = False
        
        # 检查文件大小（25MB 限制）
        max_size = 25 * 1024 * 1024  # 25MB
        if file_size > max_size:
            logger.log_error("FILE_TOO_LARGE", f"文件太大: {file_size / 1024 / 1024:.2f} MB > {max_size / 1024 / 1024} MB")
            logger.print_log("ERROR")
            return {
                "success": False,
                "message": f"音频文件太大 ({file_size / 1024 / 1024:.2f} MB)，超过限制 (25 MB)。请尝试转录更短的片段。",
                "text": "",
                "api_used": None,
                "debug_info": logger.get_log_dict()
            }
        
        # 检测音频格式
        file_header_hex = format_file_header_hex(audio_content)
        detected_format, final_content_type = detect_audio_format(audio_content, filename, content_type)
        
        # 记录文件分析结果
        logger.log_file_analysis(file_header_hex, detected_format, final_content_type, filename)
        
        # 打印请求前的日志
        logger.print_log("INFO")
        
        # 🔥 使用智能 fallback 进行转录
        request_start_time = datetime.datetime.now()
        try:
            # 🆕 v114: 手动指定 API（历史记录重试场景）
            if preferred_api:
                transcription_text, api_used, metadata = await transcribe_with_preferred_api(
                    audio_content=audio_content,
                    filename=filename,
                    preferred_api=preferred_api,
                    language=language,
                    duration=duration,
                    logger=logger,
                    audio_source=audio_source
                )
            else:
                # 🎙️ v110: 根据音频源选择 API 策略
                if use_google_only:
                    # 系统音频/混合：Deepgram Nova-3 + Google API（支持多说话人）
                    transcription_text, api_used, metadata = await transcribe_system_audio(
                        audio_content=audio_content,
                        filename=filename,
                        language=language,
                        duration=duration,
                        logger=logger
                    )
                else:
                    # 纯麦克风：标准 Fallback（AI Builder → OpenAI → Google）
                    transcription_text, api_used, metadata = await transcribe_with_fallback(
                        audio_content=audio_content,
                        filename=filename,
                        language=language,
                        duration=duration,
                        logger=logger
                    )
            
            request_end_time = datetime.datetime.now()
            request_duration = (request_end_time - request_start_time).total_seconds()
            
            # 记录成功
            print(f"[API_FALLBACK] ✅ 转录成功，使用 API: {api_used}")
            print(f"[API_FALLBACK] 转录时长: {request_duration:.2f}秒")
            print(f"[API_FALLBACK] 转录文本长度: {len(transcription_text)} 字符")
            print(f"[API_FALLBACK] 更新后的 API 状态: {get_api_status()}")
            
            # 打印成功日志
            logger.print_log("SUCCESS")
            
            return {
                "success": True,
                "text": transcription_text,
                "api_used": api_used,
                "metadata": metadata,
                "duration_seconds": request_duration,
                "api_status": get_api_status()
            }
            
        except Exception as fallback_error:
            request_end_time = datetime.datetime.now()
            request_duration = (request_end_time - request_start_time).total_seconds()
            
            # 所有 API 都失败
            logger.log_error(
                error_type="API_ALL_FAILED",
                error_message="所有 API fallback 均失败",
                error_detail=str(fallback_error)
            )
            print(f"[API_FALLBACK] ❌ 所有 API 失败，耗时: {request_duration:.2f}秒")
            print(f"[API_FALLBACK] 最终 API 状态: {get_api_status()}")
            logger.print_log("ERROR")
            
            return {
                "success": False,
                "message": f"转录失败：{str(fallback_error)}",
                "text": "",
                "api_used": None,
                "duration_seconds": request_duration,
                "api_status": get_api_status(),
                "debug_info": logger.get_log_dict()
            }
    
    except Exception as e:
        # 未预期的错误
        logger.log_error(
            error_type="UNEXPECTED_ERROR",
            error_message="发生未预期的错误",
            error_detail=str(e),
            traceback_str=traceback.format_exc()
        )
        logger.print_log("ERROR")
        
        return {
            "success": False,
            "message": f"服务器错误: {str(e)}",
            "text": "",
            "api_used": None,
            "debug_info": logger.get_log_dict()
        }


# 🔥 v96: 添加 API 状态查询端点
@app.get("/api-status")
async def api_status():
    """
    查询 API fallback 状态
    
    返回当前各个 API 的可用性和使用统计
    """
    from api_fallback import get_api_status
    
    status = get_api_status()
    
    return {
        "success": True,
        "status": status,
        "timestamp": datetime.datetime.now().isoformat()
    }


# 保留原来的端点作为备份（重命名）
@app.post("/transcribe-segment-legacy")
async def transcribe_segment(
    audio_file: UploadFile = File(...),
    duration: int = 60,
    needs_segmentation: str = None
):
    """
    转录音频片段（用于录音界面的转录功能）
    
    - **audio_file**: 上传的音频文件
    - **duration**: 音频时长（秒），用于信息显示
    
    返回转录结果
    """
    import datetime
    import traceback
    
    # 初始化日志记录器
    logger = TranscriptionLogger("transcribe-segment")
    
    try:
        # 检查是否配置了 AI Builder Token
        if not AI_BUILDER_TOKEN:
            logger.log_error("CONFIG_ERROR", "AI Builder Token 未配置")
            logger.print_log("ERROR")
            raise HTTPException(
                status_code=500,
                detail="AI Builder Token 未配置。请设置环境变量 AI_BUILDER_TOKEN 或创建配置文件"
            )
        
        # 读取上传的音频文件
        audio_content = await audio_file.read()
        file_size = len(audio_content)
        filename = audio_file.filename or 'recording.webm'
        content_type = audio_file.content_type or 'audio/webm'
        
        # 记录请求基本信息
        logger.log_request_info(filename, content_type, file_size, duration)
        logger.log_request_headers(
            {"Authorization": f"Bearer {AI_BUILDER_TOKEN}", "Accept": "application/json"},
            len(AI_BUILDER_TOKEN)
        )
        
        # 检查文件大小（AI Builder Space API 可能有文件大小限制，通常是 25MB）
        max_size = 25 * 1024 * 1024  # 25MB
        if file_size > max_size:
            logger.log_error("FILE_TOO_LARGE", f"文件太大: {file_size / 1024 / 1024:.2f} MB > {max_size / 1024 / 1024} MB")
            logger.print_log("ERROR")
            return {
                "success": False,
                "message": f"音频文件太大 ({file_size / 1024 / 1024:.2f} MB)，超过限制 (25 MB)。请尝试转录更短的片段。",
                "text": "",
                "debug_info": logger.get_log_dict()
            }
        
        # 检测音频格式
        file_header_hex = format_file_header_hex(audio_content)
        detected_format, final_content_type = detect_audio_format(audio_content, filename, content_type)
        
        # 记录文件分析结果
        logger.log_file_analysis(file_header_hex, detected_format, final_content_type, filename)
        
        # 检查是否需要服务器端截取
        needs_segmentation_flag = needs_segmentation and needs_segmentation.lower() == 'true'
        segmentation_success = False  # 标记服务器端截取是否成功
        
        if needs_segmentation_flag:
            logger.add_warning(f"需要服务器端截取最后 {duration} 秒的音频")
            logger.log_request_info(filename, content_type, file_size, duration)
            # 尝试使用ffmpeg截取音频（如果可用）
            try:
                import subprocess
                import tempfile
                import os
                import shutil
                
                # 检查ffmpeg和ffprobe是否可用
                ffmpeg_path = shutil.which('ffmpeg')
                ffprobe_path = shutil.which('ffprobe')
                
                if not ffmpeg_path or not ffprobe_path:
                    logger.add_warning("ffmpeg 或 ffprobe 未安装，无法进行服务器端截取")
                    logger.add_warning("将尝试使用完整音频文件（可能因为WebM结构损坏而失败）")
                    logger.print_log("WARNING")
                else:
                    logger.add_warning(f"找到 ffmpeg: {ffmpeg_path}")
                    logger.add_warning(f"找到 ffprobe: {ffprobe_path}")
                    
                    # 创建临时文件
                    with tempfile.NamedTemporaryFile(delete=False, suffix=f'.{detected_format.lower()}' if detected_format != 'Unknown' else '.webm') as temp_input:
                        temp_input.write(audio_content)
                        temp_input_path = temp_input.name
                    
                    with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as temp_output:
                        temp_output_path = temp_output.name
                    
                    try:
                        # 使用ffmpeg截取最后N秒
                        # 首先获取音频总时长
                        probe_cmd = [
                            ffprobe_path, '-v', 'error', '-show_entries', 'format=duration',
                            '-of', 'default=noprint_wrappers=1:nokey=1', temp_input_path
                        ]
                        result = subprocess.run(probe_cmd, capture_output=True, text=True, timeout=10)
                        if result.returncode == 0:
                            total_duration = float(result.stdout.strip())
                            logger.add_warning(f"检测到音频总时长: {total_duration:.2f}秒")
                            
                            if total_duration > duration:
                                start_time = total_duration - duration
                                logger.add_warning(f"将从 {start_time:.2f}秒 开始截取，持续 {duration}秒")
                                
                                # 截取最后N秒
                                ffmpeg_cmd = [
                                    ffmpeg_path, '-i', temp_input_path,
                                    '-ss', str(start_time),
                                    '-t', str(duration),
                                    '-ar', '16000',  # 采样率
                                    '-ac', '1',      # 单声道
                                    '-y',            # 覆盖输出文件
                                    temp_output_path
                                ]
                                result = subprocess.run(ffmpeg_cmd, capture_output=True, text=True, timeout=30)
                                if result.returncode == 0:
                                    # 读取截取后的音频
                                    with open(temp_output_path, 'rb') as f:
                                        audio_content = f.read()
                                    file_size = len(audio_content)
                                    filename = f'segmented_{duration}s.wav'
                                    final_content_type = 'audio/wav'
                                    detected_format = 'WAV'
                                    segmentation_success = True
                                    logger.add_warning(f"✅ 服务器端截取成功：从 {total_duration:.2f}秒 音频中截取最后 {duration}秒")
                                    logger.log_file_analysis(format_file_header_hex(audio_content), detected_format, final_content_type, filename)
                                else:
                                    logger.add_warning(f"ffmpeg 截取失败 (返回码: {result.returncode})")
                                    logger.add_warning(f"ffmpeg 错误输出: {result.stderr[:500]}")
                                    logger.print_log("ERROR")
                            else:
                                logger.add_warning(f"音频时长 ({total_duration:.2f}秒) 小于等于请求时长 ({duration}秒)，无需截取")
                        else:
                            logger.add_warning(f"ffprobe 获取音频时长失败 (返回码: {result.returncode})")
                            logger.add_warning(f"ffprobe 错误输出: {result.stderr[:500]}")
                            logger.print_log("ERROR")
                    finally:
                        # 清理临时文件
                        try:
                            if os.path.exists(temp_input_path):
                                os.unlink(temp_input_path)
                            if os.path.exists(temp_output_path):
                                os.unlink(temp_output_path)
                        except Exception as cleanup_error:
                            logger.add_warning(f"清理临时文件失败: {str(cleanup_error)}")
                            
            except FileNotFoundError as e:
                logger.add_warning(f"ffmpeg 或 ffprobe 未找到: {str(e)}")
                logger.add_warning("无法进行服务器端截取，将使用完整音频文件")
                logger.print_log("ERROR")
            except Exception as e:
                logger.add_warning(f"服务器端截取失败: {str(e)}")
                logger.add_warning("将使用完整音频文件")
                import traceback
                logger.add_warning(f"异常详情: {traceback.format_exc()[:500]}")
                logger.print_log("ERROR")
        
        # 如果服务器端截取失败，但标记了需要截取，记录警告
        if needs_segmentation_flag and not segmentation_success:
            logger.add_warning("⚠️  服务器端截取失败或未执行，将使用完整音频文件")
            logger.add_warning("⚠️  如果WebM文件结构损坏，API可能返回500错误")
            logger.print_log("WARNING")
        
        # WebM 格式特殊处理
        if detected_format == 'WebM':
            logger.add_warning("WebM 格式已检测到，根据 OpenAI 文档应该被支持")
            final_content_type = 'audio/webm'  # 保持简单，让 API 自动检测
        
        # AI Builder Space Audio API 端点
        api_url = f"{AI_BUILDER_API_BASE}/audio/transcriptions"
        
        # ⚠️ 关键调试信息：字段名和 model 参数
        # 根据代码注释，AI Builder Space 使用 'audio_file' 字段名
        field_name = 'audio_file'
        
        # ⚠️ 关键问题：需要添加 model 参数
        # 根据 OpenAI 文档和 AI Builder Space API 要求，model 是必需参数
        form_data = {
            'model': 'whisper-1',  # 使用标准的 Whisper 模型
            'language': 'zh-CN'
        }
        has_model_param = 'model' in form_data
        model_value = form_data.get('model', None)
        
        # 记录 API 配置（关键调试信息）
        logger.log_api_config(
            api_url=api_url,
            api_base=AI_BUILDER_API_BASE,
            field_name=field_name,  # 'audio_file' vs 'file'
            form_data=form_data,
            has_model_param=has_model_param,  # ⚠️ 关键：是否包含 model
            model_value=model_value
        )
        
        # 准备 multipart/form-data
        files = {
            field_name: (filename, audio_content, final_content_type)
        }
        
        logger.log_api_request({
            field_name: {
                'filename': filename,
                'content_type': final_content_type,
                'size': file_size
            }
        })
        
        # 打印请求前的日志
        logger.print_log("INFO")
        
        # 发送请求到 AI Builder Space Audio API
        request_start_time = datetime.datetime.now()
        response = requests.post(
            api_url,
            headers={"Authorization": f"Bearer {AI_BUILDER_TOKEN}", "Accept": "application/json"},
            files=files,
            data=form_data,
            timeout=120
        )
        request_end_time = datetime.datetime.now()
        request_duration = (request_end_time - request_start_time).total_seconds()
        
        # 记录 API 响应
        response_body = None
        if response.status_code == 200:
            try:
                response_body = response.json()
            except:
                response_body = response.text[:500]
        else:
            try:
                response_body = response.json()
            except:
                response_body = response.text[:1000]
        
        logger.log_api_response(
            status_code=response.status_code,
            response_headers=response.headers,
            response_body=response_body,
            duration_seconds=request_duration
        )
        
        # 检查响应状态
        if response.status_code != 200:
            # 尝试解析错误响应
            error_detail = None
            error_response = None
            try:
                error_response = response.json()
                error_detail = error_response.get('detail', error_response.get('message', error_response.get('error', 'Unknown error')))
                if isinstance(error_detail, list):
                    error_detail = str(error_detail)
            except Exception:
                error_detail = response.text[:1000] if response.text else 'Unknown error'
                error_response = error_detail
            
            logger.log_error(
                error_type=f"API_ERROR_{response.status_code}",
                error_message=f"API 请求失败，状态码: {response.status_code}",
                error_detail=error_detail,
                error_response=error_response
            )
            
            # 打印错误日志
            logger.print_log("ERROR")
            
            # 提供更详细的错误信息和建议
            error_msg = f"AI Builder Space API 错误 ({response.status_code})"
            if error_detail and error_detail != 'Unknown error':
                error_msg += f": {error_detail}"
            
            # 根据状态码和格式提供特定建议
            if response.status_code == 500:
                suggestions = []
                
                # 检查是否尝试了服务器端截取但失败
                if needs_segmentation_flag:
                    if not segmentation_success:
                        suggestions.append("⚠️ 服务器端截取失败或ffmpeg未安装")
                        suggestions.append("建议：1) 检查服务器日志中的ffmpeg错误信息")
                        suggestions.append("2) 确认ffmpeg和ffprobe已安装并可在PATH中找到")
                        suggestions.append("3) 如果ffmpeg不可用，WebM文件结构损坏可能导致API失败")
                        suggestions.append("4) 查看服务器控制台的详细日志获取更多信息")
                    else:
                        suggestions.append("✅ 服务器端截取成功，但API仍然返回500错误")
                        suggestions.append("建议：可能是API服务器问题或文件格式问题")
                
                if detected_format == 'WebM':
                    suggestions.append("⚠️ WebM 格式可能不被 API 完全支持，或文件结构损坏")
                    if needs_segmentation_flag and not segmentation_success:
                        suggestions.append("⚠️ 由于服务器端截取失败，发送了损坏的WebM文件到API")
                    suggestions.append("建议：1) 尝试使用其他浏览器（Chrome/Edge）")
                    suggestions.append("2) 或使用 /speech-to-text 端点（Google STT，支持WebM）")
                    suggestions.append("3) 或将音频转换为 WAV/MP3")
                
                # ⚠️ 关键调试提示
                if not has_model_param:
                    suggestions.append("⚠️ 注意：请求中缺少 'model' 参数（根据 OpenAI 文档，这可能是必需的）")
                    suggestions.append("建议：检查 AI Builder Space API 文档，确认是否需要 model 参数")
                
                if suggestions:
                    error_msg += "\n\n" + "\n".join(suggestions)
            elif response.status_code == 400:
                error_msg += "\n\n可能的原因："
                error_msg += "\n1) 请求参数不正确（字段名、格式等）"
                error_msg += "\n2) 文件格式不支持"
                if not has_model_param:
                    error_msg += "\n3) 缺少必需的参数（如 model）"
            
            # 在debug_info中添加更多信息
            debug_info = logger.get_log_dict()
            debug_info["needs_segmentation_attempted"] = needs_segmentation_flag
            debug_info["segmentation_success"] = segmentation_success if needs_segmentation_flag else None
            
            return {
                "success": False,
                "message": error_msg,
                "text": "",
                "debug_info": debug_info
            }
        
        # 解析成功响应
        try:
            result_data = response.json()
        except Exception as json_error:
            logger.log_error(
                "PARSE_ERROR",
                f"无法解析响应 JSON: {str(json_error)}",
                error_response=response.text[:500]
            )
            logger.print_log("ERROR")
            return {
                "success": False,
                "message": f"无法解析 API 响应: {str(json_error)}",
                "text": "",
                "debug_info": logger.get_log_dict()
            }
        
        # 提取转录文本
        transcript_text = result_data.get('text', '')
        transcript_length = len(transcript_text) if transcript_text else 0
        
        if not transcript_text or transcript_text.strip() == "":
            logger.log_error("EMPTY_RESULT", "转录结果为空")
            logger.print_log("WARNING")
            return {
                "success": False,
                "message": "未能识别出任何文字，请检查音频文件格式和质量",
                "text": "",
                "debug_info": logger.get_log_dict()
            }
        
        # 记录成功信息
        logger.log_success(
            transcript_text=transcript_text,
            transcript_length=transcript_length,
            language=result_data.get('language', 'zh-CN')
        )
        logger.print_log("SUCCESS")
        
        return {
            "success": True,
            "text": transcript_text,
            "duration": duration,
            "language": result_data.get('language', 'zh-CN'),
            "debug_info": logger.get_log_dict()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        error_trace = traceback.format_exc()
        logger.log_error(
            "EXCEPTION",
            f"发生异常: {str(e)}",
            traceback_str=error_trace
        )
        logger.print_log("EXCEPTION")
        return {
            "success": False,
            "message": f"转录失败: {str(e)}",
            "text": "",
            "debug_info": logger.get_log_dict()
        }

# Railway/Production startup
if __name__ == "__main__":
    import uvicorn
    
    # Get port from environment, default to 8000
    port = int(os.environ.get("PORT", 8000))
    
    # 使用 ASCII 字符避免 Windows 编码问题
    print(f"[START] Starting VoiceSpark on 0.0.0.0:{port}")
    print(f"[ENV] Environment: {os.environ.get('DEPLOY_ENVIRONMENT', 'unknown')}")
    
    uvicorn.run(
        "server2:app",
        host="0.0.0.0",
        port=port,
        log_level="info",
        access_log=True
    )
