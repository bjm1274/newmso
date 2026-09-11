import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3100';
const url = new URL(baseURL);
if (!['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('E2E는 격리된 로컬 서버에서만 실행합니다.');
const port = url.port || '80';
process.env.DATABASE_PATH = path.resolve('.scratch-r/e2e/allerp.sqlite');
process.env.DB_PATH = process.env.DATABASE_PATH;
process.env.SESSION_SECRET = 'isolated-e2e-session-secret-not-for-production-2026';
process.env.CRON_SECRET = 'isolated-e2e-cron-secret';
process.env.DISABLE_CRON = 'true';
process.env.E2E_TEST_USER_ID = 'E2E-001';
process.env.E2E_TEST_PASSWORD = 'E2ePassw0rd!';

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
    baseURL: baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    serviceWorkers: 'block',
  },
  webServer: {
    command: process.env.CI
      ? `npm run start -- --hostname 127.0.0.1 --port ${port}`
      : `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 240_000,
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
