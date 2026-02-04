# 🔍 Railway 502 错误调试指南

## ❌ 问题：部署成功但 502 错误

```
Deployment successful ✅
但访问网站显示：502 Bad Gateway ❌
```

## 🔍 502 错误的常见原因

502 错误说明：
- ✅ Docker 镜像构建成功
- ✅ 容器启动了
- ❌ 但应用没有正确监听端口或启动失败

### 可能的原因：

1. **端口绑定问题**
   - 应用没有监听 Railway 提供的 `PORT` 环境变量
   - 应用监听了 127.0.0.1 而不是 0.0.0.0

2. **应用启动失败**
   - 缺少环境变量（如 `GOOGLE_APPLICATION_CREDENTIALS_JSON`）
   - Python 依赖问题
   - 代码错误导致崩溃

3. **启动时间过长**
   - Railway 有启动超时（默认 5 分钟）
   - 应用初始化太慢

## ✅ 解决方案

### 1. 查看 Railway 日志

**这是最重要的！** 日志会告诉你具体问题。

1. 进入 Railway Dashboard
2. 点击你的项目（voicespark-dev）
3. 点击 "Logs" 标签
4. 查找错误信息

#### 常见日志错误：

**如果看到：**
```
ModuleNotFoundError: No module named 'xxx'
```
**原因**：缺少 Python 依赖  
**解决**：检查 `requirements.txt` 是否包含所有依赖

**如果看到：**
```
FileNotFoundError: [Errno 2] No such file or directory: 'oceanic-hook-xxx.json'
```
**原因**：缺少 Google Cloud 凭证  
**解决**：确认环境变量 `GOOGLE_APPLICATION_CREDENTIALS_JSON` 已设置

**如果看到：**
```
Application startup failed
```
**原因**：FastAPI 启动失败  
**解决**：检查 `server2.py` 的初始化代码

**如果看到：**
```
Address already in use
```
**原因**：端口冲突  
**解决**：确保使用 `${PORT}` 环境变量

### 2. 检查环境变量

在 Railway Dashboard：
1. Settings → Variables
2. 确认以下变量存在：
   - ✅ `GOOGLE_APPLICATION_CREDENTIALS_JSON`
   - ✅ `NODE_ENV=development` 或 `production`
   - ✅ `DEPLOY_ENVIRONMENT=development` 或 `production`

### 3. 我们的修复

我添加了一个 `start.sh` 启动脚本，它会：
- ✅ 显示启动信息
- ✅ 检查端口配置
- ✅ 验证环境变量
- ✅ 启用详细日志

新的启动流程：
```bash
🚀 Starting VoiceSpark on port 8000
📝 Environment: development
🐍 Python version: 3.11.x
✅ Google Cloud credentials found in environment
INFO:     Started server process
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000
```

### 4. Dockerfile 改进

```dockerfile
# 使用启动脚本
CMD ["bash", "start.sh"]

# 而不是直接运行 uvicorn
# CMD uvicorn server2:app --host 0.0.0.0 --port ${PORT:-8000}
```

好处：
- ✅ 更好的日志输出
- ✅ 环境检查
- ✅ 更容易调试

## 🚀 下一步行动

### 步骤 1：等待重新部署（3-5 分钟）
Railway 会自动使用新的 Dockerfile 和启动脚本重新部署

### 步骤 2：查看启动日志
1. Railway Dashboard → 你的项目
2. Logs 标签
3. 应该看到：
   ```
   🚀 Starting VoiceSpark on port XXXX
   ✅ Google Cloud credentials found in environment
   INFO: Uvicorn running on http://0.0.0.0:XXXX
   ```

### 步骤 3：如果还是 502

**检查日志中的错误**，然后根据错误类型：

#### 错误 A：缺少环境变量
```
Railway Dashboard → Settings → Variables
添加 GOOGLE_APPLICATION_CREDENTIALS_JSON
```

#### 错误 B：端口问题
```
日志显示：Uvicorn running on http://127.0.0.1:8000
                                      ^^^^^^^^^^^^ 错误！
应该是：Uvicorn running on http://0.0.0.0:8000
                                   ^^^^^^^^^ 正确
```
如果是这个，需要修改 uvicorn 启动命令

#### 错误 C：应用崩溃
查看完整的错误堆栈，可能需要修改 `server2.py`

## 📊 健康检查清单

部署成功后应该：
- [ ] Railway 日志显示 "🚀 Starting VoiceSpark"
- [ ] 日志显示 "✅ Google Cloud credentials found"
- [ ] 日志显示 "Uvicorn running on http://0.0.0.0:XXXX"
- [ ] 日志显示 "Application startup complete"
- [ ] 访问网站不再显示 502
- [ ] 网站首页正常加载

## 🔧 本地测试

如果想在本地验证修复：

```bash
# 1. 设置环境变量
export GOOGLE_APPLICATION_CREDENTIALS_JSON='你的凭证JSON'
export PORT=8000

# 2. 使用 Docker 本地测试
docker build -t voicespark-test .
docker run -p 8000:8000 \
  -e GOOGLE_APPLICATION_CREDENTIALS_JSON="$GOOGLE_APPLICATION_CREDENTIALS_JSON" \
  -e PORT=8000 \
  voicespark-test

# 3. 访问 http://localhost:8000
```

## 💡 Railway 特定提示

### Railway 如何处理端口

Railway 会：
1. 自动分配一个随机端口（通常是 `$PORT` 环境变量）
2. 设置反向代理从你的域名转发到这个端口
3. 期望你的应用监听 `0.0.0.0:$PORT`

### 常见错误

❌ **监听 localhost**
```python
# 错误
uvicorn.run(app, host="127.0.0.1", port=8000)
```

✅ **监听所有接口**
```python
# 正确
uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", 8000)))
```

## 📞 需要帮助？

如果看到日志后还是不清楚：
1. 复制完整的错误日志
2. 告诉我具体错误信息
3. 我会帮你定位问题

## 🎯 预期结果

修复后，Railway 日志应该显示：
```
Building...
✓ Build completed
Deploying...
✓ Deployment live

🚀 Starting VoiceSpark on port 7342
📝 Environment: development
🐍 Python version: Python 3.11.x
✅ Google Cloud credentials found in environment
INFO:     Started server process [1]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:7342 (Press CTRL+C to quit)
```

然后访问网站就能看到：
```
🔧 DEVELOPMENT ENVIRONMENT  (红色横幅)
VoiceSpark - Voice Your Spark
```

---

**修复提交时间**: 2026-02-04  
**预计生效**: 3-5 分钟后
