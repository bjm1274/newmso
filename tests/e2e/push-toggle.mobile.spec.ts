/**
 * push-toggle.mobile.spec.ts — 푸시 구독 토글 UI 검증
 *
 * 검증 흐름:
 *   1. 내정보 → 알림 진입 → PushSettingCard 노출 확인
 *   2. 토글(role=switch) aria-pressed 상태 확인
 *   3. 토글 클릭 → 상태 변경 확인 (권한 요청은 stub으로 mock)
 *
 * JM:  파일 단일 책임 (~195줄)
 * JM3: 실패 시 trace + screenshot 자동 보존
 * JM4: any 금지, Page 타입 활용
 * JM5: 자격증명 환경변수만 사용. SW/알림 권한은 addInitScript stub
 * JM7: 행동 테스트 — aria-pressed·role=switch·aria-label 기반
 */

import { expect, test, type Page } from '@playwright/test';
import { dismissDialogs, mockSupabase, seedSession } from './helpers';

// ─── stub ────────────────────────────────────────────────────────────────────

async function installPushStub(page: Page, perm: NotificationPermission = 'default') {
  await page.addInitScript((initialPerm) => {
    let _perm = initialPerm as NotificationPermission;
    const fakeReg = {
      scope: '/', active: { scriptURL: '/sw.js' }, waiting: null, installing: null,
      unregister: async () => true,
      pushManager: {
        getSubscription: async () => null,
        subscribe: async () => ({
          endpoint: 'https://fake-push.example.com/e',
          getKey: () => null,
          toJSON: () => ({ endpoint: 'https://fake-push.example.com/e' }),
          unsubscribe: async () => true,
        }),
      },
      showNotification: async () => undefined,
    };
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        register: async () => fakeReg, ready: Promise.resolve(fakeReg),
        getRegistration: async () => fakeReg, getRegistrations: async () => [fakeReg],
        addEventListener: () => undefined, removeEventListener: () => undefined,
      },
    });
    function FakeNotification(this: unknown) {}
    Object.defineProperty(FakeNotification, 'permission', { configurable: true, get: () => _perm });
    Object.defineProperty(FakeNotification, 'requestPermission', {
      configurable: true,
      value: async () => { _perm = 'granted'; return _perm; },
    });
    Object.defineProperty(window, 'Notification', { configurable: true, writable: true, value: FakeNotification });
  }, perm);
}

async function mockPushRoutes(page: Page) {
  await page.route('**/api/notifications/push-subscribe', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  );
  await page.route('**/api/notifications/push-unsubscribe', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  );
  await page.route('**/api/notifications/push-self-test', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  );
}

// ─── 공용 진입 ────────────────────────────────────────────────────────────────

async function gotoAlertView(page: Page) {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/main?open_menu=알림');
  await expect(page.getByTestId('main-shell')).toBeVisible();
}

// ─── 테스트 ──────────────────────────────────────────────────────────────────

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test('알림 화면에 푸시 알림 설정 카드가 노출된다', async ({ page }) => {
  await installPushStub(page, 'default');
  await mockSupabase(page, { notifications: [] });
  await seedSession(page, { localStorage: { erp_last_menu: '알림' } });

  await gotoAlertView(page);

  // PushSettingCard 텍스트 기반 확인 (VAPID 미설정 시 안내 문구 포함)
  const cardText = page.getByText(/푸시 알림/i);
  await expect(cardText.first()).toBeVisible({ timeout: 8000 });
});

test('푸시 토글(role=switch)의 aria-pressed 속성이 존재한다', async ({ page }) => {
  await installPushStub(page, 'granted');
  await mockSupabase(page, { notifications: [] });
  await seedSession(page, { localStorage: { erp_last_menu: '알림' } });

  await gotoAlertView(page);

  const toggleBtn = page.getByRole('switch', { name: /푸시 알림/i })
    .or(page.getByRole('button', { name: /푸시 알림 끄기|푸시 알림 켜기/i }));

  const count = await toggleBtn.count().catch(() => 0);
  if (count > 0) {
    const btn = toggleBtn.first();
    const ariaPressed = await btn.getAttribute('aria-pressed');
    const ariaChecked = await btn.getAttribute('aria-checked');
    expect(ariaPressed !== null || ariaChecked !== null).toBe(true);
  } else {
    // VAPID 미설정 → 안내 문구 노출
    const fallback = page.getByText(/푸시 알림 미설정|VAPID|미지원|지원하지 않/i);
    const hasFallback = await fallback.count().then(n => n > 0).catch(() => false);
    expect(hasFallback || count > 0).toBe(true);
  }
});

test('permission=granted 환경에서 푸시 토글 클릭 시 aria-pressed 상태가 바뀐다', async ({
  page, browserName,
}) => {
  test.skip(browserName === 'webkit', 'iOS WebKit은 홈 화면 추가 없이 푸시를 지원하지 않음');

  await installPushStub(page, 'granted');
  await mockPushRoutes(page);
  await mockSupabase(page, { notifications: [] });
  await seedSession(page, { localStorage: { erp_last_menu: '알림' } });

  await gotoAlertView(page);

  const toggleBtn = page.getByRole('switch', { name: /푸시 알림/i })
    .or(page.getByRole('button', { name: /푸시 알림 끄기|푸시 알림 켜기/i }));

  const count = await toggleBtn.count().catch(() => 0);
  test.skip(count === 0, 'VAPID 키 미설정 환경 — 토글 UI 없음');

  const btn = toggleBtn.first();
  const before = await btn.getAttribute('aria-pressed') ?? await btn.getAttribute('aria-checked');

  await btn.click();

  await expect
    .poll(async () =>
      btn.getAttribute('aria-pressed').then(v => v ?? undefined).catch(() => undefined) ??
      btn.getAttribute('aria-checked').catch(() => null),
      { timeout: 5000, intervals: [200, 500] }
    )
    .not.toBe(before);
});
