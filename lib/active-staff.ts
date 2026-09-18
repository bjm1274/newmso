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
  '팀장', '간호과장', '과장', '차장', '실장', '부장', '본부장', '총무부장', '진료부장', '간호부장',
  '센터장', '이사', '상무', '전무', '부원장', '부병원장', '병원장', '원장', '대표',
];

/** 전결·기본 결재선에서 빼는 실무 직책. role=admin 이어도 사원은 결재권자가 아니다. */
export const JUNIOR_STAFF_POSITIONS = new Set([
  '사원', '주임', '계장', '인턴', '수습', '수습사원', '계약직', '대리',
]);

export function isJuniorStaffPosition(position: string | null | undefined): boolean {
  const p = String(position || '').trim().normalize('NFC');
  return JUNIOR_STAFF_POSITIONS.has(p);
}

export function isDepartmentHeadOrAbove(staff: { position?: string | null; role?: string | null }): boolean {
  const position = String(staff.position || '').trim().normalize('NFC');
  // 사원·대리 등은 전결권자가 아니다. SY INC. 경영지원 사원처럼 role=admin 만으로
  // 병원 결재선에 끼어들면 안 된다.
  if (isJuniorStaffPosition(position)) return false;
  if (position === '부서장') return true;
  if (position && APPROVER_POSITIONS.includes(position)) return true;
  // 직책이 비어 있을 때만 role 로 보조 판정. 직책이 있는데 과장급이 아니면 승격하지 않는다.
  if (position) return false;
  const role = String(staff.role || '').trim();
  return role === 'manager' || role === 'admin';
}

export function getPositionOrder(position: string | null | undefined, role?: string | null): number {
  const p = String(position || '').trim().normalize('NFC');
  const idx = APPROVER_POSITIONS.indexOf(p);
  if (idx !== -1) return idx;
  if (p === '부서장') return APPROVER_POSITIONS.indexOf('부장');
  if (isJuniorStaffPosition(p)) return 900;
  if (role === 'admin') return APPROVER_POSITIONS.indexOf('대표');
  if (role === 'manager') return APPROVER_POSITIONS.indexOf('부장');
  return 999;
}

