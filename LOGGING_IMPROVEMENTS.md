# 日志系统改进总结

## 改进概述

根据 OpenAI Whisper API 文档分析和代码审查，重新设计了日志系统，重点关注以下关键调试点：

1. **API 参数完整性**：特别是 `model` 参数是否存在
2. **字段名正确性**：`file` vs `audio_file`
3. **文件格式检测**：详细的格式识别信息
4. **错误诊断**：结构化的错误信息和调试建议

## 主要改进

### 1. 统一的日志工具类 (`logging_helper.py`)

创建了 `TranscriptionLogger` 类，提供结构化的日志记录：

- ✅ 统一的日志格式
- ✅ 关键信息的明确标记（如 `has_model_param`）
- ✅ 易于扩展和维护

### 2. 关键调试信息

#### API 配置日志 (`api_config`)

现在明确记录：
- `field_name`: 使用的字段名（`file` 或 `audio_file`）
- `has_model_param`: ⚠️ **关键** - 是否包含 `model` 参数
- `model_value`: `model` 参数的值（如果有）
- `form_data_keys`: 所有表单字段的键列表

这有助于快速识别：
- 是否缺少必需的 `model` 参数
- 字段名是否正确

#### 文件分析日志 (`file_analysis`)

详细记录：
- `file_header_hex`: 文件头的十六进制表示
- `detected_format`: 检测到的格式（WAV, MP3, WebM 等）
- `final_content_type`: 最终使用的 MIME 类型
- `final_filename`: 最终使用的文件名

### 3. 错误诊断增强

#### 结构化错误信息

错误日志现在包含：
- `error.type`: 错误类型（如 `API_ERROR_500`）
- `error.message`: 错误消息
- `error.detail`: 详细错误信息
- `error.response`: 完整的 API 错误响应
- `error.traceback`: 异常堆栈（如果有）

#### 智能调试建议

根据错误类型和上下文，日志系统会提供：
- 针对 WebM 格式的特殊建议
- 关于缺少 `model` 参数的警告
- 字段名不匹配的提示

### 4. 请求/响应追踪

完整记录：
- 请求时间戳
- 响应时间戳
- 请求持续时间
- 完整的请求头（Token 已脱敏）
- 完整的响应头
- 响应体（成功或错误）

## 更新的端点

### `/transcribe-segment`

✅ 已更新使用新的日志系统
- 记录所有关键调试信息
- 特别关注 `model` 参数和字段名
- 提供详细的错误诊断

### `/speech-to-text-aibuilder`

✅ 已更新使用新的日志系统
- 与 `/transcribe-segment` 使用相同的日志格式
- 便于对比两个端点的行为差异

## 日志输出示例

### 成功请求

```
================================================================================
[SUCCESS] TRANSCRIBE-SEGMENT - 2026-01-29T12:00:00
================================================================================
{
  "endpoint": "transcribe-segment",
  "timestamp": "2026-01-29T12:00:00",
  "request": {...},
  "file_analysis": {...},
  "api_config": {
    "field_name": "audio_file",
    "has_model_param": false,  // ⚠️ 注意：缺少 model 参数
    ...
  },
  "api_response": {
    "status_code": 200,
    ...
  },
  "success": {
    "transcript_length": 100,
    ...
  }
}
================================================================================
```

### 失败请求（500 错误）

```
================================================================================
[ERROR] TRANSCRIBE-SEGMENT - 2026-01-29T12:00:00
================================================================================
{
  "endpoint": "transcribe-segment",
  "timestamp": "2026-01-29T12:00:00",
  "request": {...},
  "file_analysis": {
    "detected_format": "WebM",
    ...
  },
  "api_config": {
    "field_name": "audio_file",
    "has_model_param": false,  // ⚠️ 关键问题
    "form_data_keys": ["language"]
  },
  "api_response": {
    "status_code": 500,
    "response_body": {
      "detail": "Internal Server Error"
    }
  },
  "error": {
    "type": "API_ERROR_500",
    "message": "API 请求失败，状态码: 500",
    "detail": "Internal Server Error"
  },
  "warnings": [
    {
      "message": "WebM 格式已检测到，根据 OpenAI 文档应该被支持"
    }
  ]
}
================================================================================
```

## 使用建议

### 1. 查看日志时重点关注

1. **`api_config.has_model_param`**
   - 如果为 `false`，可能需要添加 `model` 参数
   - 根据 OpenAI 文档，`model` 是必需参数

2. **`api_config.field_name`**
   - 检查是否与 API 期望的字段名匹配
   - OpenAI 标准使用 `file`，但 AI Builder Space 可能使用 `audio_file`

3. **`api_response.status_code`**
   - 200 = 成功
   - 400 = 请求参数错误（检查字段名、参数）
   - 500 = 服务器错误（可能是参数缺失或格式问题）

4. **`file_analysis.detected_format`**
   - 检查格式是否正确识别
   - WebM 格式可能需要特殊处理

### 2. 调试流程

1. **查看请求日志** → 检查 `api_config` 部分
2. **查看文件分析** → 检查 `file_analysis` 部分
3. **查看 API 响应** → 检查 `api_response` 部分
4. **查看错误信息** → 检查 `error` 部分（如果失败）

### 3. 常见问题快速诊断

| 问题 | 检查点 | 可能原因 |
|------|--------|----------|
| 500 错误 | `has_model_param` = false | 缺少 `model` 参数 |
| 500 错误 | `field_name` = "audio_file" | 字段名不匹配 |
| 500 错误 | `detected_format` = "WebM" | WebM 格式兼容性问题 |
| 400 错误 | `form_data_keys` | 参数格式或值不正确 |
| 空结果 | `status_code` = 200 | 音频质量问题或格式不支持 |

## 下一步

根据日志信息，可以：

1. **如果 `has_model_param` 为 `false`**：
   - 尝试在 `form_data` 中添加 `'model': 'whisper-1'`
   - 测试是否解决问题

2. **如果 `field_name` 为 `audio_file` 但 API 期望 `file`**：
   - 修改代码，将字段名改为 `file`
   - 测试是否解决问题

3. **如果 WebM 格式仍然失败**：
   - 考虑服务器端格式转换
   - 或使用 Google Speech-to-Text API 作为备选

## 相关文档

- `LOGGING_GUIDE.md`: 详细的日志使用指南
- `WEBM_API_ANALYSIS.md`: WebM 格式和 API 分析
- `WEBM_CODE_REVIEW.md`: 代码审查报告
