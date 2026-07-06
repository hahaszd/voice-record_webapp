import { test, expect } from '@playwright/test';

/**
 * 音频流健康判定（修复"长时间挂机/系统休眠后录到静音或点不上"）
 * 关键不变量：休眠后麦克风轨道常变成 muted=true 但 readyState 仍为 'live'，
 * 必须把这种轨道判为"不可用"，否则会复用它录到一片静音。
 */
test('muted "live" track is treated as unusable', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(400);

  const r = await page.evaluate(() => {
    const mk = (readyState: string, muted: boolean) => ({ readyState, muted, enabled: true });
    const stream = (t: any) => ({ getAudioTracks: () => (t ? [t] : []) });
    return {
      // @ts-ignore — top-level helpers defined in script.js
      liveUnmuted: isTrackUsable(mk('live', false)),
      // @ts-ignore
      liveMuted: isTrackUsable(mk('live', true)),
      // @ts-ignore
      ended: isTrackUsable(mk('ended', false)),
      // @ts-ignore
      streamUsable: isStreamUsable(stream(mk('live', false))),
      // @ts-ignore
      streamMuted: isStreamUsable(stream(mk('live', true))),
      // @ts-ignore
      logIsFn: typeof logAudioHealth === 'function',
    };
  });

  expect(r.liveUnmuted).toBe(true);
  expect(r.liveMuted).toBe(false);   // ← the fix
  expect(r.ended).toBe(false);
  expect(r.streamUsable).toBe(true);
  expect(r.streamMuted).toBe(false);
  expect(r.logIsFn).toBe(true);
});
