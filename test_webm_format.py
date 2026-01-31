"""
测试 WebM 格式的转录功能
验证 OpenAI Whisper API 对 WebM 格式的支持
"""
import requests
import os
import sys

if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def test_webm_transcription():
    """测试 WebM 格式的转录"""
    print("=" * 80)
    print("测试 WebM 格式转录功能")
    print("=" * 80)
    
    # 检查服务器
    try:
        response = requests.get('http://localhost:8001/static/index.html', timeout=5)
        if response.status_code != 200:
            print("❌ 服务器未正常运行")
            return
    except:
        print("❌ 无法连接到服务器")
        return
    
    print("✅ 服务器连接正常\n")
    
    # 查找 WebM 测试文件
    test_files = [
        'test_voice.webm',
        'recording.webm',
    ]
    
    webm_file = None
    for test_file in test_files:
        if os.path.exists(test_file):
            webm_file = test_file
            break
    
    if not webm_file:
        print("⚠️  未找到 WebM 测试文件")
        print("   提示：可以使用录音界面录制音频，然后保存为 WebM 格式")
        return
    
    print(f"✅ 使用测试文件: {webm_file}\n")
    
    file_size = os.path.getsize(webm_file)
    print(f"📁 文件信息:")
    print(f"   路径: {webm_file}")
    print(f"   大小: {file_size / 1024:.2f} KB ({file_size / 1024 / 1024:.2f} MB)")
    
    # 检查文件头
    with open(webm_file, 'rb') as f:
        header = f.read(16)
        print(f"   文件头: {header[:4].hex()}")
        if header[:4] == b'\x1aE\xdf\xa3':
            print(f"   ✅ 确认为 WebM 格式")
        else:
            print(f"   ⚠️  文件头不匹配标准 WebM 格式")
    
    # 测试转录
    print(f"\n📤 发送转录请求...")
    try:
        with open(webm_file, 'rb') as f:
            files = {
                'audio_file': (os.path.basename(webm_file), f, 'audio/webm')
            }
            form_data = {
                'duration': '60'
            }
            
            response = requests.post(
                'http://localhost:8001/transcribe-segment',
                files=files,
                data=form_data,
                timeout=120
            )
            
            print(f"📥 响应:")
            print(f"   状态码: {response.status_code}")
            
            if response.status_code == 200:
                result = response.json()
                print(f"   Success: {result.get('success', False)}")
                
                if result.get('success'):
                    print(f"\n✅ WebM 格式转录成功!")
                    print(f"📝 转录文本: {result.get('text', 'N/A')}")
                else:
                    print(f"\n❌ 转录失败:")
                    print(f"   错误: {result.get('message', 'N/A')}")
                    
                    # 显示调试信息
                    if 'debug_info' in result:
                        debug = result['debug_info']
                        print(f"\n🔍 调试信息:")
                        print(f"   检测格式: {debug.get('detected_format', 'N/A')}")
                        print(f"   最终类型: {debug.get('final_content_type', 'N/A')}")
                        if 'error_detail' in debug:
                            print(f"   错误详情: {debug.get('error_detail', 'N/A')}")
            else:
                print(f"\n❌ HTTP 错误: {response.status_code}")
                try:
                    error = response.json()
                    print(f"   错误信息: {error}")
                except:
                    print(f"   响应文本: {response.text[:500]}")
                    
    except Exception as e:
        print(f"\n❌ 发生异常: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_webm_transcription()
