import { promises as fs } from 'node:fs';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { readSessionFromRequest } from '@/lib/server-session';
import { isNamedSystemMasterAccount } from '@/lib/system-master';
import { runBackup } from '@/lib/backup-cron';
import { processPendingChatPushJobs } from '@/lib/chat-push-dispatch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NOTICE_ROOM_ID = '00000000-0000-0000-0000-000000000000';
const OPERATION_CRONS = [
  { path: '/api/cron/backup', schedule: '매일 00:00', label: '정기 전체 백업' },
  { path: '/api/cron/chat-retention', schedule: '매일 02:00', label: '채팅 보관정책 정리' },
  { path: '/api/cron/push-subscription-cleanup', schedule: '매일 12:00', label: '푸시 구독 정리' },
  { path: '/api/cron/chat-push-dispatch', schedule: '매일 04:00', label: '채팅 푸시 큐 백업 처리' },
] as const;

type PushSubscriptionRow = {
  id: string;
  staff_id: string | null;
  endpoint: string | null;
};

type QueueHealthRow = {
  id: string;
  created_at: string | null;
  processed_at?: string | null;
  processing_started_at?: string | null;
  attempt_count?: number | null;
  next_attempt_at?: string | null;
  dead_lettered_at?: string | null;
};

type BackupSummaryRow = {
  name: string;
  created_at: string;
  source: 'local';
};

type IntegrityIssue = {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  count: number;
  samples: string[];
};

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

function sanitizeStaffRow(row: Record<string, any>) {
  const safe = { ...row };
  delete safe.password;
  delete safe.passwd;
  return safe;
}

function getStaffLabel(staff: Record<string, any> | undefined) {
  if (!staff) return '-';
  const pieces = [staff.name, staff.employee_no ? `#${staff.employee_no}` : null].filter(Boolean);
  return pieces.join(' ');
}

function getRoomLabel(room: Record<string, any>, staffMap: Map<string, Record<string, any>>) {
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

function getAuditCategory(log: Record<string, any>) {
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

function normalizeAuditLog(log: Record<string, any>, staffMap: Map<string, Record<string, any>>) {
  const details = log.details && typeof log.details === 'object' ? log.details : {};
  const targetStaff = log.target_id ? staffMap.get(String(log.target_id)) : undefined;
  const changedFields = Array.isArray((details as Record<string, any>).changed_fields)
    ? (details as Record<string, any>).changed_fields
    : Object.keys((details as Record<string, any>).after || (details as Record<string, any>).requested_changes || {});

  return {
    ...log,
    category: getAuditCategory(log),
    actor_label: log.user_name || getStaffLabel(log.user_id ? staffMap.get(String(log.user_id)) : undefined),
    target_label: targetStaff ? getStaffLabel(targetStaff) : log.target_id || '-',
    changed_fields: changedFields,
    details,
  };
}

function normalizeChatRoom(room: Record<string, any>, staffMap: Map<string, Record<string, any>>) {
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
  message: Record<string, any>,
  rooms: Map<string, Record<string, any>>,
  staffMap: Map<string, Record<string, any>>,
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

function isMissingColumnError(error: any, columnName: string) {
  if (!error) return false;
  const code = String(error?.code || '');
  const message = String(error?.message || error?.details || '').toLowerCase();
  return code === '42703' && message.includes(columnName.toLowerCase());
}

function isMissingRelationError(error: any, relationName?: string) {
  if (!error) return false;
  const code = String(error?.code || '');
  const message = String(error?.message || error?.details || '').toLowerCase();
  return code === '42P01' || (relationName ? message.includes(relationName.toLowerCase()) : false);
}

async function safeHeadCount(
  queryFactory: () => PromiseLike<{ count?: number | null; error?: any }>,
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
  queryFactory: () => PromiseLike<{ data?: T[] | null; error?: any }>,
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
    const backupRoot = path.join(process.cwd(), 'backups');
    const rows = await fs.readdir(backupRoot, { withFileTypes: true });
    const collected = await Promise.all(
      rows
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const fullPath = path.join(backupRoot, entry.name);
          const stats = await fs.stat(fullPath);
          return {
            name: entry.name,
            created_at: stats.mtime.toISOString(),
            source: 'local' as const,
          };
        }),
    );

    return collected
      .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
      .slice(0, limit);
  } catch {
    return [];
  }
}

function buildUsageSummary(logs: Record<string, any>[]) {
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

async function collectPushQueueHealth(supabase: ReturnType<typeof getAdminClient>) {
  const queueRes = await supabase
    .from('chat_push_jobs')
    .select('id, created_at, processed_at, processing_started_at, attempt_count, next_attempt_at, dead_lettered_at');

  let queueRows: QueueHealthRow[] = [];
  let queueMigrationReady = true;

  if (queueRes.error) {
    if (
      isMissingColumnError(queueRes.error, 'next_attempt_at') ||
      isMissingColumnError(queueRes.error, 'dead_lettered_at')
    ) {
      const fallbackQueueRes = await supabase
        .from('chat_push_jobs')
        .select('id, created_at, processed_at, processing_started_at, attempt_count');

      if (fallbackQueueRes.error) {
        throw fallbackQueueRes.error;
      }

      queueMigrationReady = false;
      queueRows = (fallbackQueueRes.data || []) as QueueHealthRow[];
    } else {
      throw queueRes.error;
    }
  } else {
    queueRows = (queueRes.data || []) as QueueHealthRow[];
  }

  const now = Date.now();
  return queueRows.reduce(
    (acc, row) => {
      const processedAt = row.processed_at ? Date.parse(String(row.processed_at)) : Number.NaN;
      const nextAttemptAt = row.next_attempt_at ? Date.parse(String(row.next_attempt_at)) : Number.NaN;
      const isProcessed = Number.isFinite(processedAt);

      acc.total += 1;
      if (!isProcessed) {
        acc.pending += 1;
        if (!acc.oldestPendingAt || String(row.created_at || '') < acc.oldestPendingAt) {
          acc.oldestPendingAt = String(row.created_at || '');
        }
      }

      if (row.dead_lettered_at) {
        acc.deadLettered += 1;
      } else if (!isProcessed && (!queueMigrationReady || !Number.isFinite(nextAttemptAt) || nextAttemptAt <= now)) {
        acc.ready += 1;
      }

      if (!isProcessed && Number(row.attempt_count || 0) > 0) {
        acc.retrying += 1;
      }

      if (row.processing_started_at) {
        acc.inFlight += 1;
      }

      return acc;
    },
    {
      migrationReady: queueMigrationReady,
      total: 0,
      pending: 0,
      ready: 0,
      retrying: 0,
      deadLettered: 0,
      inFlight: 0,
      oldestPendingAt: '',
    },
  );
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
  const [subscriptionRes, staffRes] = await Promise.all([
    supabase.from('push_subscriptions').select('id, staff_id, endpoint'),
    supabase.from('staff_members').select('id'),
  ]);

  if (subscriptionRes.error) throw subscriptionRes.error;
  if (staffRes.error) throw staffRes.error;

  const validStaffIds = new Set((staffRes.data || []).map((row: { id: string | null }) => String(row.id || '')));
  const rows = (subscriptionRes.data || []) as PushSubscriptionRow[];
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
    const { error } = await supabase.from('push_subscriptions').delete().in('id', chunk);
    if (error) throw error;
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

function buildPermissionChangeSummary(details: Record<string, any>) {
  const beforePermissions = (details?.before?.permissions || {}) as Record<string, boolean>;
  const afterPermissions = (details?.after?.permissions || {}) as Record<string, boolean>;
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
    beforeRole: details?.before?.role || null,
    afterRole: details?.after?.role || null,
  };
}

function buildIntegrityChecks(params: {
  staffRows: Record<string, any>[];
  payrollRows: Record<string, any>[];
  subscriptionRows: PushSubscriptionRow[];
  roomRows: Record<string, any>[];
  approvalRows: Record<string, any>[];
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

    const { data: staffRows, error: staffError } = await supabase
      .from('staff_members')
      .select('*')
      .order('employee_no', { ascending: true })
      .limit(500);

    if (staffError) {
      return NextResponse.json({ error: '직원 데이터를 불러오는 중 오류가 발생했습니다.' }, { status: 500 });
    }

    const safeStaffRows = (staffRows || []).map((row: any) => sanitizeStaffRow(row));
    const staffMap = new Map<string, Record<string, any>>(safeStaffRows.map((staff: Record<string, any>) => [String(staff.id), staff]));

    if (scope === 'overview') {
      const [staffCountRes, auditCountRes, payrollCountRes, roomCountRes, messageCountRes, auditRes, payrollRes, roomRes, messageRes] =
        await Promise.all([
          supabase.from('staff_members').select('id', { head: true, count: 'exact' }),
          supabase.from('audit_logs').select('id', { head: true, count: 'exact' }),
          supabase.from('payroll_records').select('id', { head: true, count: 'exact' }),
          supabase.from('chat_rooms').select('id', { head: true, count: 'exact' }),
          supabase.from('messages').select('id', { head: true, count: 'exact' }),
          supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(40),
          supabase.from('payroll_records').select('*').order('created_at', { ascending: false }).limit(80),
          supabase.from('chat_rooms').select('*').order('created_at', { ascending: false }).limit(80),
          supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(80),
        ]);

      const rooms = roomRes.data || [];
      const roomMap = new Map<string, Record<string, any>>(rooms.map((room: Record<string, any>) => [String(room.id), room]));
      const payrollItems = (payrollRes.data || []).map((record: Record<string, any>) => {
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
          staffCount: staffCountRes.count || 0,
          auditCount: auditCountRes.count || 0,
          payrollCount: payrollCountRes.count || 0,
          roomCount: roomCountRes.count || 0,
          messageCount: messageCountRes.count || 0,
        },
        recentAudits: (auditRes.data || []).map((log: Record<string, any>) => normalizeAuditLog(log, staffMap)),
        sensitiveStaffs: safeStaffRows,
        recentPayrolls: payrollItems,
        chatRooms: rooms.map((room: Record<string, any>) => normalizeChatRoom(room, staffMap)),
        recentMessages: (messageRes.data || []).map((message: Record<string, any>) => normalizeMessage(message, roomMap, staffMap)),
      });
    }

    if (scope === 'audit') {
      const { data: auditRows, error: auditError } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (auditError) {
        return NextResponse.json({ error: auditError.message }, { status: 500 });
      }

      const filtered = (auditRows || [])
        .map((log: Record<string, any>) => normalizeAuditLog(log, staffMap))
        .filter((log: Record<string, any>) => category === 'all' || log.category === category)
        .filter((log: Record<string, any>) => matchSearch(log, keyword));

      return NextResponse.json({ logs: filtered });
    }

    if (scope === 'chats') {
      const [roomRes, messageRes] = await Promise.all([
        supabase.from('chat_rooms').select('*').order('created_at', { ascending: false }),
        (() => {
          let query = supabase.from('messages').select('*').order('created_at', { ascending: false });
          if (roomId) query = query.eq('room_id', roomId);
          if (keyword) query = query.ilike('content', `%${keyword}%`);
          return query;
        })(),
      ]);

      if (roomRes.error) {
        return NextResponse.json({ error: '채팅방 데이터를 불러오는 중 오류가 발생했습니다.' }, { status: 500 });
      }
      if (messageRes.error) {
        return NextResponse.json({ error: '메시지 데이터를 불러오는 중 오류가 발생했습니다.' }, { status: 500 });
      }

      const rooms = roomRes.data || [];
      const roomMap = new Map<string, Record<string, any>>(rooms.map((room: Record<string, any>) => [String(room.id), room]));
      const normalizedRooms = rooms
        .map((room: Record<string, any>) => normalizeChatRoom(room, staffMap))
        .sort((left: Record<string, any>, right: Record<string, any>) => {
          const leftTime = new Date(String(left.last_activity_at || left.created_at || 0)).getTime();
          const rightTime = new Date(String(right.last_activity_at || right.created_at || 0)).getTime();
          return rightTime - leftTime;
        });

      const filteredMessages = (messageRes.data || [])
        .filter((message: Record<string, any>) => !keyword || matchSearch(message, keyword))
        .map((message: Record<string, any>) => normalizeMessage(message, roomMap, staffMap));

      return NextResponse.json({ rooms: normalizedRooms, messages: filteredMessages });
    }

    if (scope === 'operations') {
      const [auditRes, staffIdRes, backupRows, queueSummary, restoreRuns, dueTodoCount, repeatingTodoCount, reminderLogCount24h, wikiDocumentCount, wikiVersionCount, recentWikiVersions] = await Promise.all([
        supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(400),
        supabase.from('staff_members').select('id'),
        listRecentBackups(10),
        collectPushQueueHealth(supabase),
        safeRows(() => supabase.from('backup_restore_runs').select('id,file_name,status,total_tables,total_rows,requested_by_name,started_at,finished_at,result_summary').order('started_at', { ascending: false }).limit(10), 'backup_restore_runs'),
        safeHeadCount(() => supabase.from('todos').select('*', { count: 'exact', head: true }).eq('is_complete', false).not('reminder_at', 'is', null).lte('reminder_at', new Date().toISOString()), 'todos'),
        safeHeadCount(() => supabase.from('todos').select('*', { count: 'exact', head: true }).eq('is_complete', false).neq('repeat_type', 'none'), 'todos'),
        safeHeadCount(() => supabase.from('todo_reminder_logs').select('*', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()), 'todo_reminder_logs'),
        safeHeadCount(() => supabase.from('wiki_documents').select('*', { count: 'exact', head: true }).eq('is_archived', false), 'wiki_documents'),
        safeHeadCount(() => supabase.from('wiki_document_versions').select('*', { count: 'exact', head: true }), 'wiki_document_versions'),
        safeRows(() => supabase.from('wiki_document_versions').select('id,document_id,title,version_no,created_at,change_summary').order('created_at', { ascending: false }).limit(5), 'wiki_document_versions'),
      ]);

      if (auditRes.error) return NextResponse.json({ error: auditRes.error.message }, { status: 500 });
      if (staffIdRes.error) return NextResponse.json({ error: staffIdRes.error.message }, { status: 500 });

      const validStaffIds = new Set((staffIdRes.data || []).map((row: { id: string | null }) => String(row.id || '')));
      const subscriptionRes = await supabase.from('push_subscriptions').select('id, staff_id, endpoint');
      if (subscriptionRes.error) {
        return NextResponse.json({ error: subscriptionRes.error.message }, { status: 500 });
      }

      const subscriptionRows = (subscriptionRes.data || []) as PushSubscriptionRow[];
      const duplicateEndpointInfo = groupDuplicateEndpoints(subscriptionRows);
      const orphanSubscriptions = subscriptionRows.filter((row) => {
        const staffId = String(row.staff_id || '').trim();
        return Boolean(staffId) && !validStaffIds.has(staffId);
      }).length;
      const nullStaffSubscriptions = subscriptionRows.filter((row) => !String(row.staff_id || '').trim()).length;

      const latestBackup = backupRows[0] || null;
      const backupAgeHours = latestBackup ? (Date.now() - new Date(latestBackup.created_at).getTime()) / (1000 * 60 * 60) : null;
      const failedRestoreRuns = (restoreRuns as Array<Record<string, any>>).filter((run) => String(run.status || '') === 'failed');
      const latestRestoreRun = (restoreRuns as Array<Record<string, any>>)[0] || null;
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
        queue: queueSummary,
        subscriptions: {
          total: subscriptionRows.length,
          nullStaff: nullStaffSubscriptions,
          orphan: orphanSubscriptions,
          duplicateEndpointGroups: duplicateEndpointInfo.duplicateGroups,
          duplicateRows: duplicateEndpointInfo.duplicateRows,
        },
        recentBackups: backupRows,
        latestBackup,
        restoreRuns,
        cronJobs: OPERATION_CRONS,
        usageSummary: buildUsageSummary(auditRes.data || []),
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
      const { data: auditRows, error: auditError } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('target_type', 'staff_permission')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (auditError) {
        return NextResponse.json({ error: auditError.message }, { status: 500 });
      }

      const logs = (auditRows || [])
        .map((log: Record<string, any>) => normalizeAuditLog(log, staffMap))
        .map((log: Record<string, any>) => ({
          ...log,
          permission_summary: buildPermissionChangeSummary(log.details || {}),
        }))
        .filter((log: Record<string, any>) => matchSearch(log, keyword));

      return NextResponse.json({ logs });
    }

    if (scope === 'integrity') {
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

      const issues = buildIntegrityChecks({
        staffRows: safeStaffRows,
        payrollRows: payrollRes.data || [],
        subscriptionRows: (subscriptionRes.data || []) as PushSubscriptionRow[],
        roomRows: roomRes.data || [],
        approvalRows: approvalRes.data || [],
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

export async function DELETE(request: NextRequest) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session || !isNamedSystemMasterAccount(session.user)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const scope = searchParams.get('scope') || 'overview';
    const roomId = String(searchParams.get('roomId') || '').trim();

    if (scope !== 'chats' || !roomId) {
      return NextResponse.json({ error: 'Unsupported delete request' }, { status: 400 });
    }

    const supabase = getAdminClient();

    const { data: room, error: roomError } = await supabase.from('chat_rooms').select('id').eq('id', roomId).maybeSingle();

    if (roomError) {
      return NextResponse.json({ error: roomError.message }, { status: 500 });
    }
    if (!room) {
      return NextResponse.json({ error: 'Chat room not found' }, { status: 404 });
    }

    const { data: messageRows, error: messageRowsError } = await supabase.from('messages').select('id').eq('room_id', roomId);
    if (messageRowsError) {
      return NextResponse.json({ error: messageRowsError.message }, { status: 500 });
    }

    const { data: pollRows, error: pollRowsError } = await supabase.from('polls').select('id').eq('room_id', roomId);
    if (pollRowsError) {
      return NextResponse.json({ error: pollRowsError.message }, { status: 500 });
    }

    const messageIds = (messageRows || []).map((row: Record<string, any>) => String(row.id)).filter(Boolean);
    const pollIds = (pollRows || []).map((row: Record<string, any>) => String(row.id)).filter(Boolean);

    if (pollIds.length > 0) {
      const { error } = await supabase.from('poll_votes').delete().in('poll_id', pollIds);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (messageIds.length > 0) {
      const [{ error: reactionsError }, { error: bookmarksByMessageError }] = await Promise.all([
        supabase.from('message_reactions').delete().in('message_id', messageIds),
        supabase.from('message_bookmarks').delete().in('message_id', messageIds),
      ]);

      if (reactionsError) return NextResponse.json({ error: reactionsError.message }, { status: 500 });
      if (bookmarksByMessageError) return NextResponse.json({ error: bookmarksByMessageError.message }, { status: 500 });
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
      if (result.error) {
        return NextResponse.json({ error: result.error.message }, { status: 500 });
      }
    }

    const { error: deleteRoomError } = await supabase.from('chat_rooms').delete().eq('id', roomId);
    if (deleteRoomError) {
      return NextResponse.json({ error: deleteRoomError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      deletedRoomId: roomId,
      deletedMessageCount: messageIds.length,
      deletedPollCount: pollIds.length,
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
