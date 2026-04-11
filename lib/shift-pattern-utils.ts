const THREE_SHIFT_KEYWORDS = [
  '3교대',
  '3shift',
  '3-shift',
  '데이전담',
  '이브전담',
  '나이트전담',
  '야간전담',
];

export function normalizeShiftPatternText(value?: string | null) {
  return String(value || '').replace(/\s+/g, '').toLowerCase();
}

export function isThreeShiftPatternName(value?: string | null) {
  const normalized = normalizeShiftPatternText(value);
  if (!normalized) return false;

  return THREE_SHIFT_KEYWORDS.some((keyword) =>
    normalized.includes(normalizeShiftPatternText(keyword))
  );
}
