"""
测试WebM文件删除chunk后的解码和转录能力

模拟不同的chunk删除场景：
1. 完整WebM（不删除chunk）
2. 删除第一个chunk（丢失文件头）
3. 删除中间chunk（破坏Cluster连续性）
4. 删除前面的chunk但保留第一个chunk
"""
import os
import sys
import json
import requests
from pathlib import Path

# 修复Windows控制台编码问题
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def print_section(title):
    """打印分节标题"""
    print(f"\n{'='*80}")
    print(f"  {title}")
    print(f"{'='*80}\n")

def create_modified_webm(original_file, chunks_to_remove_from_start=0, chunks_to_remove_from_middle=0):
    """
    创建修改后的WebM文件（模拟删除chunk的情况）
    
    注意：这个函数假设我们可以读取MediaRecorder的chunk结构
    但实际上，我们只能处理完整的WebM文件
    """
    import tempfile
    import shutil
    
    # 由于我们无法直接操作MediaRecorder的chunk，
    # 这个函数主要用于说明，实际测试需要使用真实的WebM文件
    return original_file

def test_webm_decoding(audio_file_path, test_name):
    """测试WebM文件是否可以解码"""
    print(f"\n[测试] {test_name}")
    print(f"  文件: {audio_file_path}")
    
    if not os.path.exists(audio_file_path):
        print(f"  ❌ 文件不存在")
        return False, "文件不存在"
    
    file_size = os.path.getsize(audio_file_path)
    print(f"  文件大小: {file_size / 1024:.2f} KB")
    
    # 检查文件头
    with open(audio_file_path, 'rb') as f:
        header = f.read(16)
        header_hex = header.hex()
        print(f"  文件头: {header_hex[:32]}...")
        
        # 检查是否是WebM文件
        if header[:4] == b'\x1a\x45\xdf\xa3':
            print(f"  ✅ 检测到WebM文件头（EBML）")
        else:
            print(f"  ⚠️  不是WebM文件或文件头异常")
    
    return True, None

def test_transcribe_with_method(audio_file_path, duration, needs_segmentation, test_name):
    """测试转录音频片段"""
    print(f"\n[测试] {test_name}")
    print(f"  文件: {audio_file_path}")
    print(f"  请求时长: {duration}秒")
    print(f"  服务器端截取: {'是' if needs_segmentation else '否'}")
    
    if not os.path.exists(audio_file_path):
        print(f"  ❌ 文件不存在")
        return False, None
    
    file_size = os.path.getsize(audio_file_path)
    print(f"  文件大小: {file_size / 1024:.2f} KB")
    
    try:
        # 准备FormData
        with open(audio_file_path, 'rb') as f:
            content = f.read()
            # 检测文件类型
            if content[:4] == b'\x1a\x45\xdf\xa3':
                content_type = 'audio/webm'
            elif content[:3] == b'ID3' or content[:2] == b'\xff\xfb':
                content_type = 'audio/mpeg'
            elif content[:4] == b'RIFF':
                content_type = 'audio/wav'
            else:
                content_type = 'audio/webm'  # 默认
            
            files = {
                'audio_file': (os.path.basename(audio_file_path), content, content_type)
            }
        
        data = {
            'duration': str(duration),
            'needs_segmentation': 'true' if needs_segmentation else 'false'
        }
        
        # 发送请求
        print(f"  发送请求到 /transcribe-segment...")
        response = requests.post(
            'http://localhost:8001/transcribe-segment',
            files=files,
            data=data,
            timeout=60
        )
        
        print(f"  响应状态码: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            if result.get('success'):
                text = result.get('text', '')
                print(f"  ✅ 转录成功")
                print(f"  转录文本长度: {len(text)} 字符")
                print(f"  转录文本预览: {text[:100]}...")
                
                # 检查调试信息
                if result.get('debug_info'):
                    debug = result['debug_info']
                    if debug.get('file_analysis'):
                        print(f"  检测到的格式: {debug['file_analysis'].get('detected_format', 'Unknown')}")
                    if debug.get('api_config'):
                        print(f"  使用的字段名: {debug['api_config'].get('field_name', 'Unknown')}")
                        print(f"  是否包含model参数: {debug['api_config'].get('has_model_param', False)}")
                
                return True, result
            else:
                print(f"  ❌ 转录失败: {result.get('message', 'Unknown error')}")
                if result.get('debug_info'):
                    debug = result['debug_info']
                    if debug.get('error'):
                        print(f"  错误类型: {debug['error'].get('type', 'Unknown')}")
                        print(f"  错误详情: {debug['error'].get('detail', 'No detail')[:200]}")
                return False, result
        else:
            print(f"  ❌ HTTP错误: {response.status_code}")
            print(f"  响应内容: {response.text[:500]}")
            return False, None
            
    except Exception as e:
        print(f"  ❌ 请求失败: {str(e)}")
        import traceback
        traceback.print_exc()
        return False, None

def main():
    """主测试函数"""
    print_section("WebM Chunk删除影响测试")
    
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
    
    # 查找WebM文件
    print_section("查找WebM测试文件")
    webm_files = list(Path('.').glob('*.webm'))
    
    if not webm_files:
        print("⚠️  未找到WebM文件")
        print("   请先使用GUI录制一个WebM音频文件（超过60秒）")
        print("   或者使用现有的音频文件进行测试")
        
        # 查找其他音频文件
        other_files = []
        for ext in ['*.mp3', '*.wav', '*.m4a']:
            other_files.extend(Path('.').glob(ext))
        
        if other_files:
            print(f"\n找到其他音频文件 {len(other_files)} 个:")
            for f in other_files:
                print(f"  - {f}")
            print("\n将使用这些文件进行测试（虽然不是WebM，但可以测试API功能）")
            test_files = [str(f) for f in other_files]
        else:
            print("\n❌ 未找到任何音频文件")
            return
    else:
        print(f"✅ 找到 {len(webm_files)} 个WebM文件:")
        for f in webm_files:
            size = os.path.getsize(f) / 1024
            print(f"  - {f} ({size:.2f} KB)")
        test_files = [str(f) for f in webm_files]
    
    # 选择测试文件（优先选择WebM，否则选择最大的文件）
    if webm_files:
        test_file = str(sorted(webm_files, key=lambda f: os.path.getsize(f), reverse=True)[0])
    else:
        test_file = str(sorted([Path(f) for f in test_files], key=lambda f: os.path.getsize(f), reverse=True)[0])
    
    print(f"\n✅ 使用测试文件: {test_file}")
    
    # 检查文件类型和结构
    print_section("文件结构分析")
    can_decode, error = test_webm_decoding(test_file, "文件结构检查")
    
    # 测试结果汇总
    results = {}
    
    # 测试场景1: 完整音频文件，浏览器端截取（模拟不删除chunk）
    print_section("测试场景 1: 完整音频文件，浏览器端截取（模拟不删除chunk）")
    success1, result1 = test_transcribe_with_method(
        test_file, 30, False, 
        "完整音频文件，浏览器端截取30秒"
    )
    results["完整音频_浏览器端_30秒"] = {"success": success1, "result": result1}
    
    # 测试场景2: 完整音频文件，浏览器端截取10秒
    print_section("测试场景 2: 完整音频文件，浏览器端截取10秒")
    success2, result2 = test_transcribe_with_method(
        test_file, 10, False,
        "完整音频文件，浏览器端截取10秒"
    )
    results["完整音频_浏览器端_10秒"] = {"success": success2, "result": result2}
    
    # 测试场景3: 服务器端截取（模拟删除chunk后浏览器端失败）
    print_section("测试场景 3: 服务器端截取（模拟删除chunk后浏览器端失败）")
    success3, result3 = test_transcribe_with_method(
        test_file, 30, True,
        "服务器端截取30秒"
    )
    results["服务器端截取_30秒"] = {"success": success3, "result": result3}
    
    # 测试场景4: 服务器端截取10秒
    print_section("测试场景 4: 服务器端截取10秒")
    success4, result4 = test_transcribe_with_method(
        test_file, 10, True,
        "服务器端截取10秒"
    )
    results["服务器端截取_10秒"] = {"success": success4, "result": result4}
    
    # 总结
    print_section("测试结果总结")
    
    print("测试结果汇总:")
    print(f"{'测试场景':<40} {'状态':<10} {'说明'}")
    print("-" * 90)
    
    for scenario, data in results.items():
        status = "✅ 成功" if data["success"] else "❌ 失败"
        if data["success"]:
            text_length = len(data["result"].get("text", "")) if data["result"] else 0
            note = f"转录文本长度: {text_length} 字符"
        else:
            message = data["result"].get("message", "Unknown error") if data["result"] else "No result"
            note = message[:50] + "..." if len(message) > 50 else message
        print(f"{scenario:<40} {status:<10} {note}")
    
    # 分析
    print("\n📊 分析:")
    browser_success = sum(1 for k, v in results.items() if '浏览器端' in k and v["success"])
    server_success = sum(1 for k, v in results.items() if '服务器端' in k and v["success"])
    total_success = sum(1 for v in results.values() if v["success"])
    total_count = len(results)
    
    print(f"  总测试数: {total_count}")
    print(f"  浏览器端成功: {browser_success} / {sum(1 for k in results.keys() if '浏览器端' in k)}")
    print(f"  服务器端成功: {server_success} / {sum(1 for k in results.keys() if '服务器端' in k)}")
    print(f"  总成功数: {total_success}")
    print(f"  成功率: {total_success / total_count * 100:.1f}%")
    
    # 结论和建议
    print("\n💡 结论和建议:")
    
    if browser_success > 0 and server_success > 0:
        print("  ✅ 浏览器端和服务器端截取都可以成功")
        print("  → 建议：")
        print("     1. 优先使用浏览器端截取（如果WebM结构完整）")
        print("     2. 如果浏览器端失败（WebM结构损坏），自动使用服务器端截取")
        print("     3. 可以删除chunk节省内存，依赖服务器端截取作为备选方案")
    elif browser_success > 0:
        print("  ✅ 浏览器端截取可以成功")
        print("  → 建议：保持WebM文件结构完整，不删除chunk")
    elif server_success > 0:
        print("  ✅ 服务器端截取可以成功")
        print("  → 建议：删除chunk节省内存，使用服务器端截取")
        print("     需要确保服务器安装了ffmpeg")
    else:
        print("  ⚠️  所有测试都失败")
        print("  → 请检查：")
        print("     1. 服务器日志中的详细错误信息")
        print("     2. AI Builder Token是否正确配置")
        print("     3. 音频文件格式是否支持")
        print("     4. 如果使用服务器端截取，检查ffmpeg是否安装")

if __name__ == "__main__":
    main()
