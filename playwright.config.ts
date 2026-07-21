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

    // 录音生命周期（E1/E4）：需要 fake-mic —— 隔离成独立 project，不影响其它 functional 测试
    {
      name: 'recording',
      testMatch: /recording-lifecycle.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        permissions: ['microphone'],
        launchOptions: {
          args: [
            '--use-fake-device-for-media-stream',  // getUserMedia 返回假音频设备（持续 beep）
            '--use-fake-ui-for-media-stream',       // 自动授予权限，无弹窗
            '--autoplay-policy=no-user-gesture-required',
          ],
        },
      },
    },
  ],

  // 本地开发服务器配置（可选）
  // webServer: {
  //   command: 'python server2.py',
  //   url: 'http://localhost:8000',
  //   reuseExistingServer: true,
  // },
});
