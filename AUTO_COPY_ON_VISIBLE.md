# ✨ 新功能：激活页面自动复制转录内容

## 🎯 功能描述

每次激活网页（从其他标签页/App切换回来）时，自动将转录内容复制到剪贴板。

### 使用场景

1. 你在 VoiceSpark 录音并转录
2. 切换到其他 App（比如微信、邮件）
3. 过了一会儿，切换回 VoiceSpark
4. **✨ 自动复制！** 转录内容已经在剪贴板里
5. 直接粘贴到 ChatGPT/Claude/Notion

---

## 🔄 工作逻辑

### 优先级顺序

页面激活时，按以下优先级复制：

1. **优先**: `pendingAutoCopyText`（后台转录完成的待复制文本）
2. **其次**: `transcriptionResult`（转录结果区域的现有内容）

### 触发条件

| 条件 | 是否触发 |
|------|---------|
| 从其他标签页切换回来 | ✅ 是 |
| 从其他 App 切换回来 | ✅ 是 |
| 页面刚加载完成 | ❌ 否 |
| 页面一直处于激活状态 | ❌ 否 |
| 转录结果区域为空 | ❌ 否 |

---

## 💡 为什么需要这个功能？

### 之前的痛点

```
1. 在 VoiceSpark 录音并转录
2. 切换到其他 App 干别的事
3. 回来想用转录内容
4. ❌ 发现剪贴板里没有（被其他内容覆盖了）
5. ❌ 需要手动点"复制"按钮
```

### 现在的体验

```
1. 在 VoiceSpark 录音并转录
2. 切换到其他 App 干别的事
3. 回来想用转录内容
4. ✅ 页面激活，自动复制到剪贴板
5. ✅ 直接粘贴，无需点击
```

---

## 🔧 技术实现

### 核心代码

```javascript
// visibilitychange 事件监听器
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        setTimeout(() => {
            let textToCopy = null;
            
            // 优先复制待复制文本
            if (pendingAutoCopyText) {
                textToCopy = pendingAutoCopyText;
                pendingAutoCopyText = null;
            } 
            // 否则复制转录结果区域的内容
            else if (transcriptionResult && transcriptionResult.value.trim()) {
                textToCopy = transcriptionResult.value.trim();
            }
            
            if (textToCopy) {
                navigator.clipboard.writeText(textToCopy)
                    .then(() => console.log('✅ Auto-copy successful'))
                    .catch(err => console.warn('⚠️ Auto-copy failed'));
            }
        }, 500); // 延迟500ms，等待焦点恢复
    }
});
```

### 关键点

1. **延迟500ms**: 等待页面完全获得焦点，避免"Document is not focused"错误
2. **二次检查**: 确认页面仍然可见（避免快速切换导致的问题）
3. **优先级**: 先复制pending文本，再复制existing文本
4. **容错处理**: 失败时不报错，用户可手动复制

---

## 🧪 测试场景

### 场景 1: 后台转录完成

```
✅ 录音
✅ 切换到其他 App（页面进入后台）
✅ 转录在后台完成
✅ 切换回网页
✅ 预期: 自动复制转录内容
```

### 场景 2: 切换回来再次使用

```
✅ 之前已经转录完成
✅ 切换到其他 App
✅ 剪贴板被其他内容覆盖
✅ 切换回网页
✅ 预期: 自动复制转录内容
```

### 场景 3: 转录区域为空

```
✅ 刚打开网页，还没录音
✅ 切换到其他 App
✅ 切换回来
✅ 预期: 不复制（因为没有内容）
```

### 场景 4: 连续切换

```
✅ 转录完成
✅ 快速切换：VoiceSpark → 微信 → VoiceSpark
✅ 预期: 每次切换回来都复制一次
```

---

## 📊 Google Analytics 追踪

每次自动复制成功时，会发送GA事件：

```javascript
gtag('event', 'auto_copy_on_visible', {
    'event_category': 'AutoCopy',
    'event_label': 'Auto-copied when page became visible',
    'text_length': textToCopy.length,
    'environment': gaEnvironment
});
```

可以在 GA4 中查看：
- 事件名称: `auto_copy_on_visible`
- 类别: `AutoCopy`
- 指标: 文本长度、环境

---

## 🎯 用户价值

### 减少操作步骤

| 操作 | 之前 | 现在 |
|------|------|------|
| 切换回网页 | 1步 | 1步 |
| 点击复制按钮 | 1步 | **0步（自动）** |
| 粘贴 | 1步 | 1步 |
| **总计** | **3步** | **2步** ⬇️ 33% |

### 降低认知负担

- ❌ 之前: "咦，剪贴板里的内容呢？啊，被覆盖了，得再点一次复制"
- ✅ 现在: "切回来直接粘贴就行"

### 更符合直觉

用户心智模型：
> "我在这个网页里录了音，转录好了，当我回到这个网页时，内容应该就在我的剪贴板里"

---

## 🚀 部署信息

- **版本**: v54
- **分支**: dev
- **Commit**: `a3a9811`
- **部署时间**: 2026-02-04
- **修改文件**: 
  - `static/script.js`
  - `static/index.html`

---

## 🔮 未来可能的优化

### 1. 智能判断是否需要复制

```javascript
// 检查剪贴板中是否已经是这个内容
const clipboardText = await navigator.clipboard.readText();
if (clipboardText === textToCopy) {
    console.log('Already in clipboard, skip');
    return;
}
```

**优点**: 避免重复复制  
**缺点**: 需要额外的权限请求

### 2. 视觉反馈

```javascript
// 显示一个小的 toast 提示
showToast('✅ 已复制到剪贴板');
```

**优点**: 用户知道发生了什么  
**缺点**: 可能打扰用户

### 3. 可配置开关

```javascript
// 添加一个设置选项
if (autoRecopyToggle.checked) {
    // 自动复制
}
```

**优点**: 给用户选择权  
**缺点**: 增加设置复杂度

---

## ✅ 总结

这个功能解决了一个真实的用户痛点：

**从"需要记得点复制"变成"自动就在剪贴板里"**

虽然只是减少了一次点击，但大大提升了使用体验，让工具更符合直觉。

---

**功能状态**: ✅ 已部署到 Dev  
**下一步**: 测试后部署到 Production
