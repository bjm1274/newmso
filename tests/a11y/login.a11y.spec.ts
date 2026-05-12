/**
 * 로그인 페이지 a11y AA 회귀 검사
 *
 * - 인증 불필요, public 진입점
 * - axe-core WCAG 2.1 AA 룰
 * - critical/serious violation 0건 기대
 */

import { test, expect } from '@playwright/test';
import { formatViolations, runAxeAA } from './axe-helper';

test('로그인 페이지 a11y AA @a11y', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const { violations, blocking } = await runAxeAA(page);

  if (blocking.length > 0) {
    test.info().annotations.push({
      type: 'a11y-violations',
      description: formatViolations(violations),
    });
  }

  expect(
    blocking,
    `로그인 페이지에 critical/serious WCAG AA 위반:\n${formatViolations(blocking)}`,
  ).toHaveLength(0);
});
