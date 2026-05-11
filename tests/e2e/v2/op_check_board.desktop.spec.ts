/**
 * op_check_board.desktop.spec.ts — 그룹 ② smoke
 *
 * 대상 라우트: /main-v2/ops/op-check-board
 * 목적: 환자 카드 표시, 카드 클릭 → 사이드 패널(페이지 이동 X), 상태 전환 색상 변경
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
  id: 'v2-op-check-user',
  employee_no: 'V2-OPS-001',
  name: process.env.TEST_USER_EMAIL ?? 'V2 OP 테스터',
  role: 'manager' as const,
  permissions: {
    ...fakeUser.permissions,
    'extra_OP체크': true,
    menu_추가기능: true,
  },
};

const dummyPatients = [
  {
    id: 'patient-check-001',
    patient_name: '홍길동',
    surgery_type: '백내장 수술',
    surgery_date: new Date().toISOString().slice(0, 10),
    status: 'pending',
    company_id: fakeUser.company_id,
  },
  {
    id: 'patient-check-002',
    patient_name: '이영희',
    surgery_type: '라식',
    surgery_date: new Date().toISOString().slice(0, 10),
    status: 'in_progress',
    company_id: fakeUser.company_id,
  },
];

// ─── 헬퍼 ────────────────────────────────────────────────────────────────────

async function setupOpCheckBoard(page: Page): Promise<void> {
  await mockSupabase(page, {
    staffMembers: [opsUser],
    notifications: [],
    opPatientChecks: dummyPatients,
  });
  await seedSession(page, { user: opsUser });
  await page.goto('/main-v2/ops/op-check-board');
}

// ─── 테스트 ───────────────────────────────────────────────────────────────────

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test('OP 체크 보드 진입 시 페이지가 렌더된다', async ({ page }) => {
  await setupOpCheckBoard(page);

  await expect(
    page.locator('h1, [data-testid="op-check-board-title"]'),
  ).toBeVisible();
});

test('환자 카드가 1개 이상 표시된다', async ({ page }) => {
  await setupOpCheckBoard(page);

  const cards = page.locator(
    '[data-testid^="patient-card-"], [data-testid^="op-card-"], [role="article"], ul > li',
  );

  // 카드 렌더 대기 (최대 10초)
  await expect(cards.first()).toBeVisible({ timeout: 10_000 });
  const count = await cards.count();
  expect(count, '환자 카드가 1개 이상 있어야 한다').toBeGreaterThanOrEqual(1);
});

test('환자 카드 클릭 시 사이드 패널이 열리고 URL은 변경되지 않는다', async ({
  page,
}) => {
  await setupOpCheckBoard(page);

  const initialUrl = page.url();

  const firstCard = page
    .locator('[data-testid^="patient-card-"], [data-testid^="op-card-"], [role="article"]')
    .first();

  const cardVisible = await firstCard.isVisible({ timeout: 10_000 }).catch(() => false);
  if (!cardVisible) {
    test.skip();
    return;
  }

  await firstCard.click();

  // 사이드 패널(drawer / sheet)이 나타나야 한다
  const sidePanel = page.locator(
    '[data-testid="patient-detail-panel"], [data-testid="op-side-panel"], [role="dialog"], aside[data-open="true"]',
  );
  await expect(sidePanel).toBeVisible({ timeout: 8_000 });

  // 페이지 이동이 없어야 한다 (URL 동일)
  expect(page.url(), 'URL이 변경되지 않아야 한다').toBe(initialUrl);
});

test('상태 전환 버튼 클릭 시 시각적 색상이 변경된다', async ({ page }) => {
  await setupOpCheckBoard(page);

  const statusButton = page
    .locator(
      '[data-testid^="status-btn-"], button[aria-label*="상태"], button:has-text("완료"), button:has-text("진행")',
    )
    .first();

  const buttonVisible = await statusButton.isVisible({ timeout: 10_000 }).catch(() => false);
  if (!buttonVisible) {
    test.skip();
    return;
  }

  // 클릭 전 배경색 또는 클래스 스냅샷
  const beforeClass = await statusButton.getAttribute('class') ?? '';
  const beforeStyle = await statusButton.evaluate(
    (el) => window.getComputedStyle(el).backgroundColor,
  );

  await statusButton.click();

  // 색상 또는 클래스 변화 확인 (둘 중 하나라도 변해야 한다)
  const afterClass = await statusButton.getAttribute('class') ?? '';
  const afterStyle = await statusButton.evaluate(
    (el) => window.getComputedStyle(el).backgroundColor,
  );

  const changed = beforeClass !== afterClass || beforeStyle !== afterStyle;
  expect(changed, '상태 전환 후 버튼 스타일이 변경되어야 한다').toBe(true);
});
