"""
测试指定的音频文件
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

def print_section(title):
    """打印分隔线"""
    print("\n" + "=" * 80)
    print(f" {title}")
    print("=" * 80 + "\n")

def get_audio_duration(audio_file_path):
    """获取音频文件的实际时长（秒）"""
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

def test_transcribe_segment(audio_file_path, duration):
    """测试转录音频片段"""
    print_section(f"测试转录最后 {duration} 秒")
    
    if not os.path.exists(audio_file_path):
        print(f"❌ 错误: 文件不存在: {audio_file_path}")
        return False, None
    
    file_size = os.path.getsize(audio_file_path)
    print(f"📁 音频文件: {audio_file_path}")
    print(f"📊 文件大小: {file_size / 1024:.2f} KB ({file_size / 1024 / 1024:.2f} MB)")
    
    # 检测音频时长
    audio_duration, detected = get_audio_duration(audio_file_path)
    if detected:
        minutes = int(audio_duration // 60)
        seconds = int(audio_duration % 60)
        print(f"⏱️  音频时长: {audio_duration:.2f} 秒 ({minutes}分{seconds}秒)")
        
        if audio_duration < duration:
            print(f"⚠️  警告: 音频时长 ({audio_duration:.2f}秒) 小于请求的时长 ({duration}秒)")
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
        with open(audio_file_path, 'rb') as f:
            files = {
                'audio_file': (os.path.basename(audio_file_path), f, content_type)
            }
            form_data = {
                'duration': str(duration)
            }
            
            print(f"\n📤 发送请求到服务器...")
            print(f"   目标时长: {duration} 秒")
            
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
            
            if response.status_code != 200:
                print(f"\n❌ HTTP 错误: {response.status_code}")
                try:
                    error_data = response.json()
                    print(f"   错误信息: {error_data}")
                except:
                    print(f"   响应文本: {response.text[:500]}")
                return False, None
            
            result = response.json()
            
            print(f"\n📋 响应内容:")
            print(f"   Success: {result.get('success', False)}")
            print(f"   Duration: {result.get('duration', 'N/A')} 秒")
            
            # 显示调试信息
            if 'debug_info' in result:
                debug_info = result['debug_info']
                print(f"\n🔍 调试信息:")
                print(f"   文件大小: {debug_info.get('file_size_kb', 'N/A')} KB")
                print(f"   检测格式: {debug_info.get('detected_format', 'N/A')}")
                print(f"   最终类型: {debug_info.get('final_content_type', 'N/A')}")
                print(f"   请求耗时: {debug_info.get('request_duration_seconds', 'N/A')} 秒")
                if 'error' in debug_info:
                    print(f"   错误: {debug_info.get('error', 'N/A')}")
                    if 'error_detail' in debug_info:
                        print(f"   错误详情: {debug_info.get('error_detail', 'N/A')}")
            
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
                
    except Exception as e:
        print(f"\n❌ 发生异常: {e}")
        import traceback
        traceback.print_exc()
        return False, None

def main():
    """主测试函数"""
    audio_file = 'test_voice_long_90s.mp3'
    
    print_section(f"测试音频文件: {audio_file}")
    
    # 检查文件是否存在
    if not os.path.exists(audio_file):
        print(f"❌ 文件不存在: {audio_file}")
        return
    
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
    
    # 检测音频时长
    audio_duration, detected = get_audio_duration(audio_file)
    if detected:
        minutes = int(audio_duration // 60)
        seconds = int(audio_duration % 60)
        print(f"✅ 音频文件时长: {audio_duration:.2f} 秒 ({minutes}分{seconds}秒)")
        if audio_duration >= 90:
            print(f"✅ 音频时长足够，适合测试1分30秒的场景\n")
        else:
            print(f"⚠️  音频时长不足90秒，但可以进行测试\n")
    else:
        print("⚠️  无法检测音频时长\n")
    
    # 测试场景1: 转录最后60秒
    result1, text1 = test_transcribe_segment(audio_file, duration=60)
    
    # 测试场景2: 转录最后30秒
    result2, text2 = test_transcribe_segment(audio_file, duration=30)
    
    # 测试场景3: 转录最后10秒
    result3, text3 = test_transcribe_segment(audio_file, duration=10)
    
    # 总结
    print_section("测试总结")
    print(f"转录最后 60 秒: {'✅ 成功' if result1 else '❌ 失败'}")
    if result1 and text1:
        print(f"   文本: {text1[:50]}...")
    
    print(f"\n转录最后 30 秒: {'✅ 成功' if result2 else '❌ 失败'}")
    if result2 and text2:
        print(f"   文本: {text2[:50]}...")
    
    print(f"\n转录最后 10 秒: {'✅ 成功' if result3 else '❌ 失败'}")
    if result3 and text3:
        print(f"   文本: {text3[:50]}...")
    
    # 结果对比
    if result1 and result2 and result3:
        print(f"\n📊 结果对比:")
        if text1 and text2 and text3:
            if text1 != text2 or text2 != text3:
                print("✅ 不同时长的转录结果不同，说明截取功能正常工作")
            else:
                print("⚠️  不同时长的转录结果相同，可能是音频内容相似")
    
    success_count = sum([result1, result2, result3])
    print(f"\n总计: {success_count}/3 个测试通过")
    
    if success_count == 3:
        print("🎉 所有测试通过！")
    else:
        print("⚠️  部分测试失败，请查看上面的错误信息")

if __name__ == "__main__":
    main()
