# 🚀 Railway 快速部署（5分钟上线）

## ✅ 准备好的文件

所有配置文件已创建完成：
- ✅ `Procfile` - 启动命令
- ✅ `runtime.txt` - Python 版本
- ✅ `railway.toml` - Railway 配置
- ✅ `.gitignore` - 排除敏感文件
- ✅ `server2.py` - 已添加环境变量支持

---

## 🎯 5 步上线

### 步骤 1: 提交到 Git (2分钟)

```bash
git add .
git commit -m "feat: 添加 Railway 部署配置

- 新增 Procfile, runtime.txt, railway.toml
- server2.py 支持环境变量
- 更新 .gitignore
"
```

---

### 步骤 2: 推送到 GitHub (1分钟)

**如果还没有远程仓库：**
```bash
# 访问 https://github.com/new 创建新仓库（Private）
# 然后执行：

git remote add origin https://github.com/YOUR_USERNAME/voice-record-web.git
git branch -M main
git push -u origin main
```

**如果已有远程仓库：**
```bash
git push
```

---

### 步骤 3: 部署到 Railway (1分钟)

1. 访问 https://railway.app/
2. 用 GitHub 账号登录
3. 点击 **"New Project"**
4. 选择 **"Deploy from GitHub repo"**
5. 选择你的 `voice-record-web` 仓库
6. 点击 **"Deploy Now"**

Railway 会自动开始部署（首次会失败，缺环境变量是正常的）

---

### 步骤 4: 配置环境变量 (1分钟) ⚠️ 关键

在 Railway 项目页面：

1. 点击 **"Variables"** 标签
2. 点击 **"New Variable"**
3. 添加 Google Cloud 凭证：

```
变量名: GOOGLE_APPLICATION_CREDENTIALS_JSON
变量值: [粘贴整个 oceanic-hook-453405-u5-9e4b90fc923f.json 的内容]
```

**如何获取内容？**
- 打开 `oceanic-hook-453405-u5-9e4b90fc923f.json`
- 全选 (Ctrl+A)，复制 (Ctrl+C)
- 粘贴到 Railway 变量值框

4. （可选）如果使用 AI Builder：
```
变量名: AI_BUILDER_TOKEN
变量值: [你的 AI Builder API Token]
```

5. 点击 **"Add"** 保存

---

### 步骤 5: 获取网址并测试 (1分钟)

1. 环境变量保存后，Railway 会自动重新部署
2. 等待部署完成（约30秒-1分钟）
3. 点击 **"Settings"** → **"Domains"**
4. 复制自动生成的网址：
   ```
   https://voice-record-web-production-xxxx.up.railway.app
   ```
5. 在浏览器打开测试！🎉

---

## ✅ 测试清单

```
□ 网站能打开
□ 录音功能正常
□ 转录功能正常
□ 自动录音正常
□ 通知功能正常
```

---

## ❌ 常见错误

### 错误1: 应用无法启动
```
错误提示: "Application failed to respond"
原因: 缺少环境变量
解决: 检查步骤4，确保添加了 GOOGLE_APPLICATION_CREDENTIALS_JSON
```

### 错误2: 转录失败
```
错误提示: "无法获取访问令牌"
原因: 凭证 JSON 格式错误
解决: 确保复制了**完整的** JSON 内容（包括开头的 { 和结尾的 }）
```

### 错误3: 模块找不到
```
错误提示: "ModuleNotFoundError"
原因: requirements.txt 缺少依赖
解决: 更新 requirements.txt，重新推送代码
```

---

## 💰 费用

- **免费层**: $5 额度/月（约500小时运行）
- **小流量网站**: 完全够用
- **超出免费额度**: 自动暂停（不会扣费）
- **付费计划**: $5/月起（无限制）

---

## 🔍 查看日志

**实时日志：**
1. Railway Dashboard → **"Deployments"**
2. 点击最新部署
3. 查看 **"View Logs"**

**常用日志命令（如果安装了 Railway CLI）：**
```bash
railway logs
railway logs --follow
```

---

## 🔄 更新应用

每次修改代码后：
```bash
git add .
git commit -m "更新功能"
git push
```

Railway 会自动检测并重新部署！✨

---

## 📞 需要帮助？

### 部署前
- 检查 `.gitignore` 是否排除了敏感文件
- 确保 `oceanic-hook-*.json` 文件存在（本地）

### 部署中
- 查看 Railway 部署日志
- 检查环境变量是否正确设置

### 部署后
- 测试所有功能
- 检查浏览器控制台是否有错误

---

## 🎉 完成！

现在你的应用已经在公网上了！

**分享链接：**
```
https://your-app.railway.app
```

**下一步：**
- 收集用户反馈
- 监控使用情况
- （可选）购买自定义域名

---

**准备好开始了吗？从步骤1开始！** 🚀
