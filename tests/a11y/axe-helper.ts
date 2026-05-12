/**
 * axe-core 실행 헬퍼
 *
 * - axe-core/axe.min.js를 페이지에 inject 후 WCAG 2.1 AA 룰로 검사
 * - critical/serious violation만 실패 처리 (moderate/minor는 정보 제공)
 * - 페이지별 spec에서 runAxeAA(page)로 사용
 */

import type { Page } from '@playwright/test';
import path from 'node:path';

export type AxeViolation = {
  id: string;
  impact?: 'minor' | 'moderate' | 'serious' | 'critical' | null;
  description: string;
  help: string;
  helpUrl: string;
  nodes: Array<{ html: string; target: string[] }>;
};

export type AxeResult = {
  violations: AxeViolation[];
  blocking: AxeViolation[];
};

const AXE_SCRIPT_PATH = path.resolve(process.cwd(), 'node_modules/axe-core/axe.min.js');

export async function runAxeAA(page: Page): Promise<AxeResult> {
  await page.addScriptTag({ path: AXE_SCRIPT_PATH });
  const raw = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (opts: unknown) => Promise<unknown> } }).axe;
    if (!axe) throw new Error('axe-core 미주입');
    return axe.run({
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
      resultTypes: ['violations'],
    });
  });
  const violations = ((raw as { violations: AxeViolation[] }).violations ?? []) as AxeViolation[];
  const blocking = violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  return { violations, blocking };
}

export function formatViolations(violations: AxeViolation[]): string {
  if (violations.length === 0) return '(none)';
  return violations
    .map((v) => `[${v.impact ?? '?'}] ${v.id} (${v.nodes.length}건) — ${v.help}\n  ${v.helpUrl}`)
    .join('\n');
}
