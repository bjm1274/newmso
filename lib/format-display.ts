/**
 * Shared display formatters for mobile lists (timestamps, money).
 */
import { formatKoreanClock, parseDbTimestamp } from '@/lib/date-formatter';
import { formatKoreanDateKey, getKoreanTodayString } from '@/lib/seoul-time';

export type FormatTsMode = 'relative' | 'datetime';

/**
 * Format an ISO timestamp for list/card UI.
 * - relative (default): today → HH:mm, yesterday → "어제", else → M/D
 * - datetime: M/D HH:mm
 */
export function formatTs(iso?: string | null, mode: FormatTsMode = 'relative'): string {
  if (!iso) return '';
  const parsed = parseDbTimestamp(iso);
  if (Number.isNaN(parsed.getTime())) return '';

  // 전부 KST 로 판단한다. 예전에는 getMonth()/getDate()/getHours() 를 써서
  // 렌더 환경의 TZ 를 따랐고, 서버 렌더(Workers=UTC)에서는 시각이 9시간
  // 이르게, 날짜 경계(오늘/어제)는 하루 밀려 보였다.
  const dateKey = formatKoreanDateKey(parsed);
  const clock = formatKoreanClock(iso);
  const [, month, day] = dateKey.split('-');
  const shortDate = `${Number(month)}/${Number(day)}`;

  if (mode === 'datetime') return `${shortDate} ${clock}`;

  const todayKey = getKoreanTodayString();
  if (dateKey === todayKey) return clock;

  const yesterday = new Date(`${todayKey}T00:00:00+09:00`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  if (dateKey === formatKoreanDateKey(yesterday)) return '어제';

  return shortDate;
}

/** Number → locale string (ko-KR), floored. */
export function formatMoney(n: number): string {
  return Math.floor(n).toLocaleString('ko-KR');
}
