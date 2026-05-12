/**
 * 게시판 a11y AA 회귀 검사
 * - axe-core WCAG 2.1 AA 룰
 * - critical/serious violation 0건 기대
 */

import { test, expect } from '@playwright/test';
import { seedSession } from '../e2e/helpers';
import { formatViolations, runAxeAA } from './axe-helper';

test('게시판 a11y AA @a11y', async ({ page }) => {
  await seedSession(page);
  await page.goto('/main?open_menu=게시판');
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
    `게시판에 critical/serious WCAG AA 위반:\n${formatViolations(blocking)}`,
  ).toHaveLength(0);
});
