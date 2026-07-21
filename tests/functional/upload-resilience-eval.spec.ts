import { test, expect } from '@playwright/test';

/**
 * 🎯 上传健壮性 EVAL — 锁定 O4（超时）/ O5（重试）修复（v121）
 *
 * 被测：全局 `window.uploadForTranscription`（script.js）。它现在自带
 *   - 超时：AbortController，超 timeoutMs 主动中止（修 O4——裸 fetch 挂起→前端永久转圈）
 *   - 有限重试：网络错误/超时/5xx 重试一次；4xx（429/413/400）确定性失败不重试（修 O5）
 *
 * 做法：在页面里覆盖 `window.fetch` 模拟各种服务器响应，调用真实的
 * uploadForTranscription，断言"抛没抛、抛的是什么、调了几次 fetch"。完全离线、确定性、无需真实后端。
 *
 * ⚠️ 需要 app 在 http://localhost:8000 运行。
 */

type UploadResult = { threw: boolean; calls: number; success?: boolean; msg?: string };

async function runUpload(
  page: any,
  mode: 'timeout' | 'retry5xx' | '429' | 'neterr' | 'ok',
  ctrl: { timeoutMs?: number; retries?: number }
): Promise<UploadResult> {
  return page.evaluate(
    async ({ mode, ctrl }: any) => {
      const blob = new Blob([new Uint8Array(20000)], { type: 'audio/wav' });
      const opts = { durationSec: 5, audioSource: 'microphone', language: 'auto' };
      const json = (obj: any) =>
        new Response(JSON.stringify(obj), { status: 200, headers: { 'Content-Type': 'application/json' } });
      const orig = window.fetch;
      let calls = 0;
      window.fetch = ((_url: any, o: any) => {
        calls++;
        switch (mode) {
          case 'timeout': // 永不 resolve，但尊重 abort 信号 → 交给 AbortController 超时
            return new Promise((_res, rej) =>
              o.signal.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')))
            );
          case 'retry5xx': // 第1次 500（可重试），第2次 200
            return calls === 1
              ? Promise.resolve(new Response('server boom', { status: 500 }))
              : Promise.resolve(json({ success: true, text: 'ok' }));
          case '429': // 4xx 确定性失败，不应重试
            return Promise.resolve(new Response('rate limited', { status: 429 }));
          case 'neterr': // 网络错误，可重试；这里始终失败
            return Promise.reject(new TypeError('Failed to fetch'));
          case 'ok':
            return Promise.resolve(json({ success: true, text: 'hi' }));
        }
      }) as any;

      let result: any;
      try {
        const r = await (window as any).uploadForTranscription(blob, opts, ctrl);
        result = { threw: false, calls, success: !!(r && r.success) };
      } catch (e: any) {
        result = { threw: true, calls, msg: e.message };
      } finally {
        window.fetch = orig;
      }
      return result;
    },
    { mode, ctrl }
  );
}

test.describe('上传健壮性 eval (O4/O5, v121)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const ok = await page.evaluate(() => typeof (window as any).uploadForTranscription === 'function');
    expect(ok, 'uploadForTranscription 未挂在全局（script.js 结构变了？）').toBe(true);
  });

  test('O4：服务器挂起 → 超时中止（不永久转圈）', async ({ page }) => {
    const r = await runUpload(page, 'timeout', { timeoutMs: 500, retries: 0 });
    console.log('[O4-TIMEOUT]', JSON.stringify(r));
    expect(r.threw).toBe(true);
    expect(r.msg).toMatch(/超时/);
    expect(r.calls).toBe(1); // retries:0 → 只发一次
  });

  test('O5：5xx 服务端错误 → 重试后成功', async ({ page }) => {
    const r = await runUpload(page, 'retry5xx', { retries: 1 });
    console.log('[O5-RETRY-5XX]', JSON.stringify(r));
    expect(r.threw).toBe(false);
    expect(r.success).toBe(true);
    expect(r.calls).toBe(2); // 500 → 重试 → 200
  });

  test('O5：网络错误 → 重试一次后仍失败', async ({ page }) => {
    const r = await runUpload(page, 'neterr', { retries: 1 });
    console.log('[O5-NETERR]', JSON.stringify(r));
    expect(r.threw).toBe(true);
    expect(r.calls).toBe(2); // 原始 + 重试一次
  });

  test('O5：4xx（429 限流）→ 不重试，立即抛', async ({ page }) => {
    const r = await runUpload(page, '429', { retries: 1 });
    console.log('[O5-NO-RETRY-429]', JSON.stringify(r));
    expect(r.threw).toBe(true);
    expect(r.msg).toMatch(/429/);
    expect(r.calls).toBe(1); // 4xx 确定性失败，不重试
  });

  test('正常路径：一次成功', async ({ page }) => {
    const r = await runUpload(page, 'ok', { retries: 1 });
    console.log('[OK]', JSON.stringify(r));
    expect(r.threw).toBe(false);
    expect(r.success).toBe(true);
    expect(r.calls).toBe(1);
  });
});
