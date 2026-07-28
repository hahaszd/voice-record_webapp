"""
🎯 非规范域名 301（后端 pytest）— v125

背景（GSC URL Inspection，2026-07-28，首页）：
    User-declared canonical  : https://voicespark.app/
    Google-selected canonical: https://web-production-37d30.up.railway.app/   ← Google 选了它
    Page indexing            : Page is not indexed: Duplicate, Google chose different canonical

Railway 除自定义域名外还会分配一个 `*.up.railway.app` 域名，两个都对外可访问、内容完全相同。
Railway 域名返回的 HTML **已经**声明 canonical 指向 voicespark.app，Google 依然选了它——
**canonical 只是建议，301 才是指令**。

这些测试守住三件容易出事的事：
  1. 生产下非规范 Host 必须 301（否则重复域名回来，首页可能再次掉出索引）；
  2. **非生产环境绝不能跳** —— 本地不设 DEPLOY_ENVIRONMENT，若默认成 production，
     本地每个请求都会被跳到线上，开发直接废掉；
  3. dev 环境（`web-dev-9821.up.railway.app`）是独立环境，不能被跳到生产域名。

直接调中间件，不起服务器、不打网络。
"""
import importlib

import pytest


def _load_server(monkeypatch, deploy_env):
    """按指定 DEPLOY_ENVIRONMENT 重新导入 server2，拿到对应的 IS_PRODUCTION。"""
    if deploy_env is None:
        monkeypatch.delenv("DEPLOY_ENVIRONMENT", raising=False)
    else:
        monkeypatch.setenv("DEPLOY_ENVIRONMENT", deploy_env)
    import server2
    return importlib.reload(server2)


class _FakeURL:
    def __init__(self, path, query=""):
        self.path = path
        self.query = query


class _FakeRequest:
    def __init__(self, host, path="/", query="", method="GET"):
        self.headers = {"host": host}
        self.url = _FakeURL(path, query)
        self.method = method


async def _call(srv, request):
    """跑一次 canonical 中间件；未拦截时 call_next 返回哨兵对象。"""
    sentinel = object()

    async def call_next(_):
        return sentinel

    result = await srv.canonical_host_middleware(request, call_next)
    return None if result is sentinel else result


class TestProduction:
    """DEPLOY_ENVIRONMENT=production"""

    @pytest.fixture
    def srv(self, monkeypatch):
        return _load_server(monkeypatch, "production")

    async def test_railway生产域名被301到规范域名(self, srv):
        r = await _call(srv, _FakeRequest("web-production-37d30.up.railway.app"))
        assert r is not None and r.status_code == 301
        assert r.headers["location"] == "https://voicespark.app/"

    async def test_跳转保留路径与query(self, srv):
        r = await _call(srv, _FakeRequest("web-production-37d30.up.railway.app",
                                          path="/faq.html", query="a=1&b=2"))
        assert r.headers["location"] == "https://voicespark.app/faq.html?a=1&b=2"

    async def test_规范域名本身不跳(self, srv):
        assert await _call(srv, _FakeRequest("voicespark.app")) is None

    async def test_带端口的规范域名不跳(self, srv):
        assert await _call(srv, _FakeRequest("voicespark.app:443")) is None

    async def test_localhost绝不被跳(self, srv):
        """双保险：即使有人在本地误设 DEPLOY_ENVIRONMENT=production，本地也不能被跳走。"""
        for host in ("localhost", "127.0.0.1", "localhost:8000", "0.0.0.0", "testserver"):
            assert await _call(srv, _FakeRequest(host)) is None, f"{host} 不该被跳转"

    async def test_只跳GET和HEAD_不改写其它方法(self, srv):
        """301 会让部分客户端把 POST 改成 GET。SEO 只关心 GET/HEAD，别动其它方法。"""
        for method in ("POST", "PUT", "PATCH", "DELETE", "OPTIONS"):
            r = await _call(srv, _FakeRequest("web-production-37d30.up.railway.app",
                                              path="/transcribe-segment", method=method))
            assert r is None, f"{method} 不该被 301"
        assert await _call(srv, _FakeRequest("web-production-37d30.up.railway.app",
                                             method="HEAD")) is not None

    async def test_任意非规范域名都跳_不是只针对railway(self, srv):
        r = await _call(srv, _FakeRequest("some-other-host.example.com"))
        assert r is not None and r.status_code == 301


class TestNonProduction:
    """非生产环境（本地、dev）—— 一律不跳"""

    async def test_环境变量未设时不跳(self, monkeypatch):
        """本地跑 server2.py 就是这种情形（代码不加载 .env）。
        若这里跳了，本地开发会被整个重定向到线上。"""
        srv = _load_server(monkeypatch, None)
        assert srv.IS_PRODUCTION is False
        assert await _call(srv, _FakeRequest("web-production-37d30.up.railway.app")) is None

    async def test_dev环境不跳(self, monkeypatch):
        """`web-dev-9821.up.railway.app` 是独立的 dev 环境，跳到生产会毁掉 dev 验证流程。"""
        srv = _load_server(monkeypatch, "development")
        assert await _call(srv, _FakeRequest("web-dev-9821.up.railway.app")) is None

    async def test_IS_PRODUCTION与SHOW_DOCS默认方向相反是有意为之(self, monkeypatch):
        """SHOW_DOCS 是安全开关，fail-closed（缺失按生产、关文档）；
        IS_PRODUCTION 用于重定向，必须 fail-open（缺失按非生产、不跳）。
        两者默认方向相反不是笔误——写反任意一个都会出事。"""
        srv = _load_server(monkeypatch, None)
        assert srv.IS_PRODUCTION is False, "缺失时必须按非生产，否则本地被跳走"
        assert srv.SHOW_DOCS is False, "缺失时必须关闭 API 文档"
