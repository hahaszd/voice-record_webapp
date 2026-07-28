# 📌 VoiceSpark — Backlog & Decisions

**这是活文档。** 它管的是**还没做、但已经影响未来动作**的东西 —— 待办、已定方向的决策、
需要 owner 拍板的事。讨论一旦产生这三类结果，**当场写进这里**（CLAUDE.md 铁律 #2）。

## 边界（别和别的 tracker 打架）

| 文档 | 管什么 | 读的频率 |
|------|--------|----------|
| **`BACKLOG.md`**（本文件） | **还没做的**：待办、待 owner 决策的事、方向 | **常读** |
| `DECISION_LOG.md` | **已发生的、无代码改动的**：决策、否决的方向、运维/密钥/配置变更 | 回头查时才读 |
| `VERSION_HISTORY.md` | **已经做完的代码变更**（按 vNNN）—— 条目做完就从本文件移走 | 回头查时才读 |
| `tests/EVAL_CHECKLIST.md` | **测试/eval 覆盖缺口** —— 测试类待办归它，不要在这里重复 | 常读 |
| `README`/`FEATURES`/`ARCHITECTURE`/`CLAUDE` | **当前是什么样**（现状，不是计划） | 常读 |

**不收录**：纯过程性讨论、临时想法、已完成的事。
**条目做完时**：从本文件移走 → 有代码改动记进 `VERSION_HISTORY.md`，无代码改动记进 `DECISION_LOG.md`。

⚠️ **只增不删这份文档就会烂掉。** 每次 `/handover` 必须清理：做完的移走、作废的删掉并注明原因。
（前车之鉴：`INDIE_DEVELOPER_ROADMAP.md` 曾是认真的规划，现在是没人看的冻结快照。）

**状态图例**：🔵 待办 · 🟡 进行中 · 🔴 卡在 owner 决策 · ⚫️ 已否决（保留理由，防止重复讨论）

---

## 🔐 安全 / 运维

### 🟡 收紧 OpenAI API Key 权限（2026-07-28）—— **权限已改，待验证**

> **状态更新 2026-07-28**：owner 已在**生产 key 上原地修改**权限（父级 Model capabilities = Request、
> 其余 None；实测子项会自动级联成 Request/Write，无法单独关）。**尚未验证生产是否仍正常**。
> ⚠️ 权限给窄了不会报错停机，只会静默降级到 AI Builder/Google —— **必须跑一次验证**：
> ```bash
> export OPENAI_API_KEY='sk-...'      # 在你自己的终端，别写进 .env
> ./venv/bin/python test_model_ab.py  # 第 0 步即验证生产两个模型
> ```
> 跑通后把本条移入 `DECISION_LOG.md` 并从这里删掉。

**为什么重要**：key 泄露后最烧钱的入口是 Fine-tuning / Videos(Sora) / Batch / Files / Vector Stores，
目前 key 是 All 权限，全都敞开。

**已查明的事实**（省得下次重查）：
- 全项目只调用**一个** OpenAI endpoint：`POST /v1/audio/transcriptions`
  （`api_fallback.py:257` diarize、`api_fallback.py:839` whisper-1）。无 chat/embeddings/files/assistants。
- **受限 key 的 UI 里没有 `/v1/audio/transcriptions` 的独立开关**。展开 Model capabilities 只有 7 项：
  `/v1/responses`、`/v1/audio/speech`(TTS，不是我们用的)、`/v1/realtime`、`/v1/chat/completions`、
  `/v1/embeddings`、`/v1/images`、`/v1/moderations`。
- 转录归**父级 `model.request` scope** 管，即 **Model capabilities 那一行**。所以能做到的最细粒度就是：
  父级设 Request，父级以外全部 None。

**待办**：
1. **新建**一把受限 key（**不要原地改生产那把** —— scope 给错会让 prod 转录静默降级到 AI Builder/Google，
   不报错、不易察觉）
2. 用验证脚本测通两条路径（`whisper-1` + `verbose_json`、`gpt-4o-transcribe-diarize` + `diarized_json`）
   —— 脚本已写但在 scratchpad 里，会随会话销毁，需要时重写（逻辑就是对 `test_voice.mp3` 发两次 curl）
3. 两条都 200 才换 Railway 环境变量，最后删旧 key
4. 权限改动 OpenAI 说要几分钟生效，别改完立刻测

### 🔵 给 OpenAI Project 设预算上限（2026-07-28）

**为什么重要**：scope 限制挡不住 chat/images（父级一开就全通）。**预算上限是比 scope 更强的防线** ——
不管怎么泄露，损失被硬顶住。对本产品这种匿名无登录、无法用 API key 认证的形态尤其贴合
（见 CLAUDE.md 的 security posture：现有防线只有按 IP 限流）。

**待办**：把 key 放进独立 OpenAI Project → 设月度预算上限（量级参考 $20）。纯控制台操作，无代码改动。

---

## 🎙️ 转录质量

### ⚫️ ~~换麦克风路径的转录模型~~ —— **已否决，2026-07-28 结案**

owner 于 2026-02 在真实使用中已逐个试过 OpenAI 主要转录 API，`gpt-4o-transcribe` 与
`gpt-4o-mini-transcribe-2025-12-15` **均已否决**。**继续用 `whisper-1`。**
**除非出现 2026-02 之后的全新模型，否则不要再提、不要再测。** 详见 `DECISION_LOG.md` 速查区。

### ⚫️ ~~繁转简后处理~~ —— **已否决，2026-07-28 结案**

owner 判定 **whisper-1 输出繁體不是毛病**：绝大多数中文用户能读繁體，且**能读简体的人基本都能
读繁體、反之未必**，输出繁體覆盖面反而更广。**不要再提议加繁转简。** 详见 `DECISION_LOG.md`。

### 🔵 whisper-1 静音幻觉：`'you'`（2026-07-28）

实测：纯静音 30s 下 `whisper-1` 输出 `'you'`，且 **`temperature=0` 对此无效**（带不带都吐）。
v122 段落层过滤**能拦住**（`leading no_speech_prob=0.94`），但拦法是**抛异常触发 fallback**，
会白白再打一次 AI Builder/Google。

**待办**：考虑把 `'you'` 这类单词级静音幻觉加进 `_HALLUCINATION_PHRASES` 文本层，
直接返回空而不是走 fallback，省一次 API 调用。
⚠️ 风险：`'you'` 是极常见的英文单词，**必须锚定整段**（`^you$` 之类）才能加，
否则会误删真实语音 —— 参见 v114 的教训。

**为什么重要**：这个模型同时命中本项目的两个核心事实 ——
- 当初选 `whisper-1` 就是因为**中文准确率**（`api_fallback.py:846`），而 OpenAI 明确称新快照
  **"在中文（普通话）上尤其强"**
- 过去两个会话（v122/v129）打的补丁**全是幻觉过滤**，而它宣称噪音/静音场景下
  **幻觉比 Whisper v2 少 ~90%**、比旧版 gpt-4o-transcribe 少 ~70%，Common Voice/FLEURS 上 WER 更低

补充：全尺寸 `gpt-4o-transcribe` **没有** 12-15 快照，mini 反而是目前最新的转录模型。

**⚠️ 换之前必须知道的坑**：`gpt-4o-*-transcribe` 系列**只支持 `json`/`text`，不支持 `verbose_json`**。
v122 的 `_filter_hallucinated_segments` 完全依赖 verbose_json 的 segments，一换模型
`'segments' not in result` → **段落级过滤静默失效**。文本层的 `_HALLUCINATION_PHRASES`（含 v129
通用重复正则）不受影响。该系列有 `logprobs`（whisper-1 没有）可作替代信号重建过滤。

本质是：**用自建幻觉过滤器，换一个原生少 90% 幻觉的模型。**

**推荐做法**：**先 A/B，别盲换。** 当初选 whisper-1 是基于真实中文测试，而"中文尤其强"是厂商自述。
拿真实中文录音（尤其是出过幻觉那两段）同时跑两个模型对比 —— 一次性脚本即可，不碰生产代码。
**系统音 diarize 路径保持不动**（无更新快照，且 speaker 分离只有它能做）。

价格不构成决策因素：whisper-1 $0.006/分钟，mini $1.25/M audio input tokens，5 分钟录音都是几分钱。

---

## 🧪 已知缺口（详见 `tests/EVAL_CHECKLIST.md`，此处只放指针）

- **N1** ⭐ 当前最高性价比：`_filter_hallucinated_segments` 已是纯函数，零 mock 可测，
  而 v122/v129 目前**完全没有自动化测试兜底**，且开头段落阈值是未经真实数据验证的推断。
- **M2**：录音中途 mic 自动换流（v122 只做了提醒，未做恢复）。
