import { test, expect } from '@playwright/test';

/**
 * 🎯 录音分段 EVAL — 验证"停止时到底保留了哪一段音频"
 *
 * 这些测试回答用户最关心的三个问题，全部离线、确定性、无需转录 API key：
 *
 *   1. 录 30s、选 1 分钟 → 是否把整段录音都保留？（总时长 ≤ 所选 → 全保留）
 *   2. 录 1 分钟、选 30s → 是否只保留最后 30s、丢掉前 30s？
 *   3. 说话中间停顿（说→静音→再说）→ 前导静音被裁掉，但两段语音 + 中间停顿是否都保留？
 *
 * 做法：在浏览器里合成"每段用不同频率正弦波标记"的 WAV 夹具，喂给页面里**真实的**
 * 全局函数（不是测试替身）：
 *   - window.enforceMaxDuration(blob, maxSec)  —— 主转录路径的硬性时长上限（script.js:1192）
 *   - window.trimLeadingSilence(blob)          —— 客户端 VAD（script.js:902）
 * 再解码输出、用 Goertzel 检测哪段频率还在、用分窗 RMS 检测能量分布，据此断言。
 *
 * 为什么测这两个函数：用户的问题本质是"哪段音频被保留"，这完全由这两个函数决定，
 * 与 Whisper/Deepgram 无关——所以不碰转录 API，测试才能确定性、可重复、进 CI。
 *
 * ⚠️ 需要 app 在 http://localhost:8000 运行（与其它 functional 测试一致）。
 */

// ---------------------------------------------------------------------------
// 浏览器端 harness：作为字符串注入，这样同一套代码既能在 Playwright 里 evaluate，
// 也能原样粘进真实浏览器控制台（Chrome 插件）做端到端交叉验证。
// ---------------------------------------------------------------------------
const HARNESS = `
const SR = 16000;

// 合成单声道信号：segments = [{fromSec,toSec,freq,amp}]，其余填静音
function buildSignal(totalSec, segments) {
  const n = Math.round(totalSec * SR);
  const x = new Float32Array(n);
  for (const s of segments) {
    const a = Math.max(0, Math.floor(s.fromSec * SR));
    const b = Math.min(n, Math.floor(s.toSec * SR));
    for (let i = a; i < b; i++) x[i] += s.amp * Math.sin(2 * Math.PI * s.freq * i / SR);
  }
  return x;
}

// 用页面里真实的 WAV 编码器把样本变成 Blob（16-bit PCM WAV）
function toWavBlob(mono) { return window.encodeMonoSamplesToWav(mono, SR); }

async function decode(blob) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
  const ch = buf.getChannelData(0);
  const out = { data: new Float32Array(ch), sampleRate: buf.sampleRate, duration: buf.duration };
  ctx.close();
  return out;
}

// Goertzel：返回某频率的近似"每样本幅度"，用于判断某段正弦是否存在
function goertzel(x, sr, freq) {
  const N = x.length;
  const k = Math.round(N * freq / sr);
  const w = 2 * Math.PI * k / N;
  const coeff = 2 * Math.cos(w);
  let s1 = 0, s2 = 0;
  for (let i = 0; i < N; i++) { const s0 = x[i] + coeff * s1 - s2; s2 = s1; s1 = s0; }
  const power = s1 * s1 + s2 * s2 - coeff * s1 * s2;
  return Math.sqrt(Math.max(0, power)) / N;
}

function rmsWindow(x, sr, fromSec, toSec) {
  const a = Math.max(0, Math.floor(fromSec * sr));
  const b = Math.min(x.length, Math.floor(toSec * sr));
  if (b <= a) return 0;
  let sum = 0;
  for (let i = a; i < b; i++) sum += x[i] * x[i];
  return Math.sqrt(sum / (b - a));
}

// 场景 1：录 30s、选 60s → 整段保留
async function evalKeepAll() {
  const sig = buildSignal(30, [{ fromSec: 0, toSec: 30, freq: 300, amp: 0.4 }]);
  const out = await decode(await window.enforceMaxDuration(toWavBlob(sig), 60));
  return { duration: out.duration, tone300: goertzel(out.data, out.sampleRate, 300) };
}

// 场景 2：录 60s（前30s=300Hz，后30s=1200Hz）、选 30s → 只留最后 30s（1200Hz），丢前 30s（300Hz）
async function evalKeepTail() {
  const sig = buildSignal(60, [
    { fromSec: 0,  toSec: 30, freq: 300,  amp: 0.4 },
    { fromSec: 30, toSec: 60, freq: 1200, amp: 0.4 },
  ]);
  const out = await decode(await window.enforceMaxDuration(toWavBlob(sig), 30));
  return {
    duration: out.duration,
    tone300:  goertzel(out.data, out.sampleRate, 300),   // 前 30s 的标记，应≈0
    tone1200: goertzel(out.data, out.sampleRate, 1200),  // 后 30s 的标记，应很强
  };
}

// 场景 3：中间停顿。[0-2s 静音][2-5s 语音][5-9s 停顿][9-12s 语音]
// 期望：VAD 裁掉前导 2s 静音，但两段语音 + 中间 4s 停顿都保留（VAD 只裁首、不裁中间/尾）
async function evalMiddlePause() {
  const sig = buildSignal(12, [
    { fromSec: 2, toSec: 5,  freq: 440, amp: 0.4 },
    { fromSec: 9, toSec: 12, freq: 440, amp: 0.4 },
  ]);
  const res = await window.trimLeadingSilence(toWavBlob(sig));
  const out = await decode(res.blob);
  const d = out.duration, t = out.sampleRate;
  return {
    trimmed: res.trimmed, allSilence: res.allSilence, reason: res.reason,
    duration: d,
    rmsFirstThird:  rmsWindow(out.data, t, 0,        d / 3),
    rmsMiddleThird: rmsWindow(out.data, t, d / 3,    2 * d / 3),
    rmsLastThird:   rmsWindow(out.data, t, 2 * d / 3, d),
  };
}
`;

async function run(page: any, fnCall: string) {
  return page.evaluate(`(async () => { ${HARNESS}; return await ${fnCall}; })()`);
}

test.describe('录音分段 eval', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // 确认被测的真实函数确实挂在全局（否则测试无意义）
    const ok = await page.evaluate(
      () => typeof (window as any).enforceMaxDuration === 'function' &&
            typeof (window as any).trimLeadingSilence === 'function' &&
            typeof (window as any).encodeMonoSamplesToWav === 'function'
    );
    expect(ok, '核心函数未挂在全局（script.js 结构变了？）').toBe(true);
  });

  test('录 30s、选 1 分钟 → 整段录音都保留', async ({ page }) => {
    const r: any = await run(page, 'evalKeepAll()');
    console.log('[KEEP-ALL]', JSON.stringify(r));
    expect(r.duration).toBeGreaterThan(29.5);   // 没有被截短
    expect(r.duration).toBeLessThan(30.5);
    expect(r.tone300).toBeGreaterThan(0.05);     // 录进去的内容还在
  });

  test('录 1 分钟、选 30s → 只保留最后 30s、丢掉前 30s', async ({ page }) => {
    const r: any = await run(page, 'evalKeepTail()');
    console.log('[KEEP-TAIL]', JSON.stringify(r));
    expect(r.duration).toBeGreaterThan(29);      // 被钳到 ~30s
    expect(r.duration).toBeLessThan(31);
    expect(r.tone1200).toBeGreaterThan(0.05);    // 最后 30s（1200Hz）保留
    expect(r.tone300).toBeLessThan(0.02);        // 前 30s（300Hz）被丢弃
    expect(r.tone1200).toBeGreaterThan(r.tone300 * 8); // 尾段能量远强于首段残留
  });

  test('说话中间停顿 → 前导静音裁掉，但两段语音 + 中间停顿都保留', async ({ page }) => {
    const r: any = await run(page, 'evalMiddlePause()');
    console.log('[MIDDLE-PAUSE]', JSON.stringify(r));
    expect(r.allSilence).toBe(false);
    expect(r.trimmed).toBe(true);                // 前导 2s 静音确实被裁
    expect(r.duration).toBeGreaterThan(8.5);     // 中间停顿没被压缩掉（若删中间会≈6s）
    expect(r.rmsFirstThird).toBeGreaterThan(0.05);  // 第一段语音在
    expect(r.rmsLastThird).toBeGreaterThan(0.05);   // 第二段语音在
    // 中间停顿仍是低能量（被保留为静音，而非删除后两段语音贴在一起）
    expect(r.rmsMiddleThird).toBeLessThan(r.rmsFirstThird * 0.3);
  });
});
