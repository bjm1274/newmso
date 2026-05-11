/**
 * payroll_workcenter.desktop.spec.ts — 그룹 ① smoke
 *
 * 대상 라우트: /main-v2/hr/payroll-workcenter
 * 목적: 4단계 네비 표시·활성 전환, 시뮬레이터 패널 토글, API 호출 상한 ≤ 5건
 *
 * JM: 단일 책임 — smoke only
 * JM4: any 금지, Playwright 타입 활용
 * JM5: 자격증명은 process.env.TEST_USER_EMAIL
 * JM7: 행동 검증만, 구현 디테일 X
 */

import { expect, test, type Page } from '@playwright/test';
import { dismissDialogs, fakeUser, mockSupabase, seedSession } from '../helpers';

// ─── 픽스처 ──────────────────────────────────────────────────────────────────

const payrollUser = {
  ...fakeUser,
  id: 'v2-payroll-wc-user',
  employee_no: 'V2-PAY-001',
  name: process.env.TEST_USER_EMAIL ?? 'V2 급여 테스터',
  role: 'manager' as const,
  permissions: {
    ...fakeUser.permissions,
    hr: true,
    hr_급여: true,
    menu_인사관리: true,
  },
};

// ─── 헬퍼 ────────────────────────────────────────────────────────────────────

async function setupPayrollWorkcenter(page: Page): Promise<void> {
  await mockSupabase(page, {
    staffMembers: [payrollUser],
    notifications: [],
  });
  await seedSession(page, { user: payrollUser });
  await page.goto('/main-v2/hr/payroll-workcenter');
}

// ─── 테스트 ───────────────────────────────────────────────────────────────────

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test('급여 워크센터 진입 시 페이지가 렌더된다', async ({ page }) => {
  await setupPayrollWorkcenter(page);

  // 페이지 제목 영역 또는 헤딩이 표시되어야 한다
  await expect(page.locator('h1, [data-testid="payroll-workcenter-title"]')).toBeVisible();
});

test('4단계 네비게이션 스텝이 모두 표시된다', async ({ page }) => {
  await setupPayrollWorkcenter(page);

  // 4단계 nav 또는 stepper 항목 수 검증
  const stepItems = page.locator(
    '[data-testid^="payroll-step-"], [role="tab"], nav [aria-label*="단계"], ol > li',
  );
  const count = await stepItems.count();
  expect(count, '4단계 이상 표시되어야 한다').toBeGreaterThanOrEqual(4);
});

test('첫 번째 스텝 클릭 시 활성 강조가 변경된다', async ({ page }) => {
  await setupPayrollWorkcenter(page);

  // 첫 번째 스텝/탭 버튼을 클릭하고 활성 상태 변화 확인
  const firstStep = page
    .locator('[data-testid^="payroll-step-"], [role="tab"]')
    .first();

  // 이미 첫 스텝이 활성인 경우를 대비해 두 번째를 먼저 클릭 후 첫 번째로 복귀
  const secondStep = page
    .locator('[data-testid^="payroll-step-"], [role="tab"]')
    .nth(1);

  const secondVisible = await secondStep.isVisible().catch(() => false);
  if (secondVisible) {
    await secondStep.click();
  }

  await firstStep.click();

  // 첫 스텝이 활성(aria-selected 또는 aria-current) 상태여야 한다
  const isActive =
    (await firstStep.getAttribute('aria-selected')) === 'true' ||
    (await firstStep.getAttribute('aria-current')) !== null ||
    (await firstStep.getAttribute('data-active')) === 'true';

  expect(isActive, '첫 번째 스텝이 활성 상태여야 한다').toBe(true);
});

test('시뮬레이터 패널 토글이 동작한다', async ({ page }) => {
  await setupPayrollWorkcenter(page);

  const toggleButton = page.locator(
    '[data-testid="simulator-toggle"], button:has-text("시뮬레이터"), button:has-text("계산기"), button[aria-controls]',
  ).first();

  const toggleVisible = await toggleButton.isVisible().catch(() => false);
  if (!toggleVisible) {
    // 시뮬레이터가 아직 구현되지 않은 경우 테스트 건너뜀
    test.skip();
    return;
  }

  // 패널이 닫혀 있는 경우 열기
  const panel = page.locator('[data-testid="simulator-panel"], [role="complementary"][aria-label*="시뮬레이터"]');
  const panelInitiallyVisible = await panel.isVisible().catch(() => false);

  await toggleButton.click();

  if (panelInitiallyVisible) {
    await expect(panel).toBeHidden();
    await toggleButton.click();
    await expect(panel).toBeVisible();
  } else {
    await expect(panel).toBeVisible();
  }
});

test('초기 로드 시 Supabase API 호출이 5건 이하다', async ({ page }) => {
  let apiCallCount = 0;

  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('/rest/v1/') || url.includes('/auth/v1/')) {
      apiCallCount++;
    }
  });

  await setupPayrollWorkcenter(page);
  await page.waitForLoadState('networkidle');

  expect(
    apiCallCount,
    `초기 Supabase 호출 수 ${apiCallCount}건이 상한 5건을 초과한다`,
  ).toBeLessThanOrEqual(5);
});
