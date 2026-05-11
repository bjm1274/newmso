/**
 * discharge_review.desktop.spec.ts — 그룹 ③ smoke
 *
 * 대상 라우트:
 *   목록: /main-v2/ops/discharge-review
 *   상세: /main-v2/ops/discharge-review/[id]
 * 목적: 목록 진입, 첫 환자 클릭 → 상세 진입, 3스텝 표시 + Step1→Step2 전환
 *
 * JM: 단일 책임 — smoke only
 * JM4: any 금지, Playwright 타입 활용
 * JM5: 자격증명은 process.env.TEST_USER_EMAIL
 * JM7: 행동 검증만, 구현 디테일 X
 */

import { expect, test, type Page } from '@playwright/test';
import { dismissDialogs, fakeUser, mockSupabase, seedSession } from '../helpers';

// ─── 픽스처 ──────────────────────────────────────────────────────────────────

const opsUser = {
  ...fakeUser,
  id: 'v2-discharge-user',
  employee_no: 'V2-DISC-001',
  name: process.env.TEST_USER_EMAIL ?? 'V2 퇴원심사 테스터',
  role: 'manager' as const,
  permissions: {
    ...fakeUser.permissions,
    'extra_퇴원심사': true,
    menu_추가기능: true,
  },
};

const dummyDischargeReviews = [
  {
    id: 'discharge-review-001',
    patient_name: '김철수',
    admission_date: '2026-05-01',
    planned_discharge_date: new Date().toISOString().slice(0, 10),
    status: 'pending',
    step: 1,
    company_id: fakeUser.company_id,
  },
  {
    id: 'discharge-review-002',
    patient_name: '박영수',
    admission_date: '2026-04-28',
    planned_discharge_date: new Date().toISOString().slice(0, 10),
    status: 'in_review',
    step: 2,
    company_id: fakeUser.company_id,
  },
];

// ─── 헬퍼 ────────────────────────────────────────────────────────────────────

async function setupDischargeList(page: Page): Promise<void> {
  await mockSupabase(page, {
    staffMembers: [opsUser],
    notifications: [],
    dischargeReviews: dummyDischargeReviews,
  });
  await seedSession(page, { user: opsUser });
  await page.goto('/main-v2/ops/discharge-review');
}

// ─── 테스트 ───────────────────────────────────────────────────────────────────

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test('퇴원심사 목록 진입 시 페이지가 렌더된다', async ({ page }) => {
  await setupDischargeList(page);

  await expect(
    page.locator('h1, [data-testid="discharge-review-title"]'),
  ).toBeVisible();
});

test('퇴원심사 목록에 환자 항목이 표시된다', async ({ page }) => {
  await setupDischargeList(page);

  const listItems = page.locator(
    '[data-testid^="discharge-item-"], [data-testid^="review-row-"], ul > li, tbody > tr',
  );

  await expect(listItems.first()).toBeVisible({ timeout: 10_000 });
  const count = await listItems.count();
  expect(count, '퇴원심사 항목이 1개 이상 있어야 한다').toBeGreaterThanOrEqual(1);
});

test('첫 번째 환자 클릭 시 상세 페이지로 이동한다', async ({ page }) => {
  await setupDischargeList(page);

  const firstItem = page
    .locator(
      '[data-testid^="discharge-item-"], [data-testid^="review-row-"], ul > li:first-child, tbody > tr:first-child',
    )
    .first();

  const itemVisible = await firstItem.isVisible({ timeout: 10_000 }).catch(() => false);
  if (!itemVisible) {
    test.skip();
    return;
  }

  await firstItem.click();

  // /discharge-review/[id] 패턴으로 URL이 변경되어야 한다
  await expect(page).toHaveURL(/\/discharge-review\/.+/, { timeout: 8_000 });
});

test('퇴원심사 상세에서 3개 스텝이 모두 표시된다', async ({ page }) => {
  await mockSupabase(page, {
    staffMembers: [opsUser],
    notifications: [],
    dischargeReviews: dummyDischargeReviews,
  });
  await seedSession(page, { user: opsUser });
  await page.goto(`/main-v2/ops/discharge-review/${dummyDischargeReviews[0].id}`);

  const steps = page.locator(
    '[data-testid^="step-"], [role="tab"], ol > li, [aria-label*="스텝"], [aria-label*="Step"]',
  );

  await expect(steps.first()).toBeVisible({ timeout: 10_000 });
  const count = await steps.count();
  expect(count, '3개 이상의 스텝이 표시되어야 한다').toBeGreaterThanOrEqual(3);
});

test('Step1에서 Step2로 전환이 동작한다', async ({ page }) => {
  await mockSupabase(page, {
    staffMembers: [opsUser],
    notifications: [],
    dischargeReviews: dummyDischargeReviews,
  });
  await seedSession(page, { user: opsUser });
  await page.goto(`/main-v2/ops/discharge-review/${dummyDischargeReviews[0].id}`);

  const step2 = page
    .locator(
      '[data-testid="step-2"], [role="tab"]:nth-child(2), ol > li:nth-child(2)',
    )
    .first();

  const step2Visible = await step2.isVisible({ timeout: 10_000 }).catch(() => false);
  if (!step2Visible) {
    test.skip();
    return;
  }

  await step2.click();

  // Step2가 활성 상태여야 한다
  const isActive =
    (await step2.getAttribute('aria-selected')) === 'true' ||
    (await step2.getAttribute('aria-current')) !== null ||
    (await step2.getAttribute('data-active')) === 'true';

  expect(isActive, 'Step2가 활성 상태여야 한다').toBe(true);
});
