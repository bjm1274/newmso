'use client';

export const NOTIFICATION_LIST_UPDATED_EVENT = 'erp-notification-list-updated';
export const NOTIFICATION_READ_EVENT = 'erp-notification-read';

export type NotificationRecord = {
  id: string;
  user_id?: string | null;
  type: string;
  title?: string | null;
  body?: string | null;
  metadata?: Record<string, unknown>;
  read_at?: string | null;
  created_at?: string | null;
  [key: string]: unknown;
};

type NotificationApiListResponse = {
  ok?: boolean;
  data?: unknown;
  count?: unknown;
  error?: unknown;
};

function asNotificationRecord(row: unknown): NotificationRecord | null {
  if (!row || typeof row !== 'object') return null;
  const source = row as Record<string, unknown>;
  const id = String(source.id ?? '').trim();
  if (!id) return null;

  const metadata =
    source.metadata && typeof source.metadata === 'object' && !Array.isArray(source.metadata)
      ? source.metadata as Record<string, unknown>
      : {};

  return {
    ...source,
    id,
    type: String(source.type ?? 'notification'),
    title: source.title == null ? null : String(source.title),
    body: source.body == null ? null : String(source.body),
    metadata,
    read_at: source.read_at == null ? null : String(source.read_at),
    created_at: source.created_at == null ? null : String(source.created_at),
  };
}

async function parseNotificationResponse(response: Response): Promise<NotificationApiListResponse> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      data && typeof data === 'object' && 'error' in data
        ? String((data as { error?: unknown }).error || 'Notification request failed')
        : 'Notification request failed';
    throw new Error(message);
  }
  return data as NotificationApiListResponse;
}

export async function fetchNotificationList(limit = 200): Promise<NotificationRecord[]> {
  const safeLimit = Math.min(200, Math.max(1, Number.isFinite(limit) ? Math.floor(limit) : 200));
  const response = await fetch(`/api/notifications?limit=${safeLimit}`);
  const data = await parseNotificationResponse(response);
  const rows = Array.isArray(data.data) ? data.data : [];
  return rows.map(asNotificationRecord).filter((row): row is NotificationRecord => Boolean(row));
}

export async function fetchUnreadNotificationCount(): Promise<number> {
  const response = await fetch('/api/notifications?count=true');
  const data = await parseNotificationResponse(response);
  const count = Number(data.count ?? 0);
  return Number.isFinite(count) ? Math.max(0, count) : 0;
}

async function mutateNotifications(method: 'PUT' | 'DELETE', body: Record<string, unknown>): Promise<void> {
  const response = await fetch('/api/notifications', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  await parseNotificationResponse(response);
}

export async function markNotificationAsRead(id: string): Promise<void> {
  const normalizedId = String(id || '').trim();
  if (!normalizedId) return;
  await mutateNotifications('PUT', { id: normalizedId });
}

export async function markNotificationsAsRead(ids: readonly string[]): Promise<void> {
  const normalizedIds = Array.from(new Set(ids.map((id) => String(id || '').trim()).filter(Boolean)));
  if (normalizedIds.length === 0) return;
  await mutateNotifications('PUT', { ids: normalizedIds });
}

export async function markAllNotificationsAsRead(): Promise<void> {
  await mutateNotifications('PUT', { all: true });
}

export async function deleteNotificationById(id: string): Promise<void> {
  const normalizedId = String(id || '').trim();
  if (!normalizedId) return;
  await mutateNotifications('DELETE', { id: normalizedId });
}

export async function deleteNotificationsByIds(ids: readonly string[]): Promise<void> {
  const normalizedIds = Array.from(new Set(ids.map((id) => String(id || '').trim()).filter(Boolean)));
  if (normalizedIds.length === 0) return;
  await mutateNotifications('DELETE', { ids: normalizedIds });
}

export async function cleanupReadNotifications(): Promise<void> {
  await mutateNotifications('DELETE', { cleanup: true });
}

export function countUnreadNotifications(notifications: readonly { read_at?: unknown }[]): number {
  return notifications.filter((notification) => !notification.read_at).length;
}

export function emitNotificationReadEvent(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(NOTIFICATION_READ_EVENT));
}
