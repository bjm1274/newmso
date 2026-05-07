import type { ErpUser } from '@/types';
import { normalizeProfileUser } from './profile-photo';
import { STORAGE_KEYS } from './storage-keys';
import { getStoredSupabaseAccessToken } from './supabase-bridge';

export const RESUME_REDIRECT_ATTEMPT_KEY = 'erp_resume_redirect_attempted';
export const LAST_SESSION_REFRESH_STORAGE_KEY = 'erp_last_session_refresh_at';

const TOKEN_REFRESH_WINDOW_MS = 5 * 60 * 1000;
const SESSION_REFRESH_INTERVAL_MS = 30 * 60 * 1000;

function canUseBrowserStorage() {
  return typeof window !== 'undefined';
}

export function getUserId(user: unknown): string {
  return String((user as { id?: unknown } | null | undefined)?.id ?? '').trim();
}

export function readStoredClientUser(): ErpUser | null {
  if (!canUseBrowserStorage()) return null;

  try {
    const rawUser = window.localStorage.getItem(STORAGE_KEYS.USER);
    if (!rawUser) return null;

    const parsedUser = JSON.parse(rawUser);
    if (!parsedUser || typeof parsedUser !== 'object' || Array.isArray(parsedUser)) {
      return null;
    }

    const normalizedUser = normalizeProfileUser<ErpUser>(parsedUser);
    const hasIdentity =
      getUserId(normalizedUser) ||
      String((normalizedUser as Record<string, unknown>)?.employee_no ?? '').trim() ||
      String((normalizedUser as Record<string, unknown>)?.name ?? '').trim();

    return hasIdentity ? normalizedUser : null;
  } catch {
    return null;
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;

    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(window.atob(padded));
  } catch {
    return null;
  }
}

export function getStoredSupabaseAccessTokenExpiresAtMs(): number | null {
  const token = getStoredSupabaseAccessToken();
  if (!token) return null;

  const payload = decodeJwtPayload(token);
  const exp = Number(payload?.exp);
  return Number.isFinite(exp) && exp > 0 ? exp * 1000 : null;
}

export function isStoredSupabaseAccessTokenFresh(
  refreshWindowMs = TOKEN_REFRESH_WINDOW_MS,
): boolean {
  const expiresAtMs = getStoredSupabaseAccessTokenExpiresAtMs();
  return Boolean(expiresAtMs && expiresAtMs - Date.now() > refreshWindowMs);
}

export function markStoredSessionChecked(atMs = Date.now()) {
  if (!canUseBrowserStorage()) return;

  try {
    window.localStorage.setItem(LAST_SESSION_REFRESH_STORAGE_KEY, String(atMs));
  } catch {
    // ignore
  }
}

export function shouldRefreshStoredSession(
  refreshIntervalMs = SESSION_REFRESH_INTERVAL_MS,
): boolean {
  if (!canUseBrowserStorage()) return true;
  if (!isStoredSupabaseAccessTokenFresh()) return true;

  try {
    const lastCheckedMs = Number(window.localStorage.getItem(LAST_SESSION_REFRESH_STORAGE_KEY));
    return !Number.isFinite(lastCheckedMs) || Date.now() - lastCheckedMs > refreshIntervalMs;
  } catch {
    return true;
  }
}

export function markResumeRedirectAttempt() {
  if (!canUseBrowserStorage()) return;

  try {
    window.sessionStorage.setItem(RESUME_REDIRECT_ATTEMPT_KEY, '1');
  } catch {
    // ignore
  }
}

export function clearResumeRedirectAttempt() {
  if (!canUseBrowserStorage()) return;

  try {
    window.sessionStorage.removeItem(RESUME_REDIRECT_ATTEMPT_KEY);
  } catch {
    // ignore
  }
}

export function consumeResumeRedirectAttempt(): boolean {
  if (!canUseBrowserStorage()) return false;

  try {
    const attempted = window.sessionStorage.getItem(RESUME_REDIRECT_ATTEMPT_KEY) === '1';
    if (attempted) {
      window.sessionStorage.removeItem(RESUME_REDIRECT_ATTEMPT_KEY);
    }
    return attempted;
  } catch {
    return false;
  }
}
