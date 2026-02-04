import { test, expect } from '@playwright/test';

/**
 * 🔘 按钮功能测试
 * 
 * 验证按钮能否正常点击和响应
 */

test.describe('按钮测试', () => {
  test('录音按钮应该可以点击', async ({ page }) => {
    await page.goto('/');
    
    const recordBtn = page.locator('#recordBtn');
    
    // 按钮应该可见
    await expect(recordBtn).toBeVisible();
    
    // 按钮应该启用
    await expect(recordBtn).toBeEnabled();
    
    // 获取初始文本
    const initialText = await recordBtn.textContent();
    console.log(`初始按钮文本: "${initialText}"`);
    
    // 点击按钮（会触发权限请求）
    // 注意：这不会真的开始录音，因为没有授予权限
    await recordBtn.click();
    
    console.log('✅ 录音按钮可以点击');
  });

  test('复制按钮应该存在并可见', async ({ page }) => {
    await page.goto('/');
    
    const copyBtn = page.locator('#copyBtn');
    
    // 按钮应该可见
    await expect(copyBtn).toBeVisible();
    
    // 按钮应该可点击（即使可能被禁用）
    await expect(copyBtn).toBeAttached();
    
    console.log('✅ 复制按钮存在');
  });

  test('音频源按钮应该可以切换', async ({ page }) => {
    await page.goto('/');
    
    const audioSourceBtns = page.locator('.audio-source-btn');
    const firstBtn = audioSourceBtns.first();
    
    // 点击第一个按钮
    await firstBtn.click();
    
    // 验证按钮有 active 类
    await expect(firstBtn).toHaveClass(/active/);
    
    console.log('✅ 音频源按钮可以切换');
  });

  test('转录时长按钮应该可以切换', async ({ page }) => {
    await page.goto('/');
    
    const durationBtns = page.locator('.duration-btn');
    const firstBtn = durationBtns.first();
    
    // 点击第一个按钮
    await firstBtn.click();
    
    // 验证按钮有 active 类
    await expect(firstBtn).toHaveClass(/active/);
    
    console.log('✅ 转录时长按钮可以切换');
  });

  test('帮助按钮应该打开帮助模态框', async ({ page }) => {
    await page.goto('/');
    
    const helpBtn = page.locator('#helpBtn');
    const helpModal = page.locator('#helpModal');
    
    // 点击帮助按钮
    await helpBtn.click();
    
    // 等待模态框显示
    await expect(helpModal).toBeVisible({ timeout: 2000 });
    
    console.log('✅ 帮助模态框可以打开');
    
    // 关闭模态框
    const closeBtn = page.locator('#closeHelpBtn');
    await closeBtn.click();
    
    // 验证模态框关闭
    await expect(helpModal).not.toBeVisible();
    
    console.log('✅ 帮助模态框可以关闭');
  });

  test('历史按钮应该打开历史模态框', async ({ page }) => {
    await page.goto('/');
    
    const historyBtn = page.locator('#historyBtn');
    const historyModal = page.locator('#historyModal');
    
    // 点击历史按钮
    await historyBtn.click();
    
    // 等待模态框显示
    await expect(historyModal).toBeVisible({ timeout: 2000 });
    
    console.log('✅ 历史模态框可以打开');
    
    // 关闭模态框
    const closeBtn = page.locator('#closeHistoryBtn');
    await closeBtn.click();
    
    // 验证模态框关闭
    await expect(historyModal).not.toBeVisible();
    
    console.log('✅ 历史模态框可以关闭');
  });
});

test.describe('开关测试', () => {
  test('自动复制开关应该可以切换', async ({ page }) => {
    await page.goto('/');
    
    const autoCopyToggle = page.locator('#autoCopyToggle');
    
    // 获取初始状态
    const initialChecked = await autoCopyToggle.isChecked();
    console.log(`自动复制初始状态: ${initialChecked ? '开启' : '关闭'}`);
    
    // 切换状态
    await autoCopyToggle.click();
    
    // 验证状态改变
    const newChecked = await autoCopyToggle.isChecked();
    expect(newChecked).toBe(!initialChecked);
    
    console.log('✅ 自动复制开关可以切换');
  });

  test('自动录音开关应该可以切换', async ({ page }) => {
    await page.goto('/');
    
    const autoRecordToggle = page.locator('#autoRecordToggle');
    
    // 获取初始状态
    const initialChecked = await autoRecordToggle.isChecked();
    console.log(`自动录音初始状态: ${initialChecked ? '开启' : '关闭'}`);
    
    // 切换状态
    await autoRecordToggle.click();
    
    // 验证状态改变
    const newChecked = await autoRecordToggle.isChecked();
    expect(newChecked).toBe(!initialChecked);
    
    console.log('✅ 自动录音开关可以切换');
  });
});
