// ============================================================
// lib/db/mirror-metrics.ts
// D1 dual-write 미러 실패의 구조화된 로깅.
//
// 목표:
//   - 모든 mirror 실패가 동일한 형식의 JSON 한 줄로 stderr에 남는다.
//   - Cloudflare Workers Logs / `wrangler tail`에서
//     `event:"d1_mirror_failure"` 로 필터링 가능.
//   - 향후 Phase 3-B-2에서 cron으로 집계해 admin notifications로 알림 가능.
//
// 호출 측:
//   - lib/db/mirror.ts: mirrorRowsToD1
//   - lib/notification-utils.ts: mirrorNotificationsToD1
//   - lib/payroll-record-upsert.ts: mirrorPayrollUpsertToD1
//   - 기타 인라인 mirror 실패 처리도 이 헬퍼로 통일
// ============================================================

export interface MirrorFailureContext {
  /** label — mirror 헬퍼에서 식별용 (예: 'mirror:notifications', 'mirror:messages.quick-reply') */
  label: string;
  /** 영향받은 row 수 (배열 미러 시) */
  count?: number;
  /** D1 backend mode — 호출 측이 알면 명시 (없으면 'unknown') */
  backend?: 'supabase' | 'd1' | 'dual-write' | 'unknown';
  /** 추가 메타 (D1 binding 부재 사유, conflict policy 등) */
  reason?: string;
}

/**
 * D1 mirror 실패를 구조화 JSON으로 stderr에 출력.
 *
 * 한 줄 JSON 형식이어야 로그 파이프라인에서 추출 가능.
 * 호출은 throw하지 않는다 — 미러 실패가 main path를 깨지 않도록.
 */
function normalizeLabel(label: string): string {
  return label.startsWith('mirror:') ? label : `mirror:${label}`;
}

export function logD1MirrorFailure(error: unknown, context: MirrorFailureContext): void {
  const payload = {
    event: 'd1_mirror_failure',
    ts: new Date().toISOString(),
    label: normalizeLabel(context.label),
    backend: context.backend ?? 'unknown',
    count: context.count,
    reason: context.reason,
    error: error instanceof Error ? error.message : String(error),
    // stack은 로그 부피 큼 — Workers logs는 한 줄 권장이라 생략.
    // 필요 시 호출 측에서 별도 console.error로 dump.
  };

  // console.warn → console.error로 격상. Workers Logs는 둘 다 수집하지만
  // alert/필터링 시 error 레벨이 자연스럽다.
  console.error(JSON.stringify(payload));
}

/**
 * D1 binding이 없는 경우의 skip 알림.
 * 실패는 아니지만 dual-write 모드에서 발생하면 환경 설정 누락 신호이므로
 * 동일 channel로 기록한다.
 */
export function logD1BindingMissing(context: Pick<MirrorFailureContext, 'label' | 'backend'>): void {
  const payload = {
    event: 'd1_mirror_skipped',
    ts: new Date().toISOString(),
    label: normalizeLabel(context.label),
    backend: context.backend ?? 'unknown',
    reason: 'D1 binding unavailable' };
  console.warn(JSON.stringify(payload));
}
