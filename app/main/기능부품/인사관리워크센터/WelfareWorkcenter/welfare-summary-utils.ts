/**
 * Welfare*Summary 공용 유틸 — 날짜·만료일·톤 칩 클래스.
 */

export type WelfareTone = 'success' | 'warn' | 'danger' | 'muted';

export const WELFARE_TONE_CLS: Record<WelfareTone, string> = {
  success: 'bg-emerald-500/15 text-emerald-700',
  warn: 'bg-amber-500/15 text-amber-700',
  danger: 'bg-red-500/15 text-red-700',
  muted: 'bg-[var(--muted)] text-[var(--toss-gray-4)]',
};

export function formatDateCompact(value: unknown): string {
  if (!value) return '';
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

/** Seoul calendar-day distance to dateStr (YYYY-MM-DD or parseable). */
export function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const target = new Date(`${String(dateStr).slice(0, 10)}T00:00:00+09:00`);
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  const today = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

export function expiryTone(days: number | null): WelfareTone {
  if (days === null) return 'success';
  if (days <= 7) return 'danger';
  if (days <= 90) return 'warn';
  return 'success';
}
