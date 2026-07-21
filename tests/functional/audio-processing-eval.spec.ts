import { test, expect } from '@playwright/test';

/**
 * 🎯 音频处理 EVAL（L0 批次）— 分段/大小/VAD 边界
 *
 * 覆盖清单里几条纯 L0 的 P0/P1：
 *   C1  短音频不分段（≤90s → null，走整段上传）
 *   C3  长音频分段：连续、有序、全覆盖（endSec[i]===startSec[i+1]，无缝隙/重叠）——保证拼接顺序正确
 *   D1  满 5 分钟 16kHz 单声道 WAV < 25MB 上传上限
 *   B4  真静音仍返回 blob、绝不丢弃录音（allSilence=true 但 blob 保留，交后端过滤）
 *   B5  v119 轻声前段保护：前段轻声 + 后段响亮时，轻声语音不被当静音删掉
 *
 * 合成音频喂真实全局函数（splitAudioAtSilence / trimLeadingSilence / encodeMonoSamplesToWav），
 * 离线确定性、无需 API key。⚠️ 需要 app 在 http://localhost:8000 运行。
 */

const HARNESS = `
const SR = 16000;
function buildSignal(totalSec, segs) {
  const n = Math.round(totalSec * SR);
  const x = new Float32Array(n);
  for (const s of segs) {
    const a = Math.max(0, Math.floor(s.fromSec * SR));
    const b = Math.min(n, Math.floor(s.toSec * SR));
    for (let i = a; i < b; i++) x[i] += s.amp * Math.sin(2 * Math.PI * s.freq * i / SR);
  }
  return x;
}
function toWav(mono) { return window.encodeMonoSamplesToWav(mono, SR); }
async function decode(blob) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
  const d = { data: new Float32Array(buf.getChannelData(0)), sampleRate: buf.sampleRate, duration: buf.duration };
  ctx.close();
  return d;
}
function rms(x, sr, f, t) {
  const a = Math.max(0, Math.floor(f * sr));
  const b = Math.min(x.length, Math.floor(t * sr));
  if (b <= a) return 0;
  let s = 0;
  for (let i = a; i < b; i++) s += x[i] * x[i];
  return Math.sqrt(s / (b - a));
}
`;

async function run(page: any, body: string) {
  return page.evaluate(`(async () => { ${HARNESS}; ${body} })()`);
}

test.describe('音频处理 eval (C1/C3/D1/B4/B5)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const ok = await page.evaluate(
      () => typeof (window as any).splitAudioAtSilence === 'function' &&
            typeof (window as any).trimLeadingSilence === 'function' &&
            typeof (window as any).encodeMonoSamplesToWav === 'function'
    );
    expect(ok, '核心音频函数未挂在全局').toBe(true);
  });

  test('C1：短音频（≤90s）不分段，返回 null', async ({ page }) => {
    const r: any = await run(page, `
      const sig = buildSignal(60, [{ fromSec: 0, toSec: 60, freq: 300, amp: 0.3 }]);
      const chunks = await window.splitAudioAtSilence(toWav(sig));
      return { isNull: chunks === null };
    `);
    console.log('[C1]', JSON.stringify(r));
    expect(r.isNull).toBe(true);
  });

  test('C3：长音频分段连续、有序、全覆盖（拼接顺序正确）', async ({ page }) => {
    const r: any = await run(page, `
      // 200s：每 60s 附近留一小段静音，便于找安静切点
      const segs = [];
      for (let t = 0; t < 200; t++) if (t % 60 < 57) segs.push({ fromSec: t, toSec: t + 0.9, freq: 300, amp: 0.3 });
      const chunks = await window.splitAudioAtSilence(toWav(buildSignal(200, segs)));
      if (!chunks) return { chunks: null };
      const info = chunks.map(c => ({ s: c.startSec, e: c.endSec }));
      let ordered = true, contiguous = true;
      for (let i = 0; i < info.length - 1; i++) {
        if (info[i + 1].s < info[i].s) ordered = false;
        if (Math.abs(info[i].e - info[i + 1].s) > 1e-6) contiguous = false;
      }
      return { count: chunks.length, ordered, contiguous, firstStart: info[0].s, lastEnd: info[info.length - 1].e };
    `);
    console.log('[C3]', JSON.stringify(r));
    expect(r.chunks, '长音频应被分段').not.toBeNull();
    expect(r.count).toBeGreaterThanOrEqual(2);
    expect(r.ordered, 'startSec 应升序').toBe(true);
    expect(r.contiguous, '相邻块应无缝衔接 endSec[i]===startSec[i+1]').toBe(true);
    expect(r.firstStart).toBe(0);            // 从头覆盖
    expect(Math.abs(r.lastEnd - 200)).toBeLessThan(0.05); // 覆盖到尾，无遗漏
  });

  test('D1：满 5 分钟 16kHz 单声道 WAV < 25MB 上传上限', async ({ page }) => {
    const r: any = await run(page, `
      const sig = buildSignal(300, [{ fromSec: 0, toSec: 300, freq: 300, amp: 0.3 }]);
      const wav = toWav(sig);
      return { bytes: wav.size, mb: wav.size / 1024 / 1024 };
    `);
    console.log('[D1]', JSON.stringify({ mb: r.mb.toFixed(2) }));
    expect(r.bytes).toBeLessThan(25 * 1024 * 1024); // 硬上限
    expect(r.mb).toBeGreaterThan(9);                // 合理下界（~9.6MB），确认确实是满 5 分钟
    expect(r.mb).toBeLessThan(11);
  });

  test('B4：真静音仍返回 blob，绝不丢弃录音', async ({ page }) => {
    const r: any = await run(page, `
      const sig = buildSignal(5, []); // 全零 = 真静音
      const res = await window.trimLeadingSilence(toWav(sig));
      return { allSilence: res.allSilence, hasBlob: !!res.blob && res.blob.size > 0, reason: res.reason };
    `);
    console.log('[B4]', JSON.stringify(r));
    expect(r.allSilence).toBe(true);   // 识别为整段静音
    expect(r.hasBlob).toBe(true);      // 但仍保留 blob，交后端过滤（绝不本地丢弃）
  });

  test('B5：v119 轻声前段保护（轻声语音不被当静音删掉）', async ({ page }) => {
    const r: any = await run(page, `
      // 3s 静音 + 3s 轻声(0.05) + 4s 响亮(0.5)
      // 静音够长 → noiseFloor(10 分位) 稳落在 0；轻声远高于 silenceThr 但低于响亮触发阈
      const sig = buildSignal(10, [
        { fromSec: 3, toSec: 6,  freq: 440, amp: 0.05 },
        { fromSec: 6, toSec: 10, freq: 440, amp: 0.5 },
      ]);
      const res = await window.trimLeadingSilence(toWav(sig));
      const out = await decode(res.blob);
      return {
        trimmed: res.trimmed, allSilence: res.allSilence,
        duration: out.duration,
        rmsEarly: rms(out.data, out.sampleRate, 0.6, 3), // 输出早段应含被保护的轻声（低电平，非响亮）
      };
    `);
    console.log('[B5]', JSON.stringify({ ...r, duration: r.duration.toFixed(2), rmsEarly: r.rmsEarly.toFixed(4) }));
    expect(r.allSilence).toBe(false);
    expect(r.trimmed).toBe(true);             // 前导 3s 静音被裁
    expect(r.duration).toBeGreaterThan(6.5);  // 轻声段(3s)保留 → ≈7.4s；若被误删会≈4.4s
    expect(r.rmsEarly).toBeGreaterThan(0.005); // 输出早段确有能量（被保护的轻声）
    expect(r.rmsEarly).toBeLessThan(0.2);      // 且是轻声电平而非响亮（证明确是轻声段而非响亮前移）
  });
});
