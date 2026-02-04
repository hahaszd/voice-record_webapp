import { test, expect } from '@playwright/test';

/**
 * 🔥 最关键的测试 - 防止网站崩溃
 * 
 * 这个测试验证：
 * 1. 页面能否正常加载
 * 2. 没有 JavaScript 错误
 * 3. 关键元素存在
 * 
 * 如果这个测试失败 → 不要推送代码！
 */

test.describe('冒烟测试 - 页面加载', () => {
  test('页面应该成功加载并返回 200', async ({ page }) => {
    const response = await page.goto('/');
    
    // 验证 HTTP 状态码
    expect(response?.status()).toBe(200);
    
    console.log('✅ 页面加载成功 (HTTP 200)');
  });

  test('页面应该有正确的标题', async ({ page }) => {
    await page.goto('/');
    
    // 验证标题包含 VoiceSpark
    await expect(page).toHaveTitle(/VoiceSpark/);
    
    console.log('✅ 页面标题正确');
  });

  test('主容器应该可见', async ({ page }) => {
    await page.goto('/');
    
    // 验证主容器存在
    const container = page.locator('.container');
    await expect(container).toBeVisible();
    
    console.log('✅ 主容器可见');
  });
});

test.describe('冒烟测试 - 无错误检测', () => {
  test('页面不应该有 JavaScript 错误', async ({ page }) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // 监听控制台错误
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
      if (msg.type() === 'warning') {
        warnings.push(msg.text());
      }
    });
    
    // 监听页面错误（例如未捕获的异常）
    page.on('pageerror', error => {
      errors.push(`Page Error: ${error.message}`);
    });
    
    await page.goto('/');
    
    // 等待页面初始化完成
    await page.waitForTimeout(3000);
    
    // 输出警告（不会导致测试失败）
    if (warnings.length > 0) {
      console.log('⚠️  警告信息：', warnings);
    }
    
    // 错误会导致测试失败
    if (errors.length > 0) {
      console.error('❌ 检测到错误：', errors);
    }
    
    expect(errors).toHaveLength(0);
    
    console.log('✅ 没有 JavaScript 错误');
  });

  test('不应该有网络请求失败', async ({ page }) => {
    const failedRequests: string[] = [];
    
    page.on('requestfailed', request => {
      failedRequests.push(`${request.method()} ${request.url()}`);
    });
    
    await page.goto('/');
    
    // 等待资源加载
    await page.waitForLoadState('networkidle');
    
    if (failedRequests.length > 0) {
      console.error('❌ 失败的请求：', failedRequests);
    }
    
    expect(failedRequests).toHaveLength(0);
    
    console.log('✅ 所有网络请求成功');
  });
});

test.describe('冒烟测试 - 关键元素', () => {
  test('所有关键按钮应该存在', async ({ page }) => {
    await page.goto('/');
    
    // 等待页面初始化
    await page.waitForSelector('#recordBtn', { timeout: 5000 });
    
    // 验证录音按钮
    const recordBtn = page.locator('#recordBtn');
    await expect(recordBtn).toBeVisible();
    console.log('✅ 录音按钮存在');
    
    // 验证转录结果区域
    const transcriptionResult = page.locator('#transcriptionResult');
    await expect(transcriptionResult).toBeVisible();
    console.log('✅ 转录结果区域存在');
    
    // 验证复制按钮
    const copyBtn = page.locator('#copyBtn');
    await expect(copyBtn).toBeVisible();
    console.log('✅ 复制按钮存在');
    
    // 验证取消按钮（初始时隐藏也算存在）
    const cancelBtn = page.locator('#cancelRecordBtn');
    await expect(cancelBtn).toBeAttached();
    console.log('✅ 取消按钮存在');
  });

  test('音频源选择按钮应该有 3 个', async ({ page }) => {
    await page.goto('/');
    
    const audioSourceBtns = page.locator('.audio-source-btn');
    await expect(audioSourceBtns).toHaveCount(3);
    
    console.log('✅ 音频源按钮数量正确');
  });

  test('转录时长按钮应该有 3 个', async ({ page }) => {
    await page.goto('/');
    
    const durationBtns = page.locator('.duration-btn');
    await expect(durationBtns).toHaveCount(3);
    
    console.log('✅ 转录时长按钮数量正确');
  });

  test('应该显示初始化成功的日志', async ({ page }) => {
    const consoleLogs: string[] = [];
    
    page.on('console', msg => {
      if (msg.type() === 'log') {
        consoleLogs.push(msg.text());
      }
    });
    
    await page.goto('/');
    await page.waitForTimeout(3000);
    
    // 检查关键初始化日志
    const hasScriptLoaded = consoleLogs.some(log => 
      log.includes('script.js loaded successfully')
    );
    const hasInitComplete = consoleLogs.some(log => 
      log.includes('App initialization complete')
    );
    
    if (!hasScriptLoaded) {
      console.warn('⚠️  未检测到脚本加载日志');
    }
    if (!hasInitComplete) {
      console.warn('⚠️  未检测到初始化完成日志');
    }
    
    // 至少应该有一个关键日志
    expect(hasScriptLoaded || hasInitComplete).toBe(true);
    
    console.log('✅ 检测到初始化日志');
  });
});
