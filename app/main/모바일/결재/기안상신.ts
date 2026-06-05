'use client';

/**
 * submitApprovalDraft — 모바일 결재 신규 기안 공통 상신 로직.
 * 여러 양식 폼(일반/연장근무/연차계획)이 동일한 approvals insert + doc_number + meta 패턴을 공유.
 *
 * 데이터 레이어는 @/lib/supabase = D1 re-export shim (D1 경로로 동작).
 * JM: 단일 책임(상신), JM3(throw on error), JM4(any 금지)
 */

import { enqueueSupabaseMutation } from '@/lib/offline-queue-supabase';
import { appendApprovalHistory } from '@/lib/approval-workflow';
import type { ErpUser, StaffMember } from '@/types';
import { generateMobileDocNumber } from './data-hooks';
import type { ApproverPick } from './결재선피커';
import type { AttachmentEntry } from './AttachmentPicker';
import { supabase } from '@/lib/supabase';
import { isActiveStaff } from '@/lib/active-staff';

export type SubmitApprovalArgs = {
  user: ErpUser;
  staffId: string;
  company: string;
  formSlug: string;
  formName: string;
  title: string;
  content: string;
  approverLine: ApproverPick[];
  approverManual: boolean;
  attachments?: AttachmentEntry[];
  /** 양식별 추가 메타 (예: overtime_records, plan_dates) */
  extraMeta?: Record<string, unknown>;
};

export type SubmitApprovalResult = {
  queued: boolean;
  queuedAttachments: number;
};

export async function submitApprovalDraft(args: SubmitApprovalArgs): Promise<SubmitApprovalResult> {
  const {
    user,
    staffId,
    company,
    formSlug,
    formName,
    title,
    content,
    approverLine,
    approverManual,
    attachments = [],
    extraMeta = {},
  } = args;

  const senderName = String(user.name || '').trim() || '이름 없음';
  const senderDepartment = String(user.department || '').trim();
  const senderCompany = company;
  const firstApproverId = String(approverLine[0]?.id || '');

  const docNumber = await generateMobileDocNumber({
    formSlug,
    typeName: formName,
    companyName: senderCompany || null,
    companyId: user.company_id != null ? String(user.company_id) : null,
    departmentName: senderDepartment || null,
    userPermissions:
      (user as unknown as { permissions?: Record<string, unknown> }).permissions ?? null,
  });

  // Fetch active staff in the company for cc_users
  let ccUsers: Array<{ id: string; name: string }> = [];
  try {
    const { data: staffData } = await supabase
      .from('staff_members')
      .select('id, name, status, company, hire_date, resign_date')
      .eq('company', company);
    if (staffData) {
      ccUsers = (staffData as StaffMember[])
        .filter((s: StaffMember) => isActiveStaff(s) && String(s.id) !== staffId)
        .map((s: StaffMember) => ({
          id: String(s.id),
          name: s.name || '이름 없음',
        }));
    }
  } catch (err) {
    console.error('[mobile-approval] failed to fetch cc_users candidates', err);
  }

  const meta: Record<string, unknown> = {
    form_slug: formSlug,
    form_name: formName,
    content,
    cc_departments: [],
    cc_users: ccUsers,
    approver_line: approverLine.map((a) => String(a.id)),
    approver_line_details: approverLine.map((a) => ({
      id: String(a.id || ''),
      name: a.name || '',
      position: a.position || null,
      department: a.department || null,
      company: a.company || null,
    })),
    approver_line_source: approverManual ? 'mobile_manual' : 'mobile_auto',
    revision: 1,
    source_approval_id: null,
    previous_doc_number: null,
    client_origin: 'mobile',
    ...extraMeta,
  };

  const uploadedAttachments = attachments
    .filter((a) => a.state === 'done' && a.fileUrl)
    .map((a) => ({
      name: a.file.name,
      url: a.fileUrl as string,
      mimeType: a.file.type || null,
      size: Number.isFinite(a.file.size) ? a.file.size : null,
      uploadedAt: new Date().toISOString(),
    }));
  if (uploadedAttachments.length > 0) {
    meta.attachments = uploadedAttachments;
  }
  if (docNumber) {
    meta.doc_number = docNumber;
  }

  const row: Record<string, unknown> = {
    sender_id: staffId,
    sender_name: senderName,
    sender_company: senderCompany,
    sender_department: senderDepartment || null,
    current_approver_id: firstApproverId,
    approver_line: approverLine.map((a) => String(a.id)),
    type: formName,
    title: title.trim(),
    content,
    meta_data: appendApprovalHistory(meta, {
      action: 'created',
      actor_id: staffId,
      actor_name: senderName,
      note: '모바일 최초 상신',
      current_approver_id: firstApproverId,
      revision: 1,
    }),
    status: '대기',
  };
  if (docNumber) {
    row.doc_number = docNumber;
  }
  if (user.company_id != null) {
    row.company_id = user.company_id;
  }

  const { queued, error } = await enqueueSupabaseMutation({
    kind: 'insert',
    table: 'approvals',
    payload: row,
  });
  if (error) throw new Error(error);

  const queuedAttachments = attachments.filter((a) => a.state === 'queued').length;
  return { queued: Boolean(queued), queuedAttachments };
}
