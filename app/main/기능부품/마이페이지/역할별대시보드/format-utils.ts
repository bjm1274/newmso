import {
  normalizeApprovalLineIds,
  resolveApprovalLineIds,
  resolveStoredCurrentApproverId,
  resolveEffectiveApproverIdCore,
} from '@/lib/approval-shared';

// 결재 공용 순수 유틸은 lib/approval-shared.ts 로 통합 — 기존 export 경로 유지를 위해 re-export.
export { normalizeApprovalLineIds, resolveApprovalLineIds, resolveStoredCurrentApproverId };

// 역할별대시보드 컴포넌트(삭제됨)에 있던 types.ts 에서 이 모듈이 사용하던 타입만 인라인 보존.
export type ApprovalRow = Record<string, unknown>;
export type TodayAttendance = {
  in: string | null;
  out: string | null;
  status: string | null;
};

export function formatTodayAttendancePrimary(
  todayAttendance: TodayAttendance,
  formatTime: (value: string | null) => string,
) {
  const normalizedStatus = String(todayAttendance.status ?? '').trim().toLowerCase();
  if (normalizedStatus === 'annual_leave' || normalizedStatus === '연차휴가') return '연차';
  if (normalizedStatus === 'half_leave' || normalizedStatus === '반차휴가') return '반차';
  if (normalizedStatus === 'sick_leave' || normalizedStatus === '병가') return '병가';
  return formatTime(todayAttendance.in);
}

export function formatTodayAttendanceSecondary(
  todayAttendance: TodayAttendance,
  formatTime: (value: string | null) => string,
) {
  const normalizedStatus = String(todayAttendance.status ?? '').trim().toLowerCase();
  if (normalizedStatus === 'annual_leave' || normalizedStatus === '연차휴가') return '승인된 연차 일정';
  if (normalizedStatus === 'half_leave' || normalizedStatus === '반차휴가') return '승인된 반차 일정';
  if (normalizedStatus === 'sick_leave' || normalizedStatus === '병가') return '승인된 병가 일정';
  return todayAttendance.out ? `퇴근 ${formatTime(todayAttendance.out)}` : null;
}

export function resolveEffectiveApproverId(
  approverId: string | null | undefined,
  approverMap: Map<string, Record<string, unknown>>,
) {
  return resolveEffectiveApproverIdCore(approverId, approverMap.get(String(approverId ?? '')));
}
