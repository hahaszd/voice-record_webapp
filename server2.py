import os
import json
import time
import base64
import threading
import requests
import datetime
from collections import defaultdict, deque
from fastapi import FastAPI, UploadFile, File, HTTPException, Form, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
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

# v120: 默认关闭自动生成的 API 文档（fail-closed）
# /docs、/redoc、/openapi.json 会把所有端点和请求 schema 公开列出来，
# 相当于给扫描器一份说明书。
#
# 安全开关必须 fail-closed：变量缺失/配错时也要落在“关闭”这一侧。
# 因此默认按生产处理，只有显式设 DEPLOY_ENVIRONMENT=development 才开文档。
# （v120 首版用的是 == 'production'，结果生产上该变量没设，文档意外敞开。）
SHOW_DOCS = os.getenv('DEPLOY_ENVIRONMENT', 'production').lower() == 'development'

app = FastAPI(
    title="VoiceSpark",
    description="语音转文字服务（OpenAI Whisper / AI Builder Space / Google STT / Deepgram）",
    docs_url="/docs" if SHOW_DOCS else None,
    redoc_url="/redoc" if SHOW_DOCS else None,
    openapi_url="/openapi.json" if SHOW_DOCS else None,
)
print(f"[v120-SECURITY] API docs: {'enabled (development)' if SHOW_DOCS else 'disabled'}")


# ============================================================
# v120: 转录端点限流
# ============================================================
# 转录端点无鉴权（匿名免注册是产品设计，不能加 API key），
# 但每次调用都直打付费 API（Whisper / Deepgram / AI Builder / Google STT），
# 单个请求最大 25MB。没有限流 = 任何人都能刷爆账单。
#
# 这里只挡机会主义扫描器和脚本，不挡定向攻击（换 IP 即可绕过）。
# 阈值按"一个人正常使用的上限"设定，正常用绝不会碰到。
RATE_LIMITS = [
    (60, 20),      # 每 60 秒最多 20 次
    (3600, 150),   # 每 3600 秒最多 150 次
]
RATE_LIMITED_PATHS = {
    "/transcribe-segment",
    "/speech-to-text",
    "/speech-to-text-aibuilder",
}
_RATE_WINDOW = max(w for w, _ in RATE_LIMITS)

_rate_hits = defaultdict(deque)   # client_id -> deque[timestamp]
_rate_lock = threading.Lock()


def _client_id(request: Request) -> str:
    """取真实客户端 IP。Railway 在反向代理后，request.client.host 是代理 IP。

    K6（eval 评审 2026-07-21，已实测确认安全）：取 X-Forwarded-For **最左**项在 Railway 上是
    安全的。实测（临时 /_debug/xff 端点，用伪造 XFF 打 dev）：Railway 边缘代理会**剥离/覆盖**
    客户端自带的 X-Forwarded-For，把真实客户端 IP 放在最左，伪造值完全不出现（X-Real-IP 同样被
    覆盖为真实 IP）。因此 split(",")[0] 取到的就是真实客户端 IP、**无法用伪造头绕过限流**。
    （注意：真实 IP 轮换仍能绕过，那是文件头注释里既定接受的权衡——只挡机会主义扫描器，非定向攻击。）
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        # X-Forwarded-For: <client>, <proxy1>, <proxy2> —— 约定第一个是原始客户端（但可被伪造，见上）
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    if request.url.path not in RATE_LIMITED_PATHS:
        return await call_next(request)

    client = _client_id(request)
    now = time.monotonic()

    with _rate_lock:
        # 定期清理过期条目，防止 dict 被大量一次性 IP 撑大
        if len(_rate_hits) > 1000:
            for stale in [c for c, h in _rate_hits.items()
                          if not h or now - h[-1] > _RATE_WINDOW]:
                del _rate_hits[stale]

        hits = _rate_hits[client]
        while hits and now - hits[0] > _RATE_WINDOW:
            hits.popleft()

        for window, limit in RATE_LIMITS:
            recent = sum(1 for t in hits if now - t <= window)
            if recent >= limit:
                retry_after = int(window - (now - hits[0])) + 1
                print(f"[v120-RATELIMIT] BLOCKED {client} -> {request.url.path} "
                      f"({recent}/{limit} in {window}s)")
                return JSONResponse(
                    status_code=429,
                    headers={"Retry-After": str(max(retry_after, 1))},
                    content={
                        "success": False,
                        "message": "请求过于频繁，请稍后再试。",
                        "text": "",
                    },
                )

        hits.append(now)

    return await call_next(request)

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
