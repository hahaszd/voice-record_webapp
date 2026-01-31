#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
录音功能自动化测试运行器
在代码修改后自动运行测试，确保功能正常
"""

import subprocess
import sys
import os
import time
import signal
from pathlib import Path

# Windows编码修复
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# 服务器进程
server_process = None

def check_server_running(port=8001):
    """检查服务器是否在运行"""
    import socket
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        result = sock.connect_ex(('localhost', port))
        sock.close()
        return result == 0
    except:
        return False

def stop_existing_server():
    """停止占用8001端口的现有服务器"""
    try:
        import socket
        import psutil
        
        # 查找占用8001端口的进程
        for conn in psutil.net_connections(kind='inet'):
            if conn.laddr.port == 8001 and conn.status == psutil.CONN_LISTEN:
                try:
                    proc = psutil.Process(conn.pid)
                    print(f"🛑 发现占用8001端口的进程 (PID: {conn.pid}), 正在停止...")
                    proc.terminate()
                    proc.wait(timeout=5)
                    print("✅ 进程已停止")
                    time.sleep(2)  # 等待端口释放
                    return True
                except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.TimeoutExpired) as e:
                    print(f"⚠️  无法停止进程: {e}")
                    return False
    except ImportError:
        print("⚠️  psutil未安装，无法自动停止现有服务器")
        print("   请手动停止占用8001端口的进程")
        return False
    except Exception as e:
        print(f"⚠️  检查现有服务器时出错: {e}")
        return False
    return False

def start_server():
    """启动FastAPI服务器"""
    global server_process
    
    # 先检查服务器是否在运行，并验证是否是server2.py
    if check_server_running():
        print("⚠️  检测到服务器已在运行，正在验证是否为正确的服务器...")
        try:
            import urllib.request
            response = urllib.request.urlopen('http://localhost:8001', timeout=5)
            content = response.read().decode('utf-8')
            if '语音录制与转录' in content or 'recordBtn' in content:
                print("✅ 正确的服务器已在运行 (server2.py)")
                return True
            else:
                print("❌ 检测到错误的服务器在运行")
                if stop_existing_server():
                    print("   已停止错误的服务器，将启动正确的服务器")
                else:
                    print("   无法自动停止，请手动停止占用8001端口的进程")
                    return False
        except Exception as e:
            print(f"⚠️  无法验证服务器: {e}")
            if stop_existing_server():
                print("   已停止现有服务器，将启动正确的服务器")
            else:
                return False
    
    print("🚀 启动FastAPI服务器 (server2.py)...")
    try:
        server_process = subprocess.Popen(
            [sys.executable, '-m', 'uvicorn', 'server2:app', '--host', '0.0.0.0', '--port', '8001'],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=Path(__file__).parent
        )
        
        # 等待服务器启动
        max_wait = 10
        for i in range(max_wait):
            if check_server_running():
                print("✅ 服务器启动成功")
                return True
            time.sleep(1)
        
        print("❌ 服务器启动超时")
        return False
    except Exception as e:
        print(f"❌ 启动服务器失败: {e}")
        return False

def stop_server():
    """停止FastAPI服务器"""
    global server_process
    if server_process:
        print("🛑 停止服务器...")
        server_process.terminate()
        try:
            server_process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server_process.kill()
        server_process = None
        print("✅ 服务器已停止")

def check_node_installed():
    """检查Node.js是否已安装"""
    try:
        result = subprocess.run(['node', '--version'], capture_output=True, text=True)
        if result.returncode == 0:
            print(f"✅ Node.js已安装: {result.stdout.strip()}")
            return True
    except FileNotFoundError:
        print("❌ Node.js未安装，请先安装Node.js")
        return False

def check_npm_dependencies():
    """检查npm依赖是否已安装"""
    node_modules = Path(__file__).parent / 'node_modules'
    if node_modules.exists():
        print("✅ npm依赖已安装")
        return True
    else:
        print("📦 安装npm依赖...")
        try:
            # 在Windows上，可能需要使用cmd /c来运行npm
            if sys.platform == 'win32':
                result = subprocess.run(['cmd', '/c', 'npm', 'install'], 
                                      cwd=Path(__file__).parent, 
                                      check=True,
                                      shell=True)
            else:
                result = subprocess.run(['npm', 'install'], 
                                      cwd=Path(__file__).parent, 
                                      check=True)
            print("✅ npm依赖安装完成")
            return True
        except (subprocess.CalledProcessError, FileNotFoundError) as e:
            print(f"❌ npm依赖安装失败: {e}")
            print("提示: 请手动运行 'npm install' 安装依赖")
            return False

def run_tests():
    """运行测试"""
    print("\n" + "="*60)
    print("开始运行录音播放测试")
    print("="*60 + "\n")
    
    try:
        # 在Windows上，可能需要使用cmd /c来运行npm
        if sys.platform == 'win32':
            result = subprocess.run(['cmd', '/c', 'npm', 'test'], 
                                  cwd=Path(__file__).parent, 
                                  check=False,
                                  shell=True)
        else:
            result = subprocess.run(['npm', 'test'], 
                                  cwd=Path(__file__).parent, 
                                  check=False)
        return result.returncode == 0
    except Exception as e:
        print(f"❌ 运行测试失败: {e}")
        return False

def main():
    """主函数"""
    print("="*60)
    print("录音功能自动化测试运行器")
    print("="*60 + "\n")
    
    # 检查Node.js
    if not check_node_installed():
        sys.exit(1)
    
    # 检查并安装npm依赖
    if not check_npm_dependencies():
        sys.exit(1)
    
    # 启动服务器
    server_started = start_server()
    if not server_started:
        sys.exit(1)
    
    try:
        # 运行测试
        success = run_tests()
        
        if success:
            print("\n✅ 所有测试通过！")
            sys.exit(0)
        else:
            print("\n❌ 部分测试失败，请检查代码")
            sys.exit(1)
    finally:
        # 清理：停止服务器
        stop_server()

if __name__ == '__main__':
    # 处理Ctrl+C
    def signal_handler(sig, frame):
        print("\n\n收到中断信号，正在清理...")
        stop_server()
        sys.exit(0)
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    main()
