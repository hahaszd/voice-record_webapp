"""
🎯 幻觉过滤 EVAL（后端 pytest）— EVAL_CHECKLIST 的 N1

覆盖 `api_fallback.py` 的两层幻觉过滤（v114 / v122 / v129）：
  第 1 层 文本级 `_scrub_hallucination_phrases`  —— 作用于最终文本，**与模型无关**
  第 2 层 段落级 `_filter_hallucinated_segments` —— 依赖 verbose_json 的 segments，
                                                    **只有 whisper-1 提供**

为什么这些测试重要：v122/v129 是为两起真实用户报告打的补丁，上线时**只有手工验证**，
至今零自动化兜底；而 v122 的开头段落阈值按代码注释自陈是"未经真实数据验证的保守推断"，
迟早要按真实 Railway 日志调整——调整时必须有东西守住"不能误删真实语音"这条底线。

⚠️ **写法约定（照 EVAL_CHECKLIST review 结论）：断言行为与不变式，不锁具体阈值数值。**
阈值是要调的；被锁死的数值只会让人改测试去迁就代码，反而失去保护作用。所以：
  · 明确该丢/该留的用例一律使用**极端取值**，任何合理阈值下结论都不变；
  · 「开头更严格」这条用**扫描比较**验证集合包含关系，完全不依赖具体数字。

运行：./venv/bin/pytest        （pytest.ini 已限定 testpaths=tests/backend）
"""
import pytest

import api_fallback as af


# ---------------------------------------------------------------------------
# 工具：造一个 verbose_json 段落
# ---------------------------------------------------------------------------
def seg(text, start=0.0, end=2.0, no_speech=0.01, compression=1.0, logprob=-0.1):
    return {
        "text": text,
        "start": start,
        "end": end,
        "no_speech_prob": no_speech,
        "compression_ratio": compression,
        "avg_logprob": logprob,
    }


# 极端取值：任何合理阈值下都必然被判为幻觉 / 必然被保留
JUNK = dict(no_speech=0.99, compression=9.0, logprob=-5.0)
GOOD = dict(no_speech=0.001, compression=1.0, logprob=-0.05)


# ===========================================================================
# 第 2 层：段落级过滤 _filter_hallucinated_segments
# ===========================================================================
class TestSegmentFilter:

    def test_全部正常的段落原样保留并按顺序拼接(self):
        segments = [
            seg("我现在先把这个想法记下来", start=0.0, **GOOD),
            seg("然后再看看要不要展开", start=2.0, **GOOD),
        ]
        out = af._filter_hallucinated_segments(segments)
        assert out == "我现在先把这个想法记下来 然后再看看要不要展开"

    def test_v122真实案例_开头幻觉碎词被剥离而正文完整保留(self):
        """2026-07-24 用户报告：录音从"我现在先把..."开始，却转出
        "響鐘 響鐘 栏目 主席 我现在先把..." —— 开头几个不成句的碎词，后面完全正常。
        这是与"整段都是幻觉"不同的形状，v122 的开头段落判据就是为它加的。"""
        segments = [
            seg("響鐘 響鐘 栏目 主席", start=0.0, **JUNK),
            seg("我现在先把这个想法记下来", start=1.5, **GOOD),
        ]
        out = af._filter_hallucinated_segments(segments)
        assert "響鐘" not in out, "开头的幻觉前缀应被剥离"
        assert out == "我现在先把这个想法记下来", "正文必须完整保留，不能连带删掉"

    def test_全部段落都是幻觉时抛异常_以便上层降级到下一个API(self):
        """返回空字符串是不够的——必须抛，`transcribe_with_fallback` 才会去试下一个 API。"""
        segments = [seg("you", start=0.0, **JUNK), seg("you", start=2.0, **JUNK)]
        with pytest.raises(Exception, match="所有段落均为非语音/幻觉内容"):
            af._filter_hallucinated_segments(segments)

    # 扫描网格：三个指标各取一串值，覆盖阈值可能落在的整个区间。
    # 不锁任何单一数字，但足以刻画"判定区域"的形状。
    _GRID = [
        dict(no_speech=nsp, compression=cr, logprob=lp)
        for nsp in (0.0, 0.3, 0.55, 0.75, 0.85, 0.95)
        for cr in (1.0, 1.5, 2.1, 2.3, 2.6, 3.5)
        for lp in (-0.05, -0.5, -0.8, -1.2, -2.0)
    ]

    def _dropped_set(self, leading: bool):
        """返回在指定位置会被丢弃的指标组合集合。

        待测段落之外总是搭一个必然保留的伴随段落，避免"全部被丢"抛异常干扰扫描。
        """
        out = set()
        for metrics in self._GRID:
            probe = seg("待测", start=0.0 if leading else 10.0, **metrics)
            filler = seg("正常语句", start=20.0, **GOOD)
            segments = [probe, filler] if leading else [filler, probe]
            if "待测" not in af._filter_hallucinated_segments(segments):
                out.add(tuple(sorted(metrics.items())))
        return out

    def test_不变式_开头段落判定严于非开头段落(self):
        """v122 的核心行为，**不锁具体阈值**。

        在三个指标构成的网格上比较"放在开头会被丢"与"放在中间会被丢"两个集合：
          · 非开头集合必须 ⊆ 开头集合 —— 开头只能更严，绝不能更松；
          · 且必须是**真子集** —— 存在只在开头被丢的组合，否则位置感知形同虚设。

        ⚠️ 为什么要跨三个指标扫描：只扫 `no_speech_prob` 是抓不到"阈值被放松"的。
        非开头规则是**合取**（两指标同时命中），开头是**析取**，所以即使把开头的数字
        改得和非开头一模一样，开头依旧"更严"，单指标扫描会假绿。`compression_ratio`
        在两边都是单指标析取（2.0 vs 2.4），它才是能照出阈值放松的那一维。
        （这不是推测——用变异测试验过：把开头三个阈值放松成非开头的值，本用例会红。）
        """
        leading, trailing = self._dropped_set(True), self._dropped_set(False)
        assert trailing <= leading, "非开头被丢的组合，开头也必须被丢（开头只能更严）"
        assert leading - trailing, "必须存在只在开头被丢的组合 —— 否则 v122 的位置感知失效"

    def test_不变式_compression维度上开头阈值必须真的更低(self):
        """**唯一能照出"开头阈值被放松"的用例** —— 变异测试逼出来的。

        为什么前两条不变式抓不到：非开头是**合取**、开头是**析取**，所以只要把
        `no_speech` 或 `logprob` 调高，开头依然会因析取而"更严"，
        "存在只在开头被丢的组合"恒成立 —— 即使三个阈值被放松成与非开头完全相同。
        （变异测试实测：那样改，前两条不变式全绿。）

        `compression_ratio` 是**两边都用单指标析取**的那一维（开头 >2.0 / 非开头 >2.4），
        只有把其余指标压到无害、单独看它，才能验证"开头的门槛确实更低"。

        依旧不锁具体数字：只要求**存在**某个 compression 取值，在开头被丢、在非开头被留。
        """
        found = []
        for cr in (1.2, 1.6, 2.0, 2.1, 2.2, 2.3, 2.4, 2.5, 3.0):
            benign = dict(no_speech=0.0, logprob=-0.05)      # 其余两维压到绝不触发
            filler = seg("正常语句", start=20.0, **GOOD)
            lead = af._filter_hallucinated_segments(
                [seg("待测", start=0.0, compression=cr, **benign), filler])
            trail = af._filter_hallucinated_segments(
                [filler, seg("待测", start=10.0, compression=cr, **benign)])
            if "待测" not in lead and "待测" in trail:
                found.append(cr)

        assert found, (
            "找不到任何 compression_ratio 取值满足'开头丢、非开头留' —— "
            "说明开头段落的 compression 阈值不再低于非开头，v122 的位置感知已被放松"
        )

    def test_不变式_存在只因位置不同而结论相反的取值(self):
        """更强的一条：必须存在某个指标组合，**同样的数值**在开头被判幻觉、在中间被保留。

        这正是 v122 要解决的形状（"幻觉前缀 + 正常正文"），也是调阈值时最容易破坏的性质。
        """
        only_leading = self._dropped_set(True) - self._dropped_set(False)
        assert only_leading, "找不到任何'开头丢、非开头留'的取值，位置感知已失效"

    def test_v114教训_非开头段落单个弱指标不足以删段(self):
        """v114 的血泪：曾经单指标就删段，导致长静音后"脱轨"的**真实语音**被整段误删。
        非开头段落必须两个指标同时命中才丢。这里 no_speech 极高但 logprob 正常 → 保留。"""
        segments = [
            seg("正常开头", start=0.0, **GOOD),
            seg("长静音之后用户确实说了这句话", start=30.0,
                no_speech=0.99, compression=1.0, logprob=-0.05),
        ]
        out = af._filter_hallucinated_segments(segments)
        assert "长静音之后用户确实说了这句话" in out, "单一弱指标不得删除非开头段落"

    def test_第0段但起始时间较晚时不按开头规则处理(self):
        """`is_leading` 要求 `i == 0` **且** `start < 3.0`。第 0 段若开始得晚（例如前面被
        VAD 裁掉了静音），它就不是"音频最开头"，应回到宽松的非开头判据。

        边界取值不写死：从网格里**探测**出一个"按开头判会丢、按非开头判会留"的组合，
        再验证仅把 `start` 从 0.0 改成 5.0 就足以改变结论。调阈值不会让这条失效。
        """
        candidates = self._dropped_set(True) - self._dropped_set(False)
        assert candidates, "前置条件：需要存在位置敏感的取值（见位置不变式用例）"
        metrics = dict(next(iter(sorted(candidates))))

        early = [seg("待测", start=0.0, **metrics), seg("陪衬", start=20.0, **GOOD)]
        late = [seg("待测", start=5.0, **metrics), seg("陪衬", start=20.0, **GOOD)]

        assert "待测" not in af._filter_hallucinated_segments(early), \
            "start<3.0 的第 0 段应按开头严判"
        assert "待测" in af._filter_hallucinated_segments(late), \
            "start>=3.0 的第 0 段不应按开头严判（VAD 裁掉静音后的正常语音会被误删）"

    def test_空段落列表会抛异常_且该路径在生产中不可达(self):
        """记录真实行为，而不是想当然的预期。

        空列表时 `filtered_count == segments_count` 成立（0 == 0），于是走抛异常分支。
        乍看像 bug，实际上：
          1. **生产不可达**——`_transcribe_openai` 在 `api_fallback.py:886` 有
             `if not text: raise Exception("OpenAI API 返回空文本")` 守卫，空转录早就抛了；
             而 Whisper 的 verbose_json 不会给出"有文本却零段落"的组合。
          2. **即便到达，抛异常也是安全结果**——上层 `transcribe_with_fallback` 会降级到
             下一个 API，比静默返回空文本给用户更好。
        故意不改生产代码来迁就一个更"好看"的返回值。
        """
        with pytest.raises(Exception, match="所有段落均为非语音/幻觉内容"):
            af._filter_hallucinated_segments([])

    def test_段落缺字段时用默认值不崩溃(self):
        """真实 API 响应不保证字段齐全，缺字段不能让整条转录链崩掉。"""
        assert af._filter_hallucinated_segments([{"text": "只有文本"}]) == "只有文本"

    def test_log_tag参数不影响过滤结果(self):
        """v122 让 OpenAI 与 AI Builder 共用此函数，仅日志前缀不同，判定必须完全一致。"""
        segments = [seg("響鐘 響鐘", start=0.0, **JUNK), seg("正常内容", start=1.5, **GOOD)]
        a = af._filter_hallucinated_segments(list(segments), log_tag="OPENAI-FILTER")
        b = af._filter_hallucinated_segments(list(segments), log_tag="AI-BUILDER-FILTER")
        assert a == b == "正常内容"


# ===========================================================================
# 第 1 层：文本级过滤 _scrub_hallucination_phrases
# ===========================================================================
class TestTextScrub:

    def test_v129真实案例_栏目栏目栏目被判为幻觉并清空(self):
        """2026-07-23 用户报告：息屏挂机约 10 小时后麦克风静默，转出 "栏目 栏目 栏目"。
        它不在当时的硬编码黑名单里 → v129 加了通用重复检测。"""
        assert af._scrub_hallucination_phrases("栏目 栏目 栏目") == ""

    def test_误伤防护_中文口语的紧凑重复必须保留(self):
        """通用重复正则要求重复项之间**有分隔符**，正是为了放过这类真实语音。"""
        for real_speech in ["对对对 我明白了", "好的好的好的", "对对对"]:
            assert af._scrub_hallucination_phrases(real_speech) == real_speech, \
                f"{real_speech!r} 是真实口语，不得被删"

    def test_误伤防护_重复夹在正常句子中不触发(self):
        """通用重复正则用 ^…$ 锚定整段，只有"整段别无他物"时才判幻觉。"""
        text = "我说 好 好 好 然后我们就开始了"
        assert af._scrub_hallucination_phrases(text) == text

    def test_重复不足三次不触发(self):
        """正则要求 {2,} 次额外重复（即总计 ≥3 次）。两次是常见口语强调。"""
        text = "栏目 栏目"
        assert af._scrub_hallucination_phrases(text) == text

    def test_明镜频道片尾套话被剥离(self):
        text = "这是我真正说的内容 请不吝点赞订阅转发打赏支持明镜与点点"
        out = af._scrub_hallucination_phrases(text)
        assert "明镜" not in out and "点赞" not in out
        assert "这是我真正说的内容" in out, "套话之外的真实内容必须保留"

    def test_空输入原样返回(self):
        assert af._scrub_hallucination_phrases("") == ""

    def test_正常中文转录完全不受影响(self):
        text = "今天想到一个点子，可以把录音和笔记打通，回头整理进 Obsidian。"
        assert af._scrub_hallucination_phrases(text) == text
