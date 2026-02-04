# 🏗️ VoiceSpark 双环境架构图

## 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                     GitHub Repository                        │
│                hahaszd/voice-record_webapp                  │
└──────────────────────┬──────────────────────────────────────┘
                       │
         ┌─────────────┴─────────────┐
         │                           │
         ▼                           ▼
  ┌─────────────┐            ┌─────────────┐
  │ main 分支    │            │  dev 分支    │
  │ (生产代码)   │            │  (开发代码)  │
  └──────┬──────┘            └──────┬──────┘
         │                           │
         │ 手动触发                   │ 自动触发
         │ (git push)                │ (git push)
         │                           │
         ▼                           ▼
  ┌─────────────────┐        ┌─────────────────┐
  │ Railway Project │        │ Railway Project │
  │   Production    │        │   Development   │
  ├─────────────────┤        ├─────────────────┤
  │ ✅ 手动部署      │        │ ✅ 自动部署      │
  │ ✅ 稳定版本      │        │ ✅ 测试环境      │
  │ ✅ 用户使用      │        │ ✅ Bug 调试      │
  └────────┬────────┘        └────────┬────────┘
           │                          │
           ▼                          ▼
  ┌─────────────────┐        ┌─────────────────┐
  │  voicespark.app │        │ voicespark-dev  │
  │  (生产域名)      │        │ .up.railway.app │
  └─────────────────┘        └─────────────────┘
           │                          │
           │                          │
           ▼                          ▼
      👥 用户访问                 🔧 开发测试
```

---

## 分支策略

```
main (生产分支)
  │
  │  ← 功能稳定后合并
  │
  ├─ dev (开发分支)
  │    │
  │    ├─ 日常开发
  │    ├─ Bug 修复
  │    └─ 功能测试
  │
  └─ hotfix/* (紧急修复，可选)
       └─ 直接修复生产问题
```

---

## 部署流程

### 正常开发流程

```
1. 在 dev 分支开发
   ↓
2. git push → 自动部署到开发环境
   ↓
3. 在开发环境测试
   ↓
4. 测试通过
   ↓
5. 合并到 main 分支
   ↓
6. Railway 手动点击 Deploy
   ↓
7. 部署到生产环境
   ↓
8. 用户使用稳定版本
```

### 紧急修复流程

```
1. 发现生产问题
   ↓
2. 在 main 分支直接修复
   ↓
3. git push
   ↓
4. Railway 手动部署
   ↓
5. 快速修复生产问题
   ↓
6. 同步修复到 dev 分支
   (git checkout dev && git merge main)
```

---

## 环境对比

| 特性 | 生产环境 | 开发环境 |
|------|---------|---------|
| **分支** | main | dev |
| **域名** | voicespark.app | voicespark-dev.up.railway.app |
| **部署方式** | 手动触发 | 自动部署 |
| **更新频率** | 每周 1-2 次 | 随时更新 |
| **稳定性** | 极高 ✅ | 中等 🔧 |
| **用户** | 真实用户 | 开发者测试 |
| **环境标识** | 无横幅 | 红色横幅 |
| **Console** | ✅ Production | 🔧 Development |
| **日志级别** | Error/Warn | All |

---

## 代码同步关系

```
dev 分支 (开发中)
  ├─ commit 1: feat: 新功能 A
  ├─ commit 2: fix: 修复 Bug B
  └─ commit 3: style: UI 调整
       │
       │ 测试通过后
       ▼
main 分支 (生产中)
  ├─ commit 1: feat: 新功能 A
  ├─ commit 2: fix: 修复 Bug B
  └─ commit 3: style: UI 调整
       │
       │ 手动部署
       ▼
  生产环境更新
```

---

## 回滚策略

### 开发环境回滚

```
git checkout dev
git reset --hard HEAD~1
git push -f origin dev
→ Railway 自动重新部署
```

### 生产环境回滚

```
Railway Dashboard
  → voicespark-production
  → Deployments
  → 选择上一个稳定版本
  → 点击 "Redeploy"
```

---

## 监控和日志

```
Railway Dashboard
  │
  ├─ voicespark-production
  │    ├─ Metrics (CPU, 内存, 网络)
  │    ├─ Logs (实时日志)
  │    └─ Deployments (部署历史)
  │
  └─ voicespark-dev
       ├─ Metrics
       ├─ Logs
       └─ Deployments
```

---

## 费用管理

```
Railway 账号
  │
  ├─ 免费额度: $5/月
  │
  ├─ voicespark-production
  │    └─ 预估: $2-3/月
  │
  └─ voicespark-dev
       └─ 预估: $1-2/月
       └─ 提示: 不用时可暂停
```

---

## 安全和权限

```
GitHub Repository (Private)
  │
  ├─ 主要开发者: 完全权限
  │    ├─ main 分支: 可推送
  │    └─ dev 分支: 可推送
  │
  └─ 其他贡献者 (如有): 受限权限
       ├─ main 分支: 仅 PR
       └─ dev 分支: 可推送

Railway 项目
  │
  ├─ 所有者: 完全控制
  │    ├─ 生产环境: 手动部署
  │    └─ 开发环境: 查看/部署
  │
  └─ 协作者 (如有): 受限权限
       └─ 仅查看日志和指标
```

---

## 最佳实践总结

### ✅ Do

- 在 dev 分支开发和测试
- 在开发环境充分测试后再合并
- 使用 DEPLOY_CHECKLIST.md 检查
- 生产环境手动部署
- 保留最近 10 个生产部署
- 定期同步 dev 和 main

### ❌ Don't

- 不要直接在 main 分支开发（除非紧急修复）
- 不要在生产环境测试新功能
- 不要在未测试时合并到 main
- 不要启用生产环境自动部署
- 不要忽略部署前检查清单

---

**文档版本**: 1.0  
**最后更新**: 2026-02-04
