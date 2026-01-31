"""
测试不同的WebM chunk处理方式，找出哪种方式能够成功生成音频文件并通过API转译

测试场景：
1. 完整WebM（不删除chunk）- 应该成功
2. 删除中间chunk但保留第一个chunk - 测试是否成功
3. 删除chunk包括第一个chunk - 测试是否成功
4. 服务器端截取 - 测试是否成功
"""
import os
import sys
import json
import requests
import tempfile
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

def test_transcribe_segment(audio_file_path, duration, test_name):
    """测试转录音频片段"""
    print(f"\n[测试] {test_name}")
    print(f"  文件: {audio_file_path}")
    print(f"  请求时长: {duration}秒")
    
    if not os.path.exists(audio_file_path):
        print(f"  ❌ 文件不存在")
        return False, None
    
    file_size = os.path.getsize(audio_file_path)
    print(f"  文件大小: {file_size / 1024:.2f} KB")
    
    try:
        # 准备FormData
        with open(audio_file_path, 'rb') as f:
            files = {
                'audio_file': (os.path.basename(audio_file_path), f.read(), 'audio/webm')
            }
        
        data = {
            'duration': str(duration),
            'needs_segmentation': 'false'  # 先测试浏览器端是否成功
        }
        
        # 发送请求
        print(f"  发送请求到 /transcribe-segment...")
        response = requests.post(
            'http://localhost:8001/transcribe-segment',
            files=files,
            data=data,
            timeout=30
        )
        
        print(f"  响应状态码: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            if result.get('success'):
                text = result.get('text', '')
                print(f"  ✅ 转录成功")
                print(f"  转录文本长度: {len(text)} 字符")
                print(f"  转录文本预览: {text[:100]}...")
                return True, result
            else:
                print(f"  ❌ 转录失败: {result.get('message', 'Unknown error')}")
                if result.get('debug_info'):
                    print(f"  调试信息: {json.dumps(result['debug_info'], ensure_ascii=False, indent=2)}")
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

def test_server_side_segmentation(audio_file_path, duration):
    """测试服务器端截取"""
    print(f"\n[测试] 服务器端截取")
    print(f"  文件: {audio_file_path}")
    print(f"  请求时长: {duration}秒")
    
    if not os.path.exists(audio_file_path):
        print(f"  ❌ 文件不存在")
        return False, None
    
    try:
        # 准备FormData
        with open(audio_file_path, 'rb') as f:
            files = {
                'audio_file': (os.path.basename(audio_file_path), f.read(), 'audio/webm')
            }
        
        data = {
            'duration': str(duration),
            'needs_segmentation': 'true'  # 标记需要服务器端截取
        }
        
        # 发送请求
        print(f"  发送请求到 /transcribe-segment（服务器端截取）...")
        response = requests.post(
            'http://localhost:8001/transcribe-segment',
            files=files,
            data=data,
            timeout=60  # 服务器端截取可能需要更长时间
        )
        
        print(f"  响应状态码: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            if result.get('success'):
                text = result.get('text', '')
                print(f"  ✅ 转录成功（服务器端截取）")
                print(f"  转录文本长度: {len(text)} 字符")
                print(f"  转录文本预览: {text[:100]}...")
                return True, result
            else:
                print(f"  ❌ 转录失败: {result.get('message', 'Unknown error')}")
                if result.get('debug_info'):
                    print(f"  调试信息: {json.dumps(result['debug_info'], ensure_ascii=False, indent=2)}")
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

def find_test_files():
    """查找测试用的音频文件"""
    print_section("查找测试文件")
    
    # 查找现有的音频文件
    test_files = []
    for ext in ['*.webm', '*.mp3', '*.wav', '*.m4a']:
        test_files.extend(Path('.').glob(ext))
    
    if not test_files:
        print("⚠️  未找到测试音频文件")
        print("   请先录制一个超过60秒的音频文件，或使用现有的音频文件")
        return []
    
    print(f"✅ 找到 {len(test_files)} 个音频文件:")
    for i, f in enumerate(test_files, 1):
        size = os.path.getsize(f) / 1024
        print(f"  {i}. {f} ({size:.2f} KB)")
    
    return [str(f) for f in test_files]

def main():
    """主测试函数"""
    print_section("WebM Chunk处理方式测试")
    
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
    
    # 查找测试文件
    test_files = find_test_files()
    
    if not test_files:
        print("\n请提供测试音频文件路径:")
        test_file = input("  请输入音频文件路径: ").strip().strip('"').strip("'")
        if not os.path.exists(test_file):
            print(f"❌ 文件不存在: {test_file}")
            return
        test_files = [test_file]
    
    # 自动选择测试文件（优先选择较长的文件，模拟超过60秒的情况）
    if len(test_files) > 1:
        print("\n自动选择测试文件（优先选择较长的文件）:")
        # 按文件大小排序，选择最大的（通常是较长的录音）
        test_files_sorted = sorted(test_files, key=lambda f: os.path.getsize(f), reverse=True)
        test_file = test_files_sorted[0]
        print(f"  ✅ 自动选择: {test_file} ({os.path.getsize(test_file) / 1024:.2f} KB)")
    else:
        test_file = test_files[0]
    
    file_size = os.path.getsize(test_file)
    print(f"\n📁 测试文件信息:")
    print(f"  路径: {test_file}")
    print(f"  大小: {file_size / 1024:.2f} KB ({file_size / 1024 / 1024:.2f} MB)")
    
    # 测试结果汇总
    results = {}
    
    # 测试场景1: 完整音频文件，请求10秒（模拟短录音截取）
    print_section("测试场景 1: 完整音频文件，请求10秒（模拟短录音截取）")
    success1, result1 = test_transcribe_segment(test_file, 10, "完整音频文件，请求10秒")
    results["完整音频_10秒"] = {"success": success1, "result": result1}
    
    # 测试场景2: 完整音频文件，请求30秒
    print_section("测试场景 2: 完整音频文件，请求30秒")
    success2, result2 = test_transcribe_segment(test_file, 30, "完整音频文件，请求30秒")
    results["完整音频_30秒"] = {"success": success2, "result": result2}
    
    # 测试场景3: 完整音频文件，请求60秒
    print_section("测试场景 3: 完整音频文件，请求60秒")
    success3, result3 = test_transcribe_segment(test_file, 60, "完整音频文件，请求60秒")
    results["完整音频_60秒"] = {"success": success3, "result": result3}
    
    # 测试场景4: 服务器端截取，请求10秒（模拟删除chunk后浏览器端失败的情况）
    print_section("测试场景 4: 服务器端截取，请求10秒（模拟浏览器端失败）")
    success4, result4 = test_server_side_segmentation(test_file, 10)
    results["服务器端截取_10秒"] = {"success": success4, "result": result4}
    
    # 测试场景5: 服务器端截取，请求30秒
    print_section("测试场景 5: 服务器端截取，请求30秒")
    success5, result5 = test_server_side_segmentation(test_file, 30)
    results["服务器端截取_30秒"] = {"success": success5, "result": result5}
    
    # 总结
    print_section("测试结果总结")
    
    print("测试结果汇总:")
    print(f"{'测试场景':<30} {'状态':<10} {'说明'}")
    print("-" * 80)
    
    for scenario, data in results.items():
        status = "✅ 成功" if data["success"] else "❌ 失败"
        if data["success"]:
            text_length = len(data["result"].get("text", "")) if data["result"] else 0
            note = f"转录文本长度: {text_length} 字符"
        else:
            message = data["result"].get("message", "Unknown error") if data["result"] else "No result"
            note = message[:50] + "..." if len(message) > 50 else message
        print(f"{scenario:<30} {status:<10} {note}")
    
    # 分析
    print("\n📊 分析:")
    success_count = sum(1 for data in results.values() if data["success"])
    total_count = len(results)
    
    print(f"  总测试数: {total_count}")
    print(f"  成功数: {success_count}")
    print(f"  失败数: {total_count - success_count}")
    print(f"  成功率: {success_count / total_count * 100:.1f}%")
    
    # 建议
    print("\n💡 建议:")
    
    # 检查不同场景的成功率
    full_audio_success = any(results.get(f"完整音频_{d}秒", {}).get("success") for d in [10, 30, 60])
    server_seg_success = any(results.get(f"服务器端截取_{d}秒", {}).get("success") for d in [10, 30])
    
    if full_audio_success and server_seg_success:
        print("  ✅ 完整音频和服务器端截取都可以成功转录")
        print("  → 建议：")
        print("     1. 优先使用浏览器端截取（如果WebM结构完整）")
        print("     2. 如果浏览器端失败，自动使用服务器端截取")
        print("     3. 删除chunk节省内存，依赖服务器端截取作为备选方案")
    elif full_audio_success:
        print("  ✅ 完整音频可以成功转录")
        print("  → 建议：不删除chunk，保持WebM文件结构完整")
        print("     这样可以确保浏览器端截取始终成功")
    elif server_seg_success:
        print("  ✅ 服务器端截取可以成功转录")
        print("  → 建议：删除chunk节省内存，浏览器端失败时使用服务器端截取")
        print("     需要确保服务器安装了ffmpeg")
    else:
        print("  ⚠️  所有测试都失败，请检查：")
        print("     1. 服务器是否正常运行")
        print("     2. AI Builder Token是否配置（检查.env文件）")
        print("     3. 音频文件格式是否正确")
        print("     4. 服务器日志中的详细错误信息")
        print("     5. 如果使用服务器端截取，检查ffmpeg是否安装")
    
    # 详细建议
    print("\n📋 详细建议:")
    print("  1. 如果'完整音频'测试成功：")
    print("     → 说明WebM文件结构完整，浏览器端可以正常解码和截取")
    print("     → 建议：不删除chunk，保持文件结构完整")
    print("  2. 如果'完整音频'失败但'服务器端截取'成功：")
    print("     → 说明WebM文件可能有问题，但服务器端可以处理")
    print("     → 建议：删除chunk节省内存，依赖服务器端截取")
    print("  3. 如果所有测试都失败：")
    print("     → 检查服务器配置和日志")
    print("     → 确认AI Builder Token是否正确配置")
    print("     → 确认音频文件格式是否支持")

if __name__ == "__main__":
    main()
