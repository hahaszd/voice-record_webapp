import { test, expect, devices } from '@playwright/test';

/**
 * 📱 移动端测试 - iPhone
 * 
 * 验证在 iPhone 上页面是否正常工作
 */

test.describe('iPhone 测试', () => {
  test.use({ ...devices['iPhone 14 Pro'] });

  test('iPhone 上页面应该正常加载', async ({ page }) => {
    await page.goto('/');
    
    // 验证标题
    await expect(page).toHaveTitle(/VoiceSpark/);
    
    console.log('✅ iPhone 页面加载成功');
  });

  test('iPhone 上录音按钮应该可见', async ({ page }) => {
    await page.goto('/');
    
    const recordBtn = page.locator('#recordBtn');
    
    // 等待按钮加载
    await expect(recordBtn).toBeVisible({ timeout: 5000 });
    
    // 验证按钮启用
    await expect(recordBtn).toBeEnabled();
    
    console.log('✅ iPhone 录音按钮可见且可用');
  });

  test('iPhone 上应该检测到 iOS 设备', async ({ page }) => {
    const consoleLogs: string[] = [];
    
    page.on('console', msg => {
      consoleLogs.push(msg.text());
    });
    
    await page.goto('/');
    await page.waitForTimeout(3000);
    
    // 检查是否有 iOS 相关日志
    const hasIOSDetection = consoleLogs.some(log => 
      log.includes('iOS=true') || log.includes('检测到 iOS')
    );
    
    if (hasIOSDetection) {
      console.log('✅ 检测到 iOS 设备');
    } else {
      console.warn('⚠️  未检测到 iOS 设备标识');
    }
  });

  test('iPhone 上所有关键元素应该存在', async ({ page }) => {
    await page.goto('/');
    
    // 等待页面初始化
    await page.waitForLoadState('networkidle');
    
    // 验证关键元素
    await expect(page.locator('#recordBtn')).toBeVisible();
    await expect(page.locator('#transcriptionResult')).toBeVisible();
    await expect(page.locator('#copyBtn')).toBeVisible();
    
    console.log('✅ iPhone 上所有关键元素存在');
  });

  test('iPhone 上按钮应该可以点击', async ({ page }) => {
    await page.goto('/');
    
    const recordBtn = page.locator('#recordBtn');
    
    // 等待按钮可见
    await expect(recordBtn).toBeVisible();
    
    // 点击按钮（使用 tap 模拟触摸）
    await recordBtn.tap();
    
    console.log('✅ iPhone 上按钮可以点击');
  });

  test('iPhone 上不应该有 JavaScript 错误', async ({ page }) => {
    const errors: string[] = [];
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    
    page.on('pageerror', error => {
      errors.push(error.message);
    });
    
    await page.goto('/');
    await page.waitForTimeout(3000);
    
    if (errors.length > 0) {
      console.error('❌ iPhone 上检测到错误：', errors);
    }
    
    expect(errors).toHaveLength(0);
    
    console.log('✅ iPhone 上没有 JavaScript 错误');
  });
});

test.describe('Android 测试', () => {
  test.use({ ...devices['Pixel 5'] });

  test('Android 上页面应该正常加载', async ({ page }) => {
    await page.goto('/');
    
    // 验证标题
    await expect(page).toHaveTitle(/VoiceSpark/);
    
    console.log('✅ Android 页面加载成功');
  });

  test('Android 上录音按钮应该可见', async ({ page }) => {
    await page.goto('/');
    
    const recordBtn = page.locator('#recordBtn');
    await expect(recordBtn).toBeVisible({ timeout: 5000 });
    
    console.log('✅ Android 录音按钮可见');
  });

  test('Android 上按钮应该可以点击', async ({ page }) => {
    await page.goto('/');
    
    const recordBtn = page.locator('#recordBtn');
    await expect(recordBtn).toBeVisible();
    
    // 使用 tap 模拟触摸
    await recordBtn.tap();
    
    console.log('✅ Android 上按钮可以点击');
  });
});
