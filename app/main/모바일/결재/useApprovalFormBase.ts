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
import type { ErpUser } from '@/types';
import type { ApproverPick } from './결재선피커';
import type { AttachmentEntry } from './AttachmentPicker';
import { submitApprovalDraft } from './기안상신';
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
  /** 온라인 복귀 후 업로드될 첨부 수 */
  queuedAttachments: number;
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

  // 첨부 완료 항목 추출은 submitApprovalDraft 안으로 들어갔다(8차 D12-006).
  // 훅 밖 소비자가 없어 그대로 제거한다.

  // ── 결재선 피커 onApply 핸들러 ──
  const handleApproverApply = useCallback(
    (next: ApproverPick[]) => {
      applyPick(next);
    },
    [applyPick],
  );

  // ── approvals insert ──
  // 8차 D12-006: doc_number 생성 → buildApprovalSubmitPayload → enqueueD1Mutation 파이프라인이
  // 이 훅과 `기안상신.submitApprovalDraft` 에 병렬로 구현돼 있었고, 모바일 결재 6개 폼이
  // 3:3 으로 갈려 두 경로를 타고 있었다. 그래서 상신 정책을 바꿀 때 한쪽 누락이
  // 구조적으로 보장됐고 실제로 D12-005(행정팀 참조 누락)가 그 산물이었다.
  //
  // 두 판의 실측 차이는 네 가지였다.
  //   ccDepartments   훅=파라미터 지원 / 함수=`[]` 고정        → 함수에 파라미터 추가(정본)
  //   ccUsers         훅=파라미터    / 함수=extraMeta.cc_users → 함수가 둘 다 받도록
  //   extraMeta.content 훅=미주입    / 함수=자동 주입          → 자동 주입으로 통일
  //   첨부            훅=상태 기반   / 함수=인자               → 훅이 상태를 인자로 넘김
  // 함수를 정본으로 승격한 이유: 소비자가 6개 폼 중 3개로 같지만, 함수는 훅이 아니어서
  // React 컴포넌트 밖(인사탭 등)에서도 쓸 수 있어 커버 범위가 넓다.
  const submitApproval = useCallback(
    async (params: SubmitApprovalParams): Promise<SubmitApprovalResult> => {
      if (!staffId) {
        throw new Error('계정 정보를 확인할 수 없습니다.');
      }

      return submitApprovalDraft({
        user,
        staffId,
        company,
        formSlug: params.formSlug,
        formName: params.formDisplayName,
        typeName: params.typeName,
        title: params.title,
        content: params.content,
        approverLine,
        approverManual,
        attachments,
        ccDepartments: params.ccDepartments ?? [],
        ccUsers: params.ccUsers ?? [],
        extraMeta: params.extraMeta ?? {} });
    },
    [staffId, approverLine, approverManual, user, company, attachments],
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
    handleApproverApply,
    submitApproval,

    /** 첨부 중 오프라인 대기 항목 수 */
    queuedAttachmentCount: attachments.filter((a) => a.state === 'queued').length };
}
