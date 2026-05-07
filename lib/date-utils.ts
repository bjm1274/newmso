/**
 * 공통 날짜 유틸리티
 * 여러 컴포넌트에서 중복 사용되던 날짜 계산 로직을 통합
 */

/**
 * "YYYY-MM" 형식의 월 문자열에서 해당 월의 첫째 날과 마지막 날을 반환
 * @param yearMonth - "YYYY-MM" 형식 (예: "2026-05")
 */
export function getMonthBoundaries(yearMonth: string): { startDate: string; endDate: string } {
  const [year, month] = yearMonth.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return {
    startDate: `${yearMonth}-01`,
    endDate: `${yearMonth}-${String(lastDay).padStart(2, '0')}`,
  };
}

/**
 * 날짜 값을 한국어 표시 포맷으로 변환 (예: "2026-05-02" → "2026. 5. 2.")
 * 값이 없으면 "현재" 반환, 파싱 불가 시 원본 반환
 */
export function formatDateDisplay(value?: string | null): string {
  if (!value) return '현재';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('ko-KR');
}

/**
 * 한국 시간 기준(UTC+9) 오늘 날짜 문자열 반환 (YYYY-MM-DD)
 */
export function getKoreanTodayString(): string {
  const now = new Date();
  const koreaNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return koreaNow.toISOString().split('T')[0];
}
