/**
 * Shared display formatters for mobile lists (timestamps, money).
 */

export type FormatTsMode = 'relative' | 'datetime';

/**
 * Format an ISO timestamp for list/card UI.
 * - relative (default): today → HH:mm, yesterday → "어제", else → M/D
 * - datetime: M/D HH:mm
 */
export function formatTs(iso?: string | null, mode: FormatTsMode = 'relative'): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';

  if (mode === 'datetime') {
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  if (
    d.getFullYear() === yest.getFullYear() &&
    d.getMonth() === yest.getMonth() &&
    d.getDate() === yest.getDate()
  ) {
    return '어제';
  }
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** Number → locale string (ko-KR), floored. */
export function formatMoney(n: number): string {
  return Math.floor(n).toLocaleString('ko-KR');
}
