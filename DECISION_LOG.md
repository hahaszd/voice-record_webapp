# 🗂️ VoiceSpark — 决策与变更日志

**这是"回头查"用的流水账，不是每次开工都要读的文档。** 按时间**倒序**追加，只增不改
（写错了就补一条订正，不要retro-edit历史条目 —— 这是 log，不是现状描述）。

## 什么进这里，什么不进

| 情况 | 记到哪 |
|------|--------|
| **有代码改动** | `VERSION_HISTORY.md`（按 vNNN）—— 这里最多留一行指针 |
| **无代码改动、但影响项目** | **本文件** ← 决策、**否决的方向**、设计调整、运维/配置/密钥变更、外部依赖变化 |
| **还没做的事** | `BACKLOG.md` |
| **测试覆盖缺口** | `tests/EVAL_CHECKLIST.md` |

判断标准一句话：**"三个月后有人问『当时为什么这么定』，这条能答上吗？"** 能，就记。

**否决的方向一定要记**（含否掉的理由）—— 这是本文件价值最高的部分，防止同一个问题被反复重新讨论。

**条目类型**：`决策` · `否决` · `运维` · `方向` · `发现`（查明的重要事实）

---

## 2026-07-28

**`发现` 受限 key 权限验证通过 —— 生产未受影响**
`test_model_ab.py` 第 0 步实测：`whisper-1` HTTP 200、`gpt-4o-transcribe-diarize` HTTP 200。
父级 Model capabilities = Request 足够覆盖 `/v1/audio/transcriptions`。原地改生产 key 这次没出事，
但下次仍应走"新建→验证→切换"。

**`发现` 转录模型 A/B 实测结果（whisper-1 vs gpt-4o-mini-transcribe-2025-12-15）**
四项实测，**候选在每一项上都不劣于或优于现役**：

| 维度 | whisper-1（现役） | gpt-4o-mini-transcribe-2025-12-15（候选） |
|---|---|---|
| 中文内容准确率 | 正确 | 正确（内容完全一致） |
| **繁简体** | **输出繁體**（"我想錄幾句話…"） | **输出简体**（"我想录几句话…"） |
| **静音幻觉** | **吐出 `'you'`**（no_speech=0.94） | **输出为空** ✅ |
| 极低噪音 | 空 | 空 |
| 延迟 | 2.0–11.1s | 0.8–2.4s |
| verbose_json segments | 有 | **无** → v122 段落层过滤失效 |

关键细节：
- **繁简体差异不受 `language` 参数影响** —— `language=auto` 和 `language=zh` 两次结果相同。
  且**代码里没有任何繁转简处理**（已 grep 确认），所以 whisper-1 的繁體是直接给到用户的。
  对简体中文用户这是持续的体验损耗，此前未被识别为问题。
- **静音幻觉这一项是决定性的**：whisper-1 对纯静音吐出 `'you'`，v122 过滤器确实拦下了 —— 但拦
  的方式是**抛异常触发 fallback**，会白白再打一次 AI Builder/Google。候选直接返回空，根本不需要
  过滤器介入。也就是说 v122/v129 那一堆补丁，很大程度是在给 whisper-1 擦屁股。
- 90s 长音频两者都正确（数字写法不同：`10秒` vs `十秒`，均无误）。

**样本局限（务必知道）**：只测了 2 个仓库自带音频 + 2 个合成静音文件，都是干净录音。
**未覆盖**：真实嘈杂环境、系统音路径、口音、中英混说。繁简体结论只有 1 句话 ×2 次。

**`方向` 新增铁律 #3：发现活文档过时就当场改，不许只是"提一句"**
起因很具体：同一次会话里读到 CLAUDE.md 写着"**Not present locally**: no `.env`"，转头就在仓库里
看到 `.env` 躺着，只在回话里说了句"那条已过时"就继续往下做 —— 没修。同一轮还发现 CLAUDE.md 说
`script.js` 是"~v113"，实际已经 v122。铁律 #1/#2 都不触发这种情况（没改代码、也不是决策），
所以补第三条。
**边界**：只管活文档 + tracker；`DECISION_LOG.md`/`VERSION_HISTORY.md`/168 个冻结历史文档"过时"
是设计如此，**不许 retro-edit**。改之前先核对代码/文件系统，别用一个错的替换另一个错的。
太大或没把握就写进 BACKLOG，不许静默丢掉。

**`运维` OpenAI key 权限已收紧（owner 于 2026-07-28 操作，⚠️ 是在生产 key 上原地改的）**
配置：Model capabilities（父级）= Request，父级以外全部 None。
**实测确认：父级设为 Request 后，7 个子项会自动级联成 Request/Write，无法单独关掉。**
（此前不确定 UI 是否允许父级=Request + 子项=None，现在有答案了：不允许。）
→ 实际效果：挡住 Fine-tuning / Videos / Batch / Files / Vector Stores；**挡不住**
chat/embeddings/images。这是当前 OpenAI 受限 key 能做到的最细粒度，见下方"否决"条。
⚠️ **是原地改的生产 key，而非"新建→验证→切换"**，所以改完到验证之间生产可能已在静默降级
（OpenAI 路径失败会无声降级到 AI Builder/Google，不报错）。验证脚本 `test_model_ab.py` 的
第 0 步就是打这两个生产模型，跑通即确认无碍。

**`发现` 本地 `.env` 存在但 API key 全为空**
`.env`（946B，7-06 创建）里 `OPENAI_API_KEY`/`DEEPGRAM_API_KEY`/`AI_BUILDER_TOKEN` **都是空值**，
只有 `AI_BUILDER_API_BASE`/`DEPLOY_ENVIRONMENT`/`PORT` 有值。真实 key 只在 Railway 环境变量里。
结论没变（本地跑不了付费 API），但 CLAUDE.md 原来写的"no `.env`"是错的，已按铁律 #3 修正。
本地要调付费 API 时，让 owner 在自己终端 `export`，不要写进 `.env`。

**`发现` 活文档漂移：FEATURES.md 的转录技术描述长期是错的**
FEATURES.md 写着转录用 "Google Cloud Speech-to-Text API"，实际是两条各自带降级链的路径
（麦克风 `whisper-1`→AI Builder→Google；系统音 `gpt-4o-transcribe-diarize`→Google→Deepgram）。
按铁律"代码与文档不一致时以代码为准"已修正。→ 代码变更见 `VERSION_HISTORY.md` v122 补录。

**`发现` 7-24 的两笔改动（v122/v129）上线时没同步活文档**
违反了 CLAUDE.md 铁律 #1。本次补齐 VERSION_HISTORY / FEATURES / CLAUDE / EVAL_CHECKLIST。
**这次漏记直接催生了铁律 #2**（见下条）—— 说明只靠"记得写"不可靠，必须挂在 handover 强制执行点上。

**`方向` 新增铁律 #2：讨论产生的决策/待办当场落文档**
起因：本次会话产出三条有后续动作的结论（key 限权、预算上限、模型 A/B），但**都没有代码改动**，
铁律 #1 根本不触发 → 它们会随会话消失。新建 `BACKLOG.md`（还没做的）+ `DECISION_LOG.md`（本文件，
已发生的），写进 CLAUDE.md，并在 `/handover` skill 加强制步骤。
**同时定下防腐规则**：handover 必须清理 BACKLOG 中已完成/作废的条目 —— 只增不删的待办文档会烂成
`INDIE_DEVELOPER_ROADMAP.md` 那样没人看的快照。

**`否决` 无法给"转录"单独开 OpenAI key 权限 —— 粒度不存在**
原计划是只放行 `/v1/audio/transcriptions`、其余全 None。实际查明：OpenAI 受限 key 的
Model capabilities 展开只有 7 项（`/v1/responses`、`/v1/audio/speech`(TTS)、`/v1/realtime`、
`/v1/chat/completions`、`/v1/embeddings`、`/v1/images`、`/v1/moderations`），**`/v1/audio/transcriptions`
不在其中**，它归父级 `model.request` scope 管。
→ **改为**：父级 Model capabilities 设 Request，父级以外全部 None。能挡住 Fine-tuning/Videos/Batch/
Files/Vector Stores（泄露后最烧钱的入口），**挡不住 chat/images**（父级一开就全通）。
→ 因此追加"给 Project 设预算上限"作为更强防线，见 `BACKLOG.md`。

**`决策` 限权要新建 key，不在生产 key 上原地改**
scope 给错不会报错停机，而是 OpenAI 路径静默失败、降级到 AI Builder/Google —— 表现为"还能用但
质量悄悄变差"，很难察觉。故：新建 → 脚本验证两条路径 → 换 Railway 变量 → 删旧 key。

**`决策` 不盲换麦克风路径的转录模型，先做 A/B**
`gpt-4o-mini-transcribe-2025-12-15` 宣称幻觉比 Whisper v2 少 ~90%、且"中文（普通话）尤其强"，
正好命中本项目选 whisper-1 的原因和一直在打的补丁。**但**该系列不支持 `verbose_json`，换了会
**静默废掉** v122 的段落级过滤。当初选 whisper-1 是基于真实中文测试，厂商自述不足以直接推翻。
→ 先用真实录音 A/B，系统音 diarize 路径不动。详见 `BACKLOG.md`。

**`发现` 系统音 diarize 调用参数正确，无需改动**
核查 `api_fallback.py:269` 已正确设置 `chunking_strategy: 'auto'`（文档要求音频 >30s 时必需）。
曾怀疑是缺陷，实测不是。记此条以免下次重查。
