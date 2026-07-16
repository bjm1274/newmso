/**
 * useApprovalFormBase — 모바일 결재 신규 기안 공통 훅.
 *
 * 연차신청폼(SApprovalLeaveForm)과 일반기안폼(SApprovalGenericForm)에서
 * 완전히 동일하게 반복되던 아래 로직을 단일 모듈로 추출:
 *   1. 결재선/첨부/상신 상태 선언
 *   2. 결재선 자동 매핑 (useApproverLine → selectDefaultApproverLine SSOT)
 *   3. 첨부 파일 업로드 완료 항목 추출 (uploadedAttachments)
 *   4. approvals insert + appendApprovalHistory 패턴
 *
 * 각 폼은 이 훅을 호출한 뒤 폼별 고유 필드(연차: 날짜/종류, 일반: 제목/내용)만 관리한다.
 *
 * JM(파일당 500줄, 단일 책임), JM2(staff fetch 1회), JM4(any 금지)
 */

import { useCallback, useState } from 'react';
import { enqueueD1Mutation } from '@/lib/offline-queue-d1';
import type { ErpUser } from '@/types';
import { buildApprovalSubmitPayload } from '@/lib/approval-submit-payload';
import type { ApproverPick } from './결재선피커';
import type { AttachmentEntry } from './AttachmentPicker';
import { generateMobileDocNumber } from './data-hooks';
import { useApproverLine } from './useApproverLine';

// ─────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────

export type ApprovalFormBaseParams = {
  user: ErpUser;
  staffId: string | null;
  company: string;
};

export type SubmitApprovalParams = {
  /** approvals.type — e.g. '연차/휴가', formName */
  typeName: string;
  /** approvals.title */
  title: string;
  /** approvals.content */
  content: string;
  /** data-hooks formSlug — e.g. 'leave', formSlug */
  formSlug: string;
  /** data-hooks formName — e.g. '연차/휴가', formName */
  formDisplayName: string;
  /** meta_data에 병합할 폼별 추가 필드 */
  extraMeta?: Record<string, unknown>;
  /** cc_departments (기본: []) */
  ccDepartments?: string[];
  /** cc_users (기본: []) */
  ccUsers?: Array<{ id: string; name: string }>;
};

export type SubmitApprovalResult = {
  /** 오프라인 큐 대기 여부 */
  queued: boolean;
};

/** 업로드 완료된 첨부 shape — meta_data.attachments에 저장 */
export type UploadedAttachment = {
  name: string;
  url: string;
  mimeType: string | null;
  size: number | null;
  uploadedAt: string;
};

// ─────────────────────────────────────────────
// 훅 본체
// ─────────────────────────────────────────────

export function useApprovalFormBase({ user, staffId, company }: ApprovalFormBaseParams) {
  const [submitting, setSubmitting] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentEntry[]>([]);
  const {
    approverDefaults,
    approverLine,
    approverLoading,
    approverManual,
    pickerOpen,
    setPickerOpen,
    applyPick,
  } = useApproverLine(staffId, company);

  // ── 첨부 파일 업로드 완료 항목 추출 ──
  const buildUploadedAttachments = useCallback((): UploadedAttachment[] => {
    return attachments
      .filter((a) => a.state === 'done' && a.fileUrl)
      .map((a) => ({
        name: a.file.name,
        url: a.fileUrl as string,
        mimeType: a.file.type || null,
        size: Number.isFinite(a.file.size) ? a.file.size : null,
        uploadedAt: new Date().toISOString() }));
  }, [attachments]);

  // ── 결재선 피커 onApply 핸들러 ──
  const handleApproverApply = useCallback(
    (next: ApproverPick[]) => {
      applyPick(next);
    },
    [applyPick],
  );

  // ── approvals insert (공통 패턴) ──
  const submitApproval = useCallback(
    async (params: SubmitApprovalParams): Promise<SubmitApprovalResult> => {
      if (!staffId) {
        throw new Error('계정 정보를 확인할 수 없습니다.');
      }

      const senderName = String(user.name || '').trim() || '이름 없음';
      const senderDepartment = String(user.department || '').trim();
      const senderCompany = company;

      // doc_number — 회사·일자 시퀀스 생성 (실패 시 silent fallback)
      const docNumber = await generateMobileDocNumber({
        formSlug: params.formSlug,
        typeName: params.formDisplayName,
        companyName: senderCompany || null,
        companyId: user.company_id != null ? String(user.company_id) : null,
        departmentName: senderDepartment || null,
        userPermissions:
          (user as unknown as { permissions?: Record<string, unknown> }).permissions ?? null });

      // 첨부 — PC와 동일하게 meta_data.attachments(정본 shape: name/url/mimeType/size)에 기록.
      // 업로드 완료(done)된 항목만 저장. 오프라인 대기(queued)는 URL 미정이라 제외.
      const uploadedAttachments = buildUploadedAttachments();

      const { row } = buildApprovalSubmitPayload({
        staffId,
        senderName,
        senderCompany,
        senderDepartment: senderDepartment || null,
        companyId: user.company_id ?? null,
        typeName: params.typeName,
        title: params.title,
        content: params.content,
        formSlug: params.formSlug,
        formDisplayName: params.formDisplayName,
        approverLine,
        approverLineSource: approverManual ? 'mobile_manual' : 'mobile_auto',
        docNumber,
        ccDepartments: params.ccDepartments ?? [],
        ccUsers: params.ccUsers ?? [],
        extraMeta: {
          client_origin: 'mobile',
          ...params.extraMeta,
        },
        attachments: uploadedAttachments,
        historyNote: '모바일 최초 상신',
      });

      const { queued, error } = await enqueueD1Mutation({
        kind: 'insert',
        table: 'approvals',
        payload: row });
      if (error) throw new Error(error);

      return { queued };
    },
    [staffId, approverLine, approverManual, user, company, buildUploadedAttachments],
  );

  return {
    // ── 상태 ──
    submitting,
    setSubmitting,
    attachments,
    setAttachments,
    approverDefaults,
    approverLine,
    approverLoading,
    approverManual,
    pickerOpen,
    setPickerOpen,

    // ── 파생/헬퍼 ──
    buildUploadedAttachments,
    handleApproverApply,
    submitApproval,

    /** 첨부 중 오프라인 대기 항목 수 */
    queuedAttachmentCount: attachments.filter((a) => a.state === 'queued').length };
}
