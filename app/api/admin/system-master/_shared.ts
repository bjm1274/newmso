// 시스템마스터 라우트 공용 타입/헬퍼 — route.ts 분할 시 핸들러 모듈들이 공유.
// 순수 추출: 동작/시그니처 불변.
import {
  getD1Binding,
  getD1Drizzle,
  staff_members as staffMembersTable,
  push_subscriptions as pushSubscriptionsTable,
  backup_restore_runs as backupRestoreRunsTable,
  chat_push_jobs as chatPushJobsTable,
  desc,
  isNotNull,
  inArray } from '@/lib/db';
import type { ChatMessage, ChatRoom, StaffMember } from '@/types';
import { NOTICE_ROOM_ID } from '@/lib/constants';

/**
 * 운영 패널에 표시되는 크론 목록.
 *
 * ⚠ 이 목록은 wrangler.toml 의 [triggers] crons 와 cloudflare-worker.ts 의
 *   CRON_ROUTES_BY_SCHEDULE 에 실제로 배선된 것만 담아야 한다.
 *   예전에는 todo-reminders 를 '매시간' 이라고 표시했지만 어느 스케줄에도 매핑돼 있지 않아
 *   관리자가 "돌고 있다"고 믿는 잡이 실제로는 한 번도 실행되지 않았다.
 *   chat-push-dispatch 도 '매일 08:00' 으로 표시됐지만 실제로는 5분 주기다.
 *   표기 시각은 KST 기준이며 wrangler 의 UTC 표현식을 환산한 값이다.
 */
export const OPERATION_CRONS = [
  { path: '/api/cron/chat-push-dispatch', schedule: '5분마다', label: '채팅 푸시 큐 처리' },
  { path: '/api/cron/backup', schedule: '매일 00:00', label: '정기 전체 백업' },
  { path: '/api/cron/chat-retention', schedule: '매일 02:00', label: '채팅 보관정책 정리' },
  { path: '/api/cron/absent-auto-create', schedule: '매일 02:00', label: '전날 결근 자동 생성' },
  { path: '/api/cron/push-subscription-cleanup', schedule: '매일 12:00', label: '푸시 구독 정리 (+ 면허 만료·계약 만료 알림)' },
  { path: '/api/cron/unread-notification-repush', schedule: '매일 09:00', label: '미열람 알림 재발송' },
  { path: '/api/cron/leave-notice-announcements', schedule: '매일 09:00', label: '연차 휴무 공지메시지 발송' },
  { path: '/api/cron/birthday-announcements', schedule: '매일 09:00', label: '생일 및 경조사 축하 공지 발송' },
  { path: '/api/cron/annual-leave-accrual', schedule: '매일 09:00', label: '연차 자동 발생' },
  { path: '/api/cron/annual-leave-promotion', schedule: '매일 09:00', label: '연차 사용 촉진' },
  { path: '/api/cron/annual-leave-expiry', schedule: '매일 09:00', label: '연차 소멸 처리' },
  { path: '/api/cron/substitute-holiday', schedule: '매일 09:00', label: '대체휴무 부여' },
  { path: '/api/cron/payroll-notice', schedule: '매일 09:00', label: '급여명세 발송 안내' },
  { path: '/api/cron/appointment-apply', schedule: '매일 09:00', label: '예약 인사발령 반영' },
] as const;

/**
 * 라우트는 있으나 어느 스케줄에도 배선되지 않은 잡.
 * 필요하면 수동 호출(Bearer CRON_SECRET)로만 실행된다 — 자동 실행되지 않는다.
 * 자동화하려면 wrangler [triggers] 와 CRON_ROUTES_BY_SCHEDULE 양쪽에 함께 추가해야 한다.
 */
export const UNSCHEDULED_CRONS = [
  { path: '/api/cron/todo-reminders', label: '할일 리마인더 처리' },
  { path: '/api/cron/auto-report', label: '자동 보고서 생성' },
  { path: '/api/cron/inapp-notifications', label: '인앱 알림 보강' },
  { path: '/api/cron/license-expiry-check', label: '면허 만료 점검 (push-subscription-cleanup 에 통합 실행됨)' },
] as const;

export type PushSubscriptionRow = {
  id: string;
  staff_id: string | null;
  endpoint: string | null;
  platform?: string | null;
  user_agent?: string | null;
  device_id?: string | null;
  fcm_token?: string | null;
  created_at?: string | null;
};

export type PushFailureRow = {
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

export type BackupSummaryRow = {
  name: string;
  created_at: string;
  source: 'local' | 'db';
};

export type IntegrityIssue = {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  count: number;
  samples: string[];
};

export type LooseRecord = Record<string, unknown>;

export function isLooseRecord(value: unknown): value is LooseRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function toLooseRecordArray<T extends LooseRecord = LooseRecord>(value: unknown): T[] {
  return Array.isArray(value) ? (value.filter(isLooseRecord) as T[]) : [];
}

export type StaffRow = Partial<StaffMember> & LooseRecord;
export type ChatRoomRow = Partial<ChatRoom> & LooseRecord;
export type ChatMessageRow = Partial<ChatMessage> & LooseRecord;
export type AuditLogRow = LooseRecord & {
  id?: string | null;
  action?: string | null;
  target_type?: string | null;
  target_id?: string | null;
  user_id?: string | null;
  user_name?: string | null;
  details?: LooseRecord | null;
  created_at?: string | null;
};
export type PayrollRow = LooseRecord & {
  id?: string | null;
  staff_id?: string | null;
  year_month?: string | null;
  status?: string | null;
  net_pay?: number | null;
  created_at?: string | null;
};
export type ApprovalRow = LooseRecord & {
  id?: string | null;
  title?: string | null;
  status?: string | null;
  current_approver_id?: string | null;
};

export function clampLimit(value: string | null, fallback: number, max: number) {
  const parsed = Number.parseInt(String(value || fallback), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

export function sanitizeStaffRow(row: LooseRecord): StaffRow {
  const safe = { ...row } as StaffRow;
  delete safe.password;
  delete safe.passwd;
  return safe;
}

export function getStaffLabel(staff: StaffRow | undefined) {
  if (!staff) return '-';
  const pieces = [staff.name, staff.employee_no ? `#${staff.employee_no}` : null].filter(Boolean);
  return pieces.join(' ');
}

export function getRoomLabel(room: ChatRoomRow, staffMap: Map<string, StaffRow>) {
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

export function getAuditCategory(log: AuditLogRow) {
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

export function matchSearch(value: unknown, keyword: string) {
  if (!keyword) return true;
  return JSON.stringify(value || '')
    .toLowerCase()
    .includes(keyword.toLowerCase());
}

export function normalizeAuditLog(log: AuditLogRow, staffMap: Map<string, StaffRow>) {
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
    details };
}

export function normalizeChatRoom(room: ChatRoomRow, staffMap: Map<string, StaffRow>) {
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
    last_activity_at: room.last_message_at || room.created_at || null };
}

export function normalizeMessage(
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
    edited_at: message.edited_at || null };
}

export async function listRecentBackups(limit = 8): Promise<BackupSummaryRow[]> {
  try {
    const d1 = await getD1Binding();
    if (!d1) return [];
    const db = getD1Drizzle(d1);
    const rows = await db
      .select({
        id: backupRestoreRunsTable.id,
        file_name: backupRestoreRunsTable.file_name,
        started_at: backupRestoreRunsTable.started_at })
      .from(backupRestoreRunsTable)
      .orderBy(desc(backupRestoreRunsTable.started_at))
      .limit(limit);
    return rows.map((row) => ({
      name: row.file_name || row.id,
      created_at: row.started_at || new Date().toISOString(),
      source: 'db' as const }));
  } catch {
    return [];
  }
}

export function buildUsageSummary(logs: AuditLogRow[]) {
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
      actionCounts: new Map<string, number>() };

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
        topAction };
    })
    .sort((left, right) => right.count - left.count);
}

export function groupDuplicateEndpoints(rows: PushSubscriptionRow[]) {
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

export async function loadPushSubscriptionDiagnostics() {
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
      created_at: pushSubscriptionsTable.created_at })
    .from(pushSubscriptionsTable);
  return rows as PushSubscriptionRow[];
}

export async function loadRecentPushFailures() {
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
      dead_lettered_at: chatPushJobsTable.dead_lettered_at })
    .from(chatPushJobsTable)
    .where(isNotNull(chatPushJobsTable.last_error))
    .orderBy(desc(chatPushJobsTable.processing_started_at))
    .limit(8);
  return rows as PushFailureRow[];
}

export function buildPushSubscriptionPlatformSummary(rows: PushSubscriptionRow[]) {
  const counters = new Map<string, number>();
  rows.forEach((row) => {
    const platform = String(row.platform || '').trim() || 'unknown';
    counters.set(platform, (counters.get(platform) || 0) + 1);
  });

  return Array.from(counters.entries())
    .map(([platform, count]) => ({ platform, count }))
    .sort((left, right) => right.count - left.count);
}

export function buildPushFailureSummary(rows: PushFailureRow[]) {
  const counters = new Map<string, number>();
  rows.forEach((row) => {
    const errorKey = String(row.last_error || '').trim() || 'unknown';
    counters.set(errorKey, (counters.get(errorKey) || 0) + 1);
  });

  return Array.from(counters.entries())
    .map(([error, count]) => ({ error, count }))
    .sort((left, right) => right.count - left.count);
}

export function pickPreferredSubscription(rows: PushSubscriptionRow[]) {
  return [...rows].sort((left, right) => {
    const leftHasStaff = left.staff_id ? 1 : 0;
    const rightHasStaff = right.staff_id ? 1 : 0;
    if (leftHasStaff !== rightHasStaff) return rightHasStaff - leftHasStaff;
    return String(right.id).localeCompare(String(left.id));
  })[0];
}

export async function cleanupPushSubscriptionsInternal() {
  const d1 = await getD1Binding();
  if (!d1) throw new Error('[system-master] D1 binding not available (cleanupPushSubscriptionsInternal)');
  const db = getD1Drizzle(d1);
  const [subRows, staffRows] = await Promise.all([
    db.select({
      id: pushSubscriptionsTable.id,
      staff_id: pushSubscriptionsTable.staff_id,
      endpoint: pushSubscriptionsTable.endpoint }).from(pushSubscriptionsTable),
    db.select({ id: staffMembersTable.id }).from(staffMembersTable),
  ]);
  const rows = subRows as PushSubscriptionRow[];
  const validStaffIds = new Set(staffRows.map((row) => String(row.id || '')));

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
  for (let index = 0; index < ids.length; index += chunkSize) {
    const chunk = ids.slice(index, index + chunkSize);
    await db.delete(pushSubscriptionsTable).where(inArray(pushSubscriptionsTable.id, chunk));
  }

  return {
    totalBefore: rows.length,
    deleted: ids.length,
    emptyEndpoint,
    nullStaff,
    orphanStaff,
    duplicateGroups,
    duplicateRowsDeleted,
    totalAfter: rows.length - ids.length };
}

export function buildPermissionChangeSummary(details: LooseRecord) {
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
    afterRole: String(after.role || '').trim() || null };
}

export function buildIntegrityChecks(params: {
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
      samples: orphanPayrollRows.slice(0, 5).map((row) => `${row.year_month || '-'} · ${row.id}`) });
  }
  if (invalidSubscriptions.length > 0) {
    issues.push({
      id: 'invalid-push-subscriptions',
      severity: 'warning',
      title: '유효하지 않은 푸시 구독',
      description: 'staff_id가 없거나 현재 직원과 연결되지 않은 푸시 구독이 남아 있습니다.',
      count: invalidSubscriptions.length,
      samples: invalidSubscriptions.slice(0, 5).map((row) => `${row.id} · ${row.staff_id || 'staff 없음'}`) });
  }
  if (roomsWithMissingMembers.length > 0) {
    issues.push({
      id: 'rooms-with-missing-members',
      severity: 'warning',
      title: '삭제된 직원을 포함한 채팅방',
      description: '채팅방 멤버 목록에 현재 직원 마스터에 없는 사용자가 포함돼 있습니다.',
      count: roomsWithMissingMembers.length,
      samples: roomsWithMissingMembers.slice(0, 5).map((entry) => `${entry.room.name || entry.room.id} · ${entry.missingMembers.join(', ')}`) });
  }
  if (approvalsWithMissingApprover.length > 0) {
    issues.push({
      id: 'approvals-missing-approver',
      severity: 'critical',
      title: '현재 결재자가 존재하지 않는 대기 문서',
      description: '대기 문서인데 현재 결재자가 직원 마스터에 없어 결재가 멈춘 상태일 수 있습니다.',
      count: approvalsWithMissingApprover.length,
      samples: approvalsWithMissingApprover.slice(0, 5).map((row) => `${row.title || row.id} · ${row.current_approver_id}`) });
  }
  if (duplicateEmployeeNoRows.length > 0) {
    issues.push({
      id: 'duplicate-employee-nos',
      severity: 'warning',
      title: '중복 사번',
      description: '직원 마스터에 동일한 사번이 여러 건 존재합니다.',
      count: duplicateEmployeeNoRows.length,
      samples: duplicateEmployeeNoRows.slice(0, 5).map(([employeeNo, count]) => `${employeeNo} (${count}건)`) });
  }
  if (issues.length === 0) {
    issues.push({
      id: 'integrity-ok',
      severity: 'info',
      title: '정합성 이상 없음',
      description: '현재 기준으로 주요 원장/구독/채팅방/결재 데이터 정합성 이슈가 발견되지 않았습니다.',
      count: 0,
      samples: [] });
  }

  return issues;
}
