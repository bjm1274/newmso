import {
  getD1Binding,
  resolveDataBackend,
  getD1Drizzle,
  notifications as notificationsTable,
  staff_members as staffMembersTable,
  or,
} from './db';
import { logD1MirrorFailure, logD1BindingMissing } from './db/mirror-metrics';
import { sql, eq } from 'drizzle-orm';

const recentAdminAlertDispatches = new Map<string, number>();

// ─────────────────────────────────────────────────────────────
// Phase 8-B — notifications 테이블 서버측 D1 직접 사용
// ─────────────────────────────────────────────────────────────
//
// 본 파일은 Phase 8 이전엔 Supabase insert + mirrorNotificationsToD1 으로
// 동작했지만, Phase 8-B 부터는 D1 binding 을 직접 사용해 INSERT 한다.
// mirrorNotificationsToD1 함수 자체는 다른 곳에서 import 되므로 유지.
//
// metadata는 Supabase에선 jsonb, D1에선 text(JSON 직렬화) 보관.
// (mirrorNotificationsToD1 안에 normalizeForD1 가 그대로 처리)

export type NotificationRow = {
  id?: string | null;
  user_id?: string | null;
  type?: string | null;
  title?: string | null;
  body?: string | null;
  metadata?: Record<string, unknown> | null;
  read_at?: string | null;
  created_at?: string | null;
};

type NotificationsD1Row = typeof notificationsTable.$inferInsert;

function normalizeForD1(row: NotificationRow): NotificationsD1Row {
  return {
    id: row.id ?? crypto.randomUUID(),
    user_id: row.user_id ?? null,
    type: row.type ?? null,
    title: row.title ?? null,
    body: row.body ?? null,
    metadata: row.metadata === null || row.metadata === undefined
      ? null
      : JSON.stringify(row.metadata),
    read_at: row.read_at ?? null,
    created_at: row.created_at ?? new Date().toISOString(),
  };
}

export async function mirrorNotificationsToD1(
  rows: NotificationRow[],
  options?: { onConflict?: 'do_nothing' | 'throw' },
): Promise<void> {
  if (rows.length === 0) return;

  const backend = await resolveDataBackend();
  if (backend === 'supabase') return;

  const d1 = await getD1Binding();
  if (!d1) {
    if (backend === 'd1') {
      throw new Error('[notifications] DATA_BACKEND=d1 but DB binding not available');
    }
    logD1BindingMissing({ label: 'mirror:notifications', backend });
    return;
  }

  try {
    const db = getD1Drizzle(d1);
    const values = rows.map(normalizeForD1);
    const query = options?.onConflict === 'do_nothing'
      ? db.insert(notificationsTable).values(values).onConflictDoNothing()
      : db.insert(notificationsTable).values(values);
    await query;
  } catch (err) {
    if (backend === 'd1') throw err;
    logD1MirrorFailure(err, { label: 'mirror:notifications', count: rows.length, backend });
  }
}

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

// D1 binding 필수 — Workers env 가 없으면 throw. (서버 라우트 안에서만 호출)
async function requireD1ForNotifications(label: string) {
  const backend = await resolveDataBackend();
  const d1 = await getD1Binding();
  if (!d1) {
    logD1BindingMissing({ label, backend });
    throw new Error(`[notifications] D1 binding not available (${label})`);
  }
  return getD1Drizzle(d1);
}

export async function sendAdminNotifications(
  alerts: AdminAlertPayload[],
): Promise<number> {
  if (alerts.length === 0) return 0;

  const db = await requireD1ForNotifications('sendAdminNotifications:lookup');

  const adminUsers = await db
    .select({ id: staffMembersTable.id })
    .from(staffMembersTable)
    .where(
      or(
        eq(staffMembersTable.department, '행정팀'),
        eq(staffMembersTable.department, '총무팀'),
        eq(staffMembersTable.department, '원무팀'),
        eq(staffMembersTable.department, '행정부'),
      ),
    );

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

    try {
      // alertTypes가 빈 경우 lookup 자체를 건너뜀 (adminUserIds는 이미 가드됨)
      if (alertTypes.length > 0) {
        const rows = await db
          .select({
            user_id: notificationsTable.user_id,
            type: notificationsTable.type,
            created_at: notificationsTable.created_at,
            metadata: notificationsTable.metadata,
          })
          .from(notificationsTable)
          .where(
            sql`${notificationsTable.user_id} IN ${adminUserIds}
                AND ${notificationsTable.type} IN ${alertTypes}
                AND ${notificationsTable.created_at} >= ${cutoffIso}`,
          );

        existingNotifications = rows.map((row) => {
          // D1은 metadata를 text(JSON)로 보관 → 객체로 parse
          let parsedMetadata: Record<string, unknown> | null = null;
          if (typeof row.metadata === 'string' && row.metadata.length > 0) {
            try {
              const parsed = JSON.parse(row.metadata) as unknown;
              if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                parsedMetadata = parsed as Record<string, unknown>;
              }
            } catch {
              parsedMetadata = null;
            }
          }
          return {
            user_id: row.user_id ?? null,
            type: row.type ?? null,
            created_at: row.created_at ?? null,
            metadata: parsedMetadata,
          };
        });
      }
    } catch (err) {
      console.error('admin notification dedupe lookup failed', err);
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
    // D1 직접 INSERT — mirror 호출 불필요 (자기 자신이 primary)
    const values = (notifications as NotificationRow[]).map(normalizeForD1);
    try {
      await db.insert(notificationsTable).values(values);
    } catch (err) {
      console.error('sendAdminNotifications: D1 insert failed', err);
      throw err;
    }
  }

  return notifications.length;
}

export async function insertNotificationsOrThrow(
  notifications: Record<string, unknown> | Record<string, unknown>[],
) {
  const asArray = Array.isArray(notifications) ? notifications : [notifications];
  if (asArray.length === 0) return [] as NotificationRow[];

  // 외부 입력은 unknown 으로 받기 때문에 NotificationRow 형식으로 안전 변환
  const rows: NotificationRow[] = asArray.map((entry) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error('insertNotificationsOrThrow: notification 항목이 객체가 아닙니다');
    }
    return entry as NotificationRow;
  });

  const db = await requireD1ForNotifications('insertNotificationsOrThrow');
  const values = rows.map(normalizeForD1);

  // RETURNING 으로 insert 결과를 그대로 반환 (기존 .select() 와 호환)
  try {
    const inserted = await db.insert(notificationsTable).values(values).returning();
    return inserted;
  } catch (err) {
    console.error('insertNotificationsOrThrow: D1 insert failed', err);
    throw err;
  }
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

  // D1 직접 upsert (id PK 충돌 시 무시 — race condition 가드)
  const db = await requireD1ForNotifications('upsertNotificationWithDedupe');
  const value = normalizeForD1(row as NotificationRow);

  try {
    await db.insert(notificationsTable).values(value).onConflictDoNothing();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isDuplicate = /UNIQUE constraint failed|duplicate key/i.test(message);
    if (!isDuplicate) {
      throw err;
    }
  }

  return { id };
}
