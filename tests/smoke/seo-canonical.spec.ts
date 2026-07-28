import { test, expect } from '@playwright/test';

/**
 * SEO 规范 URL（v124）
 *
 * 背景：`static/` 目录被整体挂载，导致每个页面都有一个内容完全相同的孪生 URL
 * （`/static/index.html` 等）。Google 把首页和它的 /static 孪生版归为一组、
 * **自己选了另一个作规范**，GSC 报「Duplicate, Google chose different canonical than user」，
 * 受影响页面是**首页**，状态 "aren't indexed or served on Google"（2026-07-25 检测）。
 *
 * canonical 标签只是建议、可以被 Google 否决；301 是指令。v124 用 301 消灭重复 URL。
 *
 * ⚠️ 这个机制最容易的坏法是**静默失效**：跳转路由必须注册在
 * `app.mount("/static", ...)` 之前（路由按注册顺序匹配）。写到 mount 之后不会报错，
 * 只是 StaticFiles 抢先返回 200，重复页悄悄回来，几周后才在 GSC 上看到后果。
 */

const CANONICAL_HOST = 'https://voicespark.app';

test.describe('SEO 规范 URL (v124)', () => {

  test('/static/*.html 必须 301 到规范 URL（不能 200）', async ({ request }) => {
    const cases: [string, string][] = [
      ['/static/index.html', '/'],
      ['/static/about.html', '/about.html'],
      ['/static/faq.html', '/faq.html'],
    ];

    for (const [from, to] of cases) {
      const res = await request.get(from, { maxRedirects: 0 });
      expect(res.status(), `${from} 应 301 —— 返回 200 说明跳转路由被 StaticFiles 抢走了`
        + `（检查它是否注册在 app.mount 之前）`).toBe(301);
      expect(new URL(res.headers()['location'], 'http://x').pathname,
        `${from} 应跳到 ${to}`).toBe(to);
    }
  });

  test('/static 下的静态资源不受跳转影响，仍正常 200', async ({ request }) => {
    for (const asset of ['/static/style.css', '/static/script.js',
                         '/static/audio-storage.js', '/static/manifest.json']) {
      const res = await request.get(asset);
      expect(res.status(), `${asset} 被误伤了 —— 只该跳 .html`).toBe(200);
    }
  });

  test('三个规范页面自引用 canonical 且指向自己', async ({ page }) => {
    const cases: [string, string][] = [
      ['/', `${CANONICAL_HOST}/`],
      ['/about.html', `${CANONICAL_HOST}/about.html`],
      ['/faq.html', `${CANONICAL_HOST}/faq.html`],
    ];

    for (const [path, expected] of cases) {
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
      expect(canonical, `${path} 的 canonical 不正确`).toBe(expected);
    }
  });

  test('sitemap 只列规范 URL，不含 /static/', async ({ request }) => {
    const res = await request.get('/sitemap.xml');
    expect(res.status()).toBe(200);
    const xml = await res.text();
    expect(xml, 'sitemap 不得出现 /static/ 路径').not.toContain('/static/');
    for (const loc of [`${CANONICAL_HOST}/`, `${CANONICAL_HOST}/about.html`,
                       `${CANONICAL_HOST}/faq.html`]) {
      expect(xml).toContain(loc);
    }
  });

  test('robots.txt 不得 Disallow /static/', async ({ request }) => {
    /**
     * 反直觉但重要：屏蔽 /static/ 会让 Google 爬不到那些页面，
     * **因此也读不到它们的 canonical / 看不到 301**，重复页反而可能留在索引里。
     * Google 明确不推荐用 robots.txt 处理重复内容。
     */
    const res = await request.get('/robots.txt');
    expect(res.status()).toBe(200);
    const txt = await res.text();
    const active = txt.split('\n').filter(l => !l.trim().startsWith('#'));
    expect(active.join('\n')).not.toMatch(/Disallow:\s*\/static/i);
  });
});
