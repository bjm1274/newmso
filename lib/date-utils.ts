/**
 * 공통 날짜 유틸리티
 * 여러 컴포넌트에서 중복 사용되던 날짜 계산 로직을 통합
 */

import { formatDateLabel } from '@/lib/date-formatter';

/**
 * "YYYY-MM" 형식의 월 문자열에서 해당 월의 첫째 날과 마지막 날을 반환
 * @param yearMonth - "YYYY-MM" 형식 (예: "2026-05")
 */
export function getMonthBoundaries(yearMonth: string): { startDate: string; endDate: string } {
  const [year, month] = yearMonth.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return {
    startDate: `${yearMonth}-01`,
    endDate: `${yearMonth}-${String(lastDay).padStart(2, '0')}` };
}

/**
 * 날짜 값을 한국어 표시 포맷으로 변환 (예: "2026-05-02" → "2026. 5. 2.")
 * 값이 없으면 "현재" 반환, 파싱 불가 시 원본 반환.
 *
 * 예전에는 "lazy import 회피" 를 이유로 date-formatter 와 같은 로직을 여기에
 * 한 벌 더 두었는데, 정본에 `timeZone: 'Asia/Seoul'` 이 붙는 순간 이쪽만
 * 로컬 TZ 로 남아 두 함수의 결과가 갈렸다(8차 D12-012). 이제 정본에 위임한다.
 */
export function formatDateDisplay(value?: string | null): string {
  if (!value) return '현재';
  return formatDateLabel(value) || value;
}

/** 금액 표시 — date-formatter.formatWon 과 동일 SSOT 경로로 re-export */
export { formatWon } from '@/lib/date-formatter';

/**
 * 한국 시간 기준(UTC+9) 오늘 날짜 문자열 반환 (YYYY-MM-DD)
 * lib/seoul-time의 Intl 기반 정본을 재사용.
 */
export { getKoreanTodayString } from '@/lib/seoul-time';

/**
 * Date → 로컬 타임존 기준 'YYYY-MM-DD' 키 문자열.
 * UTC 변환을 쓰지 않으므로 로컬 날짜 경계와 일치 — 캘린더(근태/인계/메신저/조직도) 날짜 키로 사용.
 * (근무현황/인계노트/메신저/조직도서브 OrgChart 에 중복 정의되던 것을 통합)
 */
export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
