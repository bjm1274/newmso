/**
 * 공통 데이터 정규화 유틸
 * 기존에 approval-workflow.ts, approval-report-utils.ts, hr-history-ledger.ts에 분산되어 있던
 * asMetaData / asRecord / cleanString / asTrimmedString / asNumber 함수를 통합
 */

/** unknown 값을 Record<string, unknown>으로 변환. 객체가 아니면 빈 객체 반환. */
export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? { ...(value as Record<string, unknown>) } : {};
}

/** unknown 값을 문자열로 변환 후 앞뒤 공백 제거. null/undefined는 빈 문자열. */
export function cleanString(value: unknown): string {
  return String(value ?? '').trim();
}

/** 문자열 타입인 경우에만 trim. 그 외 타입은 빈 문자열 반환. */
export function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** 문자열/숫자를 number로 파싱. 콤마 제거 후 변환. 유효하지 않으면 null. */
export function asNumber(value: unknown): number | null {
  if (typeof value === 'boolean' || value === null || value === undefined || value === '') {
    return null;
  }
  const normalized =
    typeof value === 'string' ? Number(value.replace(/,/g, '')) : Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

/** cleanString 결과가 빈 문자열이면 null, 아니면 해당 문자열 반환. */
export function asNullableString(value: unknown): string | null {
  const normalized = cleanString(value);
  return normalized || null;
}
