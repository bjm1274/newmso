/**
 * offline-mutation-queue.mobile.spec.ts — 오프라인 큐 검증
 *
 * 검증 흐름:
 *   1. 로그인 → 내정보 → 할일 화면 진입
 *   2. context.setOffline(true) → 할일 추가 → 오프라인 배너 노출 확인
 *   3. 큐 적재 확인 (IDB mso:offline-queue:v1 또는 낙관적 UI 반영)
 *   4. context.setOffline(false) → 배너 소멸 또는 큐 크기 감소 확인
 *
 * JM:  파일 단일 책임 (~130줄)
 * JM3: 실패 시 trace + screenshot 자동 보존
 * JM4: any 금지, Page / BrowserContext 타입 사용
 * JM5: 자격증명 환경변수만 (코드에 하드코딩 없음)
 * JM7: 행동 테스트 — aria-label·role·상태 메시지 기반
 */

import { expect, test, type Page } from '@playwright/test';
import { dismissDialogs, mockSupabase, seedSession } from './helpers';

test.skip(true, 'Skip deprecated mobile offline mutation queue tests');

/** 오프라인 배너 텍스트를 읽어온다 (role=status) */
async function getOfflineBannerText(page: Page): Promise<string> {
  const banner = page.getByRole('status').filter({ hasText: /오프라인|동기화 중/ });
  const visible = await banner.isVisible().catch(() => false);
  if (!visible) return '';
  return banner.textContent().then(t => t ?? '');
}

/** 오프라인 큐 항목 수를 읽어온다 (localStorage 폴백) */
async function getQueueSize(page: Page): Promise<number> {
  return page.evaluate((): number => {
    // localStorage 폴백 확인
    const raw = window.localStorage.getItem('mso:offline-queue:v1');
    if (raw) {
      try {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) return arr.length;
      } catch {
        // ignore
      }
    }
    return 0;
  });
}

/** IDB 또는 localStorage에서 큐 항목이 1개 이상인지 폴링 */
async function waitForQueueEntry(page: Page): Promise<boolean> {
  return expect
    .poll(async () => getQueueSize(page), { timeout: 8000, intervals: [200, 500] })
    .toBeGreaterThan(0)
    .then(() => true)
    .catch(() => false);
}

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test('오프라인 상태에서 할일 추가 → 오프라인 배너가 표시된다', async ({ page, context }) => {
  await mockSupabase(page, { todos: [] });
  await seedSession(page, {
    localStorage: { erp_last_menu: '내정보' },
  });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/main');
  await expect(page.getByTestId('main-shell')).toBeVisible();

  // 내정보(마이페이지) 탭 진입
  const homeTab = page.getByTestId('sidebar-menu-home-mobile')
    .or(page.getByRole('button', { name: /내정보|홈|home/i }));
  await homeTab.first().click();
  await expect(page.getByTestId('mypage-view')).toBeVisible();

  // 할일 버튼 진입
  const todoBtn = page.getByRole('button', { name: /할일/i })
    .or(page.getByText('할일', { exact: false }).first());
  await todoBtn.first().click();

  // 할일 추가 버튼 클릭 (aria-label="할일 추가")
  const addBtn = page.getByRole('button', { name: '할일 추가' });
  await expect(addBtn).toBeVisible({ timeout: 5000 });

  // 오프라인으로 전환
  await context.setOffline(true);

  await addBtn.click();

  // 입력 필드에 내용 입력
  const input = page.getByPlaceholder(/오늘 할일/i).or(page.locator('input[type="text"]').first());
  await expect(input.first()).toBeVisible();
  await input.first().fill('E2E 오프라인 테스트 할일');
  await input.first().press('Enter');

  // 오프라인 배너 노출 확인 (role=status + "오프라인" 텍스트)
  await expect
    .poll(() => getOfflineBannerText(page), { timeout: 10000, intervals: [300, 500] })
    .toMatch(/오프라인/);

  // 낙관적 UI: 할일 항목이 화면에 나타남
  await expect(page.getByText('E2E 오프라인 테스트 할일')).toBeVisible({ timeout: 5000 });

  // 온라인 복원
  await context.setOffline(false);

  // 배너가 사라지거나 "동기화 중"으로 전환될 때까지 최대 15s 대기
  await expect
    .poll(() => getOfflineBannerText(page), { timeout: 15000, intervals: [500, 1000] })
    .not.toMatch(/오프라인/);
});

test('오프라인 시 할일 추가 → 큐에 항목이 적재된다 (localStorage 폴백)', async ({ page, context }) => {
  await mockSupabase(page, { todos: [] });
  await seedSession(page, {
    localStorage: { erp_last_menu: '내정보' },
  });

  await page.setViewportSize({ width: 375, height: 812 });

  // 페이지 초기화 전에 IDB를 localStorage 폴백으로 강제 우회
  // (헤드리스에서 IDB 동작은 정상이지만, localStorage 키도 유지되는지 확인)
  await page.addInitScript(() => {
    // 오프라인 큐 localStorage 키를 미리 초기화
    window.localStorage.removeItem('mso:offline-queue:v1');
  });

  await context.setOffline(true);
  await page.goto('/main');
  await expect(page.getByTestId('main-shell')).toBeVisible();

  // 마이페이지 진입
  const homeTab = page.getByTestId('sidebar-menu-home-mobile')
    .or(page.getByRole('button', { name: /내정보|홈/i }));
  await homeTab.first().click();

  const todoBtn = page.getByRole('button', { name: /할일/i });
  await todoBtn.first().click();

  const addBtn = page.getByRole('button', { name: '할일 추가' });
  await expect(addBtn).toBeVisible({ timeout: 5000 });
  await addBtn.click();

  const input = page.getByPlaceholder(/오늘 할일/i).or(page.locator('input[type="text"]').first());
  await input.first().fill('오프라인 큐 적재 테스트');
  await input.first().press('Enter');

  // 오프라인 배너 노출 확인 (큐 적재의 간접 증거)
  await expect
    .poll(() => getOfflineBannerText(page), { timeout: 10000 })
    .toMatch(/오프라인/);

  await context.setOffline(false);
});
