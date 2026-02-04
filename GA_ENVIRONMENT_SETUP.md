# 🌍 Google Analytics 环境区分配置指南

## ✅ 已完成的配置

### 自动环境检测

代码已经自动检测并标记环境：

```javascript
// 自动检测逻辑
const currentHostname = window.location.hostname;
let gaEnvironment = 'production';

if (currentHostname === 'localhost' || currentHostname === '127.0.0.1') {
    gaEnvironment = 'local';
} else if (currentHostname.includes('railway.app') && currentHostname.includes('voicespark-dev')) {
    gaEnvironment = 'development';
} else if (currentHostname.includes('railway.app')) {
    gaEnvironment = 'production';
} else if (currentHostname.includes('voicespark.com')) {
    gaEnvironment = 'production';
}
```

### 环境类型

- **`local`** - 本地开发（localhost/127.0.0.1）
- **`development`** - Railway 开发环境（voicespark-dev-xxxx.railway.app）
- **`production`** - 生产环境（voicespark-prod-xxxx.railway.app 或 voicespark.com）

### 所有事件都包含环境参数

现在每个 GA 事件都自动包含 `environment` 参数：

```javascript
gtag('event', 'recording_started', {
    'event_category': 'Recording',
    'event_label': 'User started recording',
    'audio_source': 'microphone',
    'environment': gaEnvironment  // ✅ 自动添加
});
```

---

## 📊 在 Google Analytics 中查看

### 方法 1：使用过滤器（推荐）

#### 步骤 1：访问 GA4

1. 登录 https://analytics.google.com/
2. 选择属性（G-75D37JVX99）

#### 步骤 2：查看事件并过滤

1. **Reports** → **Engagement** → **Events**
2. 点击任意事件名称（如 `recording_started`）
3. 右上角点击 **Add filter**
4. 选择 **Event parameter**
5. 参数名输入：`environment`
6. 运算符选择：`matches exactly`
7. 值输入：`production` 或 `development` 或 `local`

#### 步骤 3：保存过滤器

- 可以保存为自定义报告
- 方便以后快速查看

---

### 方法 2：创建自定义维度（可选，更高级）

如果你想要更强大的分析，可以在 GA4 中创建自定义维度：

#### 步骤 1：创建自定义维度

1. **Admin** → **Custom definitions** → **Custom dimensions**
2. 点击 **Create custom dimension**
3. 填写信息：
   - **Dimension name**: `Environment`
   - **Scope**: `Event`
   - **Event parameter**: `environment`
4. 点击 **Save**

#### 步骤 2：使用自定义维度

创建后，`Environment` 会出现在所有报告的维度列表中：

1. **Reports** → **Engagement** → **Events**
2. 点击 **+** 添加维度
3. 选择 **Environment**
4. 现在可以看到按环境分组的事件数据

---

## 📈 示例：查看生产环境数据

### 实时报告

1. **Reports** → **Realtime**
2. 点击 **Event count by Event name**
3. 右上角 **Add filter**
4. 选择 `environment` = `production`
5. 现在只看到生产环境的实时数据

### 事件报告

1. **Reports** → **Engagement** → **Events**
2. 选择事件（如 `recording_started`）
3. 添加过滤器 `environment` = `production`
4. 查看仅来自生产环境的数据

---

## 🔍 验证环境标记是否正常

### 测试步骤

#### 1. 本地测试（local）

```bash
# 本地运行
cd "d:\Cursor voice record web"
python server2.py
```

访问 http://localhost:8000/

打开 Console (F12)，应该看到：
```
[GA] Tracking environment: local
```

执行操作（录音/转录），然后在 GA 实时报告中应该看到 `environment: local`

#### 2. 开发环境测试（development）

访问你的 dev 环境：https://voicespark-dev-xxxx.railway.app/

Console 应该显示：
```
[GA] Tracking environment: development
```

#### 3. 生产环境测试（production）

访问生产环境：https://voicespark-prod-xxxx.railway.app/

Console 应该显示：
```
[GA] Tracking environment: production
```

---

## 📊 在 GA4 中创建环境对比报告

### 报告 1：环境使用分布

**目的**：看各环境的活跃度

1. **Explore** → **Blank**
2. **Dimensions**：添加 `environment`（事件参数）
3. **Metrics**：添加 `Event count`
4. **Visualization**：饼图

**结果示例**：
```
production: 85%
development: 10%
local: 5%
```

### 报告 2：录音次数（仅生产环境）

1. **Explore** → **Free form**
2. **Segment**：添加过滤器 `environment` = `production`
3. **Dimensions**：`Event name`
4. **Metrics**：`Event count`
5. **过滤**：`Event name` = `recording_started`

### 报告 3：转录成功率对比（各环境）

**目的**：对比不同环境的转录质量

1. **Explore** → **Free form**
2. **Dimensions**：
   - `environment`
   - `Event name`
3. **Metrics**：`Event count`
4. **Rows**：`environment`
5. **Values**：`Event count`
6. **手动计算**：
   ```
   成功率 = transcription_completed / transcription_started
   ```

**结果示例**：
```
Environment    Started    Completed    Success Rate
production     1000       970          97.0%
development    50         48           96.0%
local          10         9            90.0%
```

---

## 🎯 常见使用场景

### 场景 1：排除测试数据

**问题**：开发时频繁测试，污染生产数据

**解决**：
1. 查看报告时，添加过滤器 `environment` = `production`
2. 或者创建自定义报告，默认只显示生产环境

### 场景 2：调试开发环境

**问题**：开发环境有 bug，需要单独分析

**解决**：
1. 过滤 `environment` = `development`
2. 查看开发环境的事件和错误
3. 对比生产环境，找出差异

### 场景 3：本地开发验证

**问题**：本地测试 GA 事件是否正常

**解决**：
1. 本地运行应用
2. 打开 GA 实时报告
3. 过滤 `environment` = `local`
4. 执行操作，立即看到事件（10-30秒延迟）

---

## 📋 快速参考：过滤器设置

### 只看生产环境

```
Filter: environment matches exactly production
```

### 排除本地开发

```
Filter: environment does not match exactly local
```

### 只看测试环境（dev + local）

```
Filter 1: environment matches exactly development
Filter 2: environment matches exactly local
Operator: OR
```

---

## 🔧 高级配置：在 GA4 中设置视图（View）

虽然 GA4 没有传统的"视图"，但可以创建 **Audience**（受众）来模拟：

### 创建"生产用户"受众

1. **Admin** → **Audiences**
2. 点击 **New audience**
3. **Create a custom audience**
4. 名称：`Production Users`
5. 添加条件：
   - **Event parameter** `environment` `matches exactly` `production`
6. 保存

现在可以在报告中选择这个受众，只看生产用户数据。

---

## 📊 推荐的日常报告

### 报告 A：生产环境健康度

**指标**：
- 录音次数（production）
- 转录成功率（production）
- 错误次数（production）

**设置**：
- 过滤器：`environment` = `production`
- 时间范围：Last 7 days
- 对比：Previous period

### 报告 B：开发环境测试活动

**指标**：
- 总事件数（development）
- 测试频率（每日）

**用途**：
- 了解团队测试活跃度
- 验证新功能是否充分测试

---

## 🎨 在 GA4 Dashboard 中展示

### 创建自定义仪表板

1. **Explore** → **Blank**
2. 添加多个 Tab：
   - **Tab 1: Production** - 过滤 `environment` = `production`
   - **Tab 2: Development** - 过滤 `environment` = `development`
   - **Tab 3: All** - 无过滤器
3. 每个 Tab 添加相同的图表：
   - 录音次数
   - 转录次数
   - 用户数

### 示例 Dashboard 布局

```
┌─────────────────────────────────────────┐
│  Environment: Production ▼              │
├─────────────────────────────────────────┤
│  Today's Metrics                        │
│  📊 Recordings: 45                      │
│  📝 Transcriptions: 42                  │
│  👥 Active Users: 12                    │
│  ✅ Success Rate: 97.8%                 │
├─────────────────────────────────────────┤
│  [7-day trend chart]                    │
└─────────────────────────────────────────┘
```

---

## ✅ 配置检查清单

部署后请验证：

### 本地环境（local）
- [ ] Console 显示 `[GA] Tracking environment: local`
- [ ] GA 实时报告中看到 `environment: local` 事件
- [ ] 事件参数中包含 `environment: local`

### 开发环境（development）
- [ ] Console 显示 `[GA] Tracking environment: development`
- [ ] GA 实时报告中看到 `environment: development` 事件
- [ ] URL 包含 `voicespark-dev`

### 生产环境（production）
- [ ] Console 显示 `[GA] Tracking environment: production`
- [ ] GA 实时报告中看到 `environment: production` 事件
- [ ] 可以用过滤器排除其他环境

---

## 🚀 部署说明

所有代码已修改完成：

### 修改的文件

1. **`static/index.html`**
   - 在 Google Analytics 初始化中添加环境检测
   - 设置全局 `environment` 用户属性

2. **`static/script.js`**
   - 在所有 10 个 GA 事件中添加 `environment` 参数
   - 添加环境检测逻辑

### 受影响的事件

所有 10 个事件现在都包含 `environment` 参数：

1. ✅ `recording_started`
2. ✅ `recording_cancelled`
3. ✅ `transcription_started`
4. ✅ `transcription_completed`
5. ✅ `transcription_failed`
6. ✅ `transcription_error`
7. ✅ `copy_button_clicked`
8. ✅ `auto_copy_success`
9. ✅ `auto_copy_on_visible`
10. ✅ `audio_source_changed`

---

## 📖 相关文档

- `GOOGLE_ANALYTICS_EVENTS.md` - GA 事件完整文档
- `GA_AND_AUTOCOPY_STATUS.md` - 状态报告
- `DEPLOYMENT_GUIDE.md` - 部署指南

---

**配置完成日期**: 2026-02-04  
**GA Property ID**: G-75D37JVX99  
**环境类型**: local, development, production  
**状态**: ✅ 已完成，准备部署
