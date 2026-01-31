# 🚀 Railway 部署完整指南

## 📋 准备工作检查清单

### ✅ 已完成
- [x] Python 项目代码
- [x] `requirements.txt` 依赖文件
- [x] `.gitignore` 文件（已更新，排除敏感文件）
- [x] `Procfile` 启动命令
- [x] `runtime.txt` Python 版本
- [x] `railway.toml` Railway 配置

### ⚠️ 需要准备
- [ ] GitHub 账号
- [ ] Railway 账号
- [ ] Google Cloud 凭证（JSON 文件）
- [ ] AI Builder API Key（如果使用）

---

## 📁 新增的配置文件

### 1. `Procfile`
```
web: uvicorn server2:app --host 0.0.0.0 --port $PORT
```
**作用**: 告诉 Railway 如何启动你的应用

### 2. `runtime.txt`
```
python-3.11.0
```
**作用**: 指定 Python 版本

### 3. `railway.toml`
```toml
[build]
builder = "NIXPACKS"

[deploy]
startCommand = "uvicorn server2:app --host 0.0.0.0 --port $PORT"
healthcheckPath = "/"
healthcheckTimeout = 100
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10
```
**作用**: Railway 特定配置

### 4. 更新的 `.gitignore`
新增了以下内容，防止敏感文件被提交：
```
# Google Cloud credentials (IMPORTANT!)
oceanic-hook-*.json
*-credentials.json
service-account*.json

# AI Builder config with API keys
aibuilder_config.json
```

---

## 🚀 部署步骤

### 步骤1: 推送代码到 GitHub

#### 1.1 提交当前更改
```bash
# 查看状态
git status

# 添加所有文件
git add .

# 提交
git commit -m "chore: 添加 Railway 部署配置文件

- 新增 Procfile 启动命令
- 新增 runtime.txt 指定 Python 版本
- 新增 railway.toml 配置
- 更新 .gitignore 排除敏感文件
"
```

#### 1.2 创建 GitHub 仓库（如果还没有）

**选项A: 使用 GitHub 网页**
1. 访问 https://github.com/new
2. 仓库名: `voice-record-web`（或你喜欢的名字）
3. 选择 **Private**（推荐，因为包含 API 密钥）
4. **不要** 勾选 "Initialize with README"
5. 点击 "Create repository"

**选项B: 使用 GitHub CLI（如果已安装 gh）**
```bash
gh repo create voice-record-web --private --source=. --remote=origin --push
```

#### 1.3 推送代码到 GitHub

如果手动创建了仓库，执行：
```bash
# 添加远程仓库（替换 YOUR_USERNAME）
git remote add origin https://github.com/YOUR_USERNAME/voice-record-web.git

# 推送代码
git branch -M main
git push -u origin main
```

---

### 步骤2: 注册并登录 Railway

1. 访问 https://railway.app/
2. 点击 **"Login"** 或 **"Start a New Project"**
3. 使用 **GitHub 账号** 登录（推荐，方便部署）
4. 授权 Railway 访问你的 GitHub 仓库

---

### 步骤3: 创建新项目

#### 3.1 创建项目
1. 点击 **"New Project"**
2. 选择 **"Deploy from GitHub repo"**
3. 选择 **"Configure GitHub App"**（如果首次使用）
4. 授权 Railway 访问你的仓库
5. 选择 `voice-record-web` 仓库
6. 点击 **"Deploy Now"**

#### 3.2 等待初次部署
- Railway 会自动检测到 Python 项目
- 自动安装 `requirements.txt` 中的依赖
- 自动运行 `Procfile` 中的启动命令
- **首次部署会失败**（因为缺少环境变量），这是正常的

---

### 步骤4: 配置环境变量 ⚠️ **关键步骤**

#### 4.1 添加 Google Cloud 凭证

你的应用需要 Google Cloud Speech-to-Text API 凭证。有两种方式：

**方法1: 使用环境变量（推荐）** ✅

1. 在 Railway 项目页面，点击 **"Variables"** 标签
2. 点击 **"New Variable"**
3. 添加以下变量：

```
变量名: GOOGLE_APPLICATION_CREDENTIALS_JSON
变量值: [整个 oceanic-hook-453405-u5-9e4b90fc923f.json 文件的内容]
```

**如何获取 JSON 内容？**
- 打开 `oceanic-hook-453405-u5-9e4b90fc923f.json`
- 复制**整个文件**的内容（包括 `{` 和 `}`）
- 粘贴到 Railway 的变量值框中

4. 修改 `server2.py` 代码以支持环境变量：

**我需要修改 `server2.py` 吗？**
- 如果你的凭证文件名是硬编码的（`CREDENTIALS_FILE = "oceanic-hook-453405-u5-9e4b90fc923f.json"`），
- 我需要修改代码让它从环境变量读取

**我来帮你修改吗？** ✅ 推荐

---

**方法2: 上传凭证文件（不太推荐）**

1. 在 Railway 项目设置中，使用 **Volumes**（持久化存储）
2. 手动上传凭证文件
3. 更复杂，不推荐

---

#### 4.2 添加 AI Builder API Key（如果使用）

如果你使用了 AI Builder 的转录 API：

```
变量名: AI_BUILDER_API_KEY
变量值: [你的 AI Builder API Key]
```

或者，如果你有 `aibuilder_config.json`：

```
变量名: AI_BUILDER_CONFIG_JSON
变量值: [整个 aibuilder_config.json 文件的内容]
```

---

#### 4.3 添加其他环境变量（可选）

```
变量名: PORT
变量值: (不需要设置，Railway 自动提供)

变量名: PYTHON_VERSION
变量值: 3.11.0
```

---

### 步骤5: 修改代码以支持环境变量（必须）

**我需要修改 `server2.py`，让它能从环境变量读取凭证**

#### 选项A: 我帮你修改（推荐）
让我现在就修改代码，添加环境变量支持

#### 选项B: 你自己修改
在 `server2.py` 开头添加：
```python
import json
import os

# 优先从环境变量读取凭证
if os.getenv('GOOGLE_APPLICATION_CREDENTIALS_JSON'):
    # 从环境变量创建临时凭证文件
    credentials_json = json.loads(os.getenv('GOOGLE_APPLICATION_CREDENTIALS_JSON'))
    CREDENTIALS_FILE = '/tmp/gcp-credentials.json'
    with open(CREDENTIALS_FILE, 'w') as f:
        json.dump(credentials_json, f)
else:
    # 本地开发时使用文件
    CREDENTIALS_FILE = "oceanic-hook-453405-u5-9e4b90fc923f.json"
```

**👉 让我帮你修改吗？** 输入 "yes" 我立即修改

---

### 步骤6: 重新部署

1. 环境变量配置好后，点击 **"Deploy"** 按钮重新部署
2. 或者，推送新代码到 GitHub 会自动触发部署
3. 观察部署日志，确保没有错误

---

### 步骤7: 获取公网地址

1. 部署成功后，点击 **"Settings"** → **"Domains"**
2. Railway 会自动生成一个域名，类似：
   ```
   https://voice-record-web-production-xxxx.up.railway.app
   ```
3. 点击域名访问你的应用！🎉

---

## 🧪 测试部署

### 测试清单

```
✅ 访问网站：https://your-app.railway.app
✅ 测试录音功能
✅ 测试转录功能
✅ 测试自动录音
✅ 测试通知功能
✅ 检查浏览器控制台是否有错误
```

### 常见问题排查

#### 问题1: 部署失败
```
错误: ModuleNotFoundError: No module named 'xxx'
解决: 检查 requirements.txt 是否包含所有依赖
```

#### 问题2: 转录失败
```
错误: 无法获取访问令牌
解决: 检查 GOOGLE_APPLICATION_CREDENTIALS_JSON 环境变量是否正确设置
```

#### 问题3: 应用无法访问
```
错误: Application failed to respond
解决: 检查 Railway 日志，查看启动命令是否正确
```

---

## 💰 费用说明

### 免费额度
- **$5 免费额度/月**
- 约等于：
  - 500 小时运行时间，或
  - 小流量网站（<100 访问/天）

### 如何查看用量
1. Railway Dashboard → **"Usage"**
2. 实时监控：CPU、内存、网络流量

### 超出免费额度后
- 自动暂停服务（不会自动扣费）
- 升级到付费计划：$5/月起

---

## 🔒 安全检查清单

### ✅ 必做
- [x] `.gitignore` 排除了 `*.json` 凭证文件
- [x] 使用环境变量存储敏感信息
- [x] GitHub 仓库设为 **Private**

### ⚠️ 警告
- **不要** 将 `oceanic-hook-*.json` 提交到 GitHub
- **不要** 在公开仓库中暴露 API Key
- **不要** 在代码中硬编码密钥

---

## 📊 监控和日志

### 查看实时日志
1. Railway Dashboard → **"Deployments"**
2. 点击最新的部署
3. 查看 **"View Logs"**

### 常用日志命令
```bash
# Railway CLI（如果安装）
railway logs
railway logs --follow
```

---

## 🔄 更新部署

### 自动部署（推荐）
```bash
# 修改代码后
git add .
git commit -m "更新功能"
git push

# Railway 会自动检测并重新部署
```

### 手动部署
1. Railway Dashboard → **"Deployments"**
2. 点击 **"Deploy"**

---

## 🎯 下一步

### 现在你需要：
1. **让我修改 `server2.py`** 添加环境变量支持 ✅ 推荐
2. **提交代码到 GitHub**
3. **在 Railway 部署**

### 未来可以：
1. **购买自定义域名**（$10-20/年）
2. **配置 CDN**（加速访问）
3. **添加监控报警**
4. **配置自动备份**

---

## 📞 需要帮助？

### 我现在可以帮你：
- ✅ 修改 `server2.py` 支持环境变量
- ✅ 检查配置文件是否正确
- ✅ 提供详细的故障排查指导
- ✅ 优化部署配置

### 告诉我：
1. 你想让我修改代码吗？（添加环境变量支持）
2. 你有 GitHub 账号吗？
3. 你准备好开始部署了吗？

---

**🚀 准备好了吗？让我们开始吧！**
