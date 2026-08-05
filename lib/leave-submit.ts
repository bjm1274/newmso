import { leaveTypeLabel, LEAVE_TYPE } from '@/lib/leave-type';

/**
 * 연차 상신 파라미터 빌더 (SSOT).
 *
 * 8차 D12-005: 연차 신청 진입점이 3개(모바일 결재탭 / 모바일 인사탭 / PC 양식)인데
 * `leave_type` 만 normalizeLeaveType 으로 정렬됐고 나머지 규칙이 이미 갈라져 있었다.
 *
 * | 규칙            | 모바일 결재탭        | 모바일 인사탭          | PC 양식                       |
 * |-----------------|----------------------|------------------------|-------------------------------|
 * | 행정팀 자동 참조 | `['행정팀']`         | `[]` 하드코딩          | `requiredCc` 로 항상 합집합   |
 * | `meta.days`     | 기록                 | 없음                   | 없음                          |
 * | 기본 날짜       | KST(getKoreanTodayString) | 디바이스 TZ(toLocaleDateString) | —                     |
 *
 * 실제 피해: 인사탭으로 낸 연차는 `meta_data.cc_departments` 가 빈 배열로 저장돼
 * **행정팀 직원의 참조함에 영원히 뜨지 않았다**(`lib/approval-inbox.ts:166-172` 가
 * cc_departments 로 참조함을 판정하고, 서버에 일괄 보정 경로가 없다).
 * `meta.days` 는 `lib/leave-notice.ts:88` 이 실제로 읽는 값이라 경로마다 해석이 달랐다.
 *
 * 정본은 '행정팀 CC 를 항상 붙이고 meta.days 를 항상 기록하는' 쪽이다 —
 * PC 가 이미 그렇게 동작하므로 그쪽에 맞춰야 세 경로가 같아진다.
 */

/** 연차 상신 시 항상 참조로 붙는 부서. */
export const LEAVE_APPROVAL_CC_DEPARTMENTS = ['행정팀'] as const;

/**
 * 휴가 일수 — 반차 계열은 0.5, 그 외는 시작·종료일 포함 일수.
 * 두 모바일 폼에 글자 단위로 같은 사본이 있었다(연차신청폼 / 인사관리 연차신청).
 */
export function calcLeaveDays(start: string, end: string, kind: unknown): number {
  const canonical = String(kind ?? '');
  if (
    canonical === LEAVE_TYPE.HALF ||
    canonical === LEAVE_TYPE.HALF_AM ||
    canonical === LEAVE_TYPE.HALF_PM
  ) {
    return 0.5;
  }
  if (!start || !end) return 0;
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0;
  if (e < s) return 0;
  return Math.floor((e.getTime() - s.getTime()) / (24 * 3600 * 1000)) + 1;
}

/**
 * 결재 문서 제목.
 *
 * 결재탭 사본은 `kind === '반차' ? '반차' : '연차'` 로 병가·경조사를 전부 '연차' 라고 적었다.
 * 인사탭 사본은 `leaveTypeLabel()` 을 써서 실제 종류를 적었다 — 그쪽을 정본으로 삼는다.
 */
export function buildLeaveApprovalTitle(
  senderName: string,
  leaveTypeKey: unknown,
  start: string,
  end: string,
): string {
  const range = start === end ? start : `${start} ~ ${end}`;
  return `${senderName} ${leaveTypeLabel(leaveTypeKey)} 신청 (${range})`;
}

export type LeaveApprovalMetaInput = {
  leaveTypeKey: string;
  start: string;
  end: string;
  days: number;
  reason?: string | null;
  leaveRequestSynced?: boolean;
  delegate?: {
    id?: string | null;
    name?: string | null;
    department?: string | null;
    position?: string | null;
  } | null;
};

/** approvals.meta_data 에 실을 연차 전용 필드. `days` 는 어느 경로에서도 빠지면 안 된다. */
export function buildLeaveApprovalMeta(input: LeaveApprovalMetaInput): Record<string, unknown> {
  const meta: Record<string, unknown> = {
    vType: input.leaveTypeKey,
    leaveType: input.leaveTypeKey,
    startDate: input.start,
    endDate: input.end,
    // lib/leave-notice.ts:88 이 `metaData?.days` 를 읽는다. 인사탭 경로가 이 값을
    // 안 넣어서 같은 신청이 경로에 따라 일수 해석이 달라졌다.
    days: input.days,
    reason: input.reason || '',
    leave_request_synced: Boolean(input.leaveRequestSynced) };

  if (input.delegate) {
    meta.delegateId = input.delegate.id || null;
    meta.delegateName = input.delegate.name || '';
    meta.delegateDepartment = String(input.delegate.department || '').trim();
    meta.delegatePosition = String(input.delegate.position || '').trim();
  }

  return meta;
}
