export const PUSH_DEBUG_STORAGE_KEY = 'erp_push_debug_log';

export type PushDebugEntry = {
  source: 'app' | 'sw';
  stage: string;
  message: string;
  at: string;
  detail?: Record<string, unknown> | null;
};

export function normalizePushDebugDetail(detail: Record<string, unknown> | null | undefined) {
  if (!detail) return null;
  return Object.entries(detail).reduce<Record<string, unknown>>((acc, [key, value]) => {
    if (value === undefined) return acc;
    if (value === null) {
      acc[key] = null;
      return acc;
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      acc[key] = value;
      return acc;
    }
    acc[key] = JSON.stringify(value);
    return acc;
  }, {});
}

export function readPushDebugLog(): PushDebugEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(PUSH_DEBUG_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as PushDebugEntry[] : [];
  } catch {
    return [];
  }
}

export function recordPushDebug(entry: Omit<PushDebugEntry, 'at'> & { at?: string }) {
  if (typeof window === 'undefined') return;
  const nextEntry: PushDebugEntry = {
    source: entry.source,
    stage: entry.stage,
    message: entry.message,
    at: entry.at || new Date().toISOString(),
    detail: normalizePushDebugDetail(entry.detail),
  };

  try {
    const nextLog = [nextEntry, ...readPushDebugLog()].slice(0, 20);
    window.localStorage.setItem(PUSH_DEBUG_STORAGE_KEY, JSON.stringify(nextLog));
  } catch {
    // ignore storage failures
  }

  try {
    window.dispatchEvent(new CustomEvent('erp-push-debug', {
      detail: nextEntry,
    }));
  } catch {
    // ignore event failures
  }
}
