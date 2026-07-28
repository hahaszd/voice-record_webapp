# HANDOVER — 2026-07-28

> 这是**接力棒**，不是维护文档。读完、跟着指针走完之后**删掉或重写它**。
> 过期的 handover 比没有更糟——它看起来很权威。

## 1. 现状

- **全部已提交并推送，`dev` == `main`，生产已部署并验证。** 无半途而废的改动。
- 测试：后端 pytest **31/31**、Playwright **54/54**（functional + smoke-chrome + recording）。
  `mobile` project 有已知历史失败，不阻塞（见 `tests/EVAL_CHECKLIST.md`）。
- 本次两个**运行时**改动，都已在 `voicespark.app` 实测：
  - **v123** cache-bust 自动化（内容哈希注入）——三页面哈希一致、资源可加载。
  - **v124** `/static/*.html` → 301 到规范 URL —— 三个跳转正确、css/js 未被误伤。
- 对生产跑冒烟测试的方式：
  `PLAYWRIGHT_BASE_URL=https://voicespark.app npx playwright test --project=smoke-chrome`
  （只有 smoke 项目能这么跑；`recording` 需要 fake mic。）

## 2. 下一步

**① 查 GSC 验证结果（唯一有时限的事）。** owner 已于 2026-07-28 点击 VALIDATE FIX，
状态 *Validation Started*。Google 重爬通常需**数天到两周**，完成会发邮件。

- **Passed** → v124 生效，把这条从待办移走。
- **Failed** → 第一步是用 **URL Inspection** 查 `/` 的 **Google-selected canonical** 到底是什么。
  ⚠️ 「Google 选的是 `/static/index.html`」目前是**推断不是实测**（依据：全站唯一与 `/`
  内容完全相同的 URL 就是它）。若推断错了，v124 就没打中要害，得重新定位。
- 另需确认 owner 是否做了 **URL Inspection → Request Indexing**（催重新抓取）。只点了
  VALIDATE FIX 的话，重爬可能慢很多。

**② `BACKLOG.md` 里两条，都不紧急：**
- `'you'` 静音幻觉进文本层，省一次 fallback API 调用。⚠️ `'you'` 是极常见英文词，
  **必须锚定整段**（`^you$`）才能加进 `_HALLUCINATION_PHRASES`，否则误删真实语音（v114 教训）。
  `tests/backend/test_hallucination_filter.py` 已有误伤防护用例可直接扩。
- OpenAI Project 预算上限——纯控制台操作，**owner 才能做**。受限 key 挡不住 chat/images。

**③ `tests/EVAL_CHECKLIST.md` 的 N2**：全幻觉时最终要给用户看到"未识别到文字"。
注意 N1 只验到"过滤器抛异常触发降级"这一层，**N2 是端到端行为，没被覆盖**。

## 3. 注意事项（这次踩到的坑的"形状"）

- **验证工具本身可能在骗你。** 差点报出"已对生产验证"，实际 `playwright.config.ts` 的
  `baseURL` 硬编码 localhost，环境变量根本没生效。**声称验证过某个环境之前，先确认工具真打了那里。**
- **别用测不出目标维度的实验去推翻既有结论。** 干净录音室样本做转录模型 A/B，三个模型全对——
  那份测试根本区分不出中文准确率，而那正是 owner 否决候选模型的维度。
- **变异测试不是可选项。** N1 那条"位置感知"不变式看着很稳，实际抓不到阈值被放松（合取 vs
  析取的结构差异让断言恒成立）。v124 的路由顺序坑也是靠变异测试确认能抓到的。
- **不要改生产代码去迁就测试。** 空 segments 抛异常看着可疑，查清是生产不可达且行为更安全，
  于是改测试记录真实行为。
- **靠人脑维护的编号必然漂移。** 能自动算出来的就别让人记（v123 已把 cache-bust 自动化）。

## 4. 等 owner

- **GSC 验证结果**（数天到两周，见上）。
- **确认是否已做 Request Indexing**。
- 备忘：`.env` 里的 `OPENAI_API_KEY` 现为**可用状态**，`test_model_ab.py` 会拿它打真实 API。
  该文件已被 `.gitignore` 忽略、从未进过版本库。

---

**指针**：`BACKLOG.md`（没做的）· `DECISION_LOG.md`（决策/否决 + **✅已验证结论速查**，
动手查证或提问前先读它）· `tests/EVAL_CHECKLIST.md`（测试缺口）· `VERSION_HISTORY.md`（代码变更）·
`CLAUDE.md`（三条铁律 + 架构事实）。
