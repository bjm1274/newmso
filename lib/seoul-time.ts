export const SEOUL_TIME_ZONE = 'Asia/Seoul';

const seoulDateKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: SEOUL_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const seoulClockFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: SEOUL_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const seoulClockWithSecondsFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: SEOUL_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const TIME_ONLY_RE = /^\d{2}:\d{2}(?::\d{2})?$/;
const DATETIME_WITHOUT_TIME_ZONE_RE = /^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/;
const TRAILING_WALL_CLOCK_RE = /(?:T|\s)(\d{2}:\d{2}(?::\d{2})?)(?:\.\d+)?$/;

function normalizeText(value: unknown) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value).trim();
  }
  return '';
}

function safeSliceClock(text: string, includeSeconds: boolean) {
  const maxLength = includeSeconds ? 8 : 5;
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function formatKnownWallClock(text: string, includeSeconds: boolean) {
  if (TIME_ONLY_RE.test(text)) {
    return safeSliceClock(text, includeSeconds);
  }

  if (DATETIME_WITHOUT_TIME_ZONE_RE.test(text)) {
    const match = text.match(TRAILING_WALL_CLOCK_RE);
    if (match?.[1]) {
      return safeSliceClock(match[1], includeSeconds);
    }
  }

  return null;
}

function parseDateValue(value: unknown) {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }

  if (typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  const text = normalizeText(value);
  if (!text) return null;

  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed);
}

function getDatePart(parts: Intl.DateTimeFormatPart[], type: 'year' | 'month' | 'day') {
  return parts.find((part) => part.type === type)?.value || '';
}

export function toSeoulDateKey(date: Date) {
  const parts = seoulDateKeyFormatter.formatToParts(date);
  const year = getDatePart(parts, 'year');
  const month = getDatePart(parts, 'month');
  const day = getDatePart(parts, 'day');
  return `${year}-${month}-${day}`;
}

export function formatSeoulTimeLabel(value: unknown, options: { includeSeconds?: boolean } = {}) {
  const includeSeconds = options.includeSeconds ?? false;
  const text = normalizeText(value);

  if (text) {
    const wallClock = formatKnownWallClock(text, includeSeconds);
    if (wallClock) return wallClock;
  }

  const parsed = parseDateValue(value);
  if (!parsed) return text ? safeSliceClock(text, includeSeconds) : null;

  return (includeSeconds ? seoulClockWithSecondsFormatter : seoulClockFormatter).format(parsed);
}

export function formatSeoulClockLabel(value: unknown) {
  return formatSeoulTimeLabel(value);
}
