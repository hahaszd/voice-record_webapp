"""
测试长音频片段转录功能
测试场景：录音超过1分钟（如1分30秒），然后转录最后N秒
"""
import requests
import time
import sys
import os

if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

try:
    from mutagen.mp3 import MP3 as MutagenMP3
    from mutagen import File as MutagenFile
    HAS_MUTAGEN = True
except ImportError:
    HAS_MUTAGEN = False
    print("⚠️  警告: 未安装 mutagen，无法检测音频时长")

def print_section(title):
    """打印分隔线"""
    print("\n" + "=" * 80)
    print(f" {title}")
    print("=" * 80 + "\n")

def get_audio_duration(audio_file_path):
    """
    获取音频文件的实际时长（秒）
    
    Returns:
        (duration_seconds, success): 时长和是否成功检测
    """
    if not HAS_MUTAGEN:
        return None, False
    
    try:
        audio_file = MutagenFile(audio_file_path)
        if audio_file is not None:
            duration = audio_file.info.length
            return duration, True
    except Exception as e:
        print(f"⚠️  无法检测音频时长: {e}")
    
    return None, False

def test_transcribe_segment(audio_file_path, duration, expected_duration=None):
    """
    测试转录音频片段
    
    Args:
        audio_file_path: 音频文件路径
        duration: 要转录的时长（秒）
        expected_duration: 期望的音频时长（秒），用于验证
    """
    print_section(f"测试转录最后 {duration} 秒")
    
    if not os.path.exists(audio_file_path):
        print(f"❌ 错误: 文件不存在: {audio_file_path}")
        return False, None
    
    file_size = os.path.getsize(audio_file_path)
    print(f"📁 音频文件: {audio_file_path}")
    print(f"📊 文件大小: {file_size / 1024:.2f} KB ({file_size / 1024 / 1024:.2f} MB)")
    
    # 检测音频时长
    audio_duration, duration_detected = get_audio_duration(audio_file_path)
    if duration_detected:
        print(f"⏱️  音频时长: {audio_duration:.2f} 秒 ({int(audio_duration // 60)}分{int(audio_duration % 60)}秒)")
        
        if audio_duration < duration:
            print(f"⚠️  警告: 音频时长 ({audio_duration:.2f}秒) 小于请求的时长 ({duration}秒)")
            print(f"   将转录整个音频文件")
        else:
            print(f"✅ 音频时长足够，将截取最后 {duration} 秒")
    else:
        print(f"⚠️  无法检测音频时长，将尝试转录")
    
    # 确定文件类型
    if audio_file_path.endswith('.mp3'):
        content_type = 'audio/mpeg'
    elif audio_file_path.endswith('.wav'):
        content_type = 'audio/wav'
    elif audio_file_path.endswith('.webm'):
        content_type = 'audio/webm'
    else:
        content_type = 'audio/webm'
    
    print(f"🎵 文件类型: {content_type}")
    
    try:
        # 准备文件上传
        with open(audio_file_path, 'rb') as f:
            files = {
                'audio_file': (os.path.basename(audio_file_path), f, content_type)
            }
            form_data = {
                'duration': str(duration)
            }
            
            print(f"\n📤 发送请求到服务器...")
            print(f"   目标时长: {duration} 秒")
            print(f"   API 端点: http://localhost:8001/transcribe-segment")
            
            start_time = time.time()
            response = requests.post(
                'http://localhost:8001/transcribe-segment',
                files=files,
                data=form_data,
                timeout=120
            )
            elapsed_time = time.time() - start_time
            
            print(f"\n📥 服务器响应:")
            print(f"   状态码: {response.status_code}")
            print(f"   响应时间: {elapsed_time:.2f} 秒")
            print(f"   Content-Type: {response.headers.get('content-type', 'N/A')}")
            
            if response.status_code != 200:
                print(f"\n❌ HTTP 错误: {response.status_code}")
                try:
                    error_data = response.json()
                    print(f"   错误信息: {error_data}")
                except:
                    print(f"   响应文本: {response.text[:500]}")
                return False, None
            
            # 解析响应
            result = response.json()
            
            print(f"\n📋 响应内容:")
            print(f"   Success: {result.get('success', False)}")
            print(f"   Duration: {result.get('duration', 'N/A')} 秒")
            print(f"   Language: {result.get('language', 'N/A')}")
            
            # 显示调试信息（如果有）
            if 'debug_info' in result:
                debug_info = result['debug_info']
                print(f"\n🔍 调试信息:")
                print(f"   文件大小: {debug_info.get('file_size_kb', 'N/A')} KB")
                print(f"   检测格式: {debug_info.get('detected_format', 'N/A')}")
                print(f"   最终类型: {debug_info.get('final_content_type', 'N/A')}")
                print(f"   API URL: {debug_info.get('api_url', 'N/A')}")
                print(f"   请求耗时: {debug_info.get('request_duration_seconds', 'N/A')} 秒")
                if 'error' in debug_info:
                    print(f"   错误: {debug_info.get('error', 'N/A')}")
                    if 'error_detail' in debug_info:
                        print(f"   错误详情: {debug_info.get('error_detail', 'N/A')}")
                if 'error_response_json' in debug_info:
                    print(f"   API 错误响应: {debug_info.get('error_response_json', 'N/A')}")
            
            if result.get('success'):
                transcript_text = result.get('text', '')
                print(f"\n✅ 转录成功!")
                print(f"📝 转录文本 ({len(transcript_text)} 字符):")
                print(f"   {transcript_text}")
                return True, transcript_text
            else:
                error_msg = result.get('message', 'Unknown error')
                print(f"\n❌ 转录失败:")
                print(f"   错误信息: {error_msg}")
                return False, None
                
    except requests.exceptions.Timeout:
        print(f"\n❌ 请求超时（超过 120 秒）")
        return False, None
    except requests.exceptions.ConnectionError:
        print(f"\n❌ 连接错误: 无法连接到服务器")
        print(f"   请确保服务器正在运行在 http://localhost:8001")
        return False, None
    except Exception as e:
        print(f"\n❌ 发生异常: {e}")
        import traceback
        traceback.print_exc()
        return False, None

def main():
    """主测试函数"""
    print_section("长音频片段转录功能测试")
    print("测试目标: 验证录音超过1分钟时，能够正确截取并转录最后N秒\n")
    
    # 检查服务器是否运行
    try:
        response = requests.get('http://localhost:8001/static/index.html', timeout=5)
        if response.status_code != 200:
            print("❌ 服务器未正常运行")
            return
    except:
        print("❌ 无法连接到服务器，请先启动服务器:")
        print("   python -m uvicorn server2:app --host 0.0.0.0 --port 8001")
        return
    
    print("✅ 服务器连接正常\n")
    
    # 查找测试音频文件
    test_files = [
        'test_voice.mp3',
        'my-recording.mp3',
        'Record (online-voice-recorder.com).mp3',
    ]
    
    audio_file = None
    for test_file in test_files:
        if os.path.exists(test_file):
            audio_file = test_file
            break
    
    if not audio_file:
        print("⚠️  未找到测试音频文件")
        print("   请提供音频文件路径，或使用以下文件之一:")
        for f in test_files:
            print(f"   - {f}")
        print("\n   或者手动指定文件路径:")
        audio_file = input("   请输入音频文件路径: ").strip().strip('"').strip("'")
        
        if not os.path.exists(audio_file):
            print(f"❌ 文件不存在: {audio_file}")
            return
    
    print(f"✅ 使用音频文件: {audio_file}\n")
    
    # 检查音频时长
    audio_duration, detected = get_audio_duration(audio_file)
    if detected:
        if audio_duration < 60:
            print(f"⚠️  警告: 当前音频文件时长只有 {audio_duration:.2f} 秒，不足1分钟")
            print(f"   建议: 使用录音界面录制超过1分钟的音频进行测试")
            print(f"   继续测试将使用完整音频文件...\n")
        elif audio_duration >= 90:
            print(f"✅ 音频文件时长 {audio_duration:.2f} 秒，适合测试1分30秒的场景\n")
    
    # 测试场景1: 转录最后60秒（假设音频超过60秒）
    print_section("测试场景 1: 转录最后 60 秒")
    result1, text1 = test_transcribe_segment(audio_file, duration=60)
    
    # 测试场景2: 转录最后30秒
    print_section("测试场景 2: 转录最后 30 秒")
    result2, text2 = test_transcribe_segment(audio_file, duration=30)
    
    # 测试场景3: 转录最后10秒
    print_section("测试场景 3: 转录最后 10 秒")
    result3, text3 = test_transcribe_segment(audio_file, duration=10)
    
    # 验证转录结果
    print_section("结果验证")
    
    if result1 and result2 and result3:
        print("✅ 所有转录请求都成功")
        
        # 比较转录结果
        if text1 and text2 and text3:
            print("\n📊 转录结果对比:")
            print(f"   最后 60 秒: {text1[:50]}...")
            print(f"   最后 30 秒: {text2[:50]}...")
            print(f"   最后 10 秒: {text3[:50]}...")
            
            # 如果音频足够长，最后10秒和30秒的内容应该不同
            if audio_duration and audio_duration >= 90:
                if text2 != text3:
                    print("\n✅ 验证通过: 不同时长的转录结果不同，说明截取功能正常工作")
                else:
                    print("\n⚠️  注意: 不同时长的转录结果相同，可能是音频内容相似或截取功能未生效")
    else:
        print("❌ 部分转录请求失败")
    
    # 总结
    print_section("测试总结")
    print(f"转录最后 60 秒: {'✅ 成功' if result1 else '❌ 失败'}")
    print(f"转录最后 30 秒: {'✅ 成功' if result2 else '❌ 失败'}")
    print(f"转录最后 10 秒: {'✅ 成功' if result3 else '❌ 失败'}")
    
    success_count = sum([result1, result2, result3])
    print(f"\n总计: {success_count}/3 个测试通过")
    
    if success_count == 3:
        print("🎉 所有测试通过！")
        print("\n💡 提示: 要测试超过1分钟的音频，请:")
        print("   1. 使用录音界面录制超过1分30秒的音频")
        print("   2. 然后尝试转录最后60秒或30秒")
        print("   3. 验证转录结果是否正确对应相应的音频片段")
    else:
        print("⚠️  部分测试失败，请查看上面的错误信息和调试日志")

if __name__ == "__main__":
    main()
