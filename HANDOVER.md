# HANDOVER — 2026-07-28

> 这是**接力棒**，不是维护文档。读完、跟着指针走完之后**删掉或重写它**。
> 过期的 handover 比没有更糟——它看起来很权威。

## 1. 现状

- **全部已提交并推送，`dev` == `main`，生产已部署并逐项验证。** 无半途而废的改动。
- 测试：后端 pytest **50/50**、Playwright **54/54**（functional + smoke-chrome + recording）。
  `mobile` project 有已知历史失败，不阻塞（见 `tests/EVAL_CHECKLIST.md`）。
- 本次三个**运行时**改动，均已在线上实测：
  - **v123** cache-bust 自动化（内容哈希注入）——三页面哈希一致、资源可加载。
  - **v124** `/static/*.html` → 301 到规范 URL。
  - **v125** 非规范域名 → 301 到 `voicespark.app`（**这条才是首页掉索引的真正修复**）。
    实测：Railway 域名 `/`、`/about.html`、`/faq.html?x=1` 全部 301 且保留路径+query；
    `voicespark.app` 三页与静态资源 200；**dev 环境 `web-dev-9821` 不受影响（200）**。
- 对生产跑冒烟测试：
  `PLAYWRIGHT_BASE_URL=https://voicespark.app npx playwright test --project=smoke-chrome`
  （只有 smoke 项目能这么跑；`recording` 需要 fake mic。）

## 2. 下一步

**① GSC 收尾（唯一有时限的事，owner 操作）。** v125 已上线，重复源已消除。需要：
- 那条 issue → **VALIDATE FIX**（之前那次是针对 v124 的，可重新点）
- 首页 URL Inspection → **REQUEST INDEXING**
- 重爬后**再看一眼 "Google-selected canonical"** —— 变成 `https://voicespark.app/`
  才算彻底解决。（当前实测值曾是 `https://web-production-37d30.up.railway.app/`。）
- Google 重爬通常**数天到两周**，完成会发邮件。

**② `BACKLOG.md` 里两条，都不紧急：**
- `'you'` 静音幻觉进文本层，省一次 fallback API 调用。⚠️ `'you'` 是极常见英文词，
  **必须锚定整段**（`^you$`）才能加进 `_HALLUCINATION_PHRASES`，否则误删真实语音（v114 教训）。
  `tests/backend/test_hallucination_filter.py` 已有误伤防护用例可直接扩。
- OpenAI Project 预算上限——纯控制台操作，**owner 才能做**。受限 key 挡不住 chat/images。

**③ `tests/EVAL_CHECKLIST.md` 的 N2**：全幻觉时最终要给用户看到"未识别到文字"。
N1 只验到"过滤器抛异常触发降级"这一层，**N2 是端到端行为，没被覆盖**。

## 3. 注意事项（这次踩到的坑的"形状"）

- **配置类判据要问"生产上这个变量真的设了吗"，而不是"语义上该怎么判"。**
  v125 首版用 `DEPLOY_ENVIRONMENT == 'production'` 判断生产，部署后线上**一次都没触发**——
  生产根本没设这个变量。而 `server2.py` 里 SHOW_DOCS 的注释**早就写着 v120 栽过同样的坑**，
  我当天还读过那段注释。同一个仓库、同一个坑、第二次。
  → 现在判据只看 Host，并有回归测试 + 源码静态检查钉死"不许引用 DEPLOY_ENVIRONMENT"。
- **别把推断写成结论。** 首页掉索引第一次定位成 `/static/index.html` 孪生页（v124），
  实际是 Railway 自动域名（v125）。因为当天把它明确标注为"推断不是实测"并要求 owner
  用 URL Inspection 核实，才在一小时内暴露真因，而不是等两周验证失败。
- **验证工具本身可能在骗你。** 差点报出"已对生产验证"，实际 `playwright.config.ts` 的
  `baseURL` 硬编码 localhost，环境变量没生效。**声称验证过某环境前，先确认工具真打了那里。**
- **变异测试不是可选项。** N1 那条"位置感知"不变式看着很稳，实际抓不到阈值被放松
  （合取 vs 析取的结构差异让断言恒成立）。v124/v125 的坑也都是靠变异测试确认能抓到。
- **不要改生产代码去迁就测试。** 空 segments 抛异常看着可疑，查清是生产不可达且行为更安全，
  于是改测试记录真实行为。
- **canonical 只是建议，301 才是指令。** 今天两次印证：`/static/*.html` 和 Railway 域名
  都声明了正确的 canonical，Google 照样选了别的。

## 4. 等 owner

- **GSC 三步**（VALIDATE FIX / REQUEST INDEXING / 复查 Google-selected canonical），见上。
- **OpenAI Project 预算上限**（控制台操作）。
- 备忘：`.env` 里的 `OPENAI_API_KEY` 现为**可用状态**，`test_model_ab.py` 会拿它打真实 API。
  该文件已被 `.gitignore` 忽略、从未进过版本库。

---

**指针**：`BACKLOG.md`（没做的）· `DECISION_LOG.md`（决策/否决 + **✅已验证结论速查**，
动手查证或提问前先读它）· `tests/EVAL_CHECKLIST.md`（测试缺口）· `VERSION_HISTORY.md`（代码变更）·
`CLAUDE.md`（三条铁律 + 架构事实）。
