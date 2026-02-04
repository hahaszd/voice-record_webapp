# 🐛 Railway PORT 环境变量问题修复

## ❌ 错误信息
```
Error: Invalid value for '--port': '$PORT' is not a valid integer.
Usage: uvicorn [OPTIONS] APP
Try 'uvicorn --help' for help.
```

## 🔍 问题原因

### 根本原因
Bash 脚本中使用了引号包裹 `$PORT`：
```bash
uvicorn server2:app --host 0.0.0.0 --port "$PORT"
```

当 Railway 没有设置 `PORT` 环境变量或传递失败时：
- Bash 展开 `"$PORT"` → 字面字符串 `"$PORT"`
- uvicorn 接收到 → 字符串 `'$PORT'` 而不是数字
- uvicorn 报错 → `'$PORT' is not a valid integer`

### Railway 环境变量传递问题
可能的情况：
1. Railway 没有正确注入 `PORT` 到容器
2. Docker CMD 执行时环境变量丢失
3. Bash 字符串处理问题

## ✅ 解决方案

### 方案：使用 Python 启动脚本

创建 `start.py`，用 Python 处理环境变量：

```python
#!/usr/bin/env python3
import os
import sys

def main():
    # 获取 PORT，确保是整数
    port = os.environ.get('PORT', '8000')
    
    # 验证并转换为整数
    try:
        port_int = int(port)
        if not (1 <= port_int <= 65535):
            print(f"⚠️  Invalid port {port_int}, using 8000")
            port_int = 8000
    except ValueError:
        print(f"⚠️  PORT '{port}' is not a valid number, using 8000")
        port_int = 8000
    
    # 启动信息
    print(f"🚀 Starting VoiceSpark on port {port_int}")
    print(f"📝 Environment: {os.environ.get('DEPLOY_ENVIRONMENT', 'unknown')}")
    
    # 启动 uvicorn
    cmd = [
        "uvicorn",
        "server2:app",
        "--host", "0.0.0.0",
        "--port", str(port_int),  # 确保是字符串类型的数字
        "--log-level", "info",
        "--access-log",
    ]
    
    # 使用 os.execvp 替换当前进程
    os.execvp(cmd[0], cmd)

if __name__ == "__main__":
    main()
```

### Dockerfile 更新

```dockerfile
# 使用 Python 脚本启动
CMD ["python", "start.py"]

# 而不是 bash 脚本
# CMD ["bash", "start.sh"]
```

## 🎯 优势

### Python 脚本 vs Bash 脚本

| 特性 | Python `start.py` | Bash `start.sh` |
|------|------------------|-----------------|
| 环境变量处理 | ✅ 可靠 | ⚠️ 可能失败 |
| 类型转换 | ✅ `int(port)` | ⚠️ 字符串展开 |
| 错误处理 | ✅ try/except | ❌ 难以捕获 |
| 调试信息 | ✅ 详细 | ⚠️ 有限 |
| 跨平台 | ✅ 一致 | ⚠️ 依赖 shell |
| Railway 兼容 | ✅ 完美 | ⚠️ 环境变量问题 |

## 🔬 技术细节

### 为什么 Bash 失败？

```bash
# start.sh (旧版本)
PORT=${PORT:-8000}
uvicorn server2:app --port "$PORT"
```

**问题**：
1. 如果 Railway 的环境变量注入时机晚于脚本执行
2. Docker CMD 可能不会完全展开 shell 变量
3. 引号处理可能导致字面字符串传递

### 为什么 Python 成功？

```python
# start.py (新版本)
port = os.environ.get('PORT', '8000')
port_int = int(port)
os.execvp("uvicorn", ["uvicorn", "--port", str(port_int)])
```

**优势**：
1. ✅ Python 在运行时读取环境变量（更可靠）
2. ✅ 显式类型转换 `int()` → `str()`
3. ✅ `os.execvp` 直接传递参数列表（无字符串展开问题）
4. ✅ 完整的错误处理和默认值

### os.execvp vs subprocess

我们使用 `os.execvp` 而不是 `subprocess.run`：

```python
# 使用 os.execvp（推荐）
os.execvp("uvicorn", ["uvicorn", ...])
# → 替换当前进程，uvicorn 成为 PID 1
# → 正确处理信号（SIGTERM, SIGINT）
# → Railway 可以正确停止容器

# 使用 subprocess.run（不推荐）
subprocess.run(["uvicorn", ...])
# → Python 脚本是 PID 1，uvicorn 是子进程
# → 信号处理可能不正确
# → 容器停止可能有问题
```

## 🧪 测试验证

### 本地测试

```bash
# 测试 1: 正常 PORT
PORT=9000 python start.py
# 应该显示: 🚀 Starting VoiceSpark on port 9000

# 测试 2: 无效 PORT
PORT=abc python start.py
# 应该显示: ⚠️ PORT 'abc' is not a valid number, using 8000

# 测试 3: 未设置 PORT
python start.py
# 应该显示: 🚀 Starting VoiceSpark on port 8000

# 测试 4: 超出范围 PORT
PORT=99999 python start.py
# 应该显示: ⚠️ Invalid port 99999, using 8000
```

### Docker 测试

```bash
docker build -t voicespark-test .

# 测试不同 PORT
docker run -e PORT=7000 -p 7000:7000 voicespark-test
docker run -e PORT=abc -p 8000:8000 voicespark-test
docker run -p 8000:8000 voicespark-test
```

## 📊 Railway 部署日志

成功部署后应该看到：

```
Building...
✓ Build completed successfully

Deploying...
🚀 Starting VoiceSpark on port 7342
📝 Environment: development
🐍 Python version: 3.11.x
✅ Google Cloud credentials found in environment
🔧 Running: uvicorn server2:app --host 0.0.0.0 --port 7342 --log-level info --access-log
--------------------------------------------------
INFO:     Started server process [1]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:7342 (Press CTRL+C to quit)

✓ Deployment live
```

## ✅ 验证清单

部署成功后确认：

- [ ] 日志显示 "🚀 Starting VoiceSpark on port XXXX"
- [ ] 端口是数字而不是 "$PORT" 字符串
- [ ] 日志显示 "Uvicorn running on http://0.0.0.0:XXXX"
- [ ] 访问网站不再显示 502 错误
- [ ] 网站正常加载显示内容

## 🔄 如果还有问题

### 情况 A: 日志显示端口但仍 502

可能原因：
- Google Cloud 凭证缺失
- 应用启动失败

检查：
```
日志中查找 "✅ Google Cloud credentials found"
日志中查找任何 ERROR 或 FAILED 信息
```

### 情况 B: 日志显示端口 8000

Railway 可能没有设置 `PORT` 环境变量。

解决：
- Railway 会自动设置，无需手动配置
- 8000 是我们的默认值，也应该能工作
- 只要 uvicorn 启动了，就应该能访问

### 情况 C: 仍然显示 '$PORT' is not a valid integer

这个错误**不应该再出现**了，因为：
- ✅ Python 脚本会捕获并转换
- ✅ 有完整的错误处理
- ✅ 有默认值兜底

如果还出现，可能是：
- Dockerfile 没有正确更新（检查是否推送了新的 Dockerfile）
- Railway 使用了旧的缓存（清除构建缓存）

## 🎉 总结

| 问题 | 原因 | 解决 |
|------|------|------|
| `'$PORT' is not a valid integer` | Bash 变量展开失败 | 使用 Python 脚本 |
| 环境变量处理不可靠 | Shell 环境问题 | Python `os.environ` |
| 类型错误 | 字符串传递给数字参数 | 显式 `int()` 转换 |
| 调试困难 | Bash 输出有限 | Python 详细日志 |

---

**修复提交**: ae35564  
**修复文件**: `start.py`, `Dockerfile`  
**预计生效**: 3-5 分钟后  
**状态**: ✅ 已推送到 dev 分支
