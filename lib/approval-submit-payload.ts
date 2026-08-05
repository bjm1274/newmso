/**
 * buildApprovalSubmitPayload — 결재 상신 row/meta 공통 필드 빌더.
 *
 * PC useApprovalSubmit / 모바일 useApprovalFormBase·기안상신 이 동일 키로
 * approvals insert payload를 만들도록 순수 함수로 추출.
 * (doc_number 채번·enqueue 등 부수효과는 호출측 책임)
 */

import { appendApprovalHistory } from '@/lib/approval-workflow';

export type ApprovalSubmitApprover = {
  id: string;
  name?: string | null;
  position?: string | null;
  department?: string | null;
  company?: string | null;
};

export type ApprovalSubmitAttachment = {
  name: string;
  url: string;
  mimeType?: string | null;
  size?: number | null;
  uploadedAt?: string;
};

export type BuildApprovalSubmitPayloadInput = {
  staffId: string;
  senderName: string;
  senderCompany: string;
  senderDepartment?: string | null;
  companyId?: string | number | null;
  /** approvals.type — e.g. '연차/휴가', '물품신청' */
  typeName: string;
  title: string;
  content: string;
  formSlug: string;
  formDisplayName: string;
  approverLine: ApprovalSubmitApprover[];
  /** meta.approver_line_source */
  approverLineSource?: string;
  docNumber?: string | null;
  ccDepartments?: string[];
  ccUsers?: Array<{ id: string; name: string }>;
  extraMeta?: Record<string, unknown>;
  attachments?: ApprovalSubmitAttachment[];
  /** 이력 note (기본: 최초 상신) */
  historyNote?: string;
  /** revision (기본 1) */
  revision?: number;
  /** 이력 actor — 기본 staffId/senderName */
  actorId?: string | null;
  actorName?: string | null;
};

export type BuildApprovalSubmitPayloadResult = {
  /** approvals insert row (meta_data 포함) */
  row: Record<string, unknown>;
  /** history append 전 원시 meta (디버그/확장용) */
  meta: Record<string, unknown>;
};

/**
 * approvals insert 용 row + meta 를 동일 스키마로 생성.
 * type / form_slug / form_name / approver_line / items 등 서버·PC 정합 키 보장.
 */
export function buildApprovalSubmitPayload(
  input: BuildApprovalSubmitPayloadInput,
): BuildApprovalSubmitPayloadResult {
  const staffId = String(input.staffId || '').trim();
  const senderName = String(input.senderName || '').trim() || '이름 없음';
  const senderCompany = String(input.senderCompany || '').trim();
  const senderDepartment = String(input.senderDepartment || '').trim() || null;
  const approverIds = (Array.isArray(input.approverLine) ? input.approverLine : [])
    .map((a) => String(a?.id ?? '').trim())
    .filter(Boolean);

  /**
   * 결재선이 비면 row 를 만들지 않는다.
   *
   * 예전에는 `String(input.approverLine[0]?.id || '')` 로 첫 결재자를 뽑아
   * current_approver_id 에 **빈 문자열** 을 넣고도 그대로 상신했다. 그렇게 만들어진
   * 문서는 결재자가 없어 승인·반려 어느 쪽도 진행할 수 없고, 서버 전이 검사에서
   * 'Current approver is missing.' 로만 떨어지는 처리 불가 문서로 남았다.
   * 상신 자체를 막는 편이 만들어 두고 못 고치는 것보다 낫다.
   */
  if (approverIds.length === 0) {
    throw new Error('결재선이 비어 있어 상신할 수 없습니다. 결재자를 한 명 이상 지정해 주세요.');
  }

  const firstApproverId = approverIds[0];
  const revision = input.revision ?? 1;

  const meta: Record<string, unknown> = {
    form_slug: input.formSlug,
    form_name: input.formDisplayName,
    cc_departments: input.ccDepartments ?? [],
    cc_users: input.ccUsers ?? [],
    approver_line: approverIds,
    approver_line_details: input.approverLine.map((a) => ({
      id: String(a.id || ''),
      name: a.name || '',
      position: a.position || null,
      department: a.department || null,
      company: a.company || null,
    })),
    approver_line_source: input.approverLineSource ?? 'auto',
    revision,
    source_approval_id: null,
    previous_doc_number: null,
    ...input.extraMeta,
  };

  if (input.attachments && input.attachments.length > 0) {
    meta.attachments = input.attachments.map((a) => ({
      name: a.name,
      url: a.url,
      mimeType: a.mimeType ?? null,
      size: a.size ?? null,
      uploadedAt: a.uploadedAt || new Date().toISOString(),
    }));
  }

  if (input.docNumber) {
    meta.doc_number = input.docNumber;
  }

  const row: Record<string, unknown> = {
    sender_id: staffId,
    sender_name: senderName,
    sender_company: senderCompany,
    sender_department: senderDepartment,
    current_approver_id: firstApproverId,
    approver_line: approverIds,
    type: input.typeName,
    title: input.title,
    content: input.content,
    meta_data: appendApprovalHistory(meta, {
      action: 'created',
      actor_id: input.actorId ?? staffId,
      actor_name: input.actorName ?? senderName,
      note: input.historyNote ?? '최초 상신',
      current_approver_id: firstApproverId,
      revision,
    }),
    status: '대기',
  };

  if (input.companyId != null && input.companyId !== '') {
    row.company_id = input.companyId;
  }
  if (input.docNumber) {
    row.doc_number = input.docNumber;
  }

  return { row, meta };
}
