import { test, expect } from '@playwright/test';

/**
 * 🎯 后端限制 EVAL — 25MB 上传上限拒绝分支 (O6)
 *
 * 验证 server2.py `/transcribe-segment` 对超过 25MB 的上传返回**友好拒绝**
 * （`success:false` + 中文提示，HTTP 200），而不是 500 崩溃或静默转发到付费 API。
 * 这是"绕过降采样直传原始 WebM"等异常路径最后的兜底。
 *
 * L2 集成测试：直接打 HTTP 端点（无需浏览器），走真实 FastAPI 逻辑。
 * ⚠️ 需要 app 在 http://localhost:8000 运行。
 * 注：该路径受限流保护（20/min），本测试只发 1 次请求。
 */

test.describe('后端上传上限 eval (O6)', () => {
  test('>25MB 上传 → 友好拒绝 (success:false + 文案)，非崩溃', async ({ request }) => {
    const big = Buffer.alloc(26 * 1024 * 1024); // 26MB > 25MB 上限
    const res = await request.post('/transcribe-segment', {
      multipart: {
        audio_file: { name: 'big.wav', mimeType: 'audio/wav', buffer: big },
        duration: '30',
        audio_source: 'microphone',
      },
      timeout: 30000,
    });

    // 不是 5xx 崩溃：后端以 200 + 结构化结果友好返回
    expect(res.status(), '应为 200 友好拒绝而非 5xx').toBe(200);
    const body = await res.json();
    console.log('[O6-25MB]', JSON.stringify({ success: body.success, message: body.message?.slice(0, 40) }));
    expect(body.success).toBe(false);
    expect(body.text).toBe('');
    expect(body.message).toContain('太大'); // "音频文件太大 (…MB)，超过限制 (25 MB)…"
    expect(body.api_used).toBeFalsy(); // 未消耗任何付费 API
  });

  test('正常大小请求不被大小分支拦截（对照）', async ({ request }) => {
    // 一个 1KB 的假 blob：不会命中 25MB 分支。它会走到格式检测/转录，
    // 无 key 时大概率 success:false，但 message 绝不应是"太大"。
    const small = Buffer.alloc(1024);
    const res = await request.post('/transcribe-segment', {
      multipart: {
        audio_file: { name: 'tiny.wav', mimeType: 'audio/wav', buffer: small },
        duration: '5',
        audio_source: 'microphone',
      },
      timeout: 30000,
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.message || '').not.toContain('太大');
  });
});
