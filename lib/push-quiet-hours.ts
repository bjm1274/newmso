const DEFAULT_PUSH_QUIET_HOURS_TIMEZONE = 'Asia/Seoul';
const DEFAULT_PUSH_QUIET_HOURS_START_HOUR = 22;
const DEFAULT_PUSH_QUIET_HOURS_END_HOUR = 8;
const DEFAULT_STALE_CHAT_PUSH_DEFER_MINUTES = 30;

type TimeZoneDateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function parseHourEnv(name: string, fallback: number) {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw)) return fallback;
  const normalized = Math.trunc(raw);
  if (normalized < 0 || normalized > 23) return fallback;
  return normalized;
}

function parsePositiveMinuteEnv(name: string, fallback: number) {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw)) return fallback;
  const normalized = Math.trunc(raw);
  return normalized > 0 ? normalized : fallback;
}

export const PUSH_QUIET_HOURS_TIMEZONE =
  process.env.ERP_PUSH_QUIET_HOURS_TIMEZONE || DEFAULT_PUSH_QUIET_HOURS_TIMEZONE;
export const PUSH_QUIET_HOURS_START_HOUR = parseHourEnv(
  'ERP_PUSH_QUIET_HOURS_START_HOUR',
  DEFAULT_PUSH_QUIET_HOURS_START_HOUR,
);
export const PUSH_QUIET_HOURS_END_HOUR = parseHourEnv(
  'ERP_PUSH_QUIET_HOURS_END_HOUR',
  DEFAULT_PUSH_QUIET_HOURS_END_HOUR,
);
export const STALE_CHAT_PUSH_DEFER_MINUTES = parsePositiveMinuteEnv(
  'ERP_STALE_CHAT_PUSH_DEFER_MINUTES',
  DEFAULT_STALE_CHAT_PUSH_DEFER_MINUTES,
);

function getTimeZoneDateTimeParts(
  date: Date,
  timeZone = PUSH_QUIET_HOURS_TIMEZONE,
): TimeZoneDateTimeParts {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(date);

  return {
    year: Number(parts.find((part) => part.type === 'year')?.value || '0'),
    month: Number(parts.find((part) => part.type === 'month')?.value || '0'),
    day: Number(parts.find((part) => part.type === 'day')?.value || '0'),
    hour: Number(parts.find((part) => part.type === 'hour')?.value || '0'),
    minute: Number(parts.find((part) => part.type === 'minute')?.value || '0'),
    second: Number(parts.find((part) => part.type === 'second')?.value || '0'),
  };
}

function toUtcComparableValue(parts: TimeZoneDateTimeParts) {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

function buildDateFromTimeZoneLocalParts(
  parts: TimeZoneDateTimeParts,
  timeZone = PUSH_QUIET_HOURS_TIMEZONE,
) {
  const guess = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second),
  );
  const guessParts = getTimeZoneDateTimeParts(guess, timeZone);
  const delta = toUtcComparableValue(parts) - toUtcComparableValue(guessParts);
  return new Date(guess.getTime() + delta);
}

function buildUtcAnchorDate(parts: TimeZoneDateTimeParts) {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0));
}

function isWithinQuietHoursMinutes(currentMinutes: number) {
  const startMinutes = PUSH_QUIET_HOURS_START_HOUR * 60;
  const endMinutes = PUSH_QUIET_HOURS_END_HOUR * 60;

  if (startMinutes === endMinutes) return false;
  if (startMinutes < endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }
  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

export function isWithinPushQuietHours(now = new Date()) {
  const parts = getTimeZoneDateTimeParts(now);
  return isWithinQuietHoursMinutes(parts.hour * 60 + parts.minute);
}

export function getNextPushQuietHoursEnd(now = new Date()) {
  const parts = getTimeZoneDateTimeParts(now);
  const startMinutes = PUSH_QUIET_HOURS_START_HOUR * 60;
  const endMinutes = PUSH_QUIET_HOURS_END_HOUR * 60;
  const currentMinutes = parts.hour * 60 + parts.minute;
  const targetDay = buildUtcAnchorDate(parts);

  if (startMinutes < endMinutes) {
    if (currentMinutes >= endMinutes) {
      targetDay.setUTCDate(targetDay.getUTCDate() + 1);
    }
  } else if (currentMinutes >= endMinutes) {
    targetDay.setUTCDate(targetDay.getUTCDate() + 1);
  }

  return buildDateFromTimeZoneLocalParts({
    year: targetDay.getUTCFullYear(),
    month: targetDay.getUTCMonth() + 1,
    day: targetDay.getUTCDate(),
    hour: PUSH_QUIET_HOURS_END_HOUR,
    minute: 0,
    second: 0,
  });
}

export function shouldDeferStaleChatPush(messageCreatedAt: string | Date, now = new Date()) {
  const createdAt =
    messageCreatedAt instanceof Date ? messageCreatedAt : new Date(String(messageCreatedAt || ''));

  if (Number.isNaN(createdAt.getTime())) {
    return {
      defer: false as const,
      resumeAt: null,
    };
  }

  if (!isWithinPushQuietHours(now)) {
    return {
      defer: false as const,
      resumeAt: null,
    };
  }

  const ageMinutes = (now.getTime() - createdAt.getTime()) / (60 * 1000);
  if (ageMinutes < STALE_CHAT_PUSH_DEFER_MINUTES) {
    return {
      defer: false as const,
      resumeAt: null,
    };
  }

  return {
    defer: true as const,
    resumeAt: getNextPushQuietHoursEnd(now),
  };
}
