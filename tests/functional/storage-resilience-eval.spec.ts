import { test, expect } from '@playwright/test';

/**
 * 🎯 存储健壮性 EVAL (O1) — IndexedDB 不可用时的失败契约
 *
 * 背景：隐私/无痕模式或浏览器禁用本地存储时 `indexedDB.open` 会失败。startRecording (v121) 会捕获
 * 并给出清晰提示"无法使用浏览器本地存储…"，而不是让失败冒泡成误导性的"Cannot access microphone"。
 *
 * 这个提示依赖一个契约：`audioStorage.clearAll()` 必须在 open 失败时**以 reject 暴露失败**
 * （而不是静默 resolve）。本测试锁定该契约——若有人把 audio-storage.js 的错误吞掉，
 * O1 的提示会静默失效、录音会在无存储下继续、最终又退回"No audio data"。
 *
 * 注：`audioStorage` 是经典脚本里的全局 const（在全局词法环境，不挂 window），
 * 在 page.evaluate 里用裸名可解析；下面用 declare 满足 TS。
 *
 * ⚠️ 需要 app 在 http://localhost:8000 运行。
 */

declare const audioStorage: any;

test.describe('存储健壮性 eval (O1)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const ok = await page.evaluate(() => typeof audioStorage === 'object' && audioStorage !== null);
    expect(ok, 'audioStorage 单例不可见（裸名未解析？script.js 结构变了？）').toBe(true);
  });

  test('IndexedDB.open 失败 → clearAll() 以 reject 暴露（非静默 resolve）', async ({ page }) => {
    const outcome = await page.evaluate(async () => {
      const store = audioStorage;
      const origOpen = window.indexedDB.open.bind(window.indexedDB);
      // 强制 open 失败：返回一个 request，稍后触发 onerror
      (window.indexedDB as any).open = function () {
        const req: any = {};
        setTimeout(() => {
          req.error = new DOMException('storage blocked', 'InvalidStateError');
          if (req.onerror) req.onerror();
        }, 0);
        return req;
      };
      store.db = null; // 强制重新 init 走 open

      let didReject = false;
      let didResolve = false;
      try {
        await store.clearAll();
        didResolve = true;
      } catch {
        didReject = true;
      } finally {
        (window.indexedDB as any).open = origOpen;
        store.db = null;
      }
      return { didReject, didResolve };
    });
    console.log('[O1-STORAGE-FAIL]', JSON.stringify(outcome));
    expect(outcome.didReject, 'clearAll 应 reject 以便 startRecording 给出清晰提示').toBe(true);
    expect(outcome.didResolve).toBe(false);
  });
});
