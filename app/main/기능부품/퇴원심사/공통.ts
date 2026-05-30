/**
 * 퇴원심사 공통 코어 — 데스크톱(기능부품/퇴원심사.tsx)과 모바일(추가기능/퇴원심사*)이
 * 공유하는 순수 로직 모듈.
 *
 * 목적(절대 원칙): UI/컴포넌트는 병합하지 않는다. 양쪽 화면의 동작을 그대로 보존하되,
 * 중복되던 순수 함수·타입·상수만 이 모듈로 추출해 단일 출처(SSOT)로 만든다.
 *
 * 포함:
 *  - 재원일수 계산(stayDays) — 4곳 중복 제거
 *  - status 값 체계 통일(DISCHARGE_STATUS 상수 + 정규화 + 표시 메타)
 *  - 공통 데이터 shape(체크 항목 타입)
 *
 * status 통일 방식:
 *  - 데스크톱/데스크톱-모바일분기는 'pending'(생성)·'approved'(승인)만 쓰고
 *    표시는 "approved vs 그 외" 이진 분기였다.
 *  - 추가기능 모바일은 'approved'·'rejected'·'review_requested'(+레거시 별칭
 *    'request'·'2nd'·'in_progress')까지 쓴다.
 *  - 두 체계의 공통 분모는 'pending'·'approved'이며, DB(discharge_reviews.status)는
 *    free-text(default 'pending')라 모든 값과 호환된다.
 *  - 여기서는 canonical 상수와 normalize/표시 함수로 "동일 의미 해석"을 보장한다.
 *    실제 저장 값은 각 화면이 기존과 동일하게 기록하므로 회귀가 없다.
 *
 * JM: 단일 책임(순수 로직). JM4: any 금지, 판별 유니온 사용.
 */

// ─────────────────────────────────────────────────────────────
// 1. 공통 데이터 shape
// ─────────────────────────────────────────────────────────────

/** 차트 체크리스트 항목. 양쪽 화면이 동일 구조를 사용한다. */
export type DischargeCheckItem = {
  id: string;
  label: string;
  code: string;
  checked: boolean;
};

// ─────────────────────────────────────────────────────────────
// 2. 재원일수(입원 기간) 계산
// ─────────────────────────────────────────────────────────────

/**
 * 입원일~퇴원일 사이 일수.
 * - 날짜 문자열(YYYY-MM-DD) 기준 ceil, 음수/0 이하는 0.
 * - 데스크톱·데스크톱모바일분기 3곳에서 동일하게 쓰던 계산을 통합.
 * - 빈 값 방어(둘 중 하나라도 비면 0).
 */
export function stayDays(admission: string, discharge: string): number {
  if (!admission || !discharge) return 0;
  const a = new Date(admission).getTime();
  const d = new Date(discharge).getTime();
  if (Number.isNaN(a) || Number.isNaN(d)) return 0;
  const v = Math.ceil((d - a) / 86400000);
  return v > 0 ? v : 0;
}

// ─────────────────────────────────────────────────────────────
// 3. status 값 체계 통일
// ─────────────────────────────────────────────────────────────

/** 퇴원심사 상태 canonical 값(상위집합). */
export const DISCHARGE_STATUS = {
  pending: 'pending',
  inProgress: 'in_progress',
  reviewRequested: 'review_requested',
  rejected: 'rejected',
  approved: 'approved',
} as const;

export type DischargeStatus = (typeof DISCHARGE_STATUS)[keyof typeof DISCHARGE_STATUS];

/**
 * 임의 status 문자열을 canonical 값으로 정규화.
 * 레거시 별칭('request'→review_requested, '2nd'→in_progress)을 흡수한다.
 * 알 수 없는 값은 'pending'으로 본다(기존 모바일 목록의 기본 분류와 동일).
 */
export function normalizeDischargeStatus(raw: string | null | undefined): DischargeStatus {
  const s = String(raw ?? '').trim();
  switch (s) {
    case 'approved':
      return DISCHARGE_STATUS.approved;
    case 'rejected':
      return DISCHARGE_STATUS.rejected;
    case 'review_requested':
    case 'request':
      return DISCHARGE_STATUS.reviewRequested;
    case 'in_progress':
    case '2nd':
      return DISCHARGE_STATUS.inProgress;
    case 'pending':
    default:
      return DISCHARGE_STATUS.pending;
  }
}

/**
 * "승인됨" 이진 판별.
 * 데스크톱·데스크톱모바일분기가 `status === 'approved'`로 흩어져 쓰던 분기를 통합.
 * (정규화를 거쳐 alias도 안전 처리)
 */
export function isDischargeApproved(raw: string | null | undefined): boolean {
  return normalizeDischargeStatus(raw) === DISCHARGE_STATUS.approved;
}

/** 표시 메타의 톤(추가기능 모바일 MChip 토큰과 호환). */
export type DischargeStatusTone = '' | 'accent' | 'warning' | 'success' | 'danger';

export type DischargeStatusMeta = {
  status: DischargeStatus;
  label: string;
  tone: DischargeStatusTone;
};

/**
 * 추가기능 모바일 목록에서 쓰는 상태 라벨/톤.
 * 기존 statusMeta()와 동일한 라벨·톤을 canonical 기준으로 반환한다.
 */
export function dischargeStatusMeta(raw: string | null | undefined): DischargeStatusMeta {
  const status = normalizeDischargeStatus(raw);
  switch (status) {
    case DISCHARGE_STATUS.approved:
      return { status, label: '승인 완료', tone: 'success' };
    case DISCHARGE_STATUS.rejected:
      return { status, label: '반려', tone: 'danger' };
    case DISCHARGE_STATUS.reviewRequested:
      return { status, label: '보완요청', tone: 'warning' };
    case DISCHARGE_STATUS.inProgress:
      return { status, label: '심사중', tone: 'accent' };
    case DISCHARGE_STATUS.pending:
    default:
      return { status, label: '대기', tone: '' };
  }
}

/**
 * 데스크톱·데스크톱모바일분기의 이진 배지 라벨.
 * 기존: status==='approved' ? '✅ 승인'/'승인' : '⏳ 심사 중'/'심사 중'
 * emoji 유무는 화면별로 달라 호출부에서 prefix만 붙인다(여기선 순수 텍스트).
 */
export function dischargeBinaryLabel(raw: string | null | undefined): '승인' | '심사 중' {
  return isDischargeApproved(raw) ? '승인' : '심사 중';
}
