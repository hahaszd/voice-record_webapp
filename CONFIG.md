# 配置说明

## AI Builder Token 配置

为了安全起见，**AI Builder Token 不应该硬编码在程序文件中**。请使用以下方式之一配置：

### 方法 1: 环境变量（推荐）

在运行服务器之前设置环境变量：

**Windows PowerShell:**
```powershell
$env:AI_BUILDER_TOKEN="your_token_here"
python -m uvicorn server2:app --host 0.0.0.0 --port 8001
```

**Windows CMD:**
```cmd
set AI_BUILDER_TOKEN=your_token_here
python -m uvicorn server2:app --host 0.0.0.0 --port 8001
```

**Linux/Mac:**
```bash
export AI_BUILDER_TOKEN=your_token_here
python -m uvicorn server2:app --host 0.0.0.0 --port 8001
```

### 方法 2: .env 文件

1. 复制 `.env.example` 文件为 `.env`：
   ```bash
   copy .env.example .env
   ```

2. 编辑 `.env` 文件，设置你的 token：
   ```
   AI_BUILDER_TOKEN=your_token_here
   AI_BUILDER_API_BASE=https://space.ai-builders.com/backend/v1
   ```

3. 注意：`.env` 文件已在 `.gitignore` 中，不会被提交到版本控制

### 方法 3: 配置文件

1. 复制 `aibuilder_config.example.json` 文件为 `aibuilder_config.json`：
   ```bash
   copy aibuilder_config.example.json aibuilder_config.json
   ```

2. 编辑 `aibuilder_config.json`，添加你的 token：
   ```json
   {
     "AI_BUILDER_TOKEN": "your_token_here",
     "AI_BUILDER_API_BASE": "https://space.ai-builders.com/backend/v1"
   }
   ```

3. 注意：`aibuilder_config.json` 文件已在 `.gitignore` 中，不会被提交到版本控制

## Token 获取优先级

程序按以下顺序查找 token：

1. **环境变量** `AI_BUILDER_TOKEN`（优先级最高）
2. **配置文件** `.env`、`config.json` 或 `aibuilder_config.json`
3. **如果未找到**：程序会返回明确的错误信息

## 获取 Token

你可以通过以下方式获取 AI Builder Token：

1. **使用 MCP 工具**（如果在 Cursor 中）：
   - 使用 `get_auth_token` MCP 工具获取 token

2. **从 AI Builder Space 平台**：
   - 登录到 AI Builder Space 平台
   - 在设置或 API 页面获取你的 token

## 安全提示

- ✅ **不要**将 token 提交到版本控制系统（Git）
- ✅ **不要**在代码中硬编码 token
- ✅ **使用**环境变量或配置文件（已添加到 .gitignore）
- ✅ **定期**更新和轮换 token
