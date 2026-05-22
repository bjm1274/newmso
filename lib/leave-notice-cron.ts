import { createHash } from 'node:crypto';
import {
  extractLeaveRequestMeta,
  formatLeaveNoticeMessage,
  getTimeZoneDateKeyOffset,
  LEAVE_NOTICE_ROOM_ID,
  LEAVE_NOTICE_TIMEZONE,
} from '@/lib/leave-notice';
import {
  messages as messagesTable,
  approvals as approvalsTable,
  staff_members as staffMembersTable,
  getD1Binding,
  getD1Drizzle,
  updateChatRoomLastMessage,
  eq,
  and,
  inArray,
  desc,
} from '@/lib/db';

type D1Db = ReturnType<typeof getD1Drizzle>;

type LeaveApprovalRow = {
  id: string;
  sender_id?: string | null;
  sender_name?: string | null;
  sender_company?: string | null;
  company_id?: string | null;
  title?: string | null;
  meta_data?: Record<string, unknown> | null;
  created_at?: string | null;
};

type StaffRow = {
  id: string;
  name?: string | null;
  company?: string | null;
  company_id?: string | null;
  department?: string | null;
  team?: string | null;
  position?: string | null;
};

export type LeaveNoticeDispatchResult = {
  ok: boolean;
  targetDate: string;
  timeZone: string;
  scanned: number;
  created: number;
  skipped: number;
  failed: number;
  errors: string[];
};

/** D1 TEXT(JSON) 컬럼 값을 객체로 파싱. 실패·비객체는 null. */
function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string' && value.length > 0) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* 파싱 실패 → null */
    }
  }
  return null;
}

function buildDeterministicMessageId(approvalId: string, targetDate: string) {
  const source = `erp-leave-notice:${approvalId}:${targetDate}`;
  const bytes = createHash('sha256').update(source).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

async function fetchApprovedLeaveApprovals(db: D1Db): Promise<LeaveApprovalRow[]> {
  const result: LeaveApprovalRow[] = [];
  const PAGE_SIZE = 500;

  for (let page = 0; page < 20; page += 1) {
    const rows = await db
      .select({
        id: approvalsTable.id,
        sender_id: approvalsTable.sender_id,
        sender_name: approvalsTable.sender_name,
        sender_company: approvalsTable.sender_company,
        company_id: approvalsTable.company_id,
        title: approvalsTable.title,
        meta_data: approvalsTable.meta_data,
        created_at: approvalsTable.created_at,
      })
      .from(approvalsTable)
      .where(
        and(
          eq(approvalsTable.status, '승인'),
          inArray(approvalsTable.type, ['연차/휴가', '휴가신청']),
        ),
      )
      .orderBy(desc(approvalsTable.created_at))
      .limit(PAGE_SIZE)
      .offset(page * PAGE_SIZE);

    for (const row of rows) {
      result.push({
        id: String(row.id),
        sender_id: row.sender_id,
        sender_name: row.sender_name,
        sender_company: row.sender_company,
        company_id: row.company_id,
        title: row.title,
        meta_data: parseJsonObject(row.meta_data),
        created_at: row.created_at,
      });
    }

    if (rows.length < PAGE_SIZE) break;
  }

  return result;
}

async function fetchStaffDirectory(db: D1Db, staffIds: string[]) {
  const map = new Map<string, StaffRow>();
  if (staffIds.length === 0) return map;

  // D1 bound parameter 한도(100) 가드 — id IN (...) 청크 분할
  const CHUNK = 90;
  for (let i = 0; i < staffIds.length; i += CHUNK) {
    const chunk = staffIds.slice(i, i + CHUNK);
    const rows = await db
      .select({
        id: staffMembersTable.id,
        name: staffMembersTable.name,
        company: staffMembersTable.company,
        company_id: staffMembersTable.company_id,
        department: staffMembersTable.department,
        team: staffMembersTable.team,
        position: staffMembersTable.position,
      })
      .from(staffMembersTable)
      .where(inArray(staffMembersTable.id, chunk));
    for (const row of rows) {
      map.set(String(row.id), row as StaffRow);
    }
  }

  return map;
}

function resolveDepartmentLabel(staff: StaffRow | undefined, approval: LeaveApprovalRow) {
  return (
    String(staff?.department || staff?.team || '').trim() ||
    String(approval.sender_company || staff?.company || '').trim() ||
    '-'
  );
}

export async function dispatchDueLeaveNotices(now = new Date()): Promise<LeaveNoticeDispatchResult> {
  const d1 = await getD1Binding();
  if (!d1) {
    throw new Error('[leave-notice-cron] D1 binding not available');
  }
  const db = getD1Drizzle(d1);

  const targetDate = getTimeZoneDateKeyOffset(1, LEAVE_NOTICE_TIMEZONE, now);
  const approvals = await fetchApprovedLeaveApprovals(db);
  const dueApprovals = approvals.filter((approval) => {
    const leaveMeta = extractLeaveRequestMeta(
      approval.meta_data && typeof approval.meta_data === 'object'
        ? (approval.meta_data as Record<string, unknown>)
        : null
    );

    if (!leaveMeta) return false;
    if (leaveMeta.startDate !== targetDate) return false;

    const existingTargetDate = String(
      (approval.meta_data as Record<string, unknown> | null | undefined)?.leave_notice_target_date || ''
    ).trim();
    const existingAnnouncedAt = String(
      (approval.meta_data as Record<string, unknown> | null | undefined)?.leave_notice_announced_at || ''
    ).trim();

    return !(existingAnnouncedAt && existingTargetDate === targetDate);
  });

  const senderIds = Array.from(
    new Set(
      dueApprovals
        .map((approval) => String(approval.sender_id || '').trim())
        .filter(Boolean)
    )
  );
  const staffMap = await fetchStaffDirectory(db, senderIds);

  let created = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];
  const nowIso = now.toISOString();

  for (const approval of dueApprovals) {
    const metaData =
      approval.meta_data && typeof approval.meta_data === 'object'
        ? ({ ...approval.meta_data } as Record<string, unknown>)
        : {};
    const leaveMeta = extractLeaveRequestMeta(metaData);
    if (!leaveMeta) {
      skipped += 1;
      continue;
    }

    const staff = staffMap.get(String(approval.sender_id || '').trim());
    const senderName =
      String(approval.sender_name || staff?.name || '').trim() || '직원';
    const departmentLabel = resolveDepartmentLabel(staff, approval);
    const messageId = buildDeterministicMessageId(String(approval.id), targetDate);
    const content = formatLeaveNoticeMessage({
      leaveType: leaveMeta.leaveType,
      employeeName: senderName,
      department: departmentLabel,
      startDate: leaveMeta.startDate,
      endDate: leaveMeta.endDate,
      delegateName: leaveMeta.delegateName,
    });

    const messageRow = {
      id: messageId,
      room_id: LEAVE_NOTICE_ROOM_ID,
      sender_id: String(approval.sender_id || '').trim() || null,
      sender_name: senderName,
      content,
      created_at: nowIso,
    };

    // 메시지 INSERT — id가 결정적(deterministic)이라 중복은 onConflictDoNothing.
    // returning 결과가 비어 있으면 이미 발송된 공지(중복).
    let duplicateMessage = false;
    try {
      const inserted = await db
        .insert(messagesTable)
        .values(messageRow)
        .onConflictDoNothing()
        .returning({ id: messagesTable.id });
      duplicateMessage = inserted.length === 0;
    } catch (err) {
      failed += 1;
      errors.push(`${approval.id}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    // chat_rooms.last_message_at / preview 갱신 (중복이 아닐 때만 — Postgres 트리거 대체)
    if (!duplicateMessage) {
      try {
        await updateChatRoomLastMessage(db, {
          room_id: LEAVE_NOTICE_ROOM_ID,
          created_at: nowIso,
          content,
        });
      } catch (err) {
        console.warn('[leave-notice-cron] chat_rooms last_message D1 sync failed', err);
      }
    }

    const nextMetaData = {
      ...metaData,
      leave_notice_target_date: targetDate,
      leave_notice_announced_at: nowIso,
      leave_notice_message_id: messageId,
    };
    try {
      await db
        .update(approvalsTable)
        .set({ meta_data: JSON.stringify(nextMetaData) })
        .where(eq(approvalsTable.id, String(approval.id)));
    } catch (err) {
      failed += 1;
      errors.push(`${approval.id}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    if (duplicateMessage) {
      skipped += 1;
    } else {
      created += 1;
    }
  }

  return {
    ok: true,
    targetDate,
    timeZone: LEAVE_NOTICE_TIMEZONE,
    scanned: dueApprovals.length,
    created,
    skipped,
    failed,
    errors,
  };
}
