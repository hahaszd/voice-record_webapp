import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  
  // 最多 30 秒超时
  timeout: 30 * 1000,
  
  // 每个测试失败后重试一次
  retries: 1,
  
  // 并行运行测试
  workers: 3,
  
  // 报告配置
  reporter: [
    ['list'],
    ['html', { open: 'never' }]
  ],
  
  use: {
    // 基础 URL（本地测试）
    baseURL: 'http://localhost:8000',
    
    // 截图设置
    screenshot: 'only-on-failure',
    
    // 视频设置
    video: 'retain-on-failure',
    
    // 追踪设置
    trace: 'on-first-retry',
  },

  // 测试项目配置
  projects: [
    {
      name: 'smoke-chrome',
      testMatch: /smoke.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    
    {
      name: 'smoke-iphone',
      testMatch: /smoke.*\.spec\.ts/,
      use: { ...devices['iPhone 14 Pro'] },
    },
    
    {
      name: 'functional',
      testMatch: /functional.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    
    {
      name: 'mobile-iphone',
      testMatch: /mobile.*\.spec\.ts/,
      use: { ...devices['iPhone 14 Pro'] },
    },
  ],

  // 本地开发服务器配置（可选）
  // webServer: {
  //   command: 'python server2.py',
  //   url: 'http://localhost:8000',
  //   reuseExistingServer: true,
  // },
});
