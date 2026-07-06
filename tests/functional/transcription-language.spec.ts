import { test, expect } from '@playwright/test';

/**
 * 转录语言选择器（Auto / 中文 / English）
 * 背景：早期转录始终走「自动识别」，短音频常被 Whisper 猜成日文/中文乱串。
 * 该选择器让用户锁定转录语言，选择会持久化到 localStorage。
 */
test.describe('转录语言选择器', () => {
  test('存在 3 个按钮，默认 Auto 处于激活状态', async ({ page }) => {
    await page.goto('/');
    const btns = page.locator('.transcribe-lang-btn');
    await expect(btns).toHaveCount(3);
    await expect(page.locator('.transcribe-lang-btn[data-lang="auto"]')).toHaveClass(/active/);
  });

  test('切换到中文：active 状态转移且互斥', async ({ page }) => {
    await page.goto('/');
    await page.locator('.transcribe-lang-btn[data-lang="zh"]').click();
    await expect(page.locator('.transcribe-lang-btn[data-lang="zh"]')).toHaveClass(/active/);
    await expect(page.locator('.transcribe-lang-btn[data-lang="auto"]')).not.toHaveClass(/active/);
    await expect(page.locator('.transcribe-lang-btn[data-lang="en"]')).not.toHaveClass(/active/);
  });

  test('选择持久化到 localStorage，刷新后保持', async ({ page }) => {
    await page.goto('/');
    await page.locator('.transcribe-lang-btn[data-lang="en"]').click();
    expect(await page.evaluate(() => localStorage.getItem('transcriptionLanguage'))).toBe('en');
    await page.reload();
    await expect(page.locator('.transcribe-lang-btn[data-lang="en"]')).toHaveClass(/active/);
  });
});
