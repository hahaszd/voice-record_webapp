import { test, expect } from '@playwright/test';

/**
 * 静态资源自动 cache-bust（v123）
 *
 * 背景：以前 `index.html` 里的 `?v=NNN` 要手动维护，漏过至少两次——
 *   1. 语言选择器上线后在生产是没样式的原生按钮（忘记 bump）
 *   2. about/faq 的 `style.css?v=105` 停在 2026-02，而 style.css 7 月改过
 *      → 老访客浏览器里一直是 2 月那份样式表
 * v123 起由 `server2.py` 的 `_inject_asset_versions()` 用内容哈希自动替换。
 *
 * 这个机制**静默失效**的后果很隐蔽：页面照常渲染，只是所有回访用户被永久钉在
 * `?v=auto` 这一个缓存键上，再也拿不到新的 js/css。所以必须有测试盯着。
 */

const HASH = /\?v=[0-9a-f]{10}$/;      // 注入后应为 10 位十六进制内容哈希
const PLACEHOLDER = /\?v=auto/;         // 源文件里的占位符，绝不该出现在响应里

/** 取出页面 HTML 里所有 /static 下的 css/js 引用 */
async function assetRefs(page: any, path: string): Promise<string[]> {
  const res = await page.goto(path);
  expect(res?.status()).toBe(200);
  const html = await page.content();
  return [...html.matchAll(/\/static\/[A-Za-z0-9_.-]+\.(?:css|js)\?v=[^"'\s>]*/g)].map(m => m[0]);
}

test.describe('静态资源自动 cache-bust (v123)', () => {
  for (const path of ['/', '/about.html', '/faq.html']) {
    test(`${path} 的 css/js 引用都带内容哈希，且不残留 ?v=auto`, async ({ page }) => {
      const refs = await assetRefs(page, path);
      expect(refs.length, `${path} 应至少引用一个 /static 下的 css/js`).toBeGreaterThan(0);

      for (const ref of refs) {
        expect(ref, `${ref} 仍是占位符 —— 说明 _inject_asset_versions 没生效`).not.toMatch(PLACEHOLDER);
        expect(ref, `${ref} 不是 10 位内容哈希`).toMatch(HASH);
      }
      console.log(`[ASSET-VERSION] ${path}: ${refs.join(' ')}`);
    });
  }

  test('同一个文件在不同页面拿到同一个哈希（修复 about/faq 陈旧缓存的关键）', async ({ page }) => {
    const pick = (refs: string[]) => refs.find(r => r.includes('style.css'));
    const home = pick(await assetRefs(page, '/'));
    const about = pick(await assetRefs(page, '/about.html'));
    const faq = pick(await assetRefs(page, '/faq.html'));

    expect(home).toBeTruthy();
    expect(about, 'about.html 的 style.css 版本应与首页一致').toBe(home);
    expect(faq, 'faq.html 的 style.css 版本应与首页一致').toBe(home);
  });

  test('哈希与资源实际可加载一致（带哈希的 URL 能取到 200）', async ({ page, request }) => {
    const refs = await assetRefs(page, '/');
    for (const ref of refs) {
      const res = await request.get(ref);
      expect(res.status(), `${ref} 应可正常加载`).toBe(200);
    }
  });
});
