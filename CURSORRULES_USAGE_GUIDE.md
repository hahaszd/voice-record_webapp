# 📖 如何在所有Cursor项目中使用通用规则

## 🎯 概述

`.cursorrules.universal` 是一个通用的Cursor AI协作规则文件，可以在任何项目中使用。

---

## 🚀 快速使用

### 方法1: 复制到每个新项目（推荐）

**步骤**:
1. 创建新项目时，复制 `.cursorrules.universal` 到项目根目录
2. 重命名为 `.cursorrules`
3. 根据项目需求调整（如有必要）

**优点**:
- ✅ 每个项目独立配置
- ✅ 可以根据项目定制
- ✅ Git可以追踪变化

**使用场景**: 
- 每个项目可能有不同的部署流程
- 需要项目特定的规则

---

### 方法2: 创建全局Cursor配置（实验性）

**注意**: Cursor目前不支持全局`.cursorrules`，但你可以通过以下方式模拟：

#### 选项A: 符号链接（Mac/Linux）

```bash
# 1. 将通用规则保存到一个固定位置
mkdir -p ~/.cursor/templates
cp .cursorrules.universal ~/.cursor/templates/cursorrules.universal

# 2. 在每个项目中创建符号链接
cd ~/your-project
ln -s ~/.cursor/templates/cursorrules.universal .cursorrules
```

#### 选项B: Git模板

```bash
# 1. 创建Git模板目录
mkdir -p ~/.git-templates/cursor

# 2. 复制通用规则
cp .cursorrules.universal ~/.git-templates/cursor/.cursorrules

# 3. 配置Git使用模板
git config --global init.templatedir '~/.git-templates'

# 4. 新项目会自动包含.cursorrules
git init new-project
```

#### 选项C: 脚本自动化（Windows）

创建 `setup-cursorrules.ps1`:

```powershell
# 将通用规则复制到当前项目
$sourcePath = "$env:USERPROFILE\.cursor\cursorrules.universal"
$targetPath = ".\.cursorrules"

if (Test-Path $sourcePath) {
    Copy-Item $sourcePath $targetPath
    Write-Host "✅ .cursorrules 已复制到当前项目"
} else {
    Write-Host "❌ 找不到通用规则文件"
}
```

使用：
```powershell
# 在新项目根目录执行
.\setup-cursorrules.ps1
```

---

## 📦 方法3: 创建项目模板

### 创建模板仓库

**步骤**:
1. 创建一个 `cursor-project-template` 仓库
2. 包含 `.cursorrules.universal`
3. 包含其他常用配置文件

**结构**:
```
cursor-project-template/
├── .cursorrules.universal
├── .gitignore
├── .editorconfig
├── README_TEMPLATE.md
└── scripts/
    └── setup.sh
```

**使用**:
```bash
# 创建新项目时
git clone https://github.com/your-username/cursor-project-template.git my-new-project
cd my-new-project
cp .cursorrules.universal .cursorrules
rm -rf .git
git init
```

---

## 🔧 自定义和扩展

### 基础：通用规则

`.cursorrules.universal` 包含：
- ✅ 部署安全原则（通用）
- ✅ 问题解决方法论（通用）
- ✅ 确认机制（通用）

### 扩展：项目特定规则

在 `.cursorrules` 中添加项目特定内容：

```
# ===================================
# 从 .cursorrules.universal 继承通用规则
# ===================================

# ===================================
# 项目特定规则
# ===================================

## 项目信息
- 项目名称: MyProject
- 部署平台: AWS/Vercel/Railway
- 测试环境: dev-myproject.example.com
- 生产环境: myproject.example.com

## 分支策略
- 测试分支: dev
- 生产分支: main

## 代码规范
- 使用 TypeScript
- ESLint 配置: ...
- 测试框架: Jest

## 特殊注意事项
- 数据库迁移需要先在测试环境验证
- API密钥存储在环境变量中
- ...
```

---

## 📋 使用检查清单

### 新项目设置

- [ ] 复制 `.cursorrules.universal` 到项目
- [ ] 重命名为 `.cursorrules`
- [ ] 添加项目特定信息
- [ ] 提交到Git

### 现有项目升级

- [ ] 备份现有 `.cursorrules`（如果有）
- [ ] 复制通用规则
- [ ] 合并现有项目特定规则
- [ ] 测试AI是否按规则工作

### 验证规则是否生效

**测试部署原则**:
```
你: "部署一下"
AI: 应该只推送到测试环境，并询问是否需要生产环境 ✅
```

**测试方案原则**:
```
你: "这个按钮不好看，把颜色改成红色"
AI: 应该提供多个方案（红色、其他颜色、其他改进方式）✅
```

**测试确认原则**:
```
你: "把这个改一下"
AI: 应该询问具体改什么 ✅
```

---

## 🎨 推荐的项目结构

```
your-project/
├── .cursorrules              # 项目特定规则（包含通用+特定）
├── .cursorrules.universal    # 通用规则（可选，作为参考）
├── .gitignore
├── README.md
└── ...
```

---

## 💡 最佳实践

### 1. 版本控制

将 `.cursorrules` 提交到Git:
```bash
git add .cursorrules
git commit -m "Add Cursor AI collaboration rules"
```

**好处**:
- 团队成员共享相同规则
- 规则变更有历史记录
- 可以Code Review规则

### 2. 定期更新

**建议频率**: 每月或有新经验时

**更新方式**:
1. 检查 `.cursorrules.universal` 是否有更新
2. 合并新的通用原则
3. 根据项目经验调整

### 3. 团队共享

**方式1**: 放在团队文档中
```
团队Wiki → Cursor配置 → 通用规则模板
```

**方式2**: 创建共享仓库
```
github.com/your-team/cursor-templates
```

**方式3**: 公司内部npm包
```bash
npm install -g @your-company/cursor-rules
cursor-rules init  # 自动创建.cursorrules
```

---

## 📊 规则演进

### 版本历史

**v1.0.0** (2026-02-04)
- 初始版本
- 三大核心原则：
  - 多环境部署原则
  - 探索多种方案原则
  - 确认原则

### 未来改进方向

**可能添加的规则**:
- 代码审查原则
- 测试覆盖要求
- 性能优化指南
- 安全最佳实践
- 文档规范

---

## 🔍 常见问题

### Q1: 通用规则会不会覆盖项目特定需求？

**A**: 不会。通用规则是基础原则，项目特定规则可以在此基础上扩展或覆盖。

### Q2: 如果团队成员不用Cursor怎么办？

**A**: 规则中的原则（如确认机制、多方案思考）也可以作为团队协作规范，不限于AI。

### Q3: 规则太长会不会影响性能？

**A**: Cursor会在会话开始时加载规则，对性能影响很小。建议保持规则简洁明了。

### Q4: 如何确保AI真的遵守规则？

**A**: 
1. 规则写在 `.cursorrules` 中Cursor会自动加载
2. 测试时故意触发规则场景
3. 必要时在对话中提醒AI

---

## 🎓 示例：不同项目的配置

### Web项目

```
.cursorrules (继承universal + 添加):
- 前端框架：React/Vue
- CSS方案：Tailwind/styled-components
- 测试环境：Vercel Preview
- 生产环境：Vercel Production
```

### 后端API项目

```
.cursorrules (继承universal + 添加):
- 语言：Python/Node.js
- 数据库迁移流程
- API版本策略
- 测试环境：staging.api.example.com
```

### 移动应用项目

```
.cursorrules (继承universal + 添加):
- 平台：iOS/Android
- 测试环境：TestFlight/Internal Testing
- 生产环境：App Store/Google Play
- 特别注意：提交审核流程
```

---

## ✅ 总结

**通用规则文件**: `.cursorrules.universal`

**包含内容**:
- ✅ 多环境部署原则（适配单/多环境）
- ✅ 探索多种方案原则
- ✅ 确认机制原则

**使用方式**:
1. 复制到新项目
2. 重命名为 `.cursorrules`
3. 添加项目特定配置（可选）

**适用范围**: 所有使用Cursor的项目

---

**文档创建日期**: 2026-02-04  
**版本**: 1.0.0  
**维护者**: 根据实际使用经验持续更新
