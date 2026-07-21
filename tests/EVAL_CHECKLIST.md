# VoiceSpark — EVAL 清单（测试计划）

> 目标：把"录音→保留哪段→VAD→分段→转录→历史"这条主链路的**每一个可验证行为**列全，
> 标注验证方式、优先级、现状。清单以**代码为准**（见 [CLAUDE.md 铁律]），文档只作对照。
>
> 维护规则：改动相关代码时，同步更新本清单对应项的"现状"。

## 测试层级（Layer）定义

| Layer | 含义 | 特点 | 例子 |
|-------|------|------|------|
| **L0** | 离线确定性（Playwright，合成音频喂真实全局函数，不碰 API） | 快、可重复、进 CI、无需 key | 现有 `recording-segment-eval.spec.ts` |
| **L1** | 后端单元（pytest，mock 各转录 API 的响应） | 无需真实 key，测 `api_fallback.py`/`server2.py` 逻辑 | 优先级/配额/重试 |
| **L2** | 集成（mock 转录 API，走真实 FastAPI 端点） | 测请求→路由→响应契约 | `/transcribe-segment` 返回结构 |
| **L3** | 真实浏览器 E2E（Chrome 插件 / Playwright fake-mic 注入） | 最真实、较慢、不完全确定性 | 真录音→IndexedDB→停止 |
| **L4** | 手动 / 探索性 | 无法自动化的感官/权限项 | iOS 息屏、系统音授权弹窗 |

**优先级**：P0=核心正确性（错了就是产品坏了）、P1=重要、P2=加分项。
**现状**：✅已建 / 🟡部分 / ⬜待建。

---

## A. 尾部保留与时长上限（核心：停止时到底保留哪一段）

主函数 `enforceMaxDuration`（script.js:1192，硬性兜底）+ chunk 时间戳选择（`generateAndPlayAudio` 内）。

| ID | 验证内容 | 输入/设置 | 期望 | Layer | 优先级 | 现状 |
|----|----------|-----------|------|-------|--------|------|
| A1 | 录 < 所选时长 → 全保留 | 录 30s，选 60s | 输出≈30s，内容全在 | L0 | P0 | ✅ |
| A2 | 录 > 所选时长 → 只留最后 N 秒 | 录 60s(前A后B)，选 30s | 输出≈30s，只含 B 段，丢 A 段 | L0 | P0 | ✅ |
| A3 | 边界：录 == 所选（±容差2s内） | 录 31s，选 30s | 容差内不截取，全保留 | L0 | P1 | ⬜ |
| A4 | 精确边界：录 90s 选 60s | 输出严格≈60s，含最后 60s 标记、不含最前 30s | L0 | P0 | ⬜ |
| A5 | 5 分钟满窗：录 6 分钟选 5m | 输出≈300s，丢最前 60s（滚动缓冲动机） | L0 | P1 | ⬜ |
| A6 | 解码失败兜底 | 传入损坏/不可解码 blob | 不抛错，原样返回（宁放行不丢录音） | L0 | P1 | ⬜ |
| A7 | chunk 时间戳选择正确性（**真正的主链路**） | 模拟多 chunk 不同 timestamp，选 30s | cutoff 以最后 chunk 时间戳为基准，取最近 30s（v116）；已抽成纯函数 `selectRecentChunks`(v121) | **L0** | P0 | ✅ `chunk-selection-eval.spec.ts` |

> ⚠️ **重要澄清（review 发现）**：A1/A2/A4 测的 `enforceMaxDuration` 是**兜底防线**（其注释 script.js:1180
> 自称"不是主修复"）。真正决定"选1分钟却转出好几分钟旧内容"这个历史 bug 的，是 `generateAndPlayAudio`
> **内联的** chunk 时间戳过滤（script.js:3399-3411），它读 IndexedDB、耦合录音状态，**不重构成纯函数就上不了
> L0**。→ 待办：要么把 cutoff 过滤抽成纯函数以便 L0，要么 A7 老实走 L3 fake-mic。别让兜底冒充主链路覆盖。

## B. 客户端 VAD（`trimLeadingSilence`，script.js:902）

| ID | 验证内容 | 输入/设置 | 期望 | Layer | 优先级 | 现状 |
|----|----------|-----------|------|-------|--------|------|
| B1 | 中间停顿保留 | 静音-语音-停顿-语音 | 裁前导静音；两段语音+中间停顿都在 | L0 | P0 | ✅ |
| B2 | 只裁前导、不裁尾部静音 | 语音后接长尾静音 | 尾部静音保留（VAD 只裁首） | L0 | P1 | ⬜ |
| B3 | 前导静音 < minTrim(600ms) → 不裁 | 前导 300ms 静音 | 原样返回，reason=below_min_trim | L0 | P1 | ⬜ |
| B4 | 真空录音识别 | 全程近零能量 | allSilence=true，但**仍不丢弃**（保留 blob 交后端过滤） | L0 | P0 | ✅ `audio-processing-eval.spec.ts` |
| B5 | 轻声前段不被误删（v119 修复） | 前段轻声+后段响亮 | 裁剪边界回退，轻声语音保留（实测 dur=7.45s、早段=轻声电平） | L0 | P0 | ✅ `audio-processing-eval.spec.ts` |
| B6 | 瞬时噪声不误判为语音起点（triggerCount=9） | 前导静音中插单个尖峰 | 不把噪点当语音起点 | L0 | P1 | ⬜ |
| B7 | 音频过短 → 跳过 | <3 窗口 | passthrough，reason=too_short | L0 | P2 | ⬜ |
| B8a | 裁剪/截取路径 → 16kHz 单声道 WAV | trimmed=true 或超时长截取 | 采样率=16000，单声道 | L0 | P1 | ⬜ |
| B8b | passthrough 路径 → 原样不改格式 | 短/干净、前导静音<600ms | 上传原始 WebM/Opus 原生采样率（**不是** 16kHz WAV），blob 不变 | L0 | P1 | ⬜ |

## C. 长音频分段转录（`splitAudioAtSilence`，script.js:1247）

| ID | 验证内容 | 期望 | Layer | 优先级 | 现状 |
|----|----------|------|-------|--------|------|
| C1 | 短音频不分段 | ≤ minChunkable(90s) 返回 null（不分段） | L0 | P1 | ✅ `audio-processing-eval.spec.ts` |
| C2 | 长音频按静音点切成 ~60s 块 | 块数合理、切点靠近静音、块顺序正确 | L0 | P1 | ⬜ |
| C3 | 分段结果拼接顺序正确 | 各块 startSec 递增、连续(endSec[i]===startSec[i+1])、全覆盖[0,总时长]、无重叠/漏采样 | L0 | P0 | ✅ `audio-processing-eval.spec.ts` |
| C4 | 一段杂音只毒害所在块 | 中间插杂音，其它块文本不受影响 | L2(mock) | P1 | ⬜ |

## D. 音频编码 / 大小 / 降采样

| ID | 验证内容 | 期望 | Layer | 优先级 | 现状 |
|----|----------|------|-------|--------|------|
| D1 | 满 5 分钟 WAV < 25MB 上传上限 | 300s@16kHz mono ≈ 9.6MB(实测 9.16) < 25MB | L0 | P0 | ✅ `audio-processing-eval.spec.ts` |
| D2 | `encodeMonoSamplesToWav` 头部/格式正确 | RIFF/WAVE/fmt/data 合法，可被 decode | L0 | P1 | ⬜ |
| D3 | 幅度裁剪 [-1,1] 无溢出 | 超范围样本被 clamp | L0 | P2 | ⬜ |

## E. 录音生命周期与会话隔离

| ID | 验证内容 | 期望 | Layer | 优先级 | 现状 |
|----|----------|------|-------|--------|------|
| E1 | 开始→停止基本流程（**可断言化**） | recordBtn.classList 含/不含 `recording`、`recordBtn.disabled`、`recordingTime.textContent` 匹配 `^\d{2}:\d{2}$`、cancelRecordBtn.style.display、源选择器 disabled 切换 | L3 | P0 | ⬜ |
| E2 | 停止→快照窗口锁（v118 `isStoppingRecording`） | 停止处理期间重复点击被忽略 | L3 | P1 | ⬜ |
| E3 | 会话 epoch 守卫（v117） | 孤儿 recorder 的 chunk 被丢弃、不污染新会话 | L0/L3 | P1 | ⬜ |
| E4 | 新录音 clearAll 不影响正在转录的快照（v116） | 快照后清库，旧转录仍用快照数据 | L3 | P0 | ⬜ |
| E5 | 12 小时兜底自动停止 | 超 12h 自动 stopRecording | L4 | P2 | ⬜ |

## F. Auto-Capture（停止后无缝重挂，非定时切段）

| ID | 验证内容 | 期望 | Layer | 优先级 | 现状 |
|----|----------|------|-------|--------|------|
| F1 | 停止→转录→自动重开新录音 | 开关开启时，转录后立即重新录音 | L3 | P1 | ⬜ |
| F2 | 重开前检查麦克风权限 | 无权限时取消自动录音、不报错崩溃 | L3 | P1 | ⬜ |
| F3 | 不做定时自动切段 | 不到手动停不会自己切（确认无定时器） | L0(代码断言) | P1 | ⬜ |

## G. 音频源与 API 路由

| ID | 验证内容 | 期望 | Layer | 优先级 | 现状 |
|----|----------|------|-------|--------|------|
| G1 | 麦克风 vs 系统音源选择 | 录音期间源选择器禁用、停止后启用 | L3 | P1 | ⬜ |
| G2 | 音频源信息随请求上传 | audioSource 正确传给后端用于路由 | L2 | P1 | ⬜ |
| G3 | 麦克风场景 API 优先级（**已修正+测试**） | Whisper→AI Builder→**Google**（**非 Deepgram**）；docstring 已修正 | L1 | P0 | ✅ `test_fallback_engine.py` |
| G4 | 系统音场景走 `transcribe_system_audio` | 路由正确；优先级 gpt-4o-diarize→Google→**Deepgram**（Deepgram 只在这条路径） | L1 | P1 | ⬜ |
| G5 | "Both"（麦克风+系统）源路由 | 走 `use_google_only`（server2.py:805），FEATURES 列为一等模式 | L1/L2 | P1 | ⬜ |

## H. 转录 fallback 引擎（`api_fallback.py`）

| ID | 验证内容 | 期望 | Layer | 优先级 | 现状 |
|----|----------|------|-------|--------|------|
| H1 | 主 API 成功即返回 | Whisper 成功不再调用后续 | L1 | P0 | ✅ `test_fallback_engine.py` |
| H2 | 主 API 失败 → 依次 fallback | 按优先级降级到下一个可用 API | L1 | P0 | ✅ `test_fallback_engine.py` |
| H3 | 配额耗尽检测 `is_quota_exceeded` | 命中配额错误 → 跳过该 API（并回归 v121 修的 AI Builder NameError 崩溃） | L1 | P0 | ✅ `test_fallback_engine.py` |
| H4 | 配额跳过窗口 `QUOTA_RECHECK_INTERVAL`(1h) | 1h 内不再重试已耗尽 API | L1 | P1 | ✅ `test_fallback_engine.py` |
| H5 | ~~临时错误重试~~（**删除**） | `is_temporary_error`(api_fallback.py:136) 是**死代码**、零调用；无"临时错误重试同一 API"路径。任何单 API 失败都 fall through 到下一个（即 H2）。此条不测 | — | — | ❌删 |
| H6 | 全部 API 失败 | 抛结构化异常（`所有转录 API 都失败了: ...`） | L1 | P0 | ✅ `test_fallback_engine.py` |
| H7 | 响应契约 | api_used/text/success 字段齐全一致 | L1/L2 | P1 | ⬜ |

## I. 转录历史 & 重转录

| ID | 验证内容 | 期望 | Layer | 优先级 | 现状 |
|----|----------|------|-------|--------|------|
| I1 | 转录成功后入历史 | 文本+音频+源被记录 | L3 | P1 | ⬜ |
| I2 | 选区重转录 `extractAudioSegmentRange` | [start,end] 切片正确、降采样 16kHz | L0 | P1 | ⬜ |
| I3 | 指定 API 重转录 | langOverride/API 选择生效 | L2/L3 | P2 | ⬜ |
| I4 | 历史音频播放 | 播放器时长/进度正确 | L3 | P2 | ⬜ |

## J. 语言选择

| ID | 验证内容 | 期望 | Layer | 优先级 | 现状 |
|----|----------|------|-------|--------|------|
| J1 | Auto 模式不传 language | 后端自动识别 | L2 | P1 | ⬜ |
| J2 | 指定中文/英文时透传 | language 参数正确传给后端 | L2 | P1 | ⬜ |
| J3 | 语言选择器 UI 样式/交互 | 与 transcription-language.spec 一致 | L3 | P2 | 🟡 |

## K. 后端安全（v120）

| ID | 验证内容 | 期望 | Layer | 优先级 | 现状 |
|----|----------|------|-------|--------|------|
| K1 | 限流仅作用于 3 个付费路径 | `/transcribe-segment`/`/speech-to-text`/`-aibuilder` | L2 | P0 | ⬜ |
| K2a | 每分钟限流：超 20/min → 429 + Retry-After | 第 21 次/60s 触发 | L2 | P0 | ⬜ |
| K2b | 每小时限流：超 150/hour → 429 | 第 151 次/3600s 触发（与 K2a 分开测；建议把 `RATE_LIMITS` 做成可注入夹具、别真打 150 次） | L2 | P1 | ⬜ |
| K3 | 客户端 IP 取 X-Forwarded-For | 代理后取真实客户端 IP 计数 | L2 | P1 | ⬜ |
| K4 | 生产环境关闭 API 文档 | `SHOW_DOCS` **fail-closed**（server2.py:83）：默认即关，只有显式非 production 才开；/docs /redoc /openapi.json → 404/None | L2 | P1 | ⬜ |
| K5 | 非付费路径不被限流 | 静态资源/首页不受限 | L2 | P2 | ⬜ |
| K6 | 伪造 X-Forwarded-For 绕过限流 | **已实测确认安全(v121)**：临时 `/_debug/xff` 端点打 dev，伪造 XFF 完全不出现——Railway 边缘剥离/覆盖客户端 XFF、把真实 IP 放最左，`split(",")[0]` 取到真实 IP、**无法伪造绕过**。X-Real-IP 同样被覆盖。**无需改代码**。真实 IP 轮换仍可绕（既定接受权衡） | 实测 | P0 | ✅ 实测确认安全，无需修复 |
| K7 | 429 前端展示契约 | 前端把后端友好文案展示出来，而非裸 `HTTP 429:`（`script.js:1344` 目前直接 throw body，疑似缺口） | L2/L3 | P1 | ⬜ |

## L. 前端健壮性 / Smoke / PWA

| ID | 验证内容 | 期望 | Layer | 优先级 | 现状 |
|----|----------|------|-------|--------|------|
| L1 | 首页加载 200 + 标题 + 主容器 | 无 JS 错误 | L3 | P0 | ✅(smoke) |
| L2 | 关键按钮存在且可交互 | 录音/时长/源/复制按钮 | L3 | P0 | 🟡(buttons.spec) |
| L3 | 自动复制 `performAutoCopy` | 转录完成后按开关自动复制 | L3 | P2 | ⬜ |
| L4 | 通知权限/发送 | 转录完成通知（如授权） | L4 | P2 | ⬜ |
| L5 | PWA manifest / 离线壳 | manifest 有效、可安装 | L3 | P2 | ⬜ |
| L6 | 静态资源 `?v=` 缓存版本一致 | index.html 里 script/style 版本号已同步 | **smoke/lint**（非 L2 集成） | P1 | ⬜ |

## M. 移动端 / iOS / 音频健康恢复

| ID | 验证内容 | 期望 | Layer | 优先级 | 现状 |
|----|----------|------|-------|--------|------|
| M1 | 移动设备布局/源选择器隐藏（v63） | 与现有 mobile spec 一致 | L3 | P1 | 🟡 |
| M2 | 息屏/切后台后 mic 恢复（AUDIO-HEALTH） | 恢复录音、track 可用性检测 | L4 | P1 | 🟡 |
| M3 | AudioContext suspended → resume | 检测到挂起自动 resume | L3 | P2 | ⬜ |
| M4 | iOS Safari 自动暂停提示 | 显示 iOS 警告 | L4 | P2 | ⬜ |

## N. 转录质量 / 幻觉过滤（后端）

| ID | 验证内容 | 期望 | Layer | 优先级 | 现状 |
|----|----------|------|-------|--------|------|
| N1 | 静音/杂音幻觉过滤 | no_speech_prob/compression_ratio/avg_logprob 阈值过滤 | L1 | P1 | ⬜ |
| N2 | 空/无语音返回友好文本 | "未识别到文字"而非报错 | L1/L2 | P2 | ⬜ |
| N3 | whisper-1 选型不回归（**限麦克风路径**） | 麦克风 fallback 主力保持 whisper-1；系统音路径**故意**用 gpt-4o-transcribe-diarize，勿误伤 | L1(断言) | P2 | ⬜ |

## O. 失败路径与健壮性（review 补充，线上最易真实炸掉、原清单整类缺失）

| ID | 验证内容 | 期望 | Layer | 优先级 | 现状 |
|----|----------|------|-------|--------|------|
| O1 | IndexedDB 打开失败（隐私模式/Safari ITP/被禁） | startRecording(v121) 捕获存储失败 → 清晰提示"无法使用本地存储"，不再误报成"麦克风权限"；契约测试锁定 clearAll 以 reject 暴露失败 | L0 | P0 | ✅ `storage-resilience-eval.spec.ts`（代码修复+契约测试；完整 UX 因 alert 阻塞插件、人工核验） |
| O2 | 录音中 `saveChunk` 抛 QuotaExceeded | 不静默丢整段、录音继续或明确告警 | L0 | P1 | ⬜ |
| O3 | `startRecording` 中 `clearAll()` reject（script.js:3010） | 仍能开始新录音或给错误，不卡死 | L0 | P1 | ⬜ |
| O4 | 上传超时中止 | `uploadForTranscription` 加 AbortController，超 120s 主动中止、抛超时错（修 v121） | L2 | P0 | ✅ `upload-resilience-eval.spec.ts` |
| O5 | 上传失败重试 | 超时+重试集中到 `uploadForTranscription`：网络/超时/5xx 重试一次，4xx（429/413/400）不重试；短音频直传路径同样受益（修 v121） | L2 | P1 | ✅ `upload-resilience-eval.spec.ts` |
| O6 | 后端 >25MB 拒绝分支 | `success=false`+"文件太大"文案（server2.py:812-823，HTTP 200 非崩溃），未消耗付费 API | L2 | P0 | ✅ `backend-limits-eval.spec.ts` |
| O7 | 降采样被绕过时的大小兜底 | enforceMaxDuration 解码失败(script.js:1224)且 split 返回 null → 直传原始 WebM 时仍不超 25MB | L0 | P1 | ⬜ |
| O8 | 系统音"共享但无音频轨" | `getAudioTracks().length===0`(script.js:2637) → 用户可见提示、不崩 | L3/L4 | P1 | ⬜ |
| O9 | getDisplayMedia 用户取消 | 取消共享 → 回到就绪态、无异常 | L3 | P1 | ⬜ |
| O10 | 非 Chromium 录制能力 | Safari 不支持 webm、`script.js:3030` 无 mp4 回退 → 显式告警或固化"仅 Chromium"前置假设 | L4 | P1 | ⬜ |
| O11 | 极长挂机 + 首块空洞 | 数小时后 `[firstChunk,...tail]`(script.js:3415) 拼接 WebM（首尾时间戳数小时空洞）→ decode 时长/内容仍可用、enforceMaxDuration 取尾正确 | L0/L3 | P1 | ⬜ |
| O12 | 内存 chunk 增长 | 长录音 `allChunks`/memoryMonitor 不无界增长（IndexedDB 有滚动清理，内存数组需确认） | L3/L4 | P2 | ⬜ |
| O13 | 开始录音双击竞态 | `getUserMedia` 未决期间双击不产生两个 recorder | L3 | P1 | ⬜ |
| O14 | 空/超短录音早退提示 | chunks<5 且跨度<500ms、或 blob<10KB → alert 不上传（script.js:3431-3450） | L0 | P1 | ⬜ |
| O15 | 转录中点录音被拦 | `isTranscribing` 时点击弹提示、不重复触发（script.js:2380） | L3 | P2 | ⬜ |
| O16 | 分段并发乱序重组 | 双 worker 乱序完成时 `results[i]` 按 startSec 顺序拼接正确（script.js:1365-1391） | L0 | P1 | ⬜ |

## P. 漏掉的核心产品行为（FEATURES 承诺、原清单未覆盖）

| ID | 验证内容 | 期望 | Layer | 优先级 | 现状 |
|----|----------|------|-------|--------|------|
| P1 | 转录文本可编辑且本地不被覆盖 | FEATURES:191 承诺：编辑后不被新转录/重录覆盖 | L3 | P1 | ⬜ |
| P2 | 历史关键词搜索 | FEATURES:249 承诺 Searchable，需验证搜索命中 | L3 | P1 | ⬜ |
| P3 | B4 的调用方集成断言 | `allSilence=true` 时**调用方仍上传**（script.js:3469-3471），不因 VAD 怀疑静音而丢录音 | L0/L3 | P0 | ⬜ |
| P4 | 自动复制 + 页面隐藏延迟 | `document.hidden` 时暂存、window.focus 后触发（script.js:3569）；剪贴板权限被拒不崩 | L3 | P2 | ⬜ |

---

## ⚙️ L0 前置假设（脆弱点，务必固化）

L0 harness 依赖 `enforceMaxDuration`/`trimLeadingSilence`/`encodeMonoSamplesToWav` 等**顶层函数声明**
在经典脚本下隐式挂到 `window`。**一旦 `script.js` 被包进 IIFE 或改成 ES module，全部 L0 静默失效。**
→ 每个 L0 spec 的 beforeEach 已断言这些函数存在（见现有 spec），保留此守卫；若未来重构模块化，需显式
导出测试接口。

---

## 现状汇总

- **已建（✅）**：A1, A2, B1 + smoke(L1)。共 3 条核心 eval + 冒烟。
- **待建 P0（最该先补）**：A4, A7(主链路), B4/P3, B5, C3, D1, E1, E4, G3(已修正), H1/H2/H3/H6, K2a/K6, L1/L2, O1/O4/O6。
- **建议实施顺序**：先补 A/B/C/D 的 L0 → 再补 O（失败路径，很多可 L0）→ 再补 H/K 的 L1/L2（后端逻辑）→ 最后 E/F/M/P 的 L3/L4（真实浏览器/手动）。

## 📋 Review 修订记录（2026-07-21，两个独立 agent 评审后）
- **G3 硬伤修正**：麦克风优先级第 3 位是 **Google 不是 Deepgram**（两 agent 独立发现；连带修了 CLAUDE.md）。
- **H5 删除**：`is_temporary_error` 是死代码，"临时错误重试"机制不存在。
- **N3 限定**：只对麦克风路径；系统音故意用 gpt-4o-diarize。
- **B8 拆分**：仅裁剪/截取路径出 16kHz WAV，passthrough 路径原样上传原始格式。
- **A7 归位**：真正主链路的 cutoff 过滤是内联逻辑、不可 L0；enforceMaxDuration 只是兜底。
- **新增 O（16 条失败路径）、P（4 条漏掉的产品行为）**、K6/K7（XFF 伪造 / 429 契约）、G5（Both 源）、K2 拆双窗口。
- **可断言化**：E1、K4 等给了明确判据。

## 开放问题（待与 owner 确认）
1. L1 后端单元测试是否值得引入 pytest（目前测试栈是 Playwright/TS，后端零单测）？→ H/K/O6 都要它。
2. L3 fake-mic 注入（Chrome `--use-file-for-fake-audio-capture`）是否纳入 CI，还是只做 Chrome 插件手动跑？
3. N（幻觉过滤）阈值是否稳定到值得写断言，还是易变、只做冒烟？（review 建议：只做存在性断言、不锁数值）
4. **是否为 A7 把内联 cutoff 过滤抽成纯函数**（换来 L0 可测性，代价是小重构）？
5. **O4/O5 疑似真实缺陷**（上传无超时、直传无重试）——先修代码还是先写会红的测试锁定？
6. **G3 暴露 `api_fallback.py:1378-1381` docstring 与代码矛盾**——要不要顺手修那段代码注释？
