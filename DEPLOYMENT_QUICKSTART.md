# 🚀 双环境部署 - 快速开始

## ✅ 第一步：完成（已完成）

- ✅ 创建 `dev` 分支
- ✅ 推送到 GitHub
- ✅ 添加环境标识（开发环境会显示红色横幅）
- ✅ 创建部署文档

---

## 📋 第二步：在 Railway 配置（需要你手动操作）

### **配置生产环境（重命名现有项目）**

1. 访问 https://railway.app/
2. 进入你当前的项目
3. 点击 Settings → General
4. Project Name 改为：`voicespark-production`
5. 点击 Settings → Deployments
6. **取消勾选** "Auto Deploy"（手动部署更安全）
7. 点击 Settings → Variables
8. 添加变量：
   ```
   NODE_ENV=production
   DEPLOY_ENVIRONMENT=production
   ```

### **创建开发环境（新项目）**

1. 回到 Railway Dashboard
2. 点击 **"New Project"**
3. 选择 **"Deploy from GitHub repo"**
4. 选择仓库：`hahaszd/voice-record_webapp`
5. ⚠️ **重要**：点击 "Configure"
6. Source → Branch: 选择 **`dev`**（不是 main！）
7. 点击 "Deploy"
8. 部署完成后，Settings → General
9. Project Name 改为：`voicespark-dev`
10. Settings → Variables，添加所有环境变量：
    ```
    NODE_ENV=development
    DEPLOY_ENVIRONMENT=development
    GOOGLE_APPLICATION_CREDENTIALS_JSON=[复制生产环境的值]
    ```
11. Settings → Deployments
12. ✅ **勾选** "Auto Deploy"
13. Source Branch 确认是：`dev`

---

## 🎯 第三步：测试部署

### **测试开发环境**

1. Settings → Domains
2. 找到自动生成的域名，例如：
   ```
   voicespark-dev-production-xxxx.up.railway.app
   ```
3. 访问这个域名
4. ✅ 应该看到页面顶部有红色横幅：**🔧 DEVELOPMENT ENVIRONMENT**
5. ✅ 打开 Console，应该看到：`🔧 Development Environment`

### **确认生产环境**

1. 访问你的生产环境域名（voicespark.app）
2. ✅ 不应该有红色横幅
3. ✅ Console 显示：`✅ Production Environment`

---

## 📝 日常使用

### **开发新功能**

```bash
# 1. 切换到 dev 分支
git checkout dev

# 2. 修改代码
# ...

# 3. 提交并推送（自动部署到开发环境）
git add .
git commit -m "feat: 新功能"
git push
```

### **部署到生产**

```bash
# 1. 确保在 main 分支
git checkout main

# 2. 合并 dev 分支
git merge dev

# 3. 推送
git push

# 4. 手动触发部署
# Railway Dashboard → voicespark-production → Deploy 按钮
```

---

## 📊 当前状态

### 分支状态
```
main (生产环境) - 当前最新稳定版
  └─ commit: 55d761e

dev (开发环境) - 包含部署配置
  └─ commit: c27ed3c
  └─ 新增文件：
      - DEPLOYMENT_GUIDE.md (完整部署指南)
      - DEPLOY_CHECKLIST.md (部署检查清单)
      - 环境标识代码（index.html）
```

### 需要在 Railway 完成的操作
- [ ] 重命名现有项目为 `voicespark-production`
- [ ] 关闭生产环境自动部署
- [ ] 创建新项目 `voicespark-dev`
- [ ] 配置 dev 项目监听 `dev` 分支
- [ ] 启用 dev 项目自动部署
- [ ] 配置两个项目的环境变量

---

## 🔗 相关文档

- **完整指南**: `DEPLOYMENT_GUIDE.md`
- **检查清单**: `DEPLOY_CHECKLIST.md`
- **Railway 配置**: `RAILWAY_DEPLOYMENT_GUIDE.md`

---

## 💡 提示

- 开发环境会显示红色横幅，很容易区分
- 生产环境手动部署，避免意外更新
- 开发环境自动部署，方便快速测试
- 部署前使用 `DEPLOY_CHECKLIST.md` 确保质量

---

**准备好了吗？** 现在去 Railway 完成第二步配置吧！🚀
