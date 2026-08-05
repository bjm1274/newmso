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
  /** 양식 표시명. doc_number 생성과 meta.form_display_name 에 쓰인다. */
  formName: string;
  /**
   * approvals.type. 대부분 formName 과 같지만 출결정정처럼
   * 표시명('출결정정 신청')과 문서 타입('출결정정')이 다른 양식이 있어 분리해 둔다.
   * 미지정 시 formName.
   */
  typeName?: string;
  title: string;
  content: string;
  approverLine: ApproverPick[];
  approverManual: boolean;
  attachments?: AttachmentEntry[];
  /** 양식별 추가 메타 (예: overtime_records, plan_dates) */
  extraMeta?: Record<string, unknown>;
  /**
   * 참조 부서. 8차 D12-006: 예전에는 여기서 `[]` 로 고정돼 있었고 훅
   * (useApprovalFormBase.submitApproval)만 파라미터를 지원했다. 두 파이프라인의
   * 소비자가 3:3 으로 갈려 있어서, 연차 인사탭(이 함수 사용)의 행정팀 참조가
   * 통째로 빠지는 D12-005 가 실제로 발생했다.
   */
  ccDepartments?: string[];
  /** 참조 사용자. 미지정 시 `extraMeta.cc_users` 를 읽는 기존 경로를 유지한다. */
  ccUsers?: Array<{ id: string; name: string }>;
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
    typeName,
    title,
    content,
    approverLine,
    approverManual,
    attachments = [],
    extraMeta = {},
    ccDepartments = [],
    ccUsers: ccUsersArg } = args;

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

  // PC 패리티: 전사 자동 CC 금지 (인자 우선, 없으면 기존 extraMeta.cc_users 경로)
  const ccUsers: Array<{ id: string; name: string }> =
    ccUsersArg ??
    (Array.isArray(extraMeta.cc_users)
      ? (extraMeta.cc_users as Array<{ id: string; name: string }>)
      : []);

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
    typeName: typeName || formName,
    title: title.trim(),
    content,
    formSlug,
    formDisplayName: formName,
    approverLine,
    approverLineSource: approverManual ? 'mobile_manual' : 'mobile_auto',
    docNumber,
    ccDepartments,
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
