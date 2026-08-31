export function toUtcSqlTimestamp(value?: string | null): string {
  const raw = String(value || '').trim();
  if (!raw) {
    return new Date().toISOString().slice(0, 19).replace('T', ' ');
  }
  // 이미 SQL 포맷 (초 단위)
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)) return raw;
  // 소수 초가 붙은 SQL 유사 포맷
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+$/.test(raw)) {
    return raw.slice(0, 19);
  }
  const parsed = new Date(raw);
  const base = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  return base.toISOString().slice(0, 19).replace('T', ' ');
}

export function normalizeRoomReadCursorIds(roomIds: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      roomIds
        .map((roomId) => String(roomId || '').trim())
        .filter(Boolean),
    ),
  );
}
