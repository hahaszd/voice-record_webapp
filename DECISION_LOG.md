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

# ✅ 已验证结论速查

**动手查证或提问之前，先读这一节。** 下面每条都已经实测/查证过，**不要重新验证、不要重新问 owner**。
时间久了要复核可以，但要说明为什么怀疑它过时了，别当没查过一样从头再来。

（这一节是**稳定的**，随验证结果更新；下面按日期的流水账才是不可改的历史。）

### 转录模型选型

| 模型 | 验证结论 | 时间 |
|---|---|---|
| `whisper-1` | **现役麦克风主力。** 中文内容准确，但**输出繁體**、纯静音下吐 `'you'` 幻觉。`temperature=0` **对静音幻觉无效**（带不带都吐）。是唯一支持 `verbose_json`/segments 的 —— v122 段落层过滤只对它生效 | 2026-07-28 |
| `gpt-4o-transcribe`（全尺寸 2025-03 版） | **已否决，勿再提。** 2026-02-28 `6c11dff` 从它换回 whisper-1，原因是中文准确率。2026-07-28 补测证实：纯静音下吐 `'Delicious!'`，比 whisper-1 更糟 | 2026-02 + 2026-07-28 |
| `gpt-4o-mini-transcribe-2025-12-15` | **❌ 已否决 —— 别再提，别再测。** owner 于 2026-02 项目启动时把 OpenAI 主要转录 API **在真实使用中**逐个试过，**明确结论：这个版本不行**（中文场景）。2026-07-28 曾据厂商宣传重新提出，被 owner 当场否掉。<br>（2026-07-28 的合成测试显示它简体/静音表现更好，但**该测试用的是干净录音室样本、三个模型全对，根本区分不出中文准确率** —— 无法用来推翻真实使用的结论。快照是钉死版本，2 月不行今天也不行。） | **2026-02 owner 实测**（权威）<br>2026-07-28 复核 |
| `gpt-4o-transcribe-diarize` | **系统音路径主力，不动它。** 无 2025-12 快照，且 speaker 分离只有它能做。已确认 `chunking_strategy='auto'` 设置正确（>30s 必需） | 2026-07-28 |

- **繁简体**：whisper-1 输出繁體，**`language` 参数改不了**（`auto`/`zh` 实测同结果），代码里也没有繁转简处理。
  **⚠️ 这不是缺陷，是 owner 明确接受的行为 —— 不要提议加繁转简。** owner 判断（2026-07-28）：
  绝大多数中文用户能读繁體；**能读简体的人基本都能读繁體，反之未必**，所以输出繁體覆盖面反而更广。
- **A/B 必须按生产参数跑**（whisper-1 要带 `temperature=0`），否则结论失真。工具：`test_model_ab.py`。

### OpenAI API Key

- **全项目只调一个 endpoint**：`POST /v1/audio/transcriptions`，读取点只有 `api_fallback.py:245`（diarize）和 `:831`（whisper-1），均为 `os.environ.get`。**无硬编码、无散落读取、git 全历史无泄露**（`OPENAI_API_SETUP_GUIDE.md:99` 那个 `sk-proj-abcdef...` 是占位符）。
- **受限 key 的粒度到此为止**：`/v1/audio/transcriptions` **没有独立开关**，归父级 `model.request`（= Model capabilities 那一行）管。**父级设 Request 后 7 个子项会自动级联成 Request/Write，无法单独关**（2026-07-28 owner 实测）。→ 能挡 Fine-tuning/Videos/Batch/Files/Vector Stores，**挡不住** chat/embeddings/images。
- **当前受限 key 已验证可用**：`whisper-1`、`gpt-4o-transcribe-diarize` 均 HTTP 200。

### 本地环境

- **`.env` 存在，但代码根本不加载它**：没有 `load_dotenv()`，`requirements.txt` 无 `python-dotenv`。`.env` 唯一被读的地方是 `server2.py:284` 的 `get_ai_builder_token()`，且**只认 `AI_BUILDER_TOKEN=` 一个前缀**。→ `OPENAI_API_KEY` 写进 `.env` **对应用无效**，本地要跑付费 API 得 `export`（或 `set -a && . ./.env`）。

### 📋 OpenAI 批量转录模型完整清单（`/v1/audio/transcriptions`，2026-07-28 查证）

**截至 2026-07-28，OpenAI 没有任何 2026-02 之后发布的批量转录新模型。全部选项如下，已穷尽：**

| 模型 | 能否走 `/v1/audio/transcriptions` | 状态 |
|---|---|---|
| `whisper-1` | ✅ | **现役麦克风主力** |
| `gpt-4o-transcribe` | ✅ | ❌ owner 2026-02 实测否决 |
| `gpt-4o-mini-transcribe`（含 `-2025-12-15`） | ✅ | ❌ owner 2026-02 实测否决 |
| `gpt-4o-transcribe-diarize` | ✅ | 已用于**系统音**路径 |
| `gpt-realtime-whisper` | **❌ 404 `Invalid URL`** | **架构不同，不是权限问题，别重试。** 它是 **streaming** 模型：走 WebSocket/realtime 会话、边说边吐字。VoiceSpark 是 **batch**：录完一段 → 把音频文件 POST 上去 → 拿回整段文本。两者不是同一类东西，不存在"换过去"这个选项。（且 2024-09 发布，比 2 月还早） |

实测记录：`gpt-realtime-whisper` 对 `/v1/audio/transcriptions` 返回
`404 {'message': 'Invalid URL (POST /v1/audio/transcriptions)'}`；探测
`gpt-4o-transcribe-2026`/`gpt-5-transcribe`/`whisper-2` 均为 `model does not exist`。
（`GET /v1/models` 因受限 key 缺 `api.model.read` 返回 403 —— 顺带证明限权确实生效。）

**⏭️ 什么时候值得重新查**：OpenAI 发布**全新**音频/转录模型时（关注 developers.openai.com 的
audio 相关公告）。**在那之前，"有没有更好的 OpenAI 转录 API" 这个问题已有答案：没有，别再查。**

### 📌 麦克风路径模型：结论已定，不要再动

**继续用 `whisper-1`。** OpenAI 现有的转录模型 owner 已于 2026-02 在真实使用中逐个试过，
`gpt-4o-transcribe` 与 `gpt-4o-mini-transcribe-2025-12-15` **均已否决**。
**除非出现 2026-02 之后的全新模型**，否则不要再提"换模型"，也不要再跑对比测试。
whisper-1 的两个已知缺点（繁體输出、静音幻觉）**改用后处理解决，不靠换模型** —— 见 `BACKLOG.md`。

### ⚠️ 已知盲区（这些**还没**被验证，别当成已知）
- **v122/v129 的幻觉过滤逻辑无任何自动化测试**（EVAL_CHECKLIST **N1**），开头段落阈值是未经真实数据验证的推断。

---

## 2026-07-28

**`发现` 受限 key 权限验证通过 —— 生产未受影响**
`test_model_ab.py` 第 0 步实测：`whisper-1` HTTP 200、`gpt-4o-transcribe-diarize` HTTP 200。
父级 Model capabilities = Request 足够覆盖 `/v1/audio/transcriptions`。原地改生产 key 这次没出事，
但下次仍应走"新建→验证→切换"。

**`否决` 繁转简后处理 —— owner 判定"输出繁體不是毛病"，方案作废**
当日早些时候我把 whisper-1 输出繁體当作"体验损耗"提出，建议加 `zhconv` 后处理。owner 否决，理由：
**绝大多数中文用户能读繁體；能读简体的人基本都能读繁體，反之未必** —— 输出繁體的覆盖面反而更广。
这是用户群体认知层面的产品判断，属于 owner 专属决策域，我不该越过它自行定性为"缺陷"。
**后续不要再提议繁转简。**
（唯一残留的未验证疑虑，仅供记录、不作为翻案理由：降级到 Google STT 时可能输出简体，
理论上同一会话内可能出现繁简混排。**没有验证过**，且 owner 未将其视为问题。若哪天真观察到
混排再说。）

**`否决` `gpt-4o-mini-transcribe-2025-12-15` —— owner 2026-02 已实测否决，本次提案作废**
owner 明确说明：2026-02 项目启动时把 OpenAI 主要转录 API **在真实使用中**逐个试过，包括
2025-12-15 这个版本，**结论是不行**（中文场景）。时间线成立（该快照 2025-12 发布，早于 2 月）。
**本次（2026-07-28）据厂商宣传重新提出该模型的方案，就此作废。**
为什么不用当天的测试去反驳：那份 A/B 用的是干净录音室样本，**三个模型全部转对**，
**本就无法区分中文准确率** —— 而这正是 owner 否决它的维度。用一个测不出该维度的实验去推翻
真实使用结论，不成立。且**带日期的快照是钉死版本**，2 月不行今天就不行。
**教训（直接催生了铁律 #2 的 2a/2b）**：这次验证发生在 2026-02、只存在于 owner 记忆里、
git 无任何痕迹 → 五个月后被完整地重新提了一遍，浪费一轮讨论和真金白银的 API 调用。
**已记入速查区，后续不得再提、不得再测。**

**`发现` 澄清：2026-02 否掉的是 `gpt-4o-transcribe`，不是 `gpt-4o-mini-transcribe-2025-12-15`**
（⚠️ 本条为当日早些时候的判断，已被上一条 owner 澄清**部分推翻**：owner 两个都试过。
git 只记录了 `gpt-4o-transcribe` 的切换，是因为 mini-2025-12-15 试完就没提交代码。
保留本条以存档推理过程 —— log 不 retro-edit。）
owner 凭记忆提出"之前试过 2025-12-15 那个，不行"。查证 `6c11dff`(2026-02-28,
"Switch OpenAI transcription **back** to whisper-1")：当时换掉的是 **`gpt-4o-transcribe`**
（全尺寸、2025-03 版，配 `response_format=json` + `chunking_strategy=auto`），
**与候选 `gpt-4o-mini-transcribe-2025-12-15` 是不同模型**。owner 记忆准确，但指向的是另一个模型。
补测证实 owner 当时否得对：`gpt-4o-transcribe` 对纯静音吐出 `'Delicious!'`，比 whisper-1 更糟。

**`发现` 订正上一条 A/B 的方法论缺陷：`temperature=0` 不影响静音幻觉**
生产的 whisper-1 调用带 `temperature=0`（`api_fallback.py:849`，注释称"大幅减少幻觉"），
首轮 A/B **没传这个参数**，结论可能失真。已按生产参数重测：**带不带 `temperature=0`，
whisper-1 对纯静音都输出 `'you'`** —— 首轮结论不受影响，但此后 A/B 必须按生产参数跑。

**`发现` 当前测试样本不足以判定中文准确率（重要局限）**
三个模型（whisper-1 / mini-2025-12-15 / gpt-4o-transcribe）对同一句干净中文**全部转对**，
包括 2 月被否掉的那个。**即本测试无法区分中文准确率**，而这正是 2026-02 决策所依据的维度 ——
当时的判断来自真实使用，非合成样本。**结论：不能仅凭本测试决定换模型。**
→ 定为：改动先只上 `dev`（`web-dev-9821`）真实使用若干天，再决定是否合 main。

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
