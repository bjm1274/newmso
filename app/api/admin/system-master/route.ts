// fs/path 제거: Cloudflare Workers 호환을 위해 로컬 파일시스템 접근 대신 DB 조회 사용
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { readSessionFromRequest } from '@/lib/server-session';
import { isNamedSystemMasterAccount } from '@/lib/system-master';
import { runBackup } from '@/lib/backup-cron';
import { processPendingChatPushJobs } from '@/lib/chat-push-dispatch';
import { collectChatPushQueueHealth } from '@/lib/chat-push-health';
import { selectSystemMasterStaffRows } from '@/lib/system-master-staff-query';
import { processDueTodoRemindersServer } from '@/lib/todo-reminder-cron';
import type { ChatMessage, ChatRoom, StaffMember } from '@/types';
import { NOTICE_ROOM_ID } from '@/lib/constants';
import {
  getD1Binding,
  getD1Drizzle,
  resolveDataBackend,
  staff_members as staffMembersTable,
  audit_logs as auditLogsTable,
  payroll_records as payrollRecordsTable,
  chat_rooms as chatRoomsTable,
  messages as messagesTable,
  polls as pollsTable,
  poll_votes as pollVotesTable,
  message_reactions as messageReactionsTable,
  message_bookmarks as messageBookmarksTable,
  pinned_messages as pinnedMessagesTable,
  room_read_cursors as roomReadCursorsTable,
  room_notification_settings as roomNotificationSettingsTable,
  push_subscriptions as pushSubscriptionsTable,
  approvals as approvalsTable,
  backup_restore_runs as backupRestoreRunsTable,
  chat_push_jobs as chatPushJobsTable,
  todos as todosTable,
  todo_reminder_logs as todoReminderLogsTable,
  wiki_documents as wikiDocumentsTable,
  wiki_document_versions as wikiDocumentVersionsTable,
  eq,
  and,
  desc,
  asc,
  isNull,
  isNotNull,
  lte,
  gte,
  ne,
  sql,
  inArray,
} from '@/lib/db';


export const dynamic = 'force-dynamic';
const OPERATION_CRONS = [
  { path: '/api/cron/backup', schedule: '매일 00:00', label: '정기 전체 백업' },
  { path: '/api/cron/chat-retention', schedule: '매일 02:00', label: '채팅 보관정책 정리' },
  { path: '/api/cron/push-subscription-cleanup', schedule: '매일 12:00', label: '푸시 구독 정리' },
  { path: '/api/cron/chat-push-dispatch', schedule: '매일 08:00', label: '채팅 푸시 큐 백업 처리' },
  { path: '/api/cron/leave-notice-announcements', schedule: '매일 17:00', label: '연차 휴무 공지메시지 발송' },
  { path: '/api/cron/todo-reminders', schedule: '매시간', label: '할일 리마인더 처리' },
] as const;

type PushSubscriptionRow = {
  id: string;
  staff_id: string | null;
  endpoint: string | null;
  platform?: string | null;
  user_agent?: string | null;
  device_id?: string | null;
  fcm_token?: string | null;
  created_at?: string | null;
};

type PushFailureRow = {
  id: string;
  room_id?: string | null;
  message_id?: string | null;
  attempt_count?: number | null;
  last_error?: string | null;
  created_at?: string | null;
  processing_started_at?: string | null;
  next_attempt_at?: string | null;
  dead_lettered_at?: string | null;
};

type BackupSummaryRow = {
  name: string;
  created_at: string;
  source: 'local' | 'db';
};

type IntegrityIssue = {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  count: number;
  samples: string[];
};

type LooseRecord = Record<string, unknown>;
type QueryErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
} | null | undefined;

function isLooseRecord(value: unknown): value is LooseRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toLooseRecordArray<T extends LooseRecord = LooseRecord>(value: unknown): T[] {
  return Array.isArray(value) ? (value.filter(isLooseRecord) as T[]) : [];
}

type StaffRow = Partial<StaffMember> & LooseRecord;
type ChatRoomRow = Partial<ChatRoom> & LooseRecord;
type ChatMessageRow = Partial<ChatMessage> & LooseRecord;
type AuditLogRow = LooseRecord & {
  id?: string | null;
  action?: string | null;
  target_type?: string | null;
  target_id?: string | null;
  user_id?: string | null;
  user_name?: string | null;
  details?: LooseRecord | null;
  created_at?: string | null;
};
type PayrollRow = LooseRecord & {
  id?: string | null;
  staff_id?: string | null;
  year_month?: string | null;
  status?: string | null;
  net_pay?: number | null;
  created_at?: string | null;
};
type ApprovalRow = LooseRecord & {
  id?: string | null;
  title?: string | null;
  status?: string | null;
  current_approver_id?: string | null;
};

const AUDIT_LOG_SELECT = [
  'id',
  'action',
  'target_type',
  'target_id',
  'user_id',
  'user_name',
  'details',
  'created_at',
].join(', ');

const PAYROLL_RECORD_SELECT = [
  'id',
  'staff_id',
  'year_month',
  'status',
  'net_pay',
  'created_at',
].join(', ');

const CHAT_ROOM_ADMIN_SELECT = [
  'id',
  'name',
  'type',
  'members',
  'created_at',
  'last_message_at',
].join(', ');

const CHAT_MESSAGE_ADMIN_SELECT = [
  'id',
  'room_id',
  'sender_id',
  'content',
  'file_url',
  'is_deleted',
  'created_at',
  'edited_at',
].join(', ');

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Supabase service role configuration is missing.');
  }

  return createClient(supabaseUrl, serviceKey);
}

function clampLimit(value: string | null, fallback: number, max: number) {
  const parsed = Number.parseInt(String(value || fallback), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function sanitizeStaffRow(row: LooseRecord): StaffRow {
  const safe = { ...row } as StaffRow;
  delete safe.password;
  delete safe.passwd;
  return safe;
}

function getStaffLabel(staff: StaffRow | undefined) {
  if (!staff) return '-';
  const pieces = [staff.name, staff.employee_no ? `#${staff.employee_no}` : null].filter(Boolean);
  return pieces.join(' ');
}

function getRoomLabel(room: ChatRoomRow, staffMap: Map<string, StaffRow>) {
  if (!room) return '채팅방';
  if (room.id === NOTICE_ROOM_ID) return '공지메시지';
  if (room.name) return room.name;

  const memberNames = Array.isArray(room.members)
    ? room.members
        .map((memberId: string) => staffMap.get(String(memberId))?.name)
        .filter(Boolean)
    : [];

  return memberNames.length > 0 ? memberNames.join(', ') : '채팅방';
}

function getAuditCategory(log: AuditLogRow) {
  const action = String(log.action || '').toLowerCase();
  const targetType = String(log.target_type || '').toLowerCase();

  if (
    targetType.includes('payroll') ||
    action.includes('급여') ||
    action.includes('정산') ||
    action.includes('salary')
  ) {
    return 'payroll';
  }

  if (
    targetType.includes('message') ||
    targetType.includes('chat') ||
    targetType.includes('room') ||
    action.includes('message_') ||
    action.includes('채팅')
  ) {
    return 'chat';
  }

  if (
    targetType.includes('staff') ||
    targetType.includes('ess_profile') ||
    action.includes('인사') ||
    action.includes('권한') ||
    action.includes('직원') ||
    action.includes('profile')
  ) {
    return 'staff';
  }

  return 'general';
}

function matchSearch(value: unknown, keyword: string) {
  if (!keyword) return true;
  return JSON.stringify(value || '')
    .toLowerCase()
    .includes(keyword.toLowerCase());
}

function normalizeAuditLog(log: AuditLogRow, staffMap: Map<string, StaffRow>) {
  const details = log.details && typeof log.details === 'object' ? log.details : {};
  const targetStaff = log.target_id ? staffMap.get(String(log.target_id)) : undefined;
  const detailRecord = details as LooseRecord;
  const changedFields = Array.isArray(detailRecord.changed_fields)
    ? detailRecord.changed_fields
    : Object.keys((detailRecord.after as LooseRecord | undefined) || (detailRecord.requested_changes as LooseRecord | undefined) || {});

  return {
    ...log,
    category: getAuditCategory(log),
    actor_label: log.user_name || getStaffLabel(log.user_id ? staffMap.get(String(log.user_id)) : undefined),
    target_label: targetStaff ? getStaffLabel(targetStaff) : log.target_id || '-',
    changed_fields: changedFields,
    details,
  };
}

function normalizeChatRoom(room: ChatRoomRow, staffMap: Map<string, StaffRow>) {
  const memberNames = Array.isArray(room.members)
    ? room.members
        .map((memberId: string) => getStaffLabel(staffMap.get(String(memberId))))
        .filter((label: string) => label !== '-')
    : [];

  return {
    id: room.id,
    type: room.type || 'group',
    room_label: getRoomLabel(room, staffMap),
    member_count: Array.isArray(room.members) ? room.members.length : 0,
    member_labels: memberNames,
    created_at: room.created_at,
    last_message_at: room.last_message_at || null,
    last_activity_at: room.last_message_at || room.created_at || null,
  };
}

function normalizeMessage(
  message: ChatMessageRow,
  rooms: Map<string, ChatRoomRow>,
  staffMap: Map<string, StaffRow>,
) {
  const sender = message.sender_id ? staffMap.get(String(message.sender_id)) : undefined;
  const room = rooms.get(String(message.room_id));
  return {
    id: message.id,
    room_id: message.room_id,
    room_label: room ? getRoomLabel(room, staffMap) : '채팅방',
    sender_id: message.sender_id,
    sender_name: sender?.name || '알 수 없음',
    sender_company: sender?.company || '',
    content: message.content || '',
    file_url: message.file_url || null,
    is_deleted: message.is_deleted === true,
    created_at: message.created_at,
    edited_at: message.edited_at || null,
  };
}

function isMissingColumnError(error: QueryErrorLike, columnName: string) {
  if (!error) return false;
  const code = String(error?.code || '');
  const message = String(error?.message || error?.details || '').toLowerCase();
  const hint = String(error?.hint || '').toLowerCase();
  const needle = columnName.toLowerCase();
  return (
    (code === '42703' || !code) &&
    (
      message.includes(needle) ||
      message.includes(`column ${needle}`) ||
      message.includes(`"${needle}"`) ||
      message.includes(`'${needle}'`) ||
      hint.includes(needle)
    )
  );
}

function isMissingRelationError(error: QueryErrorLike, relationName?: string) {
  if (!error) return false;
  const code = String(error?.code || '');
  const message = String(error?.message || error?.details || '').toLowerCase();
  return code === '42P01' || (relationName ? message.includes(relationName.toLowerCase()) : false);
}

async function safeHeadCount(
  queryFactory: () => PromiseLike<{ count?: number | null; error?: QueryErrorLike }>,
  relationName?: string,
) {
  const result = await queryFactory();
  if (result.error) {
    if (isMissingRelationError(result.error, relationName)) return 0;
    throw result.error;
  }
  return Number(result.count || 0);
}

async function safeRows<T>(
  queryFactory: () => PromiseLike<{ data?: T[] | null; error?: QueryErrorLike }>,
  relationName?: string,
) {
  const result = await queryFactory();
  if (result.error) {
    if (isMissingRelationError(result.error, relationName)) return [] as T[];
    throw result.error;
  }
  return (result.data || []) as T[];
}

async function listRecentBackups(limit = 8): Promise<BackupSummaryRow[]> {
  try {
    const backend = await resolveDataBackend();
    if (backend === 'd1') {
      const d1 = await getD1Binding();
      if (!d1) return [];
      const db = getD1Drizzle(d1);
      const rows = await db
        .select({
          id: backupRestoreRunsTable.id,
          file_name: backupRestoreRunsTable.file_name,
          started_at: backupRestoreRunsTable.started_at,
        })
        .from(backupRestoreRunsTable)
        .orderBy(desc(backupRestoreRunsTable.started_at))
        .limit(limit);
      return rows.map((row) => ({
        name: row.file_name || row.id,
        created_at: row.started_at || new Date().toISOString(),
        source: 'db' as const,
      }));
    }
    // 기존 supabase 경로
    const client = getAdminClient();
    const { data, error } = await client
      .from('backup_restore_runs')
      .select('id, file_name, started_at')
      .order('started_at', { ascending: false })
      .limit(limit);

    if (error || !data) return [];

    return data.map((row: { id: string; file_name?: string; started_at?: string }) => ({
      name: row.file_name || row.id,
      created_at: row.started_at || new Date().toISOString(),
      source: 'db' as const,
    }));
  } catch {
    return [];
  }
}

function buildUsageSummary(logs: AuditLogRow[]) {
  const grouped = new Map<
    string,
    { label: string; count: number; latestAt: string; topAction: string; actionCounts: Map<string, number> }
  >();

  for (const log of logs) {
    const category = getAuditCategory(log);
    const existing = grouped.get(category) || {
      label:
        category === 'staff'
          ? '직원/권한'
          : category === 'payroll'
            ? '급여/정산'
            : category === 'chat'
              ? '채팅/메시지'
              : '기타',
      count: 0,
      latestAt: '',
      topAction: '-',
      actionCounts: new Map<string, number>(),
    };

    existing.count += 1;
    if (!existing.latestAt || String(log.created_at || '') > existing.latestAt) {
      existing.latestAt = String(log.created_at || '');
    }

    const action = String(log.action || 'unknown');
    existing.actionCounts.set(action, (existing.actionCounts.get(action) || 0) + 1);
    grouped.set(category, existing);
  }

  return Array.from(grouped.entries())
    .map(([id, entry]) => {
      let topAction = '-';
      let topCount = -1;
      for (const [action, count] of entry.actionCounts.entries()) {
        if (count > topCount) {
          topAction = action;
          topCount = count;
        }
      }
      return {
        id,
        label: entry.label,
        count: entry.count,
        latestAt: entry.latestAt || null,
        topAction,
      };
    })
    .sort((left, right) => right.count - left.count);
}

function groupDuplicateEndpoints(rows: PushSubscriptionRow[]) {
  const grouped = new Map<string, number>();
  for (const row of rows) {
    const endpoint = String(row.endpoint || '').trim();
    if (!endpoint) continue;
    grouped.set(endpoint, (grouped.get(endpoint) || 0) + 1);
  }

  let duplicateGroups = 0;
  let duplicateRows = 0;
  for (const count of grouped.values()) {
    if (count <= 1) continue;
    duplicateGroups += 1;
    duplicateRows += count - 1;
  }

  return { duplicateGroups, duplicateRows };
}

async function loadPushSubscriptionDiagnostics(supabase: ReturnType<typeof getAdminClient>) {
  const backend = await resolveDataBackend();
  if (backend === 'd1') {
    const d1 = await getD1Binding();
    if (!d1) throw new Error('[system-master] D1 binding not available (loadPushSubscriptionDiagnostics)');
    const db = getD1Drizzle(d1);
    const rows = await db
      .select({
        id: pushSubscriptionsTable.id,
        staff_id: pushSubscriptionsTable.staff_id,
        endpoint: pushSubscriptionsTable.endpoint,
        platform: pushSubscriptionsTable.platform,
        user_agent: pushSubscriptionsTable.user_agent,
        device_id: pushSubscriptionsTable.device_id,
        fcm_token: pushSubscriptionsTable.fcm_token,
        created_at: pushSubscriptionsTable.created_at,
      })
      .from(pushSubscriptionsTable);
    return rows as PushSubscriptionRow[];
  }
  // 기존 supabase 경로
  const extendedRes = await supabase
    .from('push_subscriptions')
    .select('id, staff_id, endpoint, platform, user_agent, device_id, fcm_token, created_at');

  if (!extendedRes.error) {
    return (extendedRes.data || []) as PushSubscriptionRow[];
  }

  if (
    isMissingColumnError(extendedRes.error, 'platform') ||
    isMissingColumnError(extendedRes.error, 'user_agent') ||
    isMissingColumnError(extendedRes.error, 'device_id') ||
    isMissingColumnError(extendedRes.error, 'fcm_token')
  ) {
    const fallbackRes = await supabase
      .from('push_subscriptions')
      .select('id, staff_id, endpoint, created_at');

    if (fallbackRes.error) {
      throw fallbackRes.error;
    }

    return (fallbackRes.data || []) as PushSubscriptionRow[];
  }

  throw extendedRes.error;
}

async function loadRecentPushFailures(supabase: ReturnType<typeof getAdminClient>) {
  const backend = await resolveDataBackend();
  if (backend === 'd1') {
    const d1 = await getD1Binding();
    if (!d1) throw new Error('[system-master] D1 binding not available (loadRecentPushFailures)');
    const db = getD1Drizzle(d1);
    const rows = await db
      .select({
        id: chatPushJobsTable.id,
        room_id: chatPushJobsTable.room_id,
        message_id: chatPushJobsTable.message_id,
        attempt_count: chatPushJobsTable.attempt_count,
        last_error: chatPushJobsTable.last_error,
        created_at: chatPushJobsTable.created_at,
        processing_started_at: chatPushJobsTable.processing_started_at,
        next_attempt_at: chatPushJobsTable.next_attempt_at,
        dead_lettered_at: chatPushJobsTable.dead_lettered_at,
      })
      .from(chatPushJobsTable)
      .where(isNotNull(chatPushJobsTable.last_error))
      .orderBy(desc(chatPushJobsTable.processing_started_at))
      .limit(8);
    return rows as PushFailureRow[];
  }
  // 기존 supabase 경로
  const failureRes = await supabase
    .from('chat_push_jobs')
    .select('id, room_id, message_id, attempt_count, last_error, created_at, processing_started_at, next_attempt_at, dead_lettered_at')
    .not('last_error', 'is', null)
    .order('processing_started_at', { ascending: false })
    .limit(8);

  if (!failureRes.error) {
    return (failureRes.data || []) as PushFailureRow[];
  }

  if (isMissingColumnError(failureRes.error, 'last_error')) {
    return [] as PushFailureRow[];
  }

  if (
    isMissingColumnError(failureRes.error, 'processing_started_at') ||
    isMissingColumnError(failureRes.error, 'next_attempt_at') ||
    isMissingColumnError(failureRes.error, 'dead_lettered_at')
  ) {
    const fallbackRes = await supabase
      .from('chat_push_jobs')
      .select('id, room_id, message_id, attempt_count, last_error, created_at')
      .not('last_error', 'is', null)
      .order('created_at', { ascending: false })
      .limit(8);

    if (fallbackRes.error) {
      if (isMissingColumnError(fallbackRes.error, 'last_error')) {
        return [] as PushFailureRow[];
      }
      throw fallbackRes.error;
    }

    return (fallbackRes.data || []) as PushFailureRow[];
  }

  throw failureRes.error;
}

function buildPushSubscriptionPlatformSummary(rows: PushSubscriptionRow[]) {
  const counters = new Map<string, number>();
  rows.forEach((row) => {
    const platform = String(row.platform || '').trim() || 'unknown';
    counters.set(platform, (counters.get(platform) || 0) + 1);
  });

  return Array.from(counters.entries())
    .map(([platform, count]) => ({ platform, count }))
    .sort((left, right) => right.count - left.count);
}

function buildPushFailureSummary(rows: PushFailureRow[]) {
  const counters = new Map<string, number>();
  rows.forEach((row) => {
    const errorKey = String(row.last_error || '').trim() || 'unknown';
    counters.set(errorKey, (counters.get(errorKey) || 0) + 1);
  });

  return Array.from(counters.entries())
    .map(([error, count]) => ({ error, count }))
    .sort((left, right) => right.count - left.count);
}

function pickPreferredSubscription(rows: PushSubscriptionRow[]) {
  return [...rows].sort((left, right) => {
    const leftHasStaff = left.staff_id ? 1 : 0;
    const rightHasStaff = right.staff_id ? 1 : 0;
    if (leftHasStaff !== rightHasStaff) return rightHasStaff - leftHasStaff;
    return String(right.id).localeCompare(String(left.id));
  })[0];
}

async function cleanupPushSubscriptionsInternal(supabase: ReturnType<typeof getAdminClient>) {
  const backend = await resolveDataBackend();

  let rows: PushSubscriptionRow[];
  let validStaffIds: Set<string>;

  if (backend === 'd1') {
    const d1 = await getD1Binding();
    if (!d1) throw new Error('[system-master] D1 binding not available (cleanupPushSubscriptionsInternal)');
    const db = getD1Drizzle(d1);
    const [subRows, staffRows] = await Promise.all([
      db.select({
        id: pushSubscriptionsTable.id,
        staff_id: pushSubscriptionsTable.staff_id,
        endpoint: pushSubscriptionsTable.endpoint,
      }).from(pushSubscriptionsTable),
      db.select({ id: staffMembersTable.id }).from(staffMembersTable),
    ]);
    rows = subRows as PushSubscriptionRow[];
    validStaffIds = new Set(staffRows.map((row) => String(row.id || '')));
  } else {
    const [subscriptionRes, staffRes] = await Promise.all([
      supabase.from('push_subscriptions').select('id, staff_id, endpoint'),
      supabase.from('staff_members').select('id'),
    ]);
    if (subscriptionRes.error) throw subscriptionRes.error;
    if (staffRes.error) throw staffRes.error;
    rows = (subscriptionRes.data || []) as PushSubscriptionRow[];
    validStaffIds = new Set((staffRes.data || []).map((row: { id: string | null }) => String(row.id || '')));
  }

  // 이하 공통 로직 — rows와 validStaffIds를 사용
  const deleteIds = new Set<string>();
  const validRows: PushSubscriptionRow[] = [];

  let emptyEndpoint = 0;
  let nullStaff = 0;
  let orphanStaff = 0;

  for (const row of rows) {
    const endpoint = String(row.endpoint || '').trim();
    const staffId = String(row.staff_id || '').trim();
    if (!endpoint) {
      emptyEndpoint += 1;
      deleteIds.add(row.id);
      continue;
    }
    if (!staffId) {
      nullStaff += 1;
      deleteIds.add(row.id);
      continue;
    }
    if (!validStaffIds.has(staffId)) {
      orphanStaff += 1;
      deleteIds.add(row.id);
      continue;
    }
    validRows.push({ ...row, endpoint, staff_id: staffId });
  }

  const endpointGroups = new Map<string, PushSubscriptionRow[]>();
  for (const row of validRows) {
    const key = String(row.endpoint || '');
    const bucket = endpointGroups.get(key);
    if (bucket) {
      bucket.push(row);
    } else {
      endpointGroups.set(key, [row]);
    }
  }

  let duplicateGroups = 0;
  let duplicateRowsDeleted = 0;
  for (const group of endpointGroups.values()) {
    if (group.length <= 1) continue;
    duplicateGroups += 1;
    const keep = pickPreferredSubscription(group);
    for (const row of group) {
      if (row.id === keep.id) continue;
      duplicateRowsDeleted += 1;
      deleteIds.add(row.id);
    }
  }

  const ids = Array.from(deleteIds);
  const chunkSize = 200;
  if (backend === 'd1') {
    const d1 = await getD1Binding();
    if (!d1) throw new Error('[system-master] D1 binding not available (cleanupPushSubscriptionsInternal delete)');
    const db = getD1Drizzle(d1);
    for (let index = 0; index < ids.length; index += chunkSize) {
      const chunk = ids.slice(index, index + chunkSize);
      await db.delete(pushSubscriptionsTable).where(inArray(pushSubscriptionsTable.id, chunk));
    }
  } else {
    for (let index = 0; index < ids.length; index += chunkSize) {
      const chunk = ids.slice(index, index + chunkSize);
      const { error } = await supabase.from('push_subscriptions').delete().in('id', chunk);
      if (error) throw error;
    }
  }

  return {
    totalBefore: rows.length,
    deleted: ids.length,
    emptyEndpoint,
    nullStaff,
    orphanStaff,
    duplicateGroups,
    duplicateRowsDeleted,
    totalAfter: rows.length - ids.length,
  };
}

function buildPermissionChangeSummary(details: LooseRecord) {
  const before = isLooseRecord(details?.before) ? (details.before as LooseRecord) : {};
  const after = isLooseRecord(details?.after) ? (details.after as LooseRecord) : {};
  const beforePermissions = (isLooseRecord(before.permissions) ? before.permissions : {}) as Record<string, boolean>;
  const afterPermissions = (isLooseRecord(after.permissions) ? after.permissions : {}) as Record<string, boolean>;
  const allKeys = Array.from(new Set([...Object.keys(beforePermissions), ...Object.keys(afterPermissions)]));
  const enabled: string[] = [];
  const disabled: string[] = [];

  for (const key of allKeys) {
    const beforeValue = beforePermissions[key] === true;
    const afterValue = afterPermissions[key] === true;
    if (beforeValue === afterValue) continue;
    if (afterValue) enabled.push(key);
    else disabled.push(key);
  }

  return {
    enabled,
    disabled,
    beforeRole: String(before.role || '').trim() || null,
    afterRole: String(after.role || '').trim() || null,
  };
}

function buildIntegrityChecks(params: {
  staffRows: StaffRow[];
  payrollRows: PayrollRow[];
  subscriptionRows: PushSubscriptionRow[];
  roomRows: ChatRoomRow[];
  approvalRows: ApprovalRow[];
}): IntegrityIssue[] {
  const { staffRows, payrollRows, subscriptionRows, roomRows, approvalRows } = params;
  const validStaffIds = new Set(staffRows.map((row) => String(row.id)));
  const duplicateEmployeeNos = new Map<string, number>();

  for (const row of staffRows) {
    const employeeNo = String(row.employee_no || '').trim();
    if (!employeeNo) continue;
    duplicateEmployeeNos.set(employeeNo, (duplicateEmployeeNos.get(employeeNo) || 0) + 1);
  }

  const orphanPayrollRows = payrollRows.filter((row) => !validStaffIds.has(String(row.staff_id || '')));
  const invalidSubscriptions = subscriptionRows.filter((row) => {
    const staffId = String(row.staff_id || '').trim();
    return !staffId || !validStaffIds.has(staffId);
  });
  const roomsWithMissingMembers = roomRows
    .map((room) => {
      const missingMembers = Array.isArray(room.members)
        ? room.members.filter((memberId: string) => !validStaffIds.has(String(memberId)))
        : [];
      return { room, missingMembers };
    })
    .filter((entry) => entry.missingMembers.length > 0);
  const approvalsWithMissingApprover = approvalRows.filter((row) => {
    if (String(row.status || '') !== '대기') return false;
    const approverId = String(row.current_approver_id || '').trim();
    return Boolean(approverId) && !validStaffIds.has(approverId);
  });
  const duplicateEmployeeNoRows = Array.from(duplicateEmployeeNos.entries()).filter(([, count]) => count > 1);

  const issues: IntegrityIssue[] = [];
  if (orphanPayrollRows.length > 0) {
    issues.push({
      id: 'orphan-payroll',
      severity: 'critical',
      title: '직원 마스터와 연결되지 않은 급여 레코드',
      description: '급여 레코드가 현재 직원 마스터와 끊어져 있어 정산/보정이 어려운 상태입니다.',
      count: orphanPayrollRows.length,
      samples: orphanPayrollRows.slice(0, 5).map((row) => `${row.year_month || '-'} · ${row.id}`),
    });
  }
  if (invalidSubscriptions.length > 0) {
    issues.push({
      id: 'invalid-push-subscriptions',
      severity: 'warning',
      title: '유효하지 않은 푸시 구독',
      description: 'staff_id가 없거나 현재 직원과 연결되지 않은 푸시 구독이 남아 있습니다.',
      count: invalidSubscriptions.length,
      samples: invalidSubscriptions.slice(0, 5).map((row) => `${row.id} · ${row.staff_id || 'staff 없음'}`),
    });
  }
  if (roomsWithMissingMembers.length > 0) {
    issues.push({
      id: 'rooms-with-missing-members',
      severity: 'warning',
      title: '삭제된 직원을 포함한 채팅방',
      description: '채팅방 멤버 목록에 현재 직원 마스터에 없는 사용자가 포함돼 있습니다.',
      count: roomsWithMissingMembers.length,
      samples: roomsWithMissingMembers.slice(0, 5).map((entry) => `${entry.room.name || entry.room.id} · ${entry.missingMembers.join(', ')}`),
    });
  }
  if (approvalsWithMissingApprover.length > 0) {
    issues.push({
      id: 'approvals-missing-approver',
      severity: 'critical',
      title: '현재 결재자가 존재하지 않는 대기 문서',
      description: '대기 문서인데 현재 결재자가 직원 마스터에 없어 결재가 멈춘 상태일 수 있습니다.',
      count: approvalsWithMissingApprover.length,
      samples: approvalsWithMissingApprover.slice(0, 5).map((row) => `${row.title || row.id} · ${row.current_approver_id}`),
    });
  }
  if (duplicateEmployeeNoRows.length > 0) {
    issues.push({
      id: 'duplicate-employee-nos',
      severity: 'warning',
      title: '중복 사번',
      description: '직원 마스터에 동일한 사번이 여러 건 존재합니다.',
      count: duplicateEmployeeNoRows.length,
      samples: duplicateEmployeeNoRows.slice(0, 5).map(([employeeNo, count]) => `${employeeNo} (${count}건)`),
    });
  }
  if (issues.length === 0) {
    issues.push({
      id: 'integrity-ok',
      severity: 'info',
      title: '정합성 이상 없음',
      description: '현재 기준으로 주요 원장/구독/채팅방/결재 데이터 정합성 이슈가 발견되지 않았습니다.',
      count: 0,
      samples: [],
    });
  }

  return issues;
}

export async function GET(request: NextRequest) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session || !isNamedSystemMasterAccount(session.user)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const scope = searchParams.get('scope') || 'overview';
    const limit = clampLimit(searchParams.get('limit'), 120, 500);
    const keyword = String(searchParams.get('keyword') || '').trim();
    const roomId = String(searchParams.get('roomId') || '').trim();
    const category = String(searchParams.get('category') || 'all').trim();

    const supabase = getAdminClient();
    const backend = await resolveDataBackend();

    const { data: staffRows, error: staffError } = await selectSystemMasterStaffRows<StaffRow>(
      async ({ select: _select, orderColumn: _orderColumn }) => {
        if (backend === 'd1') {
          const d1 = await getD1Binding();
          if (!d1) return { data: null, error: { message: '[system-master] D1 binding not available' } };
          const db = getD1Drizzle(d1);
          const rows = await db
            .select()
            .from(staffMembersTable)
            .orderBy(asc(staffMembersTable.employee_no))
            .limit(500);
          // 비밀번호 등 민감 필드는 sanitizeStaffRow에서 제거됨
          return { data: (rows || []) as StaffRow[], error: null };
        }
        const result = await supabase
          .from('staff_members')
          .select(_select)
          .order(_orderColumn, { ascending: true })
          .limit(500);

        return {
          data: (result.data || null) as StaffRow[] | null,
          error: result.error,
        };
      },
    );

    if (staffError) {
      return NextResponse.json({ error: '직원 데이터를 불러오는 중 오류가 발생했습니다.' }, { status: 500 });
    }

    const safeStaffRows = toLooseRecordArray<StaffRow>(staffRows).map((row) => sanitizeStaffRow(row));
    const staffMap = new Map<string, StaffRow>(safeStaffRows.map((staff) => [String(staff.id), staff]));

    if (scope === 'overview') {
      let overviewData: {
        staffCount: number;
        auditCount: number;
        payrollCount: number;
        roomCount: number;
        messageCount: number;
        auditRows: AuditLogRow[];
        payrollRows: PayrollRow[];
        roomRows: ChatRoomRow[];
        messageRows: ChatMessageRow[];
      };

      if (backend === 'd1') {
        const d1 = await getD1Binding();
        if (!d1) return NextResponse.json({ error: '[system-master] D1 binding not available' }, { status: 500 });
        const db = getD1Drizzle(d1);
        const [
          staffCountRows, auditCountRows, payrollCountRows, roomCountRows, messageCountRows,
          auditRawRows, payrollRawRows, roomRawRows, messageRawRows,
        ] = await Promise.all([
          db.select({ id: staffMembersTable.id }).from(staffMembersTable).limit(10000),
          db.select({ id: auditLogsTable.id }).from(auditLogsTable).limit(10000),
          db.select({ id: payrollRecordsTable.id }).from(payrollRecordsTable).limit(10000),
          db.select({ id: chatRoomsTable.id }).from(chatRoomsTable).limit(10000),
          db.select({ id: messagesTable.id }).from(messagesTable).limit(100000),
          db.select().from(auditLogsTable).orderBy(desc(auditLogsTable.created_at)).limit(40),
          db.select({
            id: payrollRecordsTable.id,
            staff_id: payrollRecordsTable.staff_id,
            year_month: payrollRecordsTable.year_month,
            status: payrollRecordsTable.status,
            net_pay: payrollRecordsTable.net_pay,
            created_at: payrollRecordsTable.created_at,
          }).from(payrollRecordsTable).orderBy(desc(payrollRecordsTable.created_at)).limit(80),
          db.select({
            id: chatRoomsTable.id,
            name: chatRoomsTable.name,
            type: chatRoomsTable.type,
            members: chatRoomsTable.members,
            created_at: chatRoomsTable.created_at,
            last_message_at: chatRoomsTable.last_message_at,
          }).from(chatRoomsTable).orderBy(desc(chatRoomsTable.created_at)).limit(80),
          db.select({
            id: messagesTable.id,
            room_id: messagesTable.room_id,
            sender_id: messagesTable.sender_id,
            content: messagesTable.content,
            file_url: messagesTable.file_url,
            is_deleted: messagesTable.is_deleted,
            created_at: messagesTable.created_at,
            edited_at: messagesTable.edited_at,
          }).from(messagesTable).orderBy(desc(messagesTable.created_at)).limit(80),
        ]);
        // chat_rooms.members는 D1에서 TEXT(JSON) → 파싱
        const parsedRoomRows = (roomRawRows || []).map((row) => {
          const r = { ...row } as Record<string, unknown>;
          if (typeof r.members === 'string') {
            try { r.members = JSON.parse(r.members); } catch { r.members = []; }
          }
          return r as ChatRoomRow;
        });
        // audit_logs.details는 D1에서 TEXT(JSON) → 파싱
        const parsedAuditRows = (auditRawRows || []).map((row) => {
          const r = { ...row } as Record<string, unknown>;
          if (typeof r.details === 'string') {
            try { r.details = JSON.parse(r.details) as LooseRecord; } catch { r.details = {}; }
          }
          return r as AuditLogRow;
        });
        overviewData = {
          staffCount: staffCountRows.length,
          auditCount: auditCountRows.length,
          payrollCount: payrollCountRows.length,
          roomCount: roomCountRows.length,
          messageCount: messageCountRows.length,
          auditRows: parsedAuditRows,
          payrollRows: payrollRawRows as unknown as PayrollRow[],
          roomRows: parsedRoomRows,
          messageRows: messageRawRows as unknown as ChatMessageRow[],
        };
      } else {
        const [staffCountRes, auditCountRes, payrollCountRes, roomCountRes, messageCountRes, auditRes, payrollRes, roomRes, messageRes] =
          await Promise.all([
            supabase.from('staff_members').select('id', { head: true, count: 'exact' }),
            supabase.from('audit_logs').select('id', { head: true, count: 'exact' }),
            supabase.from('payroll_records').select('id', { head: true, count: 'exact' }),
            supabase.from('chat_rooms').select('id', { head: true, count: 'exact' }),
            supabase.from('messages').select('id', { head: true, count: 'exact' }),
            supabase.from('audit_logs').select(AUDIT_LOG_SELECT).order('created_at', { ascending: false }).limit(40),
            supabase.from('payroll_records').select(PAYROLL_RECORD_SELECT).order('created_at', { ascending: false }).limit(80),
            supabase.from('chat_rooms').select(CHAT_ROOM_ADMIN_SELECT).order('created_at', { ascending: false }).limit(80),
            supabase.from('messages').select(CHAT_MESSAGE_ADMIN_SELECT).order('created_at', { ascending: false }).limit(80),
          ]);
        overviewData = {
          staffCount: staffCountRes.count || 0,
          auditCount: auditCountRes.count || 0,
          payrollCount: payrollCountRes.count || 0,
          roomCount: roomCountRes.count || 0,
          messageCount: messageCountRes.count || 0,
          auditRows: toLooseRecordArray<AuditLogRow>(auditRes.data),
          payrollRows: toLooseRecordArray<PayrollRow>(payrollRes.data),
          roomRows: toLooseRecordArray<ChatRoomRow>(roomRes.data),
          messageRows: toLooseRecordArray<ChatMessageRow>(messageRes.data),
        };
      }

      const rooms = overviewData.roomRows;
      const roomMap = new Map<string, ChatRoomRow>(rooms.map((room) => [String(room.id), room]));
      const payrollRows = overviewData.payrollRows;
      const payrollItems = payrollRows.map((record) => {
        const staff = staffMap.get(String(record.staff_id));
        return {
          ...record,
          staff_name: staff?.name || '-',
          employee_no: staff?.employee_no || null,
          company: staff?.company || '',
          department: staff?.department || '',
        };
      });

      return NextResponse.json({
        summary: {
          staffCount: overviewData.staffCount,
          auditCount: overviewData.auditCount,
          payrollCount: overviewData.payrollCount,
          roomCount: overviewData.roomCount,
          messageCount: overviewData.messageCount,
        },
        recentAudits: overviewData.auditRows.map((log) =>
          normalizeAuditLog(log, staffMap),
        ),
        sensitiveStaffs: safeStaffRows,
        recentPayrolls: payrollItems,
        chatRooms: rooms.map((room) => normalizeChatRoom(room, staffMap)),
        recentMessages: overviewData.messageRows.map((message) =>
          normalizeMessage(message, roomMap, staffMap),
        ),
      });
    }

    if (scope === 'audit') {
      let auditRows: AuditLogRow[];

      if (backend === 'd1') {
        const d1 = await getD1Binding();
        if (!d1) return NextResponse.json({ error: '[system-master] D1 binding not available' }, { status: 500 });
        const db = getD1Drizzle(d1);
        const rows = await db
          .select()
          .from(auditLogsTable)
          .orderBy(desc(auditLogsTable.created_at))
          .limit(limit);
        auditRows = rows.map((row) => {
          const r = { ...row } as Record<string, unknown>;
          if (typeof r.details === 'string') {
            try { r.details = JSON.parse(r.details) as LooseRecord; } catch { r.details = {}; }
          }
          return r as AuditLogRow;
        });
      } else {
        const { data, error: auditError } = await supabase
          .from('audit_logs')
          .select(AUDIT_LOG_SELECT)
          .order('created_at', { ascending: false })
          .limit(limit);
        if (auditError) {
          return NextResponse.json({ error: auditError.message }, { status: 500 });
        }
        auditRows = toLooseRecordArray<AuditLogRow>(data);
      }

      const filtered = auditRows
        .map((log) => normalizeAuditLog(log, staffMap))
        .filter((log) => category === 'all' || log.category === category)
        .filter((log) => matchSearch(log, keyword));

      return NextResponse.json({ logs: filtered });
    }

    if (scope === 'chats') {
      const chatLimit = Math.min(Math.max(Number(limit) || 1000, 1), 5000);
      const roomLimitRaw = Number(searchParams.get('roomLimit') || 0);
      const roomLimit = Math.min(Math.max(Number.isFinite(roomLimitRaw) && roomLimitRaw > 0 ? roomLimitRaw : 2000, 1), 10000);

      // 단어 필터(선택검색) — bannedWords 파라미터로 다중 키워드 OR 검색
      const bannedWordsParam = String(searchParams.get('bannedWords') || '').trim();
      const bannedWords = bannedWordsParam
        ? bannedWordsParam.split(',').map((w) => w.trim()).filter(Boolean)
        : [];
      const wantOnlyBannedRooms = searchParams.get('flaggedRoomsOnly') === '1' && bannedWords.length > 0;

      let rawRooms: ChatRoomRow[];
      let rawMessages: ChatMessageRow[];
      let bannedRoomIds: Set<string>;

      if (backend === 'd1') {
        const d1 = await getD1Binding();
        if (!d1) return NextResponse.json({ error: '[system-master] D1 binding not available (chats)' }, { status: 500 });
        const db = getD1Drizzle(d1);

        // 1. 메시지 조회
        const msgBaseSelect = {
          id: messagesTable.id,
          room_id: messagesTable.room_id,
          sender_id: messagesTable.sender_id,
          content: messagesTable.content,
          file_url: messagesTable.file_url,
          is_deleted: messagesTable.is_deleted,
          created_at: messagesTable.created_at,
          edited_at: messagesTable.edited_at,
        } as const;

        let msgQuery = db.select(msgBaseSelect).from(messagesTable).$dynamic();
        const msgConditions: ReturnType<typeof and>[] = [];
        if (roomId) msgConditions.push(eq(messagesTable.room_id, roomId));
        // D1은 ilike 미지원 — like로 대체 (대소문자 무관 SQLite LIKE)
        if (keyword) msgConditions.push(sql`lower(${messagesTable.content}) like lower(${'%' + keyword + '%'})`);
        if (msgConditions.length > 0) msgQuery = msgQuery.where(and(...msgConditions));
        msgQuery = msgQuery.orderBy(desc(messagesTable.created_at)).limit(chatLimit);

        // 2. bannedWords 조회 (OR 검색)
        let bannedMsgRows: { room_id: string | null }[] = [];
        if (bannedWords.length > 0) {
          // SQLite LIKE OR 조건을 sql 태그로 조합
          const likeConditions = bannedWords.map(
            (word) => sql`lower(${messagesTable.content}) like lower(${'%' + word.replace(/[%_]/g, '\\$&') + '%'})`
          );
          const orExpr = likeConditions.length === 1
            ? likeConditions[0]
            : sql`(${likeConditions.reduce((acc, cur) => sql`${acc} OR ${cur}`)})`;
          bannedMsgRows = await db
            .select({ room_id: messagesTable.room_id })
            .from(messagesTable)
            .where(orExpr)
            .orderBy(desc(messagesTable.created_at))
            .limit(5000);
        }

        // 3. 채팅방 조회
        const roomRawRows = await db.select({
          id: chatRoomsTable.id,
          name: chatRoomsTable.name,
          type: chatRoomsTable.type,
          members: chatRoomsTable.members,
          created_at: chatRoomsTable.created_at,
          last_message_at: chatRoomsTable.last_message_at,
        }).from(chatRoomsTable).orderBy(desc(chatRoomsTable.created_at)).limit(roomLimit);

        const [msgRows] = await Promise.all([msgQuery]);

        // chat_rooms.members TEXT → JSON 파싱
        rawRooms = roomRawRows.map((row) => {
          const r = { ...row } as Record<string, unknown>;
          if (typeof r.members === 'string') {
            try { r.members = JSON.parse(r.members); } catch { r.members = []; }
          }
          return r as ChatRoomRow;
        });
        rawMessages = msgRows as unknown as ChatMessageRow[];
        bannedRoomIds = new Set<string>(
          bannedMsgRows.map((row) => String(row.room_id || '').trim()).filter(Boolean)
        );
      } else {
        // 기존 supabase 경로
        let messageQuery = supabase
          .from('messages')
          .select(CHAT_MESSAGE_ADMIN_SELECT)
          .order('created_at', { ascending: false })
          .limit(chatLimit);
        if (roomId) messageQuery = messageQuery.eq('room_id', roomId);
        if (keyword) messageQuery = messageQuery.ilike('content', `%${keyword}%`);

        const bannedWordsMessageQuery = bannedWords.length > 0
          ? supabase
              .from('messages')
              .select('id, room_id, content')
              .or(bannedWords.map((word) => `content.ilike.%${word.replace(/[,)]/g, '')}%`).join(','))
              .order('created_at', { ascending: false })
              .limit(5000)
          : null;

        const roomQuery = supabase
          .from('chat_rooms')
          .select(CHAT_ROOM_ADMIN_SELECT)
          .order('created_at', { ascending: false })
          .limit(roomLimit);

        const [roomRes, messageRes, bannedRes] = await Promise.all([
          roomQuery,
          messageQuery,
          bannedWordsMessageQuery ?? Promise.resolve({ data: [], error: null } as never),
        ]);

        if (roomRes.error) {
          return NextResponse.json({ error: '채팅방 데이터를 불러오는 중 오류가 발생했습니다.' }, { status: 500 });
        }
        if (messageRes.error) {
          return NextResponse.json({ error: '메시지 데이터를 불러오는 중 오류가 발생했습니다.' }, { status: 500 });
        }
        if (bannedRes && (bannedRes as { error?: { message?: string } }).error) {
          return NextResponse.json({ error: '필터 단어 검색 중 오류가 발생했습니다.' }, { status: 500 });
        }

        rawRooms = toLooseRecordArray<ChatRoomRow>(roomRes.data);
        rawMessages = toLooseRecordArray<ChatMessageRow>(messageRes.data);
        bannedRoomIds = new Set<string>(
          bannedWords.length > 0
            ? toLooseRecordArray<ChatMessageRow>((bannedRes as { data: ChatMessageRow[] }).data || [])
                .map((row) => String(row.room_id || '').trim())
                .filter(Boolean)
            : [],
        );
      }

      let rooms = rawRooms;
      if (wantOnlyBannedRooms) {
        rooms = rooms.filter((room) => bannedRoomIds.has(String(room.id || '')));
      }
      const roomMap = new Map<string, ChatRoomRow>(rooms.map((room) => [String(room.id), room]));
      const normalizedRooms = rooms
        .map((room) => normalizeChatRoom(room, staffMap))
        .sort((left, right) => {
          const leftTime = new Date(String(left.last_activity_at || left.created_at || 0)).getTime();
          const rightTime = new Date(String(right.last_activity_at || right.created_at || 0)).getTime();
          return rightTime - leftTime;
        });

      const filteredMessages = rawMessages
        .filter((message) => !keyword || matchSearch(message, keyword))
        .map((message) => normalizeMessage(message, roomMap, staffMap));

      return NextResponse.json({
        rooms: normalizedRooms,
        messages: filteredMessages,
        flaggedRoomIds: bannedWords.length > 0 ? Array.from(bannedRoomIds) : undefined,
      });
    }

    if (scope === 'operations') {
      type OperationsData = {
        auditRows: AuditLogRow[];
        validStaffIds: Set<string>;
        backupRows: BackupSummaryRow[];
        queueSummary: Awaited<ReturnType<typeof collectChatPushQueueHealth>>;
        restoreRuns: LooseRecord[];
        dueTodoCount: number;
        repeatingTodoCount: number;
        reminderLogCount24h: number;
        wikiDocumentCount: number;
        wikiVersionCount: number;
        recentWikiVersions: LooseRecord[];
        recentPushFailures: PushFailureRow[];
        subscriptionRows: PushSubscriptionRow[];
      };

      let opData: OperationsData;

      if (backend === 'd1') {
        const d1 = await getD1Binding();
        if (!d1) return NextResponse.json({ error: '[system-master] D1 binding not available (operations)' }, { status: 500 });
        const db = getD1Drizzle(d1);
        const nowIso = new Date().toISOString();
        const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        const [
          auditRawRows,
          staffIdRows,
          restoreRunRaws,
          dueTodoRows,
          repeatingTodoRows,
          reminderLogRows,
          wikiDocRows,
          wikiVerRows,
          recentWikiVerRows,
        ] = await Promise.all([
          db.select().from(auditLogsTable).orderBy(desc(auditLogsTable.created_at)).limit(400),
          db.select({ id: staffMembersTable.id }).from(staffMembersTable),
          db.select({
            id: backupRestoreRunsTable.id,
            file_name: backupRestoreRunsTable.file_name,
            status: backupRestoreRunsTable.status,
            total_tables: backupRestoreRunsTable.total_tables,
            total_rows: backupRestoreRunsTable.total_rows,
            requested_by_name: backupRestoreRunsTable.requested_by_name,
            started_at: backupRestoreRunsTable.started_at,
            finished_at: backupRestoreRunsTable.finished_at,
            result_summary: backupRestoreRunsTable.result_summary,
          }).from(backupRestoreRunsTable).orderBy(desc(backupRestoreRunsTable.started_at)).limit(10),
          // 미완료 + reminder_at 설정 + 기한 경과
          db.select({ id: todosTable.id }).from(todosTable)
            .where(and(
              eq(todosTable.is_complete, 0),
              isNotNull(todosTable.reminder_at),
              lte(todosTable.reminder_at, nowIso),
            )),
          // 반복 할일 (repeat_type != 'none')
          db.select({ id: todosTable.id }).from(todosTable)
            .where(and(
              eq(todosTable.is_complete, 0),
              ne(todosTable.repeat_type, 'none'),
            )),
          // 24시간 이내 리마인더 로그
          db.select({ id: todoReminderLogsTable.id }).from(todoReminderLogsTable)
            .where(gte(todoReminderLogsTable.created_at, since24h)),
          // 아카이브 안 된 위키 문서
          db.select({ id: wikiDocumentsTable.id }).from(wikiDocumentsTable)
            .where(eq(wikiDocumentsTable.is_archived, 0)),
          // 위키 버전 전체 카운트
          db.select({ id: wikiDocumentVersionsTable.id }).from(wikiDocumentVersionsTable),
          // 최근 위키 버전 5건
          db.select({
            id: wikiDocumentVersionsTable.id,
            document_id: wikiDocumentVersionsTable.document_id,
            title: wikiDocumentVersionsTable.title,
            version_no: wikiDocumentVersionsTable.version_no,
            created_at: wikiDocumentVersionsTable.created_at,
            change_summary: wikiDocumentVersionsTable.change_summary,
          }).from(wikiDocumentVersionsTable).orderBy(desc(wikiDocumentVersionsTable.created_at)).limit(5),
        ]);

        // audit_logs.details JSON 파싱
        const parsedAuditRows = auditRawRows.map((row) => {
          const r = { ...row } as Record<string, unknown>;
          if (typeof r.details === 'string') {
            try { r.details = JSON.parse(r.details) as LooseRecord; } catch { r.details = {}; }
          }
          return r as AuditLogRow;
        });

        const [backupRows, queueSummary, recentPushFailures, subscriptionRows] = await Promise.all([
          listRecentBackups(10),
          collectChatPushQueueHealth(supabase),
          loadRecentPushFailures(supabase),
          loadPushSubscriptionDiagnostics(supabase),
        ]);

        opData = {
          auditRows: parsedAuditRows,
          validStaffIds: new Set(staffIdRows.map((row) => String(row.id || ''))),
          backupRows,
          queueSummary,
          restoreRuns: restoreRunRaws as unknown as LooseRecord[],
          dueTodoCount: dueTodoRows.length,
          repeatingTodoCount: repeatingTodoRows.length,
          reminderLogCount24h: reminderLogRows.length,
          wikiDocumentCount: wikiDocRows.length,
          wikiVersionCount: wikiVerRows.length,
          recentWikiVersions: recentWikiVerRows as unknown as LooseRecord[],
          recentPushFailures,
          subscriptionRows,
        };
      } else {
        const [auditRes, staffIdRes, backupRows, queueSummary, restoreRuns, dueTodoCount, repeatingTodoCount, reminderLogCount24h, wikiDocumentCount, wikiVersionCount, recentWikiVersions, recentPushFailures, subscriptionRows] = await Promise.all([
          supabase.from('audit_logs').select(AUDIT_LOG_SELECT).order('created_at', { ascending: false }).limit(400),
          supabase.from('staff_members').select('id'),
          listRecentBackups(10),
          collectChatPushQueueHealth(supabase),
          safeRows(() => supabase.from('backup_restore_runs').select('id,file_name,status,total_tables,total_rows,requested_by_name,started_at,finished_at,result_summary').order('started_at', { ascending: false }).limit(10), 'backup_restore_runs'),
          safeHeadCount(() => supabase.from('todos').select('id', { count: 'exact', head: true }).eq('is_complete', false).not('reminder_at', 'is', null).lte('reminder_at', new Date().toISOString()), 'todos'),
          safeHeadCount(() => supabase.from('todos').select('id', { count: 'exact', head: true }).eq('is_complete', false).neq('repeat_type', 'none'), 'todos'),
          safeHeadCount(() => supabase.from('todo_reminder_logs').select('id', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()), 'todo_reminder_logs'),
          safeHeadCount(() => supabase.from('wiki_documents').select('id', { count: 'exact', head: true }).eq('is_archived', false), 'wiki_documents'),
          safeHeadCount(() => supabase.from('wiki_document_versions').select('id', { count: 'exact', head: true }), 'wiki_document_versions'),
          safeRows(() => supabase.from('wiki_document_versions').select('id,document_id,title,version_no,created_at,change_summary').order('created_at', { ascending: false }).limit(5), 'wiki_document_versions'),
          loadRecentPushFailures(supabase),
          loadPushSubscriptionDiagnostics(supabase),
        ]);
        if (auditRes.error) { console.error('system-master audit query failed:', auditRes.error); return NextResponse.json({ error: '감사 로그 조회에 실패했습니다.' }, { status: 500 }); }
        if (staffIdRes.error) { console.error('system-master staff query failed:', staffIdRes.error); return NextResponse.json({ error: '직원 데이터 조회에 실패했습니다.' }, { status: 500 }); }
        opData = {
          auditRows: toLooseRecordArray<AuditLogRow>(auditRes.data),
          validStaffIds: new Set(toLooseRecordArray(staffIdRes.data).map((row) => String(row.id || ''))),
          backupRows,
          queueSummary,
          restoreRuns: restoreRuns as LooseRecord[],
          dueTodoCount,
          repeatingTodoCount,
          reminderLogCount24h,
          wikiDocumentCount,
          wikiVersionCount,
          recentWikiVersions: recentWikiVersions as LooseRecord[],
          recentPushFailures,
          subscriptionRows,
        };
      }

      const {
        auditRows: opAuditRows,
        validStaffIds,
        backupRows,
        queueSummary,
        restoreRuns,
        dueTodoCount,
        repeatingTodoCount,
        reminderLogCount24h,
        wikiDocumentCount,
        wikiVersionCount,
        recentWikiVersions,
        recentPushFailures,
        subscriptionRows,
      } = opData;
      const duplicateEndpointInfo = groupDuplicateEndpoints(subscriptionRows);
      const orphanSubscriptions = subscriptionRows.filter((row) => {
        const staffId = String(row.staff_id || '').trim();
        return Boolean(staffId) && !validStaffIds.has(staffId);
      }).length;
      const nullStaffSubscriptions = subscriptionRows.filter((row) => !String(row.staff_id || '').trim()).length;
      const platformSummary = buildPushSubscriptionPlatformSummary(subscriptionRows);
      const fcmEnabledCount = subscriptionRows.filter((row) => Boolean(String(row.fcm_token || '').trim())).length;
      const webPushOnlyCount = subscriptionRows.filter((row) => {
        const endpoint = String(row.endpoint || '').trim();
        return /^https?:\/\//i.test(endpoint) && !String(row.fcm_token || '').trim();
      }).length;
      const placeholderEndpointCount = subscriptionRows.filter((row) =>
        String(row.endpoint || '').trim().startsWith('fcm:')
      ).length;
      const recentSubscriptions = [...subscriptionRows]
        .sort((left, right) => {
          const leftTime = new Date(String(left.created_at || 0)).getTime();
          const rightTime = new Date(String(right.created_at || 0)).getTime();
          return rightTime - leftTime;
        })
        .slice(0, 5)
        .map((row) => ({
          id: row.id,
          staff_id: row.staff_id,
          platform: String(row.platform || '').trim() || 'unknown',
          device_id: String(row.device_id || '').trim() || null,
          has_fcm: Boolean(String(row.fcm_token || '').trim()),
          created_at: row.created_at || null,
          user_agent: String(row.user_agent || '').trim() || null,
        }));
      const recentFailureSummary = buildPushFailureSummary(recentPushFailures);

      const latestBackup = backupRows[0] || null;
      const backupAgeHours = latestBackup ? (Date.now() - new Date(latestBackup.created_at).getTime()) / (1000 * 60 * 60) : null;
      const failedRestoreRuns = (restoreRuns as LooseRecord[]).filter((run) => String(run.status || '') === 'failed');
      const latestRestoreRun = (restoreRuns as LooseRecord[])[0] || null;
      const versionGap = Math.max(0, Number(wikiDocumentCount || 0) - Number(wikiVersionCount || 0));
      const failureItems = [
        queueSummary.deadLettered > 0
          ? { id: 'chat-push-dead-letter', severity: 'critical', label: '채팅 푸시 Dead Letter', count: queueSummary.deadLettered, detail: '재시도 한도를 넘긴 채팅 푸시 작업이 남아 있습니다.' }
          : null,
        queueSummary.pending > 0
          ? {
              id: 'chat-push-pending',
              severity: queueSummary.ready > 0 ? 'warning' : 'info',
              label: '대기 중인 채팅 푸시 작업',
              count: queueSummary.pending,
              detail: queueSummary.oldestPendingAt ? `가장 오래된 작업: ${new Date(queueSummary.oldestPendingAt).toLocaleString('ko-KR')}` : '처리 대기 중인 작업이 있습니다.',
            }
          : null,
        orphanSubscriptions + nullStaffSubscriptions > 0
          ? { id: 'push-subscription-orphan', severity: 'warning', label: '정리 필요한 푸시 구독', count: orphanSubscriptions + nullStaffSubscriptions, detail: `null staff ${nullStaffSubscriptions}건 · orphan ${orphanSubscriptions}건` }
          : null,
        duplicateEndpointInfo.duplicateRows > 0
          ? { id: 'push-subscription-duplicate', severity: 'info', label: '중복 푸시 구독', count: duplicateEndpointInfo.duplicateRows, detail: `${duplicateEndpointInfo.duplicateGroups}개 endpoint 그룹에서 중복이 발견됐습니다.` }
          : null,
        backupAgeHours !== null && backupAgeHours > 30
          ? { id: 'backup-stale', severity: 'warning', label: '백업 지연', count: 1, detail: `마지막 로컬 백업이 ${Math.floor(backupAgeHours)}시간 전에 생성됐습니다.` }
          : null,
        failedRestoreRuns.length > 0
          ? {
              id: 'backup-restore-failed',
              severity: 'warning',
              label: '백업 복원 실패 이력',
              count: failedRestoreRuns.length,
              detail: latestRestoreRun?.started_at ? `최근 복원 시각: ${new Date(String(latestRestoreRun.started_at)).toLocaleString('ko-KR')}` : '최근 복원 작업 중 실패한 이력이 있습니다.',
            }
          : null,
        dueTodoCount > 0
          ? {
              id: 'todo-reminder-backlog',
              severity: 'info',
              label: '대기 중인 할일 리마인더',
              count: dueTodoCount,
              detail: `미완료 리마인더 대상 ${Number(dueTodoCount || 0).toLocaleString('ko-KR')}건이 확인됩니다.`,
            }
          : null,
        versionGap > 0
          ? {
              id: 'wiki-version-gap',
              severity: 'info',
              label: '버전 기록이 없는 위키 문서',
              count: versionGap,
              detail: `문서 ${Number(wikiDocumentCount || 0).toLocaleString('ko-KR')}건 중 버전 기록 ${Number(wikiVersionCount || 0).toLocaleString('ko-KR')}건이 있습니다.`,
            }
          : null,
      ].filter(Boolean);

      return NextResponse.json({
        checkedAt: new Date().toISOString(),
        queue: queueSummary,
        subscriptions: {
          total: subscriptionRows.length,
          nullStaff: nullStaffSubscriptions,
          orphan: orphanSubscriptions,
          duplicateEndpointGroups: duplicateEndpointInfo.duplicateGroups,
          duplicateRows: duplicateEndpointInfo.duplicateRows,
          fcmEnabled: fcmEnabledCount,
          webPushOnly: webPushOnlyCount,
          placeholderEndpoints: placeholderEndpointCount,
          platformSummary,
          recentSubscriptions,
        },
        pushFailures: {
          total: recentPushFailures.length,
          summary: recentFailureSummary,
          recent: recentPushFailures,
        },
        recentBackups: backupRows,
        latestBackup,
        restoreRuns,
        cronJobs: OPERATION_CRONS,
        usageSummary: buildUsageSummary(opAuditRows),
        todoAutomation: {
          dueReminders: dueTodoCount,
          repeatingOpenTodos: repeatingTodoCount,
          reminderLogs24h: reminderLogCount24h,
        },
        wiki: {
          documents: wikiDocumentCount,
          versions: wikiVersionCount,
          recentVersions: recentWikiVersions,
        },
        failureItems,
      });
    }

    if (scope === 'permission-diffs') {
      let auditPermRows: AuditLogRow[];

      if (backend === 'd1') {
        const d1 = await getD1Binding();
        if (!d1) return NextResponse.json({ error: '[system-master] D1 binding not available' }, { status: 500 });
        const db = getD1Drizzle(d1);
        const rows = await db
          .select()
          .from(auditLogsTable)
          .where(eq(auditLogsTable.target_type, 'staff_permission'))
          .orderBy(desc(auditLogsTable.created_at))
          .limit(limit);
        auditPermRows = rows.map((row) => {
          const r = { ...row } as Record<string, unknown>;
          if (typeof r.details === 'string') {
            try { r.details = JSON.parse(r.details) as LooseRecord; } catch { r.details = {}; }
          }
          return r as AuditLogRow;
        });
      } else {
        const { data: auditRows, error: auditError } = await supabase
          .from('audit_logs')
          .select(AUDIT_LOG_SELECT)
          .eq('target_type', 'staff_permission')
          .order('created_at', { ascending: false })
          .limit(limit);
        if (auditError) {
          return NextResponse.json({ error: auditError.message }, { status: 500 });
        }
        auditPermRows = toLooseRecordArray<AuditLogRow>(auditRows);
      }

      const logs = auditPermRows
        .map((log) => normalizeAuditLog(log, staffMap))
        .map((log) => ({
          ...log,
          permission_summary: buildPermissionChangeSummary(log.details || {}),
        }))
        .filter((log) => matchSearch(log, keyword));

      return NextResponse.json({ logs });
    }

    if (scope === 'integrity') {
      let integrityPayrollRows: PayrollRow[];
      let integritySubRows: PushSubscriptionRow[];
      let integrityRoomRows: ChatRoomRow[];
      let integrityApprovalRows: ApprovalRow[];

      if (backend === 'd1') {
        const d1 = await getD1Binding();
        if (!d1) return NextResponse.json({ error: '[system-master] D1 binding not available' }, { status: 500 });
        const db = getD1Drizzle(d1);
        const [pRows, sRows, rRows, aRows] = await Promise.all([
          db.select({
            id: payrollRecordsTable.id,
            staff_id: payrollRecordsTable.staff_id,
            year_month: payrollRecordsTable.year_month,
            status: payrollRecordsTable.status,
          }).from(payrollRecordsTable),
          db.select({
            id: pushSubscriptionsTable.id,
            staff_id: pushSubscriptionsTable.staff_id,
            endpoint: pushSubscriptionsTable.endpoint,
          }).from(pushSubscriptionsTable),
          db.select({
            id: chatRoomsTable.id,
            name: chatRoomsTable.name,
            members: chatRoomsTable.members,
          }).from(chatRoomsTable),
          db.select({
            id: approvalsTable.id,
            title: approvalsTable.title,
            status: approvalsTable.status,
            current_approver_id: approvalsTable.current_approver_id,
          }).from(approvalsTable),
        ]);
        // chat_rooms.members TEXT → JSON
        integrityRoomRows = rRows.map((row) => {
          const r = { ...row } as Record<string, unknown>;
          if (typeof r.members === 'string') {
            try { r.members = JSON.parse(r.members); } catch { r.members = []; }
          }
          return r as ChatRoomRow;
        });
        integrityPayrollRows = pRows as unknown as PayrollRow[];
        integritySubRows = sRows as unknown as PushSubscriptionRow[];
        integrityApprovalRows = aRows as unknown as ApprovalRow[];
      } else {
        const [payrollRes, subscriptionRes, roomRes, approvalRes] = await Promise.all([
          supabase.from('payroll_records').select('id, staff_id, year_month, status'),
          supabase.from('push_subscriptions').select('id, staff_id, endpoint'),
          supabase.from('chat_rooms').select('id, name, members'),
          supabase.from('approvals').select('id, title, status, current_approver_id'),
        ]);
        if (payrollRes.error) return NextResponse.json({ error: payrollRes.error.message }, { status: 500 });
        if (subscriptionRes.error) return NextResponse.json({ error: subscriptionRes.error.message }, { status: 500 });
        if (roomRes.error) return NextResponse.json({ error: roomRes.error.message }, { status: 500 });
        if (approvalRes.error) return NextResponse.json({ error: approvalRes.error.message }, { status: 500 });
        integrityPayrollRows = toLooseRecordArray<PayrollRow>(payrollRes.data);
        integritySubRows = toLooseRecordArray<PushSubscriptionRow>(subscriptionRes.data);
        integrityRoomRows = toLooseRecordArray<ChatRoomRow>(roomRes.data);
        integrityApprovalRows = toLooseRecordArray<ApprovalRow>(approvalRes.data);
      }

      const issues = buildIntegrityChecks({
        staffRows: safeStaffRows,
        payrollRows: integrityPayrollRows,
        subscriptionRows: integritySubRows,
        roomRows: integrityRoomRows,
        approvalRows: integrityApprovalRows,
      });

      return NextResponse.json({
        checkedAt: new Date().toISOString(),
        issues,
      });
    }

    return NextResponse.json({ error: 'Unsupported scope' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

async function deleteChatRoomCascade(
  supabase: ReturnType<typeof getAdminClient>,
  roomId: string,
): Promise<{ ok: true; deletedMessageCount: number; deletedPollCount: number } | { ok: false; error: string; status: number }> {
  const backend = await resolveDataBackend();

  if (backend === 'd1') {
    const d1 = await getD1Binding();
    if (!d1) {
      return { ok: false, error: '[deleteChatRoomCascade] D1 binding not available', status: 500 };
    }
    const db = getD1Drizzle(d1);

    // 방 존재 확인
    const roomRows = await db
      .select({ id: chatRoomsTable.id })
      .from(chatRoomsTable)
      .where(eq(chatRoomsTable.id, roomId))
      .limit(1);
    if (roomRows.length === 0) {
      return { ok: false, error: 'Chat room not found', status: 404 };
    }

    // 삭제 카운트 수집용 메시지·투표 ID 조회
    const messageIdRows = await db
      .select({ id: messagesTable.id })
      .from(messagesTable)
      .where(eq(messagesTable.room_id, roomId));
    const pollIdRows = await db
      .select({ id: pollsTable.id })
      .from(pollsTable)
      .where(eq(pollsTable.room_id, roomId));

    const messageIds = messageIdRows.map((r) => r.id).filter(Boolean) as string[];
    const pollIds = pollIdRows.map((r) => r.id).filter(Boolean) as string[];

    // 자식 테이블 삭제 (자식 → 부모 순서)
    // 1) poll_votes (poll_id FK)
    if (pollIds.length > 0) {
      await db.delete(pollVotesTable).where(inArray(pollVotesTable.poll_id, pollIds));
    }

    // 2) message_reactions, message_bookmarks by message_id
    if (messageIds.length > 0) {
      await db.delete(messageReactionsTable).where(inArray(messageReactionsTable.message_id, messageIds));
      await db.delete(messageBookmarksTable).where(inArray(messageBookmarksTable.message_id, messageIds));
    }

    // 3) room 기준 나머지 자식 테이블
    await db.delete(messageBookmarksTable).where(eq(messageBookmarksTable.room_id, roomId));
    await db.delete(pinnedMessagesTable).where(eq(pinnedMessagesTable.room_id, roomId));
    await db.delete(roomReadCursorsTable).where(eq(roomReadCursorsTable.room_id, roomId));
    await db.delete(roomNotificationSettingsTable).where(eq(roomNotificationSettingsTable.room_id, roomId));
    await db.delete(pollsTable).where(eq(pollsTable.room_id, roomId));
    await db.delete(messagesTable).where(eq(messagesTable.room_id, roomId));

    // 4) chat_rooms (부모) 마지막 삭제
    await db.delete(chatRoomsTable).where(eq(chatRoomsTable.id, roomId));

    return { ok: true, deletedMessageCount: messageIds.length, deletedPollCount: pollIds.length };
  }

  // ── Supabase 경로 (d1이 아닐 때) ─────────────────────────────────────────
  const { data: room, error: roomError } = await supabase.from('chat_rooms').select('id').eq('id', roomId).maybeSingle();
  if (roomError) return { ok: false, error: roomError.message, status: 500 };
  if (!room) return { ok: false, error: 'Chat room not found', status: 404 };

  const { data: messageRows, error: messageRowsError } = await supabase.from('messages').select('id').eq('room_id', roomId);
  if (messageRowsError) return { ok: false, error: messageRowsError.message, status: 500 };

  const { data: pollRows, error: pollRowsError } = await supabase.from('polls').select('id').eq('room_id', roomId);
  if (pollRowsError) return { ok: false, error: pollRowsError.message, status: 500 };

  const messageIds = (messageRows || []).map((row) => String(row.id)).filter(Boolean);
  const pollIds = (pollRows || []).map((row) => String(row.id)).filter(Boolean);

  if (pollIds.length > 0) {
    const { error } = await supabase.from('poll_votes').delete().in('poll_id', pollIds);
    if (error) return { ok: false, error: error.message, status: 500 };
  }
  if (messageIds.length > 0) {
    const [{ error: reactionsError }, { error: bookmarksByMessageError }] = await Promise.all([
      supabase.from('message_reactions').delete().in('message_id', messageIds),
      supabase.from('message_bookmarks').delete().in('message_id', messageIds),
    ]);
    if (reactionsError) return { ok: false, error: reactionsError.message, status: 500 };
    if (bookmarksByMessageError) return { ok: false, error: bookmarksByMessageError.message, status: 500 };
  }

  const cleanupResults = await Promise.all([
    supabase.from('message_bookmarks').delete().eq('room_id', roomId),
    supabase.from('pinned_messages').delete().eq('room_id', roomId),
    supabase.from('room_read_cursors').delete().eq('room_id', roomId),
    supabase.from('room_notification_settings').delete().eq('room_id', roomId),
    supabase.from('polls').delete().eq('room_id', roomId),
    supabase.from('messages').delete().eq('room_id', roomId),
  ]);
  for (const result of cleanupResults) {
    if (result.error) return { ok: false, error: result.error.message, status: 500 };
  }

  const { error: deleteRoomError } = await supabase.from('chat_rooms').delete().eq('id', roomId);
  if (deleteRoomError) return { ok: false, error: deleteRoomError.message, status: 500 };

  return { ok: true, deletedMessageCount: messageIds.length, deletedPollCount: pollIds.length };
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session || !isNamedSystemMasterAccount(session.user)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const scope = searchParams.get('scope') || 'overview';
    const roomId = String(searchParams.get('roomId') || '').trim();
    const roomIdsParam = String(searchParams.get('roomIds') || '').trim();
    const roomIds = roomIdsParam
      ? Array.from(new Set(roomIdsParam.split(',').map((id) => id.trim()).filter(Boolean)))
      : [];

    if (scope !== 'chats' || (!roomId && roomIds.length === 0)) {
      return NextResponse.json({ error: 'Unsupported delete request' }, { status: 400 });
    }

    const supabase = getAdminClient();

    // 단일 삭제 (기존 동작)
    if (roomId && roomIds.length === 0) {
      const result = await deleteChatRoomCascade(supabase, roomId);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
      return NextResponse.json({
        ok: true,
        deletedRoomId: roomId,
        deletedMessageCount: result.deletedMessageCount,
        deletedPollCount: result.deletedPollCount,
      });
    }

    // 일괄 삭제 — 안전을 위해 한 번에 최대 500개로 제한
    const targets = roomIds.slice(0, 500);
    const deletedRoomIds: string[] = [];
    const failures: { roomId: string; error: string }[] = [];
    for (const id of targets) {
      const result = await deleteChatRoomCascade(supabase, id);
      if (result.ok) {
        deletedRoomIds.push(id);
      } else {
        failures.push({ roomId: id, error: result.error });
      }
    }

    return NextResponse.json({
      ok: failures.length === 0,
      deletedRoomIds,
      failureCount: failures.length,
      failures,
      requestedCount: targets.length,
    });
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : 'Server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session || !isNamedSystemMasterAccount(session.user)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || '').trim();
    const supabase = getAdminClient();

    if (action === 'run_backup_full') {
      const result = await runBackup('24h');
      if (!result.ok) {
        return NextResponse.json(
          {
            error: result.error || '백업 실행에 실패했습니다.',
            hint: result.hint || null,
          },
          { status: 500 },
        );
      }

      return NextResponse.json({ ok: true, action, result });
    }

    if (action === 'run_chat_push_dispatch') {
      const result = await processPendingChatPushJobs(50);
      return NextResponse.json({ ok: true, action, result });
    }

    if (action === 'run_todo_reminders') {
      const result = await processDueTodoRemindersServer(150);
      return NextResponse.json({ ok: true, action, result });
    }

    if (action === 'cleanup_push_subscriptions') {
      const result = await cleanupPushSubscriptionsInternal(supabase);
      return NextResponse.json({ ok: true, action, result });
    }

    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : 'Server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
