# v104 测试指南 - 系统音频标签页切换

## 🎯 测试目标

验证 v104 的页面可见性警告和用户提示功能是否正常工作。

## ⚠️ 重要说明

**浏览器会在后台标签页限制录音，这是无法绕过的！**

v104 的改进是**提前告知用户这个限制**，而不是让用户录音失败后才发现。

## 🧪 测试步骤

### 测试 1：系统音频录制提示

**步骤：**
1. 刷新页面（清除缓存：Ctrl+Shift+R / Cmd+Shift+R）
2. 选择音频源：**麦克风+系统音频** 或 **系统音频**
3. 点击录音按钮
4. 在浏览器弹窗中选择任意标签页（确保勾选"Share tab audio"）

**预期结果：**
- ✅ 录音开始后，立即看到一个**紫色渐变提示框**
- 内容：🎵 System Audio Recording Tips
- 提示："Keep this tab active! Browser may pause recording if you switch tabs"
- 建议："Use split-screen or picture-in-picture mode"
- 有 "Got it!" 按钮
- 10秒后自动消失

**截图位置：**
- 提示框在页面顶部（top: 80px）
- 紫色渐变背景
- 有滑入动画效果

---

### 测试 2：后台录音红色警告

**步骤：**
1. 开始录音（任意音频源）
2. **切换到其他标签页**（如 YouTube、Google 等）
3. 等待 2-3 秒
4. **切换回 VoiceSpark 标签页**

**预期结果：**
- ✅ 切换回来后，立即看到一个**红色警告条**
- 位置：页面顶部
- 内容：⚠️ "Recording in Background!"
- 说明："Browser may pause recording when this tab is hidden"
- 提示："Keep this tab active to ensure continuous recording"

**控制台日志：**
```
⚠️ [RECORDING WARNING] Page hidden during recording!
⚠️ Browser may pause or stop recording when page is in background
[VISIBILITY] Page visibility changed: HIDDEN
...（切换回来后）
[INFO] Page visible again after X.Xs hidden
⚠️ Recording may have been paused for X.X seconds
```

---

### 测试 3：帮助页面内容

**步骤：**
1. 点击右上角 "❓" 按钮
2. 滚动到 "Q: 如何录制系统音频？"

**预期结果：**
- ✅ 看到新增的红色警告文字
- ⚠️ 重要：务必勾选"同时分享标签页音频"
- 🔴 关键限制：录音期间必须保持录音页面激活
- 建议操作流程（5个步骤）

---

### 测试 4：分屏模式（推荐工作流程）

**步骤：**
1. 打开两个浏览器窗口
2. 使用 Windows 分屏（Win + 左/右箭头）或 Mac 拖动
3. 左边：VoiceSpark 录音页面
4. 右边：YouTube 播放页面
5. 在 VoiceSpark 开始录音，选择 YouTube 标签页
6. 同时观看 YouTube 和保持 VoiceSpark 可见

**预期结果：**
- ✅ 不应该出现红色警告（因为页面始终可见）
- ✅ 录音应该正常工作
- ✅ 可以同时看到两个窗口

---

## 📊 验证清单

### 视觉提示
- [ ] 紫色系统音频提示（录音开始时）
- [ ] 红色后台录音警告（切换标签页后）
- [ ] 动画效果流畅
- [ ] 按钮可以手动关闭提示

### 控制台日志
- [ ] `[RECORDING WARNING]` 在页面隐藏时输出
- [ ] 记录页面隐藏时长
- [ ] `Page visible again after X.Xs hidden`
- [ ] 警告信息清晰明确

### 帮助文档
- [ ] 新增的红色警告文字可见
- [ ] 5步操作流程完整
- [ ] 分屏/画中画建议明确

### 用户体验
- [ ] 第一次录制系统音频时看到提示
- [ ] 切换标签页后看到警告
- [ ] 提示内容清晰易懂
- [ ] 不会过度打扰用户

---

## 🐛 已知问题和限制

### 正常行为（不是 bug）
1. **切换标签页后录音可能中断** - 这是浏览器限制，无法解决
2. **红色警告只在切换回来后显示** - 在后台标签页时无法显示 UI
3. **系统音频信号检测到但没录上** - MediaRecorder 被浏览器暂停了

### 不支持的场景
1. ❌ 完全在后台录制系统音频
2. ❌ 切换标签页后继续录制
3. ❌ 锁屏后继续录制

### 推荐的工作方式
1. ✅ 使用分屏模式
2. ✅ 使用画中画功能
3. ✅ 先播放内容，快速切回录音页面

---

## 🎨 UI 样式参考

### 紫色提示框
```
背景：linear-gradient(135deg, #667eea 0%, #764ba2 100%)
位置：top: 80px
宽度：550px (max-width: 90%)
圆角：16px
阴影：0 8px 24px rgba(102, 126, 234, 0.3)
```

### 红色警告条
```
背景：#ff6b6b
位置：top: 80px
宽度：500px (max-width: 90%)
圆角：12px
阴影：0 4px 16px rgba(255, 107, 107, 0.3)
```

---

## 📝 测试报告模板

```markdown
## v104 测试结果

**测试时间：** YYYY-MM-DD HH:MM
**浏览器：** Chrome/Edge/Safari XX.X
**操作系统：** Windows/Mac/Linux

### 测试 1：系统音频录制提示
- [ ] 通过 / [ ] 失败
- 备注：

### 测试 2：后台录音红色警告
- [ ] 通过 / [ ] 失败
- 备注：

### 测试 3：帮助页面内容
- [ ] 通过 / [ ] 失败
- 备注：

### 测试 4：分屏模式
- [ ] 通过 / [ ] 失败
- 备注：

### 总体评价
- [ ] 所有功能正常
- [ ] 部分功能有问题
- [ ] 需要修复

### 问题和建议
1. 
2. 
3. 
```

---

## 🚀 下一步

测试通过后：
1. ✅ 提交代码到 Git
2. ✅ 部署到 dev 环境
3. ✅ 生产环境验证
4. ✅ 更新用户文档
5. ✅ 考虑添加到产品发布说明

测试失败：
1. 记录问题详情
2. 截图/录屏
3. 检查浏览器控制台错误
4. 反馈给开发团队
