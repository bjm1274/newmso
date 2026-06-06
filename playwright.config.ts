import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    serviceWorkers: 'block',
  },
  webServer: {
    command: process.env.CI
      ? 'npm run start -- --hostname 127.0.0.1 --port 3000'
      : 'npm run dev -- --webpack --hostname 127.0.0.1 --port 3000',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'desktop-chromium',
      testMatch: /.*\.desktop\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'mobile-chromium',
      testMatch: /.*\.mobile\.spec\.ts/,
      use: {
        ...devices['iPhone 13'],
        browserName: 'chromium',
      },
    },
    {
      name: 'mobile-android-chromium',
      testMatch: /.*\.mobile\.spec\.ts/,
      use: {
        ...devices['Pixel 7'],
        browserName: 'chromium',
      },
    },
    {
      name: 'mobile-iphone-webkit',
      testMatch: /.*\.mobile\.spec\.ts/,
      use: {
        ...devices['iPhone 13'],
        browserName: 'webkit',
      },
    },
    {
      // 320px 폭 회귀 — 가로 오버플로우/모바일 카드 변형/시트 popstate 등 좁은 폭 전용.
      // 기존 .mobile.spec.ts는 iPhone 13(390px) 기준이라 여기서 돌리지 않는다.
      name: 'mobile-320',
      testMatch: /(mobile-overflow|mobile-components|mobile-sheet-history)\.mobile\.spec\.ts/,
      use: {
        browserName: 'chromium',
        viewport: { width: 320, height: 568 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'a11y-chromium',
      testDir: './tests/a11y',
      testMatch: /.*\.a11y\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
});
