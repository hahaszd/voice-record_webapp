# 日志系统使用指南

## 概述

重新设计的日志系统提供了结构化的、详细的调试信息，特别关注以下关键问题：

1. **API 请求参数**：字段名（`file` vs `audio_file`）、所有表单数据
2. **Model 参数**：是否包含必需的 `model` 参数
3. **文件格式检测**：文件头分析、格式识别、MIME 类型
4. **API 响应**：完整的状态码、响应头、响应体
5. **错误诊断**：详细的错误信息和调试建议

## 日志结构

### 1. 请求信息 (`request`)

```json
{
  "request": {
    "filename": "recording.webm",
    "content_type": "audio/webm",
    "file_size_bytes": 123456,
    "file_size_kb": 120.56,
    "file_size_mb": 0.12,
    "requested_duration_seconds": 60
  }
}
```

### 2. 文件分析 (`file_analysis`)

```json
{
  "file_analysis": {
    "file_header_hex": "1a45dfa3...",
    "detected_format": "WebM",
    "final_content_type": "audio/webm",
    "final_filename": "recording.webm"
  }
}
```

### 3. API 配置 (`api_config`) ⚠️ 关键调试信息

```json
{
  "api_config": {
    "api_url": "https://space.ai-builders.com/backend/v1/audio/transcriptions",
    "api_base": "https://space.ai-builders.com/backend/v1",
    "field_name": "audio_file",  // ⚠️ 'file' 或 'audio_file'
    "form_data": {
      "language": "zh-CN"
    },
    "has_model_param": false,  // ⚠️ 关键：是否包含 model 参数
    "model_value": null,  // ⚠️ model 参数的值（如果有）
    "form_data_keys": ["language"]  // 所有表单字段的键
  }
}
```

### 4. API 请求 (`api_request`)

```json
{
  "api_request": {
    "files": {
      "audio_file": {
        "filename": "recording.webm",
        "content_type": "audio/webm",
        "size": 123456
      }
    },
    "request_timestamp": "2026-01-29T12:00:00"
  }
}
```

### 5. API 响应 (`api_response`)

```json
{
  "api_response": {
    "status_code": 200,
    "response_headers": {...},
    "response_body": {...},
    "response_timestamp": "2026-01-29T12:00:01",
    "duration_seconds": 1.23
  }
}
```

### 6. 错误信息 (`error`)

```json
{
  "error": {
    "type": "API_ERROR_500",
    "message": "API 请求失败，状态码: 500",
    "detail": "Internal Server Error",
    "response": {...},
    "timestamp": "2026-01-29T12:00:00",
    "traceback": "..."
  }
}
```

### 7. 成功信息 (`success`)

```json
{
  "success": {
    "transcript_length": 100,
    "transcript_preview": "转录文本的前200个字符...",
    "language": "zh-CN",
    "timestamp": "2026-01-29T12:00:00"
  }
}
```

## 关键调试点

### 1. 检查 Model 参数

在日志中查找 `api_config.has_model_param`：

```json
"has_model_param": false  // ⚠️ 如果为 false，可能缺少必需的 model 参数
```

**如果为 false**：
- 根据 OpenAI 文档，`model` 是必需参数
- 检查 AI Builder Space API 文档，确认是否需要 `model` 参数
- 如果需要，添加 `'model': 'whisper-1'` 到 `form_data`

### 2. 检查字段名

在日志中查找 `api_config.field_name`：

```json
"field_name": "audio_file"  // ⚠️ 检查是 'file' 还是 'audio_file'
```

**如果使用 `audio_file`**：
- 确认 AI Builder Space API 是否接受此字段名
- 如果 API 期望 `file`，需要修改代码

### 3. 检查文件格式

在日志中查找 `file_analysis.detected_format`：

```json
"detected_format": "WebM"  // ⚠️ 检查格式是否正确识别
```

**如果格式识别错误**：
- 检查文件头是否正确
- 检查 MIME 类型是否正确

### 4. 检查 API 响应

在日志中查找 `api_response.status_code` 和 `api_response.response_body`：

```json
{
  "status_code": 500,
  "response_body": {
    "detail": "Internal Server Error"
  }
}
```

**如果状态码不是 200**：
- 查看 `response_body` 中的详细错误信息
- 检查 `error` 部分中的诊断建议

## 日志输出位置

### 服务器端（Python）

日志会打印到控制台（标准输出），格式如下：

```
================================================================================
[INFO] TRANSCRIBE-SEGMENT - 2026-01-29T12:00:00
================================================================================
{
  "endpoint": "transcribe-segment",
  "timestamp": "2026-01-29T12:00:00",
  "request": {...},
  "file_analysis": {...},
  "api_config": {...},
  ...
}
================================================================================
```

### 客户端（JavaScript）

日志会输出到浏览器控制台，格式类似：

```javascript
[INFO] 准备上传:
  - 文件名: recording_60s.webm
  - 文件大小: 120.56 KB
  - 文件类型: audio/webm
```

## 调试流程

### 步骤 1: 查看请求日志

检查 `api_config` 部分：
- ✅ `has_model_param` 是否为 `true`？
- ✅ `field_name` 是否正确？
- ✅ `form_data` 是否包含所有必需参数？

### 步骤 2: 查看文件分析

检查 `file_analysis` 部分：
- ✅ 格式是否正确识别？
- ✅ MIME 类型是否正确？

### 步骤 3: 查看 API 响应

检查 `api_response` 部分：
- ✅ 状态码是什么？
- ✅ 响应体包含什么信息？

### 步骤 4: 查看错误信息

如果失败，检查 `error` 部分：
- ✅ 错误类型是什么？
- ✅ 错误详情是什么？
- ✅ 是否有调试建议？

## 常见问题诊断

### 问题 1: 500 Internal Server Error

**检查点**：
1. `has_model_param` 是否为 `false`？→ 可能需要添加 `model` 参数
2. `field_name` 是否为 `audio_file`？→ 可能需要改为 `file`
3. `detected_format` 是否为 `WebM`？→ WebM 可能有兼容性问题

### 问题 2: 400 Bad Request

**检查点**：
1. `form_data` 中的参数是否正确？
2. `field_name` 是否正确？
3. 文件格式是否支持？

### 问题 3: 空转录结果

**检查点**：
1. `api_response.status_code` 是否为 200？
2. `success.transcript_length` 是否为 0？
3. 音频文件是否包含有效音频？

## 示例：完整的调试日志

```json
{
  "endpoint": "transcribe-segment",
  "timestamp": "2026-01-29T12:00:00",
  "request": {
    "filename": "recording.webm",
    "content_type": "audio/webm",
    "file_size_bytes": 123456,
    "file_size_kb": 120.56,
    "file_size_mb": 0.12,
    "requested_duration_seconds": 60
  },
  "file_analysis": {
    "file_header_hex": "1a45dfa3a3428682...",
    "detected_format": "WebM",
    "final_content_type": "audio/webm",
    "final_filename": "recording.webm"
  },
  "api_config": {
    "api_url": "https://space.ai-builders.com/backend/v1/audio/transcriptions",
    "api_base": "https://space.ai-builders.com/backend/v1",
    "field_name": "audio_file",
    "form_data": {
      "language": "zh-CN"
    },
    "has_model_param": false,  // ⚠️ 关键问题
    "model_value": null,
    "form_data_keys": ["language"]
  },
  "api_response": {
    "status_code": 500,
    "response_body": {
      "detail": "Internal Server Error"
    },
    "duration_seconds": 1.23
  },
  "error": {
    "type": "API_ERROR_500",
    "message": "API 请求失败，状态码: 500",
    "detail": "Internal Server Error"
  },
  "warnings": [
    {
      "message": "WebM 格式已检测到，根据 OpenAI 文档应该被支持",
      "timestamp": "2026-01-29T12:00:00"
    }
  ]
}
```

## 下一步行动

根据日志中的信息：

1. **如果 `has_model_param` 为 `false`**：
   - 尝试添加 `'model': 'whisper-1'` 到 `form_data`
   - 测试是否解决问题

2. **如果 `field_name` 为 `audio_file` 但 API 期望 `file`**：
   - 修改代码，将 `audio_file` 改为 `file`
   - 测试是否解决问题

3. **如果 WebM 格式仍然失败**：
   - 考虑服务器端转换为 WAV/MP3
   - 或使用 Google Speech-to-Text API 作为备选
