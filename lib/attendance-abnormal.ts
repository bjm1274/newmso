/**
 * 근태이상(abnormal) lookback 윈도우 SSOT.
 *
 * PC AbnormalWorkcenter 는 원래 4주(28일 inclusive) 윈도우를 사용했고,
 * 모바일 useTeamAbnormalByDay / resolveTeamAbnormalForStaff 는 30일이었음.
 * 본 모듈로 28일에 정렬한다.
 *
 * resolve / clarify 쓰기 경로는 PC(kind별 필터 + dual table update)와
 * 모바일(일자 단위 + notifications clarify)이 달라 아직 공유하지 않는다.
 * clarify 는 당분간 모바일 전용.
 *
 * attendance-sync 의 dual-write API 는 건드리지 않는다.
 */

import { formatKoreanDateKey } from '@/lib/seoul-time';

/** 근태이상 조회·정상처리 lookback (일). 오늘 포함 28일 = 4주. */
export const ABNORMAL_LOOKBACK_DAYS = 28;

/**
 * lookback 구간의 YYYY-MM-DD 배열 (오름차순, 오늘 포함).
 * 기본 28일: [today-(days-1), …, today]
 *
 * @param days  일수 (기본 {@link ABNORMAL_LOOKBACK_DAYS})
 * @param now   기준 시각 (테스트/고정용)
 */
export function buildLookbackDays(
  days: number = ABNORMAL_LOOKBACK_DAYS,
  now: Date = new Date(),
): string[] {
  const safeDays = Number.isFinite(days) && days > 0 ? Math.floor(days) : ABNORMAL_LOOKBACK_DAYS;
  const result: string[] = [];
  for (let i = safeDays - 1; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    result.push(formatKoreanDateKey(d));
  }
  return result;
}

/** lookback 시작일 (YYYY-MM-DD). gte 필터용. */
export function getAbnormalLookbackSince(
  days: number = ABNORMAL_LOOKBACK_DAYS,
  now: Date = new Date(),
): string {
  const list = buildLookbackDays(days, now);
  return list[0] ?? formatKoreanDateKey(now);
}
