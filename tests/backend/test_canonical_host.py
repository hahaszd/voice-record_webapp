"""
🎯 非规范域名 301（后端 pytest）— v125

背景（GSC URL Inspection，2026-07-28，首页）：
    User-declared canonical  : https://voicespark.app/
    Google-selected canonical: https://web-production-37d30.up.railway.app/   ← Google 选了它
    Page indexing            : Page is not indexed: Duplicate, Google chose different canonical

Railway 除自定义域名外还会分配一个 `*.up.railway.app` 域名，两个都对外可访问、内容完全相同。
Railway 域名返回的 HTML **已经**声明 canonical 指向 voicespark.app，Google 依然选了它——
**canonical 只是建议，301 才是指令**。

⚠️⚠️ **本文件存在的头号理由：判据绝不能依赖 `DEPLOY_ENVIRONMENT`。**
v125 首版按 `os.getenv('DEPLOY_ENVIRONMENT') == 'production'` 判断生产，
**部署后线上一次都没触发** —— 因为**生产环境根本没设这个变量**
（`server2.py` 里 SHOW_DOCS 的注释早就写着：「v120 首版用的是 == 'production'，
结果生产上该变量没设」）。同一个坑在同一个仓库里踩了两次。
现在改为**只看 Host**，配置漏设也不会失效；下面有用例专门钉死这一点。

直接调判定函数与中间件，不起服务、不打网络、不依赖任何环境变量。
"""
import os

import pytest

import server2 as srv


class _FakeURL:
    def __init__(self, path, query=""):
        self.path = path
        self.query = query


class _FakeRequest:
    def __init__(self, host, path="/", query="", method="GET"):
        self.headers = {"host": host}
        self.url = _FakeURL(path, query)
        self.method = method


async def _call(request):
    """跑一次 canonical 中间件；未拦截时 call_next 返回哨兵对象。"""
    sentinel = object()

    async def call_next(_):
        return sentinel

    result = await srv.canonical_host_middleware(request, call_next)
    return None if result is sentinel else result


PROD_RAILWAY = "web-production-37d30.up.railway.app"


class TestShouldRedirect:
    """纯判定函数 —— 只看 Host"""

    def test_railway生产域名要跳(self):
        assert srv._should_redirect_to_canonical(PROD_RAILWAY) is True

    def test_规范域名不跳(self):
        assert srv._should_redirect_to_canonical(srv.CANONICAL_HOST) is False

    def test_dev域名不跳(self):
        """`web-dev-9821.up.railway.app` 是独立 dev 环境，跳到生产会毁掉 dev 验证流程。"""
        assert srv._should_redirect_to_canonical(srv.DEV_HOST) is False

    def test_本地Host一律不跳(self):
        for host in ("localhost", "127.0.0.1", "0.0.0.0", "testserver"):
            assert srv._should_redirect_to_canonical(host) is False, host

    def test_未知外部域名不跳_fail_open(self):
        """宁可漏跳，也不要把没预料到的流量甩走（例如将来新增的自定义域名）。"""
        for host in ("example.com", "some-cdn.net", "voicespark.app.evil.com"):
            assert srv._should_redirect_to_canonical(host) is False, host

    def test_空Host不跳(self):
        assert srv._should_redirect_to_canonical("") is False

    def test_任意其它railway自动域名都跳(self):
        """Railway 若重新生成域名（名字会变），规则仍然生效。"""
        assert srv._should_redirect_to_canonical("web-production-abcde.up.railway.app") is True


class TestMiddleware:

    async def test_railway域名被301到规范域名(self):
        r = await _call(_FakeRequest(PROD_RAILWAY))
        assert r is not None and r.status_code == 301
        assert r.headers["location"] == "https://voicespark.app/"

    async def test_跳转保留路径与query(self):
        r = await _call(_FakeRequest(PROD_RAILWAY, path="/faq.html", query="a=1&b=2"))
        assert r.headers["location"] == "https://voicespark.app/faq.html?a=1&b=2"

    async def test_带端口的Host也能正确判定(self):
        assert await _call(_FakeRequest("voicespark.app:443")) is None
        assert await _call(_FakeRequest(f"{PROD_RAILWAY}:443")) is not None

    async def test_规范域名与本地不跳(self):
        assert await _call(_FakeRequest("voicespark.app")) is None
        assert await _call(_FakeRequest("localhost:8000")) is None

    async def test_只跳GET和HEAD(self):
        """301 会让部分客户端把 POST 改写成 GET。SEO 只关心 GET/HEAD，别动其它方法。"""
        for method in ("POST", "PUT", "PATCH", "DELETE", "OPTIONS"):
            assert await _call(_FakeRequest(PROD_RAILWAY, path="/transcribe-segment",
                                            method=method)) is None, method
        assert await _call(_FakeRequest(PROD_RAILWAY, method="HEAD")) is not None


class TestNoEnvDependency:
    """⚠️ 回归测试：判据绝不能依赖 DEPLOY_ENVIRONMENT（v125 首版就栽在这）"""

    @pytest.mark.parametrize("env", [None, "", "production", "development", "staging", "PRODUCTION"])
    async def test_任何DEPLOY_ENVIRONMENT取值下行为都不变(self, monkeypatch, env):
        """生产环境实际上**没有**设这个变量。行为必须与它完全无关 ——
        否则配置漏设时中间件静默失效，线上重复域名照旧、首页继续掉索引。"""
        if env is None:
            monkeypatch.delenv("DEPLOY_ENVIRONMENT", raising=False)
        else:
            monkeypatch.setenv("DEPLOY_ENVIRONMENT", env)

        assert srv._should_redirect_to_canonical(PROD_RAILWAY) is True
        assert srv._should_redirect_to_canonical(srv.CANONICAL_HOST) is False
        assert srv._should_redirect_to_canonical("localhost") is False
        r = await _call(_FakeRequest(PROD_RAILWAY))
        assert r is not None and r.status_code == 301

    def test_源码中该中间件不得引用DEPLOY_ENVIRONMENT(self):
        """静态检查：把环境判断重新引进来会让线上再次静默失效。"""
        src = open(os.path.join(os.path.dirname(__file__), "..", "..", "server2.py"),
                   encoding="utf-8").read()
        start = src.index("def _should_redirect_to_canonical")
        end = src.index("return await call_next(request)", start)
        block = src[start:end]
        assert "DEPLOY_ENVIRONMENT" not in block, \
            "规范域名判定不得依赖 DEPLOY_ENVIRONMENT —— 生产上该变量没设，会导致静默失效"
