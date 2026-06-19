/**
 * mobile-home-subroutes.mobile.spec.ts — 모바일 내정보(홈) 하위화면 진입 회귀
 *
 * 회귀 배경: MobileShell의 route↔전역 subView 동기화 effect가 mypage 탭에서도
 * route.sub를 PC용 subView(기본 '전체')로 덮어써, 출퇴근/연차 등 홈 하위화면을
 * 탭해도 즉시 홈으로 튕기던 버그. mypage 탭을 sub 동기화에서 제외해 수정.
 */
import { expect, test } from '@playwright/test';
import { dismissDialogs, mockSupabase, seedSession } from './helpers';

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test('모바일 출퇴근 타일 탭 → 출퇴근 체크인 화면이 열린다', async ({ page }) => {
  await mockSupabase(page, { attendance: [] });
  await seedSession(page, { localStorage: { erp_last_menu: '내정보' } });

  await page.goto('/main');
  await expect(page.getByTestId('mypage-view')).toBeVisible({ timeout: 20000 });

  await page.getByRole('button', { name: '출퇴근', exact: true }).first().click();

  // 출퇴근 체크인 화면의 큰 액션 버튼이 떠야 한다 (홈으로 튕기지 않음)
  await expect(
    page.getByRole('button', { name: /출근하기|퇴근하기|오늘 근무 완료/ }).first(),
  ).toBeVisible({ timeout: 12000 });
});

test('모바일 연차 타일 탭 → 연차 화면이 열린다', async ({ page }) => {
  await mockSupabase(page, { attendance: [], leaveRequests: [] });
  await seedSession(page, { localStorage: { erp_last_menu: '내정보' } });

  await page.goto('/main');
  await expect(page.getByTestId('mypage-view')).toBeVisible({ timeout: 20000 });

  await page.getByRole('button', { name: '연차', exact: true }).first().click();

  // 홈(빠른 메뉴)으로 되돌아가지 않았는지 — '바로가기' 홈 섹션이 사라졌는지로 확인
  await expect(page.getByRole('button', { name: '출퇴근', exact: true })).toHaveCount(0);
});
