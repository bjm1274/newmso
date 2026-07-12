/**
 * useApprovalFormBase — 모바일 결재 신규 기안 공통 훅.
 *
 * 연차신청폼(SApprovalLeaveForm)과 일반기안폼(SApprovalGenericForm)에서
 * 완전히 동일하게 반복되던 아래 로직을 단일 모듈로 추출:
 *   1. 결재선/첨부/상신 상태 선언
 *   2. 결재선 자동 매핑 useEffect (staff_members fetch → 필터 → 정렬 → toApproverPick)
 *   3. 첨부 파일 업로드 완료 항목 추출 (uploadedAttachments)
 *   4. approvals insert + appendApprovalHistory 패턴
 *
 * 각 폼은 이 훅을 호출한 뒤 폼별 고유 필드(연차: 날짜/종류, 일반: 제목/내용)만 관리한다.
 *
 * JM(파일당 500줄, 단일 책임), JM2(staff fetch 1회), JM4(any 금지)
 */

import { useCallback, useEffect, useState } from 'react';
import { db } from '@/lib/db-client';
import { toast } from '@/lib/toast';
import { enqueueD1Mutation } from '@/lib/offline-queue-d1';
import type { ErpUser, StaffMember } from '@/types';
import { isActiveStaff, isDepartmentHeadOrAbove, getPositionOrder } from '@/lib/active-staff';
import { appendApprovalHistory } from '@/lib/approval-workflow';
import { toApproverPick, type ApproverPick } from './결재선피커';
import type { AttachmentEntry } from './AttachmentPicker';
import { generateMobileDocNumber } from './data-hooks';

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
  const [approverDefaults, setApproverDefaults] = useState<ApproverPick[]>([]);
  const [approverLine, setApproverLine] = useState<ApproverPick[]>([]);
  const [approverLoading, setApproverLoading] = useState(true);
  const [approverManual, setApproverManual] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  // 결재선 자동 매핑 — 본인 회사의 APPROVER_POSITIONS 보유자 1~3명, 직급 위계순
  useEffect(() => {
    if (!staffId) {
      setApproverLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setApproverLoading(true);
      try {
        const { data, error } = await db
          .from('staff_members')
          .select('id, name, company, department, position, status, hire_date, resign_date, email, phone, role, permissions');
        if (error) throw error;
        if (cancelled) return;
        const candidates = ((data ?? []) as StaffMember[])
          .filter((s) => isActiveStaff(s))
          .filter((s) => isDepartmentHeadOrAbove(s))
          .filter((s) => String(s.id) !== staffId)
          .filter((s) => s.company === company || s.company === 'SY INC.')
          .sort((a, b) => getPositionOrder(a.position, a.role) - getPositionOrder(b.position, b.role) || (a.name || '').localeCompare(b.name || ''));
        // 자동 결재선은 1~3명 (직급 위계 상위 우선)
        const picks = candidates.map(toApproverPick).slice(0, 3);
        setApproverDefaults(picks);
        // 수동 변경 전이면 기본값으로 라인 채움
        if (!approverManual) {
          setApproverLine(picks);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('[mobile-approval] approver candidates load failed', err);
          setApproverDefaults([]);
          if (!approverManual) setApproverLine([]);
        }
      } finally {
        if (!cancelled) setApproverLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // approverManual은 의도적으로 의존성 제외 — manual 토글로 재fetch하면 안 됨
  }, [staffId, company]); // eslint-disable-line react-hooks/exhaustive-deps

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
      setApproverLine(next);
      // 기본값과 같은지 비교 — 같으면 manual 해제
      const sameAsDefault =
        next.length === approverDefaults.length &&
        next.every((p, i) => p.id === approverDefaults[i]?.id);
      setApproverManual(!sameAsDefault);
    },
    [approverDefaults],
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
      const firstApproverId = String(approverLine[0]?.id || '');

      // doc_number — 회사·일자 시퀀스 생성 (실패 시 silent fallback)
      const docNumber = await generateMobileDocNumber({
        formSlug: params.formSlug,
        typeName: params.formDisplayName,
        companyName: senderCompany || null,
        companyId: user.company_id != null ? String(user.company_id) : null,
        departmentName: senderDepartment || null,
        userPermissions:
          (user as unknown as { permissions?: Record<string, unknown> }).permissions ?? null });

      const meta: Record<string, unknown> = {
        form_slug: params.formSlug,
        form_name: params.formDisplayName,
        cc_departments: params.ccDepartments ?? [],
        cc_users: params.ccUsers ?? [],
        approver_line: approverLine.map((a) => String(a.id)),
        approver_line_details: approverLine.map((a) => ({
          id: String(a.id || ''),
          name: a.name || '',
          position: a.position || null,
          department: a.department || null,
          company: a.company || null })),
        approver_line_source: approverManual ? 'mobile_manual' : 'mobile_auto',
        revision: 1,
        source_approval_id: null,
        previous_doc_number: null,
        client_origin: 'mobile',
        ...params.extraMeta };

      // 첨부 — PC와 동일하게 meta_data.attachments(정본 shape: name/url/mimeType/size)에 기록.
      // 업로드 완료(done)된 항목만 저장. 오프라인 대기(queued)는 URL 미정이라 제외.
      const uploadedAttachments = buildUploadedAttachments();
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
        type: params.typeName,
        title: params.title,
        content: params.content,
        meta_data: appendApprovalHistory(meta, {
          action: 'created',
          actor_id: staffId,
          actor_name: senderName,
          note: '모바일 최초 상신',
          current_approver_id: firstApproverId,
          revision: 1 }),
        status: '대기' };
      if (user.company_id != null) {
        row.company_id = user.company_id;
      }
      if (docNumber) {
        row.doc_number = docNumber;
      }

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
    setApproverLine,
    approverLoading,
    approverManual,
    setApproverManual,
    pickerOpen,
    setPickerOpen,

    // ── 파생/헬퍼 ──
    buildUploadedAttachments,
    handleApproverApply,
    submitApproval,

    /** 첨부 중 오프라인 대기 항목 수 */
    queuedAttachmentCount: attachments.filter((a) => a.state === 'queued').length };
}
