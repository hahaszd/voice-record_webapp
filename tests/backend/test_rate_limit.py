"""
🎯 限流 EVAL（后端 pytest）— server2.rate_limit_middleware

覆盖 K1 / K2a / K2b / K3：
  K1   限流仅作用于 3 个付费路径；其它路径（如 /）无限放行
  K2a  每分钟超 20 → 429 + Retry-After
  K2b  多窗口限流通用逻辑（用 monkeypatch 降阈到 (3600, N) 验证小时窗口分支，不必真打 150 次）
  K3   按客户端 IP 隔离计数（不同 XFF → 各自独立，一个耗尽不影响另一个）

做法：直接调用中间件（传轻量假 request + call_next），测试间重置 _rate_hits。
进程内、非 flaky、不打真实端点、不消耗 API 配额。

运行：./venv/bin/pytest
"""
import pytest

import server2


# ---- 轻量假 request（中间件只用到 .url.path / .headers.get / .client.host） ----
class _URL:
    def __init__(self, path):
        self.path = path


class _Client:
    def __init__(self, host):
        self.host = host


class _Req:
    def __init__(self, path, headers=None, host="1.1.1.1"):
        self.url = _URL(path)
        self.headers = headers or {}
        self.client = _Client(host)


async def _call_next(req):
    return "PASSED"


PAID = "/transcribe-segment"


@pytest.fixture(autouse=True)
def reset_rate_state():
    """每个用例前清空限流计数，保证独立、非 flaky。"""
    server2._rate_hits.clear()
    snap = list(server2.RATE_LIMITS)
    yield
    server2._rate_hits.clear()
    server2.RATE_LIMITS = snap


async def _hit(path, host="9.9.9.9", headers=None):
    return await server2.rate_limit_middleware(_Req(path, headers=headers, host=host), _call_next)


# ---------------------------------------------------------------- K2a
async def test_k2a_per_minute_limit_429():
    # 前 20 次放行
    for i in range(20):
        r = await _hit(PAID, host="20.0.0.1")
        assert r == "PASSED", f"第 {i+1} 次应放行，却被限流"
    # 第 21 次 → 429 + Retry-After
    r = await _hit(PAID, host="20.0.0.1")
    assert getattr(r, "status_code", None) == 429
    assert r.headers.get("Retry-After") is not None


# ---------------------------------------------------------------- K1
async def test_k1_non_paid_path_never_limited():
    # 非付费路径（首页）打 40 次都放行，从不 429
    for i in range(40):
        r = await _hit("/", host="30.0.0.1")
        assert r == "PASSED", f"非付费路径第 {i+1} 次不应被限流"


def test_k1_rate_limited_paths_are_exactly_the_three_paid():
    assert server2.RATE_LIMITED_PATHS == {
        "/transcribe-segment",
        "/speech-to-text",
        "/speech-to-text-aibuilder",
    }


# ---------------------------------------------------------------- K3
async def test_k3_per_client_isolation_via_xff():
    a = {"x-forwarded-for": "40.0.0.1"}
    b = {"x-forwarded-for": "40.0.0.2"}
    # 客户端 A 打满 20 次
    for _ in range(20):
        assert await _hit(PAID, headers=a) == "PASSED"
    # A 第 21 次被限
    assert getattr(await _hit(PAID, headers=a), "status_code", None) == 429
    # 客户端 B 不受影响，仍放行
    assert await _hit(PAID, headers=b) == "PASSED"


# ---------------------------------------------------------------- K2b
async def test_k2b_multi_window_generic_enforcement(monkeypatch):
    # 把限流降到 (3600s, 3)，验证小时窗口分支（不必真打 150 次）
    monkeypatch.setattr(server2, "RATE_LIMITS", [(3600, 3)])
    server2._rate_hits.clear()
    for i in range(3):
        assert await _hit(PAID, host="50.0.0.1") == "PASSED", f"第 {i+1} 次应放行"
    r = await _hit(PAID, host="50.0.0.1")
    assert getattr(r, "status_code", None) == 429  # 第 4 次超 (3600,3) → 429
