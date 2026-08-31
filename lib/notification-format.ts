import { parseDbTimestampMs } from './date-formatter';

export function toNotificationText(
  value: unknown,
  fallback = '',
  shouldTrim = false,
): string {
  if (typeof value === 'string') return shouldTrim ? value.trim() : value;
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  return fallback;
}

export function getInitials(name: string, fallback = '?'): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return fallback;
  if (/[\uAC00-\uD7A3]/.test(trimmed[0])) return trimmed[0];
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return trimmed.slice(0, 2).toUpperCase();
}

export function timeAgo(value: number | string): string {
  const ms = parseDbTimestampMs(value);
  if (Number.isNaN(ms) || ms === 0) return '';
  const diffSeconds = (Date.now() - ms) / 1000;
  if (diffSeconds < 10) return '방금';
  if (diffSeconds < 60) return `${Math.floor(diffSeconds)}초 전`;
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}분 전`;
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}시간 전`;
  return `${Math.floor(diffSeconds / 86400)}일 전`;
}
