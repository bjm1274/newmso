/**
 * 자동 결재선 후보 선택 SSOT.
 * PC(무제한) / 모바일(top 3 + SY) 은 옵션으로 분기한다.
 */

import {
  APPROVER_POSITIONS,
  getPositionOrder,
  isActiveStaff,
  isDepartmentHeadOrAbove,
  isJuniorStaffPosition,
} from '@/lib/active-staff';

export type ApproverCandidateInput = {
  id: string;
  name?: string | null;
  company?: string | null;
  department?: string | null;
  position?: string | null;
  role?: string | null;
  status?: string | null;
  [key: string]: unknown;
};

export type SelectDefaultApproverLineOptions = {
  selfId: string;
  /** 소속 회사 — includeSyInc 와 함께 필터 */
  company?: string | null;
  /** true: company 일치 또는 'SY INC.' 포함 (모바일) */
  includeSyInc?: boolean;
  /** 상한 — 미지정 시 무제한 (PC). 모바일은 3 */
  maxCount?: number;
  /**
   * head_or_above: isDepartmentHeadOrAbove (기본 시드)
   * approver_positions: APPROVER_POSITIONS 엄격 포함
   */
  mode?: 'head_or_above' | 'approver_positions';
  /** 과장급 이상 직책자 본인 결재선 포함 허용 */
  allowSelf?: boolean;
};

export { APPROVER_POSITIONS };

/**
 * 자동 결재선 기본값에서 빼는 사람.
 * 김이지는 SY INC. 경영지원 사원인데 role=admin 이라 예전에 병원 결재선 기본값에
 * 끼어 들었다. 수동 지정은 막지 않는다(피커 extra 필터는 호출측).
 */
export const DEFAULT_APPROVER_EXCLUDED_NAMES = new Set(['김이지']);
export const DEFAULT_APPROVER_EXCLUDED_IDS = new Set([
  '76ddb717-6f2f-46ee-aa76-1db2ae11f359',
]);

export function isExcludedFromDefaultLine(staff: ApproverCandidateInput): boolean {
  const id = String(staff.id ?? '').trim();
  if (id && DEFAULT_APPROVER_EXCLUDED_IDS.has(id)) return true;
  const name = String(staff.name ?? '').trim().normalize('NFC');
  if (name && DEFAULT_APPROVER_EXCLUDED_NAMES.has(name)) return true;
  if (isJuniorStaffPosition(String(staff.position ?? ''))) return true;
  return false;
}

export function sortApproverCandidates<T extends ApproverCandidateInput>(staffs: T[]): T[] {
  return [...staffs].sort((a, b) => {
    const orderA = getPositionOrder(String(a.position ?? ''), a.role as string | undefined);
    const orderB = getPositionOrder(String(b.position ?? ''), b.role as string | undefined);
    if (orderA !== orderB) return orderA - orderB;
    return String(a.name ?? '').localeCompare(String(b.name ?? ''), 'ko');
  });
}

function matchesCompanyFilter(
  staff: ApproverCandidateInput,
  company: string | null | undefined,
  includeSyInc: boolean,
): boolean {
  if (!includeSyInc) return true;
  const c = String(company ?? '').trim();
  if (!c) return true;
  const sc = String(staff.company ?? '').trim();
  return sc === c || sc === 'SY INC.';
}

function matchesMode(
  staff: ApproverCandidateInput,
  mode: 'head_or_above' | 'approver_positions',
): boolean {
  if (mode === 'approver_positions') {
    const pos = String(staff.position ?? '').trim();
    return APPROVER_POSITIONS.includes(pos);
  }
  return isDepartmentHeadOrAbove(staff as Parameters<typeof isDepartmentHeadOrAbove>[0]);
}

/**
 * 기본 결재선 후보 배열 (정렬·필터·상한 적용).
 */
export function selectDefaultApproverLine<T extends ApproverCandidateInput>(
  staffs: T[],
  options: SelectDefaultApproverLineOptions,
): T[] {
  const selfId = String(options.selfId ?? '').trim();
  const mode = options.mode ?? 'head_or_above';
  const includeSyInc = options.includeSyInc === true;
  const maxCount = options.maxCount;
  const selfStaff = selfId ? staffs.find((s) => String(s?.id) === selfId) : null;
  const selfIsApprover = Boolean(
    selfStaff && isDepartmentHeadOrAbove(selfStaff as Parameters<typeof isDepartmentHeadOrAbove>[0]),
  );
  const allowSelf = options.allowSelf === true;

  const filtered = staffs.filter((s) => {
    if (!s?.id) return false;
    const isSelf = String(s.id) === selfId;
    if (isSelf && !allowSelf) return false;
    if (isExcludedFromDefaultLine(s)) return false;
    if (!isActiveStaff(s as Parameters<typeof isActiveStaff>[0])) return false;
    if (!matchesMode(s, mode)) return false;
    if (!matchesCompanyFilter(s, options.company, includeSyInc)) return false;
    return true;
  });

  // 본인을 제외해 후보가 없으나 기안자가 과장급 이상 결재권자인 경우 본인을 결재선에 단독 포함 (자가 전결)
  if (filtered.length === 0 && selfStaff && selfIsApprover && !isExcludedFromDefaultLine(selfStaff)) {
    if (
      matchesCompanyFilter(selfStaff, options.company, includeSyInc) &&
      isActiveStaff(selfStaff as Parameters<typeof isActiveStaff>[0])
    ) {
      filtered.push(selfStaff);
    }
  }

  const sorted = sortApproverCandidates(filtered);
  if (typeof maxCount === 'number' && maxCount > 0) {
    return sorted.slice(0, maxCount);
  }
  return sorted;
}
