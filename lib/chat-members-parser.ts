/** D1 text(JSON) 또는 이미 파싱된 배열 → string[] (클라이언트 normalizeMemberIds 와 정합) */
export function parseMembersField(raw: unknown): string[] {
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      // 단일 UUID 문자열
      return [trimmed];
    }
  }
  if (Array.isArray(parsed)) {
    return parsed.map((m) => String(m ?? '').trim()).filter(Boolean);
  }
  if (parsed && typeof parsed === 'object') {
    return Object.values(parsed as Record<string, unknown>)
      .map((m) => String(m ?? '').trim())
      .filter(Boolean);
  }
  return [];
}
