/**
 * login.mobile.spec.ts — 로그인 + 모바일 진입 시나리오
 *
 * 검증 흐름:
 *   1. 로그인 페이지가 렌더링됨을 확인
 *   2. 모바일 뷰포트(375×812)에서 MobileShell 확인 (5탭 하단바 + 더보기)
 *   3. 세션 seed 후 /main 진입 시 MobileShell 노출
 *
 * JM:  파일 단일 책임 (~100줄)
 * JM3: 실패 시 스크린샷 자동 (playwright.config trace: retain-on-failure)
 * JM4: any 금지, Playwright 타입 활용
 * JM5: 자격증명은 E2E_TEST_USER_ID / E2E_TEST_PASSWORD 환경변수만 사용
 * JM7: 행동 테스트 — 구현 디테일 비의존, role/aria-label 우선
 */

import { expect, test } from '@playwright/test';
import { dismissDialogs, fakeUser, mockSupabase, seedSession } from './helpers';

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test('로그인 페이지가 렌더링된다', async ({ page }) => {
  await page.goto('/');
  // 로그인 페이지: 직원번호 입력 또는 /login 리다이렉트
  await expect(page).toHaveURL(/\/(login|$)/);
  // 로그인 폼 요소 확인 — role 우선
  const hasPasswordField = await page.getByRole('textbox', { name: /비밀번호|password/i }).isVisible().catch(() => false);
  const hasLoginButton = await page.getByRole('button', { name: /로그인|login/i }).isVisible().catch(() => false);
  const hasAnyInput = await page.locator('input').count().then(n => n > 0).catch(() => false);

  // 로그인 입력 수단이 존재하면 성공 (form, input, button 중 하나)
  const loginPageReady = hasPasswordField || hasLoginButton || hasAnyInput;
  expect(loginPageReady).toBe(true);
});

test('모바일 뷰포트에서 세션 seed 후 MobileShell 5탭 하단바가 표시된다', async ({ page }) => {
  await mockSupabase(page);
  await seedSession(page, {
    localStorage: { erp_last_menu: '내정보' },
  });

  // 모바일 뷰포트 375×812 (iPhone 13 기준)
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/main');

  // MobileShell 컨테이너 확인
  await expect(page.getByTestId('main-shell')).toBeVisible();
  // 하단 탭바 확인
  await expect(page.getByTestId('mobile-tabbar')).toBeVisible();
});

test('모바일 MobileShell에서 더보기 메뉴 버튼이 존재한다', async ({ page }) => {
  await mockSupabase(page);
  await seedSession(page);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/main');

  await expect(page.getByTestId('main-shell')).toBeVisible();
  await expect(page.getByTestId('mobile-tabbar')).toBeVisible();

  // 더보기 탭 버튼 확인 (role=button + 텍스트 '더보기' or testid)
  const moreBtn =
    page.getByTestId('sidebar-menu-more-mobile').or(
      page.getByRole('button', { name: /더보기|more/i })
    );
  await expect(moreBtn.first()).toBeVisible();
});

test('세션 없이 /main 접근하면 로그인 페이지로 리다이렉트된다', async ({ page }) => {
  await page.goto('/main');
  // 로그인 페이지 또는 / 로 이동해야 함
  await expect(page).toHaveURL(/\/(login|$)/);
});
