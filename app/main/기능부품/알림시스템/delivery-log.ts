import { normalizePushDebugDetail } from './push-debug';

export type NotificationDeliveryLogEntry = {
  id: string;
  notificationId?: string | null;
  type: string;
  title: string;
  stage: string;
  at: string;
  detail?: Record<string, unknown> | null;
};

export const NOTIFICATION_DELIVERY_LOG_KEY = 'erp_notification_delivery_log';
export const NOTIFICATION_DELIVERY_EVENT = 'erp-notification-delivery-log';

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
    detail: normalizePushDebugDetail(entry.detail) };

  try {
    const nextLog = [nextEntry, ...readNotificationDeliveryLog()].slice(0, 40);
    window.localStorage.setItem(NOTIFICATION_DELIVERY_LOG_KEY, JSON.stringify(nextLog));
  } catch {
    // ignore storage failures
  }

  try {
    window.dispatchEvent(new CustomEvent(NOTIFICATION_DELIVERY_EVENT, {
      detail: nextEntry }));
  } catch {
    // ignore event failures
  }
}
