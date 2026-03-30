import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { dismissDialogs, mockSupabase, seedSession } from './helpers';

async function installNotificationStubs(page: Page) {
  await page.addInitScript(() => {
    const fakeRegistration = {
      pushManager: {
        getSubscription: async () => null,
        subscribe: async () => null,
      },
      showNotification: async () => null,
    };

    function FakeNotification(this: Notification) {
      return this;
    }

    Object.defineProperty(FakeNotification, 'permission', {
      configurable: true,
      get: () => 'granted',
    });
    Object.defineProperty(FakeNotification, 'requestPermission', {
      configurable: true,
      value: async () => 'granted',
    });

    Object.defineProperty(window, 'Notification', {
      configurable: true,
      writable: true,
      value: FakeNotification,
    });

    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        register: async () => fakeRegistration,
        ready: Promise.resolve(fakeRegistration),
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      },
    });
  });
}

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test('todo reminders use server dispatch first when the API succeeds', async ({ page }) => {
  let dispatchCount = 0;
  let fallbackTodoQueryCount = 0;
  let fallbackReminderLogQueryCount = 0;

  await installNotificationStubs(page);
  await mockSupabase(page, {
    notifications: [],
  });

  await page.route('**/rest/v1/todos*', async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('select') === 'id,content,task_date,reminder_at') {
      fallbackTodoQueryCount += 1;
    }
    await route.fallback();
  });

  await page.route('**/rest/v1/todo_reminder_logs*', async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('select') === 'todo_id,reminder_at') {
      fallbackReminderLogQueryCount += 1;
    }
    await route.fallback();
  });

  await page.route('**/api/todos/reminders/dispatch', async route => {
    dispatchCount += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        scanned: 0,
        created: 0,
        skipped: 0,
        failed: 0,
        errors: [],
      }),
    });
  });

  await seedSession(page);
  await page.goto('/main');
  await expect(page.getByTestId('main-shell')).toBeVisible();

  await expect.poll(() => dispatchCount).toBeGreaterThan(0);
  await page.waitForTimeout(500);

  expect(fallbackTodoQueryCount).toBe(0);
  expect(fallbackReminderLogQueryCount).toBe(0);
});

test('todo reminders fall back to local Supabase queries when the server dispatch fails', async ({
  page,
}) => {
  let dispatchCount = 0;
  let fallbackTodoQueryCount = 0;
  let fallbackReminderLogQueryCount = 0;
  let fallbackReminderLogWriteCount = 0;

  await installNotificationStubs(page);
  await mockSupabase(page, {
    notifications: [],
  });

  await page.route('**/rest/v1/todos*', async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('select') === 'id,content,task_date,reminder_at') {
      fallbackTodoQueryCount += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'todo-reminder-e2e-1',
            content: '서버 실패시 로컬 fallback 확인',
            task_date: '2026-03-30',
            reminder_at: '2026-03-30T00:00:00.000Z',
          },
        ]),
      });
      return;
    }

    await route.fallback();
  });

  await page.route('**/rest/v1/todo_reminder_logs*', async route => {
    const method = route.request().method();
    const url = new URL(route.request().url());

    if (method === 'GET' && url.searchParams.get('select') === 'todo_id,reminder_at') {
      fallbackReminderLogQueryCount += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
      return;
    }

    if (method === 'POST') {
      fallbackReminderLogWriteCount += 1;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
      return;
    }

    await route.fallback();
  });

  await page.route('**/api/todos/reminders/dispatch', async route => {
    dispatchCount += 1;
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: false,
        error: 'forced e2e failure',
      }),
    });
  });

  await seedSession(page);
  await page.goto('/main');
  await expect(page.getByTestId('main-shell')).toBeVisible();

  await expect.poll(() => dispatchCount).toBeGreaterThan(0);
  await expect.poll(() => fallbackTodoQueryCount).toBeGreaterThan(0);
  await expect.poll(() => fallbackReminderLogQueryCount).toBeGreaterThan(0);
  await expect.poll(() => fallbackReminderLogWriteCount).toBeGreaterThan(0);
});
