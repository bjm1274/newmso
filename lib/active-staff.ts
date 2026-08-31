/**
 * 재직 중인 스태프 필터링/정렬 유틸
 * 기존에 전자결재서브/근태신청양식.tsx, 인사관리서브 여러 파일에 흩어진
 * "status !== '퇴사'" 인라인 패턴과 getScopedActiveStaffs를 통합
 */

type StaffLike = {
  status?: string | null;
  상태?: string | null;
  company?: string | null;
};

/**
 * 재직 중인 스태프인지 확인.
 * status '퇴사' 또는 '퇴직' 모두 비활성으로 판정한다.
 * (메신저유틸.ts의 RESIGNED_STATUSES 기준과 동일)
 */
export function isActiveStaff(staff: StaffLike): boolean {
  if (!staff) return false;
  const status = String(staff?.status ?? staff?.상태 ?? '').trim();
  if (status === '퇴사' || status === '퇴직' || status === 'resigned' || status === 'inactive') return false;

  const role = String((staff as any)?.role ?? '').trim();
  if (role === 'inactive' || role === 'resigned') return false;

  const isActiveFlag = (staff as any)?.is_active;
  if (isActiveFlag === 0 || isActiveFlag === false || isActiveFlag === '0') return false;

  const resignDate = (staff as any)?.resigned_at || (staff as any)?.resign_date;
  if (typeof resignDate === 'string' && resignDate.trim()) {
    const todayStr = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit' }).format(new Date()); // YYYY-MM-DD KST
    if (resignDate.trim().slice(0, 10) <= todayStr) {
      return false;
    }
  }
  return true;
}

/**
 * 회사 필터 + 재직 여부로 스태프 목록을 필터링.
 * selectedCo가 '전체'이면 회사 필터 없이 재직자만 반환.
 */
export function getScopedActiveStaffs<T extends StaffLike>(
  staffs: T[] = [],
  selectedCo = '전체',
): T[] {
  return staffs.filter((staff) => {
    const companyMatched = selectedCo === '전체' || staff?.company === selectedCo;
    return companyMatched && isActiveStaff(staff);
  });
}

export const APPROVER_POSITIONS = [
  '팀장', '간호과장', '실장', '부장', '본부장', '총무부장', '진료부장', '간호부장',
  '이사', '병원장', '원장', '대표',
];

export function isDepartmentHeadOrAbove(staff: { position?: string | null; role?: string | null }): boolean {
  const role = staff.role;
  if (role === 'manager' || role === 'admin') return true;
  const position = String(staff.position || '').trim();
  if (!position) return false;
  if (position === '부서장') return true;
  // 팀장·간호과장·과장 포함 — 자동 결재선 공백 방지 (APPROVER_POSITIONS 와 정합)
  return APPROVER_POSITIONS.includes(position) || position === '과장';
}

export function getPositionOrder(position: string | null | undefined, role?: string | null): number {
  const p = String(position || '').trim();
  const idx = APPROVER_POSITIONS.indexOf(p);
  if (idx !== -1) return idx;
  if (p === '부서장') return APPROVER_POSITIONS.indexOf('부장');
  if (role === 'admin') return APPROVER_POSITIONS.indexOf('대표');
  if (role === 'manager') return APPROVER_POSITIONS.indexOf('부장');
  return 999;
}

