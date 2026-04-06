/**
 * 공통 날짜/금액 포매팅 유틸
 * 기존에 approval-report-utils.ts, hr-history-ledger.ts에 분산되어 있던
 * 날짜 포맷 함수들을 통합
 */

/** ISO 날짜 문자열 → 한국 날짜 형식 (예: 2024. 1. 5.) */
export function formatDateLabel(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString('ko-KR');
}

/** "YYYY-MM" 형식 → "YYYY년 M월" */
export function formatMonthLabel(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const [year, month] = raw.split('-');
  if (!year || !month) return raw;
  const numericMonth = Number(month);
  if (!Number.isFinite(numericMonth)) return raw;
  return `${year}년 ${numericMonth}월`;
}

/** 시작일~종료일을 "YYYY. M. D. ~ YYYY. M. D." 형식으로 반환. 같으면 단일 날짜. */
export function buildDateRangeLabel(startValue: unknown, endValue: unknown): string {
  const startLabel = formatDateLabel(startValue);
  const endLabel = formatDateLabel(endValue);
  if (startLabel && endLabel) {
    return startLabel === endLabel ? startLabel : `${startLabel} ~ ${endLabel}`;
  }
  return startLabel || endLabel;
}

/** string이면 그대로, null/undefined면 빈 문자열 반환 (DB 날짜 필드 정규화용). */
export function normalizeDateString(value: string | null | undefined): string {
  return typeof value === 'string' ? value : '';
}

/** 숫자를 "N원" 형식으로 변환 (예: 3000000 → "3,000,000원") */
export function formatWon(value: number): string {
  return `${value.toLocaleString()}원`;
}
