/**
 * lib/measurement/axe-runner.ts
 * K5 WCAG AA 자동 검사 — axe-core dev 전용 (JM3·JM4·JM6)
 *
 * production 환경에서는 import 자체를 막아 번들에 포함되지 않는다.
 */

import type { AxeResults, Result } from 'axe-core';

// ─────────────────────────────────────────────
// production 가드 (JM2)
// ─────────────────────────────────────────────

const isDev = process.env.NODE_ENV !== 'production';

// ─────────────────────────────────────────────
// 결과 출력 헬퍼
// ─────────────────────────────────────────────

function printViolation(v: Result): void {
  console.groupCollapsed(`  ❌ [${v.impact ?? 'unknown'}] ${v.help} (${v.id})`);
  console.log('📋 설명:', v.description);
  console.log('🔗 더 보기:', v.helpUrl);
  v.nodes.slice(0, 3).forEach((node, i) => {
    console.log(`  노드 ${i + 1}:`, node.html);
    if (node.failureSummary) {
      console.log('  수정 가이드:', node.failureSummary);
    }
  });
  console.groupEnd();
}

function printPasses(passes: Result[]): void {
  if (passes.length === 0) return;
  console.groupCollapsed(`  ✅ 통과 규칙 ${passes.length}개`);
  passes.forEach((p) => console.log(`  - ${p.id}: ${p.help}`));
  console.groupEnd();
}

// ─────────────────────────────────────────────
// 메인 실행 함수
// ─────────────────────────────────────────────

/**
 * axe-core를 실행해 접근성 위반 사항을 콘솔에 출력한다.
 *
 * @param target 검사 대상 Element (기본: document.body)
 * @returns AxeResults — dev에서만 실제 결과, production에서는 null 반환
 *
 * 에러는 console.warn으로만 처리 — 측정 실패가 앱을 깨면 안 됨 (JM3).
 */
export async function runAxe(target?: Element): Promise<AxeResults | null> {
  if (!isDev || typeof window === 'undefined') return null;

  let results: AxeResults;

  try {
    const axe = await import('axe-core');
    const context = target ?? document.body;

    results = await axe.default.run(context, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'best-practice'] } });
  } catch (err: unknown) {
    console.warn('[axe-core] 실행 실패:', err);
    return null;
  }

  const { violations, passes, incomplete } = results;

  console.group(
    `[axe-core] 접근성 검사 — 위반 ${violations.length}개 / 경고 ${incomplete.length}개 / 통과 ${passes.length}개`,
  );

  if (violations.length === 0) {
    console.log('✅ WCAG AA 위반 사항 없음');
  } else {
    console.group(`❌ 위반 사항 (${violations.length}개)`);
    violations.forEach(printViolation);
    console.groupEnd();
  }

  if (incomplete.length > 0) {
    console.groupCollapsed(`⚠️ 수동 검토 필요 (${incomplete.length}개)`);
    incomplete.forEach((item) => console.log(`  - ${item.id}: ${item.help}`));
    console.groupEnd();
  }

  printPasses(passes);
  console.groupEnd();

  return results;
}
