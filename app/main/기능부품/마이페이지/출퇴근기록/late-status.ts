/**
 * late-status.ts
 *
 * 체크인 시각의 지각 여부를 판정하는 순수 모듈(외부 의존 없음 → 단위검증 용이).
 * 데스크톱·모바일 출퇴근 체크인이 동일 규칙을 공유한다.
 *
 * JM : 단일 책임(지각 판정 규칙), JM4: any 금지
 */
import type { ShiftBoundary } from './commute-types';

/**
 * 근무유형 시작시각 기준 체크인 상태(정상/지각) 판정.
 *
 * 규칙:
 *  - shiftKnown=false: 기준 불명 → '정상'(오탐 방지)
 *  - 1일근무1일휴무 + 근무표(shift_assignments) 미배정: 휴무일 → '정상'
 *  - 그 외(근무일): 시작시각 초과(유예 0분) 또는 근무시간대 이탈 → '지각'
 *
 * (데스크톱 출퇴근기록/index.tsx 의 인라인 판정과 동일 규칙)
 */
export function decideCheckInStatus(boundary: ShiftBoundary, checkInIso: string): '정상' | '지각' {
  if (!boundary.shiftKnown) return '정상';
  if (boundary.shiftType === '1일근무1일휴무' && !boundary.rosterAssigned) return '정상';

  const checkIn = new Date(checkInIso);
  if (Number.isNaN(checkIn.getTime())) return '정상';

  const nowMin = checkIn.getHours() * 60 + checkIn.getMinutes();
  const startMin = boundary.hour * 60 + boundary.minute;
  const isLateByStart = nowMin > startMin; // 유예 0분(엄격)

  let isOutOfShiftWindow = false;
  if (boundary.endHour !== null && boundary.endMinute !== null) {
    const endMin = boundary.endHour * 60 + boundary.endMinute;
    if (endMin < startMin) {
      // 야간/교대(자정 넘김): [end, start-2h) 구간 체크인은 시간대 이탈
      const invalidStart = endMin;
      const invalidEnd = Math.max(0, startMin - 120);
      if (nowMin >= invalidStart && nowMin < invalidEnd) isOutOfShiftWindow = true;
    } else if (nowMin > endMin + 180) {
      // 일반 주간: 종료 +3h 이후 체크인은 시간대 이탈
      isOutOfShiftWindow = true;
    }
  }

  return isLateByStart || isOutOfShiftWindow ? '지각' : '정상';
}
