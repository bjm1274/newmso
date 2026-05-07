const SUPABASE_SERVICE_RESTRICTION_PATTERNS = [
  /service for this project is restricted/i,
  /exceed_cached_egress_quota/i,
  /exceed_egress_quota/i,
];

function collectErrorTexts(
  value: unknown,
  bucket: string[],
  seen: Set<unknown>,
  depth = 0,
) {
  if (value == null || seen.has(value) || depth > 4) return;
  seen.add(value);

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) bucket.push(trimmed);
    return;
  }

  if (typeof value !== 'object') return;

  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    if (
      key === 'message' ||
      key === 'details' ||
      key === 'hint' ||
      key === 'code' ||
      key === 'error' ||
      key === 'cause'
    ) {
      collectErrorTexts(nestedValue, bucket, seen, depth + 1);
    }
  }
}

function hasServiceRestrictionStatus(value: unknown, seen: Set<unknown>, depth = 0): boolean {
  if (value == null || seen.has(value) || depth > 4) return false;
  seen.add(value);

  if (typeof value !== 'object') return false;

  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    if ((key === 'status' || key === 'statusCode') && Number(nestedValue) === 402) {
      return true;
    }

    if (typeof nestedValue === 'object' && hasServiceRestrictionStatus(nestedValue, seen, depth + 1)) {
      return true;
    }
  }

  return false;
}

export function isSupabaseServiceRestricted(error: unknown): boolean {
  const texts: string[] = [];
  collectErrorTexts(error, texts, new Set());
  const combinedText = texts.join(' ');

  if (SUPABASE_SERVICE_RESTRICTION_PATTERNS.some((pattern) => pattern.test(combinedText))) {
    return true;
  }

  return hasServiceRestrictionStatus(error, new Set());
}

export function getSupabaseServiceRestrictionMessage(error: unknown): string | null {
  if (!isSupabaseServiceRestricted(error)) return null;

  return '현재 Supabase 프로젝트가 쿼터 초과로 제한되어 있습니다. 로그인, 사진, 채팅, 권한 조회가 함께 비정상 동작할 수 있어요. Supabase 결제/사용량 한도 상태를 먼저 복구해야 합니다.';
}
