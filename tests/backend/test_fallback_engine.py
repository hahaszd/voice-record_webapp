"""
🎯 转录降级引擎 EVAL（后端 pytest）— api_fallback.transcribe_with_fallback

覆盖清单里的 G3 / H1 / H2 / H3 / H4 / H6：
  G3  麦克风优先级：OpenAI Whisper → AI Builder → Google（第3位是 Google，不是 Deepgram）
  H1  主 API 成功即返回，不调用后续
  H2  主 API 失败 → 依次降级
  H3  配额耗尽检测 → 跳过该 API（并回归 v121 修复的 AI Builder NameError 崩溃）
  H4  配额重检间隔 QUOTA_RECHECK_INTERVAL(1h)
  H6  全部失败 → 抛结构化异常

做法：monkeypatch 掉 _transcribe_openai/_ai_builder/_google 为可控 async mock，
只测优先级/降级/配额逻辑，不打真实 API、不需要 key。

运行：./venv/bin/pytest        （pytest.ini 已限定 testpaths=tests/backend, asyncio_mode=auto）
"""
import time

import pytest

import api_fallback as af


@pytest.fixture(autouse=True)
def reset_status():
    """每个用例前重置全局配额状态，避免测试间串扰。"""
    snap = dict(af.API_FALLBACK_STATUS)
    for k in ("openai_quota_exceeded", "ai_builder_quota_exceeded", "deepgram_quota_exceeded"):
        af.API_FALLBACK_STATUS[k] = False
    for k in ("openai_last_check", "ai_builder_last_check", "deepgram_last_check"):
        af.API_FALLBACK_STATUS[k] = None
    yield
    af.API_FALLBACK_STATUS.clear()
    af.API_FALLBACK_STATUS.update(snap)


def _ok(text, calls=None, name=None):
    async def f(*a, **k):
        if calls is not None:
            calls.append(name)
        return text, {"mock": name}
    return f


def _fail(msg, calls=None, name=None):
    async def f(*a, **k):
        if calls is not None:
            calls.append(name)
        raise Exception(msg)
    return f


def _patch(monkeypatch, openai=None, ai=None, google=None):
    if openai is not None:
        monkeypatch.setattr(af, "_transcribe_openai", openai)
    if ai is not None:
        monkeypatch.setattr(af, "_transcribe_ai_builder", ai)
    if google is not None:
        monkeypatch.setattr(af, "_transcribe_google", google)


# ---------------------------------------------------------------- H1
async def test_h1_primary_success_no_fallback(monkeypatch):
    calls = []
    _patch(monkeypatch,
           openai=_ok("OPENAI_OK", calls, "openai"),
           ai=_fail("不该被调用", calls, "ai"),
           google=_fail("不该被调用", calls, "google"))
    text, api_used, meta = await af.transcribe_with_fallback(b"x", "f.wav")
    assert api_used == "openai_whisper"
    assert calls == ["openai"]  # 主 API 成功后不再调用后续


# ---------------------------------------------------------------- G3 + H2
async def test_g3_priority_order_third_is_google(monkeypatch):
    calls = []
    _patch(monkeypatch,
           openai=_fail("openai down", calls, "openai"),
           ai=_fail("ai down", calls, "ai"),
           google=_ok("GOOGLE_OK", calls, "google"))
    text, api_used, meta = await af.transcribe_with_fallback(b"x", "f.wav")
    assert calls == ["openai", "ai", "google"]  # 顺序：Whisper → AI Builder → Google
    assert api_used == "google"                 # 第3位是 Google，不是 Deepgram（纠正文档硬伤）


async def test_h2_openai_fails_to_ai_builder(monkeypatch):
    calls = []
    _patch(monkeypatch,
           openai=_fail("openai down", calls, "openai"),
           ai=_ok("AIB_OK", calls, "ai"),
           google=_fail("不该被调用", calls, "google"))
    text, api_used, meta = await af.transcribe_with_fallback(b"x", "f.wav")
    assert api_used == "ai_builder"
    assert calls == ["openai", "ai"]  # Google 未被调用


# ---------------------------------------------------------------- H3
async def test_h3_openai_quota_skipped_on_next_call(monkeypatch):
    # 第一次：OpenAI 配额错误 → 标记 quota_exceeded 并降级
    _patch(monkeypatch,
           openai=_fail("insufficient_quota", None, "openai"),
           ai=_ok("AIB_OK", None, "ai"),
           google=_fail("nope", None, "google"))
    await af.transcribe_with_fallback(b"x", "f.wav")
    assert af.API_FALLBACK_STATUS["openai_quota_exceeded"] is True

    # 第二次：OpenAI 应被 should_retry_api 跳过、不再调用
    calls = []
    _patch(monkeypatch,
           openai=_fail("本应被跳过", calls, "openai"),
           ai=_ok("AIB_OK", calls, "ai"),
           google=_fail("nope", calls, "google"))
    text, api_used, meta = await af.transcribe_with_fallback(b"x", "f.wav")
    assert "openai" not in calls  # 配额耗尽 → 跳过
    assert api_used == "ai_builder"


async def test_ai_builder_quota_fallsthrough_to_google_no_crash(monkeypatch):
    """回归 v121 修复：AI Builder 配额错误原会因 API_BUILDER_STATUS 笔误抛 NameError、
    导致整个 fallback 崩溃。修复后应优雅降级到 Google 并正确标记配额状态。"""
    calls = []
    _patch(monkeypatch,
           openai=_fail("openai down", calls, "openai"),
           ai=_fail("insufficient_quota", calls, "ai"),
           google=_ok("GOOGLE_OK", calls, "google"))
    text, api_used, meta = await af.transcribe_with_fallback(b"x", "f.wav")
    assert api_used == "google"                                       # 未崩，降级成功
    assert af.API_FALLBACK_STATUS["ai_builder_quota_exceeded"] is True
    assert af.API_FALLBACK_STATUS["ai_builder_last_check"] is not None  # 1446 行确实成功执行


# ---------------------------------------------------------------- H4
def test_h4_quota_recheck_interval():
    af.API_FALLBACK_STATUS["openai_quota_exceeded"] = True
    af.API_FALLBACK_STATUS["openai_last_check"] = time.time()
    assert af.should_retry_api("openai") is False  # 间隔内跳过

    af.API_FALLBACK_STATUS["openai_last_check"] = time.time() - (af.QUOTA_RECHECK_INTERVAL + 1)
    assert af.should_retry_api("openai") is True    # 过了 1h 间隔可重试


# ---------------------------------------------------------------- H6
async def test_h6_all_fail_raises(monkeypatch):
    _patch(monkeypatch,
           openai=_fail("openai down"),
           ai=_fail("ai down"),
           google=_fail("google down"))
    with pytest.raises(Exception) as ei:
        await af.transcribe_with_fallback(b"x", "f.wav")
    assert "所有转录" in str(ei.value)


# ---------------------------------------------------------------- is_quota_exceeded 单元
def test_is_quota_exceeded_detection():
    # 关键词检测——实际 fallback 路径走的就是这条：is_quota_exceeded(None, error_msg)
    assert af.is_quota_exceeded(None, "insufficient_quota") is True
    assert af.is_quota_exceeded(None, "You exceeded your quota") is True
    assert af.is_quota_exceeded(None, "rate_limit_exceeded") is True
    # 状态码检测：仅当 error_message 非空时才会走到（402/429）
    assert af.is_quota_exceeded(429, "too many requests") is True
    assert af.is_quota_exceeded(402, "payment declined") is True
    # ⚠️ 已知短路：空 error_message 直接返回 False，即使状态码是 429（函数开头 `if not error_message`）。
    #   实际路径 error_msg 总是非空异常字符串，故无影响；此处固化该契约避免误改。
    assert af.is_quota_exceeded(429, "") is False
    assert af.is_quota_exceeded(200, "ok") is False
    assert af.is_quota_exceeded(None, "") is False
