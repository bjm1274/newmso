import { supabase } from './supabase';

const recentAdminAlertDispatches = new Map<string, number>();

export function toNotificationText(
  value: unknown,
  fallback = '',
  shouldTrim = false,
): string {
  if (typeof value === 'string') return shouldTrim ? value.trim() : value;
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  return fallback;
}

function toNotificationMetadataRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function getInitials(name: string, fallback = '?'): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return fallback;
  if (/[\uAC00-\uD7A3]/.test(trimmed[0])) return trimmed[0];
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return trimmed.slice(0, 2).toUpperCase();
}

export function timeAgo(value: number | string): string {
  const ms = typeof value === 'string' ? new Date(value).getTime() : value;
  const diffSeconds = (Date.now() - ms) / 1000;
  if (diffSeconds < 10) return '방금';
  if (diffSeconds < 60) return `${Math.floor(diffSeconds)}초 전`;
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}분 전`;
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}시간 전`;
  return `${Math.floor(diffSeconds / 86400)}일 전`;
}

export interface AdminAlertPayload {
  type: string;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
  dedupeKey?: string;
  dedupeWindowHours?: number;
}

type ExistingAdminNotificationRow = {
  user_id?: string | null;
  type?: string | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

function pruneRecentAdminAlertDispatches(referenceTime: number) {
  for (const [key, timestamp] of recentAdminAlertDispatches.entries()) {
    if (timestamp < referenceTime) {
      recentAdminAlertDispatches.delete(key);
    }
  }
}

export async function sendAdminNotifications(
  alerts: AdminAlertPayload[],
): Promise<number> {
  if (alerts.length === 0) return 0;

  const { data: adminUsers } = await supabase
    .from('staff_members')
    .select('id')
    .or('department.eq.행정팀,department.eq.총무팀,department.eq.원무팀,department.eq.행정부');

  if (!adminUsers?.length) return 0;

  const adminUserIds = adminUsers
    .map((admin) => toNotificationText(admin?.id, '', true))
    .filter(Boolean);

  const normalizedAlerts = alerts.map((alert) => ({
    ...alert,
    dedupeKey: toNotificationText(alert.dedupeKey, '', true),
    dedupeWindowHours:
      Number.isFinite(Number(alert.dedupeWindowHours)) &&
      Number(alert.dedupeWindowHours) > 0
        ? Number(alert.dedupeWindowHours)
        : 24,
  }));

  const alertsWithDedupe = normalizedAlerts.filter((alert) => alert.dedupeKey);
  let existingNotifications: ExistingAdminNotificationRow[] = [];

  if (alertsWithDedupe.length > 0 && adminUserIds.length > 0) {
    const maxLookbackHours = alertsWithDedupe.reduce(
      (max, alert) => Math.max(max, alert.dedupeWindowHours),
      24,
    );
    const cutoffIso = new Date(
      Date.now() - maxLookbackHours * 60 * 60 * 1000,
    ).toISOString();
    const alertTypes = Array.from(
      new Set(alertsWithDedupe.map((alert) => alert.type).filter(Boolean)),
    );

    const { data: existingRows, error: existingError } = await supabase
      .from('notifications')
      .select('user_id, type, created_at, metadata')
      .in('user_id', adminUserIds)
      .in('type', alertTypes)
      .gte('created_at', cutoffIso);

    if (existingError) {
      console.error('admin notification dedupe lookup failed', existingError);
    } else {
      existingNotifications = (existingRows || []) as ExistingAdminNotificationRow[];
    }
  }

  const notifications = adminUsers.flatMap((admin) => {
    const adminId = toNotificationText(admin?.id, '', true);
    return normalizedAlerts.flatMap((alert) => {
      const nowIso = new Date().toISOString();
      const nowTime = new Date(nowIso).getTime();
      const dedupeKey = alert.dedupeKey;

      if (dedupeKey) {
        const cutoffTime =
          nowTime - alert.dedupeWindowHours * 60 * 60 * 1000;
        const localDispatchKey = `${adminId}:${alert.type}:${dedupeKey}`;

        pruneRecentAdminAlertDispatches(cutoffTime);

        if ((recentAdminAlertDispatches.get(localDispatchKey) || 0) >= cutoffTime) {
          return [];
        }

        const hasDuplicate = existingNotifications.some((row) => {
          const rowMetadata = toNotificationMetadataRecord(row.metadata);
          const rowDedupeKey = toNotificationText(
            rowMetadata.dedupe_key,
            '',
            true,
          );
          const rowCreatedAt = new Date(
            toNotificationText(row.created_at, ''),
          ).getTime();

          return (
            toNotificationText(row.user_id, '', true) === adminId &&
            toNotificationText(row.type, '', true) === alert.type &&
            rowDedupeKey === dedupeKey &&
            rowCreatedAt >= cutoffTime
          );
        });

        if (hasDuplicate) {
          return [];
        }

        recentAdminAlertDispatches.set(localDispatchKey, nowTime);
        existingNotifications.push({
          user_id: adminId,
          type: alert.type,
          created_at: nowIso,
          metadata: {
            ...(alert.metadata ?? {}),
            dedupe_key: dedupeKey,
          },
        });
      }

      return [
        {
          user_id: admin.id,
          type: alert.type,
          title: alert.title,
          body: alert.body,
          metadata: dedupeKey
            ? {
                ...(alert.metadata ?? {}),
                dedupe_key: dedupeKey,
              }
            : (alert.metadata ?? {}),
          read_at: null,
          created_at: nowIso,
        },
      ];
    });
  });

  if (notifications.length > 0) {
    await supabase.from('notifications').insert(notifications);
  }

  return notifications.length;
}

export async function insertNotificationsOrThrow(
  notifications: Record<string, unknown> | Record<string, unknown>[],
) {
  const { data, error } = await supabase
    .from('notifications')
    .insert(notifications)
    .select();

  if (error) throw error;
  return data;
}

// SHA-256 기반 결정적 UUID v5 스타일 ID — 같은 dedupeKey는 동일 ID가 되어
// notifications 테이블 PRIMARY KEY로 race condition 중복 INSERT를 차단한다.
export async function buildDeterministicNotificationId(
  userId: string,
  dedupeKey: string,
): Promise<string> {
  const source = `erp-notification:${userId}:${dedupeKey}`;
  const encoder = new TextEncoder();
  const buffer = await crypto.subtle.digest('SHA-256', encoder.encode(source));
  const bytes = new Uint8Array(buffer.slice(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

type DedupedNotificationInput = {
  user_id: string;
  type: string;
  title: string;
  body: string;
  metadata?: Record<string, unknown> | null;
  // dedupeKey가 있으면 같은 키에 대해 1번만 insert(upsert ignoreDuplicates).
  dedupeKey: string;
};

// 결정적 ID + upsert(ignoreDuplicates)로 같은 dedupeKey가 어디서 호출되든 1건만 만들어준다.
// 여러 탭/기기에서 동시 호출돼도 중복 알림이 생성되지 않는다.
export async function upsertNotificationWithDedupe(input: DedupedNotificationInput) {
  const id = await buildDeterministicNotificationId(input.user_id, input.dedupeKey);
  const row = {
    id,
    user_id: input.user_id,
    type: input.type,
    title: input.title,
    body: input.body,
    metadata: {
      ...(input.metadata ?? {}),
      dedupe_key: input.dedupeKey,
    },
    read_at: null,
    created_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('notifications')
    .upsert([row], { onConflict: 'id', ignoreDuplicates: true });

  if (error) {
    const code = String((error as { code?: string } | null)?.code || '');
    const message = String((error as { message?: string } | null)?.message || '');
    const isDuplicate = code === '23505' || /duplicate key|unique constraint/i.test(message);
    if (!isDuplicate) {
      throw error;
    }
  }

  return { id };
}
