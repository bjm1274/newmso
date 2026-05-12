/**
 * OP체크 a11y AA 회귀 검사
 * - OP체크는 추가기능 메뉴의 서브뷰 (open_subview=OP체크)
 * - axe-core WCAG 2.1 AA 룰
 * - critical/serious violation 0건 기대
 */

import { test, expect } from '@playwright/test';
import { seedSession } from '../e2e/helpers';
import { formatViolations, runAxeAA } from './axe-helper';

test('OP체크 a11y AA @a11y', async ({ page }) => {
  await seedSession(page);
  await page.goto('/main?open_menu=추가기능&open_subview=OP체크');
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
    `OP체크에 critical/serious WCAG AA 위반:\n${formatViolations(blocking)}`,
  ).toHaveLength(0);
});
