import { createHash } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  extractLeaveRequestMeta,
  formatLeaveNoticeMessage,
  getTimeZoneDateKeyOffset,
  LEAVE_NOTICE_ROOM_ID,
  LEAVE_NOTICE_TIMEZONE,
} from '@/lib/leave-notice';

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

function getAdminClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Supabase service role configuration is missing.');
  }

  return createClient(supabaseUrl, serviceKey);
}

function buildDeterministicMessageId(approvalId: string, targetDate: string) {
  const source = `erp-leave-notice:${approvalId}:${targetDate}`;
  const bytes = createHash('sha256').update(source).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

async function fetchApprovedLeaveApprovals(supabase: SupabaseClient, pageSize = 500) {
  const rows: LeaveApprovalRow[] = [];

  for (let page = 0; page < 20; page += 1) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from('approvals')
      .select('id,sender_id,sender_name,sender_company,company_id,title,meta_data,created_at')
      .eq('status', '승인')
      .in('type', ['연차/휴가', '휴가신청'])
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;

    const batch = (data || []) as LeaveApprovalRow[];
    rows.push(...batch);

    if (batch.length < pageSize) {
      break;
    }
  }

  return rows;
}

async function fetchStaffDirectory(supabase: SupabaseClient, staffIds: string[]) {
  if (staffIds.length === 0) return new Map<string, StaffRow>();

  const { data, error } = await supabase
    .from('staff_members')
    .select('id,name,company,company_id,department,team,position')
    .in('id', staffIds);

  if (error) throw error;

  return new Map(
    ((data || []) as StaffRow[]).map((staff) => [String(staff.id), staff])
  );
}

function resolveDepartmentLabel(staff: StaffRow | undefined, approval: LeaveApprovalRow) {
  return (
    String(staff?.department || staff?.team || '').trim() ||
    String(approval.sender_company || staff?.company || '').trim() ||
    '-'
  );
}

export async function dispatchDueLeaveNotices(now = new Date()): Promise<LeaveNoticeDispatchResult> {
  const supabase = getAdminClient();
  const targetDate = getTimeZoneDateKeyOffset(1, LEAVE_NOTICE_TIMEZONE, now);
  const approvals = await fetchApprovedLeaveApprovals(supabase);
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
  const staffMap = await fetchStaffDirectory(supabase, senderIds);

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

    const { error: messageError } = await supabase.from('messages').insert({
      id: messageId,
      room_id: LEAVE_NOTICE_ROOM_ID,
      sender_id: String(approval.sender_id || '').trim() || null,
      sender_name: senderName,
      content,
      created_at: nowIso,
    });

    const duplicateMessage =
      Boolean(messageError) &&
      (String((messageError as { code?: string } | null)?.code || '') === '23505' ||
        /duplicate key|unique constraint/i.test(
          String((messageError as { message?: string } | null)?.message || '')
        ));

    if (messageError && !duplicateMessage) {
      failed += 1;
      errors.push(`${approval.id}: ${String(messageError.message || messageError)}`);
      continue;
    }

    const nextMetaData = {
      ...metaData,
      leave_notice_target_date: targetDate,
      leave_notice_announced_at: nowIso,
      leave_notice_message_id: messageId,
    };
    const { error: approvalUpdateError } = await supabase
      .from('approvals')
      .update({ meta_data: nextMetaData })
      .eq('id', String(approval.id));

    if (approvalUpdateError) {
      failed += 1;
      errors.push(`${approval.id}: ${String(approvalUpdateError.message || approvalUpdateError)}`);
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
