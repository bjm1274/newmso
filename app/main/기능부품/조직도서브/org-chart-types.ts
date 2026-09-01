import type { StaffMember } from '@/types';

// 조직도/직원 상세에서 공유하는 문자열 안전 변환·내선번호 유틸.
// (조직도 렌더링에 쓰이던 Org* 타입·DEPT_STYLES 등은 OrgChart.tsx 내부 구현으로
// 대체되어 미사용 — dead code 제거)
export function toSafeText(value: unknown, fallback = '') {
  if (typeof value === 'string') return value.trim() || fallback;
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value).trim() || fallback;
  }
  return fallback;
}

export function getStaffExtensionText(staff: StaffMember | null | undefined) {
  return (
    toSafeText(staff?.extension) ||
    toSafeText(staff?.permissions?.extension) ||
    ''
  );
}
