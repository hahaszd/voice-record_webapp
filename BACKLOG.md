# 📌 VoiceSpark — Backlog

**这是活文档。** 它管的是**还没做、但已经影响未来动作**的东西 —— 待办、需要 owner 拍板的事。
讨论一旦产生这类结果，**当场写进这里**（CLAUDE.md 铁律 #2）。

## 边界（别和别的 tracker 打架）

| 文档 | 管什么 | 读的频率 |
|------|--------|----------|
| **`BACKLOG.md`**（本文件） | **还没做的**：待办、待 owner 决策的事 | **常读** |
| `HANDOVER.md` | 上次会话的**接力棒**（存在时先读，读完删/重写） | 开工先读 |
| `DECISION_LOG.md` | **已发生的、无代码改动的**：决策、否决的方向、运维变更 + **✅已验证结论速查** | 查证/提问前读速查区 |
| `VERSION_HISTORY.md` | **已经做完的代码变更**（按 vNNN） | 回头查时才读 |
| `tests/EVAL_CHECKLIST.md` | **测试/eval 覆盖缺口** —— 测试类待办归它，这里只放指针 | 常读 |
| `README`/`FEATURES`/`ARCHITECTURE`/`CLAUDE` | **当前是什么样**（现状，不是计划） | 常读 |

**不收录**：纯过程性讨论、临时想法、已完成的事、**已否决的方向**（后者归 `DECISION_LOG.md`
速查区，那里才是"别再提这个"的权威位置；两处都写必然分叉）。

**条目做完时**：从本文件移走 → 有代码改动记进 `VERSION_HISTORY.md`，无代码改动记进 `DECISION_LOG.md`。

⚠️ **只增不删这份文档就会烂掉。** 每次 `/handover` 必须清理：做完的移走、作废的删掉并注明原因。
（前车之鉴：`INDIE_DEVELOPER_ROADMAP.md` 曾是认真的规划，现在是没人看的冻结快照。）

**状态图例**：🔵 待办 · 🟡 进行中 · 🔴 卡在 owner 决策

---

## 🔐 安全 / 运维

### 🔵 给 OpenAI Project 设预算上限（2026-07-28）— **owner 操作**

**为什么重要**：受限 key 挡不住 `chat`/`images`（转录归父级 `model.request` scope，父级一开
7 个子项就全通，无法单独关 —— 已实测，见 `DECISION_LOG.md` 速查区）。
**预算上限是比 scope 更强的防线** —— 不管怎么泄露，损失被硬顶住。对本产品这种匿名无登录、
无法用 API key 认证的形态尤其贴合（现有防线只有按 IP 限流，见 CLAUDE.md 的 security posture）。

**待办**：把 key 放进独立 OpenAI Project → 设月度预算上限（量级参考 $20）。纯控制台操作，无代码改动。

---

## 🌐 SEO

### 🔴 GSC 收尾：确认首页恢复索引（2026-07-28）— **owner 操作 + 需等待**

v125 已上线并实测生效（Railway 域名 301 到 `voicespark.app`），重复源已消除。剩下的是走完 GSC 流程：

1. 那条「Duplicate, Google chose different canonical than user」→ **VALIDATE FIX**
2. 首页 URL Inspection → **REQUEST INDEXING**（催重爬；只点 VALIDATE FIX 会慢很多）
3. 重爬后**复查 "Google-selected canonical"** —— 变成 `https://voicespark.app/` 才算彻底解决
   （此前实测值是 `https://web-production-37d30.up.railway.app/`）

Google 重爬通常**数天到两周**，完成会发邮件。若验证失败，第一步就是回到第 3 步看实测值。

---

## 🎙️ 转录质量

### 🔵 `'you'` 静音幻觉可提前到文本层（2026-07-28）

**现状**：纯静音 30s 下 `whisper-1` 输出 `'you'`，且 **`temperature=0` 对此无效**（带不带都吐）。
v122 段落层过滤**能拦住**（`leading no_speech_prob=0.94`），但拦法是**抛异常触发 fallback**，
会白白再打一次 AI Builder/Google。

**待办**：把这类单词级静音幻觉加进 `_HALLUCINATION_PHRASES` 文本层，直接返回空而不走 fallback，
省一次 API 调用。

⚠️ **风险**：`'you'` 是极常见的英文单词，**必须锚定整段**（`^you$` 之类）才能加，
否则会误删真实语音 —— 参见 v114 的教训。
`tests/backend/test_hallucination_filter.py` 已有误伤防护用例，可直接扩。

---

## 🧪 已知测试缺口（详见 `tests/EVAL_CHECKLIST.md`，此处只放指针）

- **N2**：全幻觉时最终要给用户看到"未识别到文字"。⚠️ N1 已完成，但**只验到"过滤器抛异常触发
  降级"这一层**，N2 是端到端行为，**没被覆盖**。
- **M2**：录音中途 mic 自动换流（v122 只做了提醒，未做恢复）。
