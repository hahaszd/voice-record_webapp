import { test, expect } from '@playwright/test';

/**
 * 🎯 主链路 chunk 选择 EVAL (A7) — selectRecentChunks 纯函数
 *
 * 这是主转录链路真正决定"选 1 分钟却别转出好几分钟旧内容"的逻辑（v116 修的那个 bug）。
 * 原先内联在 generateAndPlayAudio 里、耦合 IndexedDB 无法单测；v121 抽成纯函数 selectRecentChunks
 * 后可离线 L0 覆盖。之前的 recording-segment-eval 只覆盖了兜底 enforceMaxDuration，本 spec 补上主链路。
 *
 * 模型：录音每秒 1 个 chunk，timestamp = 0,1000,2000,... ms（v116 以最后一个 chunk 时间戳为时间轴末端）。
 * ⚠️ 需要 app 在 http://localhost:8000 运行。
 */

async function select(page: any, totalSec: number, requestedSec: number) {
  return page.evaluate(
    ({ totalSec, requestedSec }: any) => {
      const chunks = Array.from({ length: totalSec + 1 }, (_, i) => ({ timestamp: i * 1000 }));
      const r = (window as any).selectRecentChunks(chunks, requestedSec);
      return {
        len: r.chunksToUse.length,
        cutoffTime: r.cutoffTime,
        lastChunkTs: r.lastChunkTs,
        addedFirstChunk: r.addedFirstChunk,
        firstTs: r.chunksToUse[0]?.timestamp,
        secondTs: r.chunksToUse[1]?.timestamp,
        minRecentTs: Math.min(...r.chunksToUse.slice(1).map((c: any) => c.timestamp)),
      };
    },
    { totalSec, requestedSec }
  );
}

test.describe('主链路 chunk 选择 eval (A7)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const ok = await page.evaluate(() => typeof (window as any).selectRecentChunks === 'function');
    expect(ok, 'selectRecentChunks 未挂在全局').toBe(true);
  });

  test('录 30s、选 60s → cutoff=0，全部保留', async ({ page }) => {
    const r: any = await select(page, 30, 60);
    console.log('[A7-KEEP-ALL]', JSON.stringify(r));
    expect(r.cutoffTime).toBe(0);
    expect(r.len).toBe(31); // 0..30s = 31 个 chunk
    expect(r.addedFirstChunk).toBe(false);
  });

  test('录 120s、选 30s → 只保留最后 30s + WebM 头块，丢中间旧块', async ({ page }) => {
    const r: any = await select(page, 120, 30);
    console.log('[A7-KEEP-TAIL]', JSON.stringify(r));
    expect(r.cutoffTime).toBe(90000); // 120000 - 30000
    expect(r.addedFirstChunk).toBe(true); // 头块不在最近窗口内 → 被补进来
    expect(r.firstTs).toBe(0); // 第一个 chunk（WebM 头部）必须保留
    expect(r.secondTs).toBe(90000); // 紧跟其后的是最近窗口第一块
    expect(r.minRecentTs).toBe(90000); // 除头块外，其余全部 ≥ cutoff（中间旧块被丢弃）
    expect(r.len).toBe(32); // 头块 + 最近 31 块(90..120s)
  });

  test('边界：录 30s、选 30s → cutoff=0，全保留（含头块，不重复补）', async ({ page }) => {
    const r: any = await select(page, 30, 30);
    console.log('[A7-BOUNDARY]', JSON.stringify(r));
    expect(r.cutoffTime).toBe(0);
    expect(r.addedFirstChunk).toBe(false);
    expect(r.len).toBe(31);
  });

  test('空列表 → 空结果，不抛错', async ({ page }) => {
    const r: any = await page.evaluate(() => {
      const x = (window as any).selectRecentChunks([], 30);
      return { len: x.chunksToUse.length, cutoffTime: x.cutoffTime };
    });
    console.log('[A7-EMPTY]', JSON.stringify(r));
    expect(r.len).toBe(0);
    expect(r.cutoffTime).toBe(0);
  });
});
