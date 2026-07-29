/**
 * KST(Asia/Seoul) 기준 날짜·시간 헬퍼.
 *
 * Cloudflare Workers / Node 서버는 timezone이 UTC라 `new Date().toISOString().slice(0,10)`을 그대로
 * 사용하면 KST 자정 직전에 다음날로 잘못 인식한다 (예: KST 23:00 = UTC 14:00 다음날 00:00).
 *
 * 모든 DB insert·cron·통계 키는 이 헬퍼를 사용해 KST 기준으로 통일.
 */

export const SEOUL_TIME_ZONE = 'Asia/Seoul';

/** 오늘 날짜를 KST 기준 'YYYY-MM-DD'로 반환. */
export function getKoreanTodayString(now: Date = new Date()): string {
  return formatKoreanDateKey(now);
}

/** 임의 Date를 KST 기준 'YYYY-MM-DD'로 변환. */
export function formatKoreanDateKey(date: Date): string {
  // sv-SE 로케일은 ISO 형식(YYYY-MM-DD) — timeZone 옵션으로 KST 강제
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: SEOUL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit' }).format(date);
}

/** KST 기준 'YYYY-MM' 반환 (월 단위 키). */
export function getKoreanMonthString(now: Date = new Date()): string {
  return formatKoreanDateKey(now).slice(0, 7);
}

/** KST 기준 시:분(`HH:mm`) 반환. */
export function formatKoreanTimeLabel(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: SEOUL_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23' }).format(date);
}

/** ko-KR 로케일 + KST timezone 적용한 사용자 친화 라벨. */
export function formatKoreanDateLabel(date: Date = new Date()): string {
  return date.toLocaleDateString('ko-KR', { timeZone: SEOUL_TIME_ZONE });
}

/**
 * 날짜+시각 라벨 (KST 고정).
 *
 * 서버(Cloudflare Worker)의 로컬 타임존은 UTC 라, 화면에 보일 시각을
 * 서버에서 만들 때 timeZone 없이 toLocaleString 을 쓰면 9시간 어긋난다.
 * 서버에서 시각 문자열을 만들 일이 있으면 이걸 쓴다.
 */
export function formatKoreanDateTimeLabel(value: string | number | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value ?? '');
  return date.toLocaleString('ko-KR', { timeZone: SEOUL_TIME_ZONE });
}
