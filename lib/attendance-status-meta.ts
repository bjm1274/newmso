/**
 * 근태 상태 표시 메타 SSOT.
 *
 * 레거시 `근태유틸.ts` / `근태관리메인-내부유틸.ts` 가 동일 맵을 복제하고 있었음.
 * `off` 키는 내부유틸(근무표 OFF) 쪽에만 있었고 유틸에는 없었음 → 통합 시 포함.
 *
 * LEGACY_ROSTER_APPROVAL_TYPE 은 approvals.type 값이 파일마다 다르므로 여기로 옮기지 않는다.
 */

export const ATTENDANCE_STATUS_META = {
  present: {
    label: '정상 출근',
    color: 'text-emerald-700 dark:text-emerald-400',
    bg: 'bg-emerald-50 dark:bg-emerald-900/30',
    ring: 'ring-emerald-200 dark:ring-emerald-800/50',
    dot: 'bg-emerald-500',
  },
  late: {
    label: '지각',
    color: 'text-orange-700 dark:text-orange-400',
    bg: 'bg-orange-500/10 dark:bg-orange-900/30',
    ring: 'ring-orange-200 dark:ring-orange-800/50',
    dot: 'bg-orange-500',
  },
  early_leave: {
    label: '조퇴',
    color: 'text-amber-700 dark:text-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-900/30',
    ring: 'ring-amber-200 dark:ring-amber-800/50',
    dot: 'bg-amber-500',
  },
  absent: {
    label: '결근',
    color: 'text-rose-700 dark:text-rose-400',
    bg: 'bg-rose-50 dark:bg-rose-900/30',
    ring: 'ring-rose-200 dark:ring-rose-800/50',
    dot: 'bg-rose-500',
  },
  annual_leave: {
    label: '연차',
    color: 'text-blue-700 dark:text-blue-400',
    bg: 'bg-blue-500/10 dark:bg-blue-900/30',
    ring: 'ring-blue-200 dark:ring-blue-800/50',
    dot: 'bg-blue-500',
  },
  sick_leave: {
    label: '병가',
    color: 'text-purple-700 dark:text-purple-400',
    bg: 'bg-purple-500/10 dark:bg-purple-900/30',
    ring: 'ring-purple-200 dark:ring-purple-800/50',
    dot: 'bg-purple-500',
  },
  half_leave: {
    label: '반차',
    color: 'text-cyan-700 dark:text-cyan-400',
    bg: 'bg-cyan-50 dark:bg-cyan-900/30',
    ring: 'ring-cyan-200 dark:ring-cyan-800/50',
    dot: 'bg-cyan-500',
  },
  holiday: {
    label: '휴일',
    color: 'text-[var(--toss-gray-4)] dark:text-[var(--toss-gray-3)]',
    bg: 'bg-[var(--tab-bg)] dark:bg-zinc-800',
    ring: 'ring-zinc-200 dark:ring-zinc-700',
    dot: 'bg-zinc-400',
  },
  /** 근무표 OFF (교대 배정). 레거시 내부유틸에만 있던 키를 통합. */
  off: {
    label: 'OFF',
    color: 'text-slate-600 dark:text-slate-400',
    bg: 'bg-slate-100 dark:bg-slate-800/40',
    ring: 'ring-slate-300 dark:ring-slate-700',
    dot: 'bg-slate-500',
  },
  missing: {
    label: '기록 없음',
    color: 'text-[var(--toss-gray-4)] dark:text-[var(--toss-gray-3)]',
    bg: 'bg-[var(--page-bg)] dark:bg-zinc-800/80',
    ring: 'ring-zinc-200 dark:ring-zinc-700',
    dot: 'bg-zinc-400',
  },
} as const;

export type AttendanceStatusMetaKey = keyof typeof ATTENDANCE_STATUS_META;
export type AttendanceStatusMeta = (typeof ATTENDANCE_STATUS_META)[AttendanceStatusMetaKey];

export function getAttendanceStatusMeta(status: string): AttendanceStatusMeta {
  const key = (status || 'missing') as AttendanceStatusMetaKey;
  return ATTENDANCE_STATUS_META[key] || ATTENDANCE_STATUS_META.missing;
}
