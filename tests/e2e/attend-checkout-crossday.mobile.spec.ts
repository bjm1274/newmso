/**
 * attend-checkout-crossday.mobile.spec.ts — 야간/이월 퇴근 후 기록 유지 회귀
 *
 * 회귀: 출근 기록 날짜가 '오늘'이 아닌(자정을 넘긴 야간/이월) 경우, 퇴근하기를 누르면
 * 완료 표시가 잠깐 뜬 뒤 fetchTodayLog 재조회가 그 기록을 못 찾아 화면이 비워지던 버그.
 * (오늘 쿼리=없음 + stale 구제 쿼리가 check_out IS NULL만 찾아 방금 닫힌 기록을 제외)
 *
 * 127.0.0.1에서 실행되어 GPS 우회가 적용되므로 퇴근 동작이 실제로 수행된다.
 */
import { expect, test } from '@playwright/test';
import { dismissDialogs, fakeUser, mockSupabase, seedSession } from './helpers';

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

function pad(n: number) {
  return String(n).padStart(2, '0');
}
function dateKeyOf(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

test('야간 이월 출근 기록을 퇴근 처리해도 완료 상태가 사라지지 않는다', async ({ page }) => {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yKey = dateKeyOf(yesterday);
  // 어제 22시에 출근, 아직 미퇴근인 야간 기록
  const checkInIso = new Date(
    yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 22, 0, 0,
  ).toISOString();

  await mockSupabase(page, {
    attendance: [
      {
        id: 'att-crossday-1',
        staff_id: fakeUser.id,
        date: yKey,
        check_in: checkInIso,
        check_out: null,
        status: '정상',
      },
    ],
  });
  await seedSession(page, { localStorage: { erp_last_menu: '내정보' } });

  await page.goto('/main');
  await expect(page.getByTestId('mypage-view')).toBeVisible({ timeout: 20000 });

  await page.getByRole('button', { name: '출퇴근', exact: true }).first().click();

  // 미퇴근 야간 기록이 구제되어 '퇴근하기' 상태로 진입해야 한다
  const checkoutBtn = page.getByRole('button', { name: /퇴근하기/ }).first();
  await expect(checkoutBtn).toBeVisible({ timeout: 12000 });

  await checkoutBtn.click();

  // 퇴근 직후: 완료 상태로 전환
  const doneBtn = page.getByRole('button', { name: /오늘 근무 완료/ }).first();
  await expect(doneBtn).toBeVisible({ timeout: 8000 });

  // 재조회(erp-attendance-updated)가 끝난 뒤에도 완료 상태가 유지되어야 한다 (사라지면 안 됨)
  await page.waitForTimeout(3000);
  await expect(doneBtn).toBeVisible();
  await expect(page.getByRole('button', { name: /^출근하기$/ })).toHaveCount(0);
});
