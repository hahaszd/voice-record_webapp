import { test, expect } from '@playwright/test';

/**
 * 📱 测试 v63 移动端音频选择器隐藏功能
 * 
 * 验证：
 * 1. 移动端（≤600px）音频选择器应该隐藏
 * 2. 桌面端（>600px）音频选择器应该显示
 */

test.describe('v63 移动端音频选择器隐藏', () => {
  
  test('移动端：音频选择器应该隐藏（iPhone SE - 375px）', async ({ page }) => {
    // 设置为 iPhone SE 尺寸
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const audioSelector = page.locator('.audio-source-selector');
    
    // 验证元素存在于 DOM（但应该不可见）
    await expect(audioSelector).toBeAttached();
    
    // 验证元素不可见（display: none）
    await expect(audioSelector).toBeHidden();
    
    // 检查 computed style
    const displayStyle = await audioSelector.evaluate(el => 
      window.getComputedStyle(el).display
    );
    
    expect(displayStyle).toBe('none');
    
    console.log('✅ 移动端（375px）：音频选择器已隐藏');
  });
  
  test('移动端：音频选择器应该隐藏（极小屏 - 320px）', async ({ page }) => {
    // 设置为 iPhone 5/SE 尺寸（最小）
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const audioSelector = page.locator('.audio-source-selector');
    
    // 验证元素不可见
    await expect(audioSelector).toBeHidden();
    
    console.log('✅ 极小屏（320px）：音频选择器已隐藏');
  });
  
  test('移动端：音频选择器应该隐藏（600px边界）', async ({ page }) => {
    // 设置为 600px（边界值）
    await page.setViewportSize({ width: 600, height: 800 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const audioSelector = page.locator('.audio-source-selector');
    
    // 600px 应该隐藏（max-width: 600px 包含600）
    await expect(audioSelector).toBeHidden();
    
    console.log('✅ 600px边界：音频选择器已隐藏');
  });
  
  test('桌面端：音频选择器应该显示（601px）', async ({ page }) => {
    // 设置为 601px（刚好超过移动端）
    await page.setViewportSize({ width: 601, height: 800 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const audioSelector = page.locator('.audio-source-selector');
    
    // 601px 应该显示
    await expect(audioSelector).toBeVisible();
    
    // 验证3个按钮都可见
    const buttons = audioSelector.locator('.audio-source-btn');
    await expect(buttons).toHaveCount(3);
    
    console.log('✅ 桌面端（601px）：音频选择器已显示');
  });
  
  test('桌面端：音频选择器应该显示（1920px）', async ({ page }) => {
    // 设置为标准桌面尺寸
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const audioSelector = page.locator('.audio-source-selector');
    
    // 应该显示
    await expect(audioSelector).toBeVisible();
    
    // 验证3个按钮
    const micBtn = audioSelector.locator('[data-source="microphone"]');
    const systemBtn = audioSelector.locator('[data-source="system"]');
    const bothBtn = audioSelector.locator('[data-source="both"]');
    
    await expect(micBtn).toBeVisible();
    await expect(systemBtn).toBeVisible();
    await expect(bothBtn).toBeVisible();
    
    console.log('✅ 桌面端（1920px）：音频选择器和所有按钮都显示');
  });
  
  test('移动端：其他元素应该正常显示', async ({ page }) => {
    // 设置为移动端
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // 验证其他关键元素仍然可见
    await expect(page.locator('h1')).toBeVisible(); // 标题
    await expect(page.locator('#recordBtn')).toBeVisible(); // 录音按钮
    await expect(page.locator('.duration-selector')).toBeVisible(); // 时长选择
    await expect(page.locator('#transcriptionResult')).toBeVisible(); // 结果
    
    console.log('✅ 移动端：其他元素正常显示');
  });
  
  test('移动端：副标题应该隐藏（v61功能）', async ({ page }) => {
    // 设置为移动端
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const tagline = page.locator('.tagline');
    
    // 验证副标题隐藏（v61的优化）
    await expect(tagline).toBeHidden();
    
    console.log('✅ 移动端：副标题已隐藏（v61）');
  });
  
  test('桌面端：副标题应该显示', async ({ page }) => {
    // 设置为桌面端
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const tagline = page.locator('.tagline');
    
    // 验证副标题显示
    await expect(tagline).toBeVisible();
    
    console.log('✅ 桌面端：副标题已显示');
  });
  
  test('移动端：页面应该无溢出', async ({ page }) => {
    // 设置为 iPhone SE（最容易溢出的尺寸）
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // 检查是否有水平滚动
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    
    expect(hasHorizontalScroll).toBe(false);
    
    console.log('✅ 移动端：无水平溢出');
  });
  
  test('响应式切换：从桌面到移动', async ({ page }) => {
    // 先设置为桌面
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const audioSelector = page.locator('.audio-source-selector');
    
    // 桌面应该显示
    await expect(audioSelector).toBeVisible();
    
    // 切换到移动端
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500); // 等待CSS过渡
    
    // 移动端应该隐藏
    await expect(audioSelector).toBeHidden();
    
    console.log('✅ 响应式切换：桌面→移动正常');
  });
  
  test('响应式切换：从移动到桌面', async ({ page }) => {
    // 先设置为移动端
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const audioSelector = page.locator('.audio-source-selector');
    
    // 移动端应该隐藏
    await expect(audioSelector).toBeHidden();
    
    // 切换到桌面端
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(500); // 等待CSS过渡
    
    // 桌面端应该显示
    await expect(audioSelector).toBeVisible();
    
    console.log('✅ 响应式切换：移动→桌面正常');
  });
});
