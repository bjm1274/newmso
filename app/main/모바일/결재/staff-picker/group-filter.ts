import type { StaffMember } from '@/types';

export type StaffFilterOptions = {
  query: string;
  selfId?: string | null;
  /** 이미 선택된 id 등 제외 */
  excludeIds?: Set<string>;
  /**
   * 제공 시 해당 회사 또는 'SY INC.' 만 유지.
   * (참조 피커 전용 — 결재선 피커는 미사용)
   */
  company?: string | null;
  /** 추가 조건 (예: isDepartmentHeadOrAbove) */
  extra?: (s: StaffMember) => boolean;
};

/** 검색 + 본인/기선택/회사 필터 (피커별 extra 로 확장) */
export function filterStaffByQuery(
  list: StaffMember[],
  opts: StaffFilterOptions
): StaffMember[] {
  const q = opts.query.trim().toLowerCase();
  return list.filter((s) => {
    const id = String(s.id || '');
    if (opts.selfId && id === opts.selfId) return false;
    if (opts.excludeIds?.has(id)) return false;
    if (opts.company && s.company !== opts.company && s.company !== 'SY INC.') return false;
    if (opts.extra && !opts.extra(s)) return false;
    if (!q) return true;
    const hay = [s.name, s.department, s.position, s.company]
      .map((v) => String(v || '').toLowerCase())
      .join(' ');
    return hay.includes(q);
  });
}

/** 부서별 그룹핑 (미지정 폴백, 한글 locale 정렬) */
export function groupStaffByDepartment(
  list: StaffMember[]
): [string, StaffMember[]][] {
  const map = new Map<string, StaffMember[]>();
  for (const s of list) {
    const key = String(s.department || '미지정').trim() || '미지정';
    const arr = map.get(key) ?? [];
    arr.push(s);
    map.set(key, arr);
  }
  return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], 'ko'));
}
