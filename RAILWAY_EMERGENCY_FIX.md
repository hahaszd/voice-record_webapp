# 🚨 Railway 部署紧急修复指南

## 🔴 当前问题

Railway 一直报错：
```
Error: Invalid value for '--port': '$PORT' is not a valid integer.
```

**根本原因**：Railway 可能在缓存旧的构建配置或 nixpacks 设置。

## ✅ 已完成的修复

1. ✅ 删除了 `nixpacks.toml`
2. ✅ 在 `server2.py` 添加了 `__main__` 块
3. ✅ Dockerfile 使用 `CMD ["python", "server2.py"]`
4. ✅ 添加了 `railway.json` 强制使用 Dockerfile
5. ✅ 添加了 `.railwayignore` 忽略 nixpacks

## 🔧 需要手动操作的步骤

### 方案 A：在 Railway Dashboard 清除缓存（推荐）

1. 进入 Railway Dashboard
2. 选择你的开发环境项目
3. 点击 **Settings**
4. 找到 **Service Settings** 或 **Deployments**
5. 点击 **"Clear Build Cache"** 或 **"Reset Service"**
6. 回到 Deployments，点击 **"Redeploy"**

### 方案 B：手动配置启动命令

1. Railway Dashboard → 你的项目
2. Settings → Deploy
3. 找到 **"Start Command"** 或 **"Custom Start Command"**
4. 输入：
   ```
   python server2.py
   ```
5. 保存并重新部署

### 方案 C：检查 Service Source

1. Railway Dashboard → Settings
2. 找到 **"Source"** 或 **"Build Settings"**
3. 确认：
   - Builder: **Dockerfile** 或 **Auto**
   - Branch: **dev**
   - Root Directory: `/` (根目录)

### 方案 D：删除服务重新创建（最后手段）

如果以上都不行：

1. 记录当前的环境变量（Settings → Variables）
2. 删除当前的服务
3. 创建新服务：
   - New Service → Deploy from GitHub
   - 选择 `dev` 分支
   - Railway 会自动检测 Dockerfile
4. 添加环境变量：
   ```
   GOOGLE_APPLICATION_CREDENTIALS_JSON=[你的凭证]
   NODE_ENV=development
   DEPLOY_ENVIRONMENT=development
   ```
5. 部署

## 🔍 调试检查清单

### 检查 Railway 是否使用了 Dockerfile

查看部署日志，应该看到：
```
✓ Building with Dockerfile
Step 1/8 : FROM python:3.11-slim
...
```

如果看到：
```
✓ Using nixpacks
```
说明 Railway 还在使用 nixpacks（错误！）

### 检查启动命令

日志中查找：
- ✅ 正确：`🚀 Starting VoiceSpark on 0.0.0.0:XXXX`
- ❌ 错误：`Error: Invalid value for '--port': '$PORT'`

## 📝 当前代码配置

### server2.py (末尾)
```python
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    print(f"🚀 Starting VoiceSpark on 0.0.0.0:{port}")
    uvicorn.run(
        "server2:app",
        host="0.0.0.0",
        port=port,
        log_level="info",
        access_log=True
    )
```

### Dockerfile (最后一行)
```dockerfile
CMD ["python", "server2.py"]
```

### railway.json
```json
{
  "build": {
    "builder": "DOCKERFILE"
  },
  "deploy": {
    "startCommand": "python server2.py"
  }
}
```

## 🎯 预期正确的日志

```
Building...
✓ Building with Dockerfile
Step 1/8 : FROM python:3.11-slim
Step 2/8 : WORKDIR /app
...
✓ Build completed

Deploying...
Starting Container
🚀 Starting VoiceSpark on 0.0.0.0:7342
📝 Environment: development
INFO:     Started server process [1]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:7342

✓ Deployment live
```

## 💡 为什么一直失败？

可能的原因：
1. **Railway 缓存了旧的 nixpacks 配置**
2. **自动检测选择了错误的构建器**
3. **环境变量没有正确传递到容器**

## 🔄 临时解决方案

如果真的急需上线，可以：

### 选项 1：在 Railway 设置固定端口

虽然不推荐，但可以：
1. Settings → Variables
2. 添加 `PORT=8000`
3. 重新部署

### 选项 2：使用其他平台

如果 Railway 问题持续：
- Render.com
- Fly.io  
- Vercel (需要调整为 serverless)
- Heroku

## 📞 联系 Railway 支持

如果所有方法都失败，可能是 Railway 的 bug：

1. Railway Discord: https://discord.gg/railway
2. Railway Support: support@railway.app
3. 提供：
   - 项目 ID
   - 部署日志
   - 说明 nixpacks 配置问题

## ⚡ 快速测试本地是否正常

```bash
# 测试 Docker 构建
docker build -t voicespark-test .
docker run -e PORT=8000 -p 8000:8000 voicespark-test

# 访问 http://localhost:8000
# 应该能看到 VoiceSpark 界面
```

如果本地正常，说明代码没问题，是 Railway 配置问题。

---

**最后更新**: 2026-02-04  
**状态**: 等待 Railway 部署或手动清除缓存
