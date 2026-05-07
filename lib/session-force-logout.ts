import { STORAGE_KEYS } from './storage-keys';

const FALLBACK_LOGIN_AT = '1970-01-01T00:00:00.000Z';

export function normalizeSessionLoginAt(value: unknown, fallback = FALLBACK_LOGIN_AT): string {
  if (typeof value === 'number' || (typeof value === 'string' && value.trim())) {
    const numericValue = Number(value);
    if (Number.isFinite(numericValue) && numericValue > 0) {
      const timestampMs = numericValue > 1_000_000_000_000 ? numericValue : numericValue * 1000;
      const parsedDate = new Date(timestampMs);
      if (Number.isFinite(parsedDate.getTime())) {
        return parsedDate.toISOString();
      }
    }

    const parsedMs = new Date(String(value)).getTime();
    if (Number.isFinite(parsedMs)) {
      return new Date(parsedMs).toISOString();
    }
  }

  return fallback;
}

export function getStoredSessionLoginAt(): string {
  if (typeof window === 'undefined') return FALLBACK_LOGIN_AT;

  try {
    return normalizeSessionLoginAt(window.localStorage.getItem(STORAGE_KEYS.LOGIN_AT), FALLBACK_LOGIN_AT);
  } catch {
    return FALLBACK_LOGIN_AT;
  }
}

export function isForceLogoutAfterLogin(
  forceLogoutAt: unknown,
  loginAt: string | null | undefined = getStoredSessionLoginAt(),
): boolean {
  const forceLogoutMs = new Date(String(forceLogoutAt || '')).getTime();
  const loginMs = new Date(String(loginAt || FALLBACK_LOGIN_AT)).getTime();

  return Number.isFinite(forceLogoutMs) && Number.isFinite(loginMs) && forceLogoutMs > loginMs;
}
