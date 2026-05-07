import { STORAGE_KEYS } from '@/lib/storage-keys';

// ─── 알림 설정 타입 ───
export interface NotifSettings {
  sound: boolean;
  vibration: boolean;
  dndEnabled: boolean;
  dndFrom: string;
  dndTo: string;
  weekendMute: boolean;
  keywordAlertsEnabled: boolean;
  keywords: string[];
  types: Record<string, boolean>;
}

export type NotificationDeliveryLogEntry = {
  id: string;
  notificationId?: string | null;
  type: string;
  title: string;
  stage: string;
  at: string;
  detail?: Record<string, unknown> | null;
};

// ─── 상수 ───
export const DEFAULT_SETTINGS: NotifSettings = {
  sound: true, vibration: true, dndEnabled: false,
  dndFrom: '22:00', dndTo: '08:00',
  weekendMute: false,
  keywordAlertsEnabled: false,
  keywords: [],
  types: {
    message: true, mention: true, approval: true, payroll: true,
    inventory: true, attendance: true, board: true, 인사: true,
    education: true, notification: true, todo: true,
  },
};

export const NOTIFICATION_DELIVERY_EVENT = 'erp-notification-delivery-log';

const NOTIFICATION_DELIVERY_LOG_KEY = 'erp_notification_delivery_log';

// ─── 내부 유틸 ───
function normalizePushDebugDetail(detail: Record<string, unknown> | null | undefined) {
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

// ─── 공개 함수 ───
export function normalizeKeywordList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((entry) => String(entry || '').trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 30),
    ),
  );
}

export function saveNotifSettings(next: NotifSettings) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEYS.NOTIF_SETTINGS, JSON.stringify(next));
  } catch {
    // ignore storage failures
  }
}

export function loadNotifSettings(): NotifSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.NOTIF_SETTINGS);
    if (!raw) return DEFAULT_SETTINGS;
    const p = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...p,
      keywords: normalizeKeywordList(p.keywords),
      types: { ...DEFAULT_SETTINGS.types, ...(p.types || {}) },
    };
  } catch { return DEFAULT_SETTINGS; }
}

export function readNotificationDeliveryLog(): NotificationDeliveryLogEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(NOTIFICATION_DELIVERY_LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as NotificationDeliveryLogEntry[] : [];
  } catch {
    return [];
  }
}

export function recordNotificationDelivery(
  entry: Omit<NotificationDeliveryLogEntry, 'id' | 'at'> & { id?: string; at?: string },
) {
  if (typeof window === 'undefined') return;
  const nextEntry: NotificationDeliveryLogEntry = {
    id:
      entry.id ||
      (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`),
    notificationId: entry.notificationId || null,
    type: entry.type,
    title: entry.title,
    stage: entry.stage,
    at: entry.at || new Date().toISOString(),
    detail: normalizePushDebugDetail(entry.detail),
  };

  try {
    const nextLog = [nextEntry, ...readNotificationDeliveryLog()].slice(0, 40);
    window.localStorage.setItem(NOTIFICATION_DELIVERY_LOG_KEY, JSON.stringify(nextLog));
  } catch {
    // ignore storage failures
  }

  try {
    window.dispatchEvent(new CustomEvent(NOTIFICATION_DELIVERY_EVENT, {
      detail: nextEntry,
    }));
  } catch {
    // ignore event failures
  }
}
