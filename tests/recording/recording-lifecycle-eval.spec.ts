import { test, expect } from '@playwright/test';

/**
 * 🎯 录音生命周期 EVAL（E1/E4）— 需要 fake-mic（见 playwright.config.ts 的 `recording` project）
 *
 *   E1  开始→停止状态机：录音态 UI（recording class / 计时走动 / 源选择器禁用 / cancel 可见），
 *       停止后回到就绪态（class 移除、源选择器重新启用）
 *   E4  v116 竞态：停止时先快照 chunks，随后自动录音的 clearAll 清空 IndexedDB 也不影响这次转录
 *       —— 用 route 拦截捕获上传体大小，证明送去转录的是"真实录音"而非被清空后的空数据
 *
 * 转录端点用 page.route mock，避免依赖后端/API key，且让停止流程快速完成。
 * ⚠️ 需要 app 在 http://localhost:8000 运行。用 `npx playwright test --project=recording` 跑。
 */

const MOCK_OK = {
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ success: true, text: 'mock-transcript', api_used: 'mock' }),
};

test.describe('录音生命周期 eval (E1/E4)', () => {
  test.beforeEach(async ({ page }) => {
    // 短录音可能触发 alert（数据不足）——统一 dismiss，避免阻塞
    page.on('dialog', (d) => d.dismiss().catch(() => {}));
  });

  test('E1：record → stop 生命周期 UI 状态', async ({ page }) => {
    await page.route('**/transcribe-segment', (route) => route.fulfill(MOCK_OK));
    await page.goto('/');

    const recordBtn = page.locator('#recordBtn');
    const cancelBtn = page.locator('#cancelRecordBtn');
    const sourceBtn = page.locator('.audio-source-btn').first();
    const recordingTime = page.locator('#recordingTime');

    // 隔离 E1：关闭自动录音，避免停止后立即重开。
    // 该 checkbox 被自定义开关样式隐藏（uncheck 点不到），直接设 checked——app 停止时直接读 .checked。
    await page.locator('#autoRecordToggle').evaluate((el: any) => { el.checked = false; });

    // 初始就绪态
    await expect(recordBtn).not.toHaveClass(/recording/);
    await expect(cancelBtn).toBeHidden();

    // ▶️ 开始录音
    await recordBtn.click({ force: true }); // 录音时按钮有脉冲动画，绕过稳定性检查
    await expect(recordBtn).toHaveClass(/recording/);          // 进入录音态
    await expect(cancelBtn).toBeVisible();                     // 取消按钮出现
    await expect(sourceBtn).toBeDisabled();                    // 录音期间源选择器禁用
    await expect(recordingTime).toHaveText(/00:0[1-9]/, { timeout: 4000 }); // 计时器在走

    // ⏹️ 停止录音（转录被 mock，秒回）
    await recordBtn.click({ force: true }); // 录音时按钮有脉冲动画，绕过稳定性检查
    await expect(recordBtn).not.toHaveClass(/recording/);      // 回到就绪态
    await expect(sourceBtn).toBeEnabled();                     // 源选择器重新启用
  });

  test('E4：停止时快照不受新录音 clearAll 影响（v116），上传体为真实录音', async ({ page }) => {
    let uploadedBytes = 0;
    await page.route('**/transcribe-segment', async (route) => {
      const buf = route.request().postDataBuffer();
      uploadedBytes = buf ? buf.length : 0;
      await route.fulfill(MOCK_OK);
    });
    await page.goto('/');

    // 自动录音默认开启（停止→转录→立即重开新录音，新录音会 clearAll IndexedDB）
    await expect(page.locator('#autoRecordToggle')).toBeChecked();

    const recordBtn = page.locator('#recordBtn');
    await recordBtn.click({ force: true }); // 录音时按钮有脉冲动画，绕过稳定性检查
    await expect(recordBtn).toHaveClass(/recording/);
    // 录 ~3s，攒够 chunk（避免"数据不足"早退）
    await expect(page.locator('#recordingTime')).toHaveText(/00:0[3-9]/, { timeout: 6000 });

    // 停止：内部先把 chunks 快照，再启动转录；随后自动录音 clearAll 清空 IndexedDB
    await recordBtn.click({ force: true }); // 录音时按钮有脉冲动画，绕过稳定性检查

    // 送去转录的 multipart 体应包含真实 ~3s 录音（数万字节）。
    // 若 v116 竞态回归（快照读到被清空的库），会因数据不足早退、根本不发上传 → uploadedBytes 保持 0。
    await expect
      .poll(() => uploadedBytes, { timeout: 8000, message: '快照应含真实录音数据' })
      .toBeGreaterThan(15000);
  });
});
