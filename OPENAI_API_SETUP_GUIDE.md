# OpenAI API Key 创建和配置指南

**日期：** 2026-02-08  
**目的：** 为 VoiceSpark 添加 OpenAI Whisper API 作为 backup  
**优先级：** ⭐⭐⭐⭐⭐ 关键

---

## 📋 为什么选择 OpenAI Whisper API

### 优势
- ✅ **价格便宜：** $0.006/分钟（比 Google 便宜 63%）
- ✅ **质量高：** 与 AI Builder Space 相同的模型（Whisper）
- ✅ **稳定性：** OpenAI 官方 API，可靠性高
- ✅ **一致性：** 保持与主 API 相同的转录质量

### 成本对比
| API | 价格/分钟 | 1小时成本 | 100小时成本 |
|-----|----------|----------|------------|
| AI Builder Space | **免费** ($100额度) | $0 | $0 |
| OpenAI Whisper | $0.006 | $0.36 | $36 |
| Google Cloud STT | $0.016 | $0.96 | $96 |

---

## 🚀 Step 1: 创建 OpenAI 账户

### 1.1 访问 OpenAI 官网
**链接：** https://platform.openai.com/signup

### 1.2 注册账户
- **选项 1：** 使用 Google 账户注册（推荐，快速）
- **选项 2：** 使用邮箱注册

**需要的信息：**
- 邮箱地址
- 手机号码（用于验证）

### 1.3 验证邮箱和手机
- 检查邮箱收件箱，点击验证链接
- 输入手机号码，接收验证码
- 输入验证码完成验证

---

## 💳 Step 2: 设置付费方式（重要！）

⚠️ **注意：** OpenAI 已取消免费额度，需要先充值才能使用 API

### 2.1 访问 Billing 页面
**链接：** https://platform.openai.com/account/billing/overview

### 2.2 添加付费方式
点击 **"Add payment details"** 或 **"Set up paid account"**

**支持的付费方式：**
- 💳 信用卡（Visa, MasterCard, American Express）
- 💳 借记卡
- ⚠️ **不支持：** PayPal, 支付宝, 微信支付

### 2.3 充值金额建议
**推荐充值：** $10 - $20

**预估使用量：**
- $10 = 1,666 分钟 ≈ 27.7 小时录音
- $20 = 3,333 分钟 ≈ 55.5 小时录音

**Product Hunt Launch 预估：**
- 假设 100 个用户测试
- 每人平均录音 5 分钟
- 总计：500 分钟 × $0.006 = **$3**

**建议：** 充值 $10 足够应对 Launch

---

## 🔑 Step 3: 创建 API Key

### 3.1 访问 API Keys 页面
**链接：** https://platform.openai.com/api-keys

### 3.2 创建新 API Key
1. 点击 **"+ Create new secret key"**
2. **Name（可选）：** `VoiceSpark Production`
3. **Permissions（权限）：** 
   - 选择 **"Restricted"**（推荐，安全）
   - 或 **"All"**（简单，但权限更大）

### 3.3 如果选择 Restricted（推荐）
**只勾选以下权限：**
- ✅ **Model capabilities** → **Audio**（语音转录）
- ❌ 其他权限都不需要

### 3.4 复制 API Key
⚠️ **重要：** API Key 只会显示一次！

```
格式示例：
sk-proj-abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdefghijklmnopqr
```

**立即保存到安全位置：**
- 记事本
- 密码管理器（推荐：1Password, LastPass）
- 不要分享给任何人！

---

## 🔒 Step 4: 配置 API Key 到项目

### 4.1 Railway 环境变量配置（Production）

#### 访问 Railway Dashboard
**链接：** https://railway.app/project/[your-project-id]

#### 添加环境变量
1. 点击你的项目
2. 点击 **"Variables"** 标签
3. 点击 **"+ New Variable"**
4. 添加以下变量：

```
Variable Name: OPENAI_API_KEY
Variable Value: sk-proj-abcdefg... （你的完整 API Key）
```

5. 点击 **"Add"**
6. Railway 会自动重新部署

⏱️ **等待时间：** 1-2 分钟自动部署完成

---

### 4.2 本地开发环境配置（Dev）

#### 创建 `.env` 文件（如果不存在）
```bash
# 在项目根目录创建或编辑 .env 文件
```

#### 添加以下内容：
```env
# OpenAI API Configuration
OPENAI_API_KEY=sk-proj-abcdefg...（你的完整 API Key）

# 现有的其他配置
AI_BUILDER_TOKEN=your_ai_builder_token
```

⚠️ **重要：** `.env` 文件已在 `.gitignore` 中，不会被提交到 Git

---

## ✅ Step 5: 验证配置

### 5.1 检查环境变量
**在本地：**
```python
import os
print(os.environ.get("OPENAI_API_KEY"))
# 应该输出: sk-proj-...
```

**在 Railway：**
- 访问 Railway Dashboard
- Variables 标签
- 确认 `OPENAI_API_KEY` 存在

### 5.2 测试 API 调用（可选）
**使用 curl 测试：**
```bash
curl https://api.openai.com/v1/audio/transcriptions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: multipart/form-data" \
  -F model="whisper-1" \
  -F file="@/path/to/audio.mp3"
```

**成功响应示例：**
```json
{
  "text": "Hello, this is a test."
}
```

---

## 🔧 Step 6: 代码集成（我来实现）

等你完成 Step 1-5 后，我会：

### 6.1 创建 `api_fallback.py` 模块
```python
# 核心 fallback 逻辑
- AI Builder Space (主)
- OpenAI Whisper (备用1)
- Google Cloud STT (备用2)
```

### 6.2 更新 `server2.py`
```python
# 更新 /transcribe-segment 端点
- 使用 fallback 逻辑
- 自动切换 API
- 记录使用的 API
```

### 6.3 添加依赖
```bash
pip install openai
```

---

## 📊 使用监控

### Railway Logs
**查看哪个 API 被使用：**
```
[INFO] 使用 AI Builder Space API
[FALLBACK] AI Builder Space quota 耗尽，切换到 OpenAI
[INFO] 使用 OpenAI Whisper API
```

### OpenAI Usage Dashboard
**链接：** https://platform.openai.com/usage

**可以看到：**
- 每日使用量
- 花费金额
- API 调用次数

---

## 💰 费用预估和预警

### 设置费用限制（推荐）
**链接：** https://platform.openai.com/account/billing/limits

**建议设置：**
- **Hard limit（硬限制）：** $20/月
- **Soft limit（软限制）：** $10/月（到达后发邮件提醒）

### Product Hunt Launch 预算
**保守估计：**
- 100 用户 × 10 分钟 = 1,000 分钟 × $0.006 = **$6**

**乐观估计：**
- 500 用户 × 10 分钟 = 5,000 分钟 × $0.006 = **$30**

**建议：** 充值 $20，设置 $20 硬限制

---

## ⚠️ 常见问题

### Q1: 没有信用卡怎么办？
**解决方案：**
- 使用虚拟信用卡（如：Revolut, Wise）
- 借用朋友的信用卡（需要信任）
- 暂时只使用 Google API（免费 $300 额度）

### Q2: API Key 泄露了怎么办？
**立即操作：**
1. 访问 https://platform.openai.com/api-keys
2. 找到泄露的 Key
3. 点击 **"Revoke"**（撤销）
4. 创建新的 Key
5. 更新 Railway 环境变量

### Q3: 如何查看实时花费？
**实时监控：**
- https://platform.openai.com/usage
- 更新频率：每 5-10 分钟

### Q4: 可以免费试用吗？
**答案：** OpenAI 已取消免费试用
- 之前：新用户有 $5 免费额度
- 现在：必须充值才能使用

---

## 🎯 下一步操作清单

请按顺序完成：

- [ ] **Step 1:** 创建 OpenAI 账户
- [ ] **Step 2:** 添加付费方式，充值 $10-$20
- [ ] **Step 3:** 创建 API Key（记得复制保存！）
- [ ] **Step 4:** 配置到 Railway（OPENAI_API_KEY）
- [ ] **Step 5:** 告诉我已完成，我开始实现代码

---

## 📞 需要帮助？

如果遇到任何问题，请告诉我：
1. 在哪一步遇到问题
2. 具体的错误信息或截图
3. 我会立即帮你解决

---

**准备好了吗？开始 Step 1 吧！** 🚀

完成后告诉我，我会立即开始实现 API fallback 代码！