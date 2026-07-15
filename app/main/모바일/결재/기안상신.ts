'use client';

/**
 * submitApprovalDraft — 모바일 결재 신규 기안 공통 상신 로직.
 * 여러 양식 폼(일반/연장근무/연차계획)이 동일한 approvals insert + doc_number + meta 패턴을 공유.
 *
 * 데이터 레이어는 @/lib/db = D1 re-export shim (D1 경로로 동작).
 * JM: 단일 책임(상신), JM3(throw on error), JM4(any 금지)
 */

import { enqueueD1Mutation } from '@/lib/offline-queue-d1';
import { buildApprovalSubmitPayload } from '@/lib/approval-submit-payload';
import type { ErpUser } from '@/types';
import { generateMobileDocNumber } from './data-hooks';
import type { ApproverPick } from './결재선피커';
import type { AttachmentEntry } from './AttachmentPicker';

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
    extraMeta = {} } = args;

  const senderName = String(user.name || '').trim() || '이름 없음';
  const senderDepartment = String(user.department || '').trim();
  const senderCompany = company;

  const docNumber = await generateMobileDocNumber({
    formSlug,
    typeName: formName,
    companyName: senderCompany || null,
    companyId: user.company_id != null ? String(user.company_id) : null,
    departmentName: senderDepartment || null,
    userPermissions:
      (user as unknown as { permissions?: Record<string, unknown> }).permissions ?? null });

  // PC 패리티: 전사 자동 CC 금지 (필요 시 호출 측 extraMeta.cc_users 로 전달)
  const ccUsers: Array<{ id: string; name: string }> = Array.isArray(extraMeta.cc_users)
    ? (extraMeta.cc_users as Array<{ id: string; name: string }>)
    : [];

  const uploadedAttachments = attachments
    .filter((a) => a.state === 'done' && a.fileUrl)
    .map((a) => ({
      name: a.file.name,
      url: a.fileUrl as string,
      mimeType: a.file.type || null,
      size: Number.isFinite(a.file.size) ? a.file.size : null,
      uploadedAt: new Date().toISOString() }));

  const { row } = buildApprovalSubmitPayload({
    staffId,
    senderName,
    senderCompany,
    senderDepartment: senderDepartment || null,
    companyId: user.company_id ?? null,
    typeName: formName,
    title: title.trim(),
    content,
    formSlug,
    formDisplayName: formName,
    approverLine,
    approverLineSource: approverManual ? 'mobile_manual' : 'mobile_auto',
    docNumber,
    ccDepartments: [],
    ccUsers,
    extraMeta: {
      content,
      client_origin: 'mobile',
      ...extraMeta,
    },
    attachments: uploadedAttachments,
    historyNote: '모바일 최초 상신',
  });

  const { queued, error } = await enqueueD1Mutation({
    kind: 'insert',
    table: 'approvals',
    payload: row });
  if (error) throw new Error(error);

  const queuedAttachments = attachments.filter((a) => a.state === 'queued').length;
  return { queued: Boolean(queued), queuedAttachments };
}
