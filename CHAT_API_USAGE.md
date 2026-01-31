# AI Builder Space Chat API 使用指南

## 端点

**POST** `/chat/completions`

## 功能

通过本地服务器代理调用 AI Builder Space 的 Chat API，支持多种模型。

## 请求格式

```json
{
  "model": "deepseek",
  "messages": [
    {"role": "user", "content": "你的问题"}
  ],
  "temperature": 0.7,
  "max_tokens": 500
}
```

## 参数说明

- **model** (必需): 模型名称
  - `deepseek`: 快速且经济的对话模型（推荐）
  - `gpt-5`: OpenAI 兼容的模型（需要 `max_completion_tokens`）
  - `supermind-agent-v1`: 多工具代理，支持网络搜索
  - `gemini-2.5-pro`: Google Gemini 模型
  - `gemini-3-flash-preview`: 快速 Gemini 推理模型
  - `grok-4-fast`: X.AI Grok API

- **messages** (必需): 对话消息列表
  - `role`: "system", "user", 或 "assistant"
  - `content`: 消息内容

- **temperature** (可选): 温度参数，默认 0.7
  - 范围: 0.0 - 2.0
  - 注意: `gpt-5` 模型固定为 1.0

- **max_tokens** (可选): 最大生成 token 数
  - 用于 `deepseek` 等模型

- **max_completion_tokens** (可选): 最大完成 token 数
  - 用于 `gpt-5` 模型
  - 如果未设置但设置了 `max_tokens`，会自动转换

- **stream** (可选): 是否流式返回，默认 false
  - 当前版本暂不支持流式响应

## 使用示例

### 1. 使用 curl

```bash
curl -X POST http://localhost:8001/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek",
    "messages": [
      {"role": "user", "content": "请给我讲一个笑话"}
    ],
    "temperature": 0.7,
    "max_tokens": 500
  }'
```

### 2. 使用 Python

```python
import requests

url = "http://localhost:8001/chat/completions"
data = {
    "model": "deepseek",
    "messages": [
        {"role": "user", "content": "请给我讲一个笑话"}
    ],
    "temperature": 0.7,
    "max_tokens": 500
}

response = requests.post(url, json=data)
result = response.json()

if response.status_code == 200:
    reply = result['choices'][0]['message']['content']
    print(reply)
else:
    print(f"错误: {result}")
```

### 3. 使用 GPT-5 模型

```python
import requests

url = "http://localhost:8001/chat/completions"
data = {
    "model": "gpt-5",
    "messages": [
        {"role": "user", "content": "Tell me a joke"}
    ],
    "temperature": 1.0,  # gpt-5 固定为 1.0
    "max_completion_tokens": 500  # 使用 max_completion_tokens
}

response = requests.post(url, json=data)
result = response.json()
print(result['choices'][0]['message']['content'])
```

### 4. 多轮对话

```python
import requests

url = "http://localhost:8001/chat/completions"
data = {
    "model": "deepseek",
    "messages": [
        {"role": "system", "content": "你是一个有用的助手"},
        {"role": "user", "content": "什么是 Python？"},
        {"role": "assistant", "content": "Python 是一种编程语言..."},
        {"role": "user", "content": "它有什么特点？"}
    ],
    "temperature": 0.7,
    "max_tokens": 500
}

response = requests.post(url, json=data)
result = response.json()
print(result['choices'][0]['message']['content'])
```

## 响应格式

成功响应 (200):

```json
{
  "id": "chatcmpl-...",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "deepseek",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "AI 的回复内容"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 50,
    "total_tokens": 60
  }
}
```

错误响应:

```json
{
  "detail": "错误信息"
}
```

## 注意事项

1. **当前状态**: AI Builder Space 的 Chat API 端点返回 405 错误，这是服务器端问题。代码实现是正确的，一旦服务器端问题解决，端点即可正常工作。

2. **Token 配置**: 确保已配置 `AI_BUILDER_TOKEN`（通过环境变量或 `aibuilder_config.json` 文件）

3. **模型限制**: 
   - `gpt-5` 只支持 `temperature=1.0`
   - `gpt-5` 使用 `max_completion_tokens` 而不是 `max_tokens`

4. **超时设置**: 默认超时为 120 秒，对于长文本生成可能需要更长时间

5. **流式响应**: 当前版本不支持流式响应，`stream` 参数应设置为 `false`

## API 文档

访问 http://localhost:8001/docs 查看完整的 API 文档和交互式测试界面。
