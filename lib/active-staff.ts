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

/** 퇴사 처리되지 않은 재직 중인 스태프인지 확인 */
export function isActiveStaff(staff: StaffLike): boolean {
  const status = staff?.status ?? staff?.상태;
  return String(status ?? '').trim() !== '퇴사';
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
