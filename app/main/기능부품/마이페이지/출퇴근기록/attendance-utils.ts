/**
 * attendance-utils.ts
 * 마이페이지 근태 집계 공용 유틸.
 * W1(출퇴근기록) 과 마이페이지 index.tsx 모두 이 파일에서 import.
 */

import { COMMUTE_STATUS_LABELS, NON_ABSENT_DISPLAY_STATUSES, type CommuteLog } from './commute-types';

/** displayStatus → 한글 표시 상태 반환 */
export function getDisplayStatus(log: CommuteLog | null | undefined): string {
  return String(log?.displayStatus || log?.status || '').trim();
}

export type MonthlyAttendance = {
  /** 이번 달 출퇴근 기록이 있는 날 수 (결근 포함) */
  total: number;
  /** 출+퇴 모두 있고 결근이 아닌 날 수 */
  present: number;
  /** 지각 횟수 */
  late: number;
  /** 결근 횟수 */
  absent: number;
};

function normalizeStatus(raw: string | null | undefined): string {
  const s = String(raw ?? '').trim();
  return COMMUTE_STATUS_LABELS[s] ?? s;
}

/**
 * attendance 테이블에서 가져온 raw log 배열을 집계.
 * getDisplayStatus 를 사용하지 않고 raw status 직접 집계
 * (마이페이지 fetch는 displayStatus 데코레이션 전이므로).
 */
export function calculateMonthlyAttendance(logs: CommuteLog[]): MonthlyAttendance {
  let total = 0;
  let present = 0;
  let late = 0;
  let absent = 0;

  for (const log of logs) {
    // isVirtual 로그는 집계에서 제외
    if (log.isVirtual) continue;

    const rawStatus = String(log.status ?? '').trim();
    const normalizedStatus = normalizeStatus(rawStatus);
    const displaySt = String(log.displayStatus || rawStatus).trim();

    // NON_ABSENT_DISPLAY_STATUSES: 연차/반차/병가 등은 total 포함, absent 제외
    if (NON_ABSENT_DISPLAY_STATUSES.has(normalizedStatus) || NON_ABSENT_DISPLAY_STATUSES.has(displaySt)) {
      total += 1;
      present += 1; // 연차·반차는 정상 출근으로 간주
      continue;
    }

    const isAbsent =
      normalizedStatus === '결근' ||
      displaySt === '결근' ||
      rawStatus === 'absent';

    if (isAbsent) {
      total += 1;
      absent += 1;
      continue;
    }

    const hasCheckIn = !!log.check_in;
    const hasCheckOut = !!log.check_out;

    if (hasCheckIn) {
      total += 1;
      if (hasCheckOut) {
        present += 1;
      }
    }

    const isLate =
      normalizedStatus === '지각' ||
      displaySt === '지각' ||
      rawStatus === 'late';
    if (isLate) {
      late += 1;
    }
  }

  return { total, present, late, absent };
}
