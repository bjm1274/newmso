import type { StaffMember } from '@/types';

export type StaffFilterOptions = {
  query: string;
  selfId?: string | null;
  /** 이미 선택된 id 등 제외 */
  excludeIds?: Set<string>;
  /**
   * 사용자 본인 회사. **필터링에 쓰지 않는다** — 목록 정렬에서 본인 회사를 앞으로 올리는 용도.
   *
   * 예전에는 "해당 회사 또는 'SY INC.' 만 유지" 로 걸러서, MSO 구조인데도
   * 제3의 회사(예: 수연의원) 직원이 참조자 후보에서 통째로 사라졌다.
   * 모회사가 자회사 직원까지 관리하고 회사 간 정보교류·대체근무가 성립하는 제품이므로
   * 참조자는 전 회사에서 지정할 수 있어야 한다.
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
    if (opts.extra && !opts.extra(s)) return false;
    if (!q) return true;
    const hay = [s.name, s.department, s.position, s.company]
      .map((v) => String(v || '').toLowerCase())
      .join(' ');
    return hay.includes(q);
  });
}

/**
 * 부서별 그룹핑 (미지정 폴백, 한글 locale 정렬).
 *
 * 목록에 **여러 회사가 섞여 있으면** 그룹 라벨에 회사명을 앞에 붙인다.
 * 회사가 다르면 같은 부서명(예: '원무과')이 여러 곳에 존재하므로,
 * 부서명만으로 묶으면 서로 다른 회사 직원이 한 그룹에 섞여 구분이 안 된다.
 *
 * @param myCompany 본인 회사 — 지정 시 해당 회사 그룹을 맨 앞에 정렬한다.
 */
export function groupStaffByDepartment(
  list: StaffMember[],
  myCompany?: string | null
): [string, StaffMember[]][] {
  const companies = new Set(list.map((s) => String(s.company || '').trim()).filter(Boolean));
  const multiCompany = companies.size > 1;
  const mine = String(myCompany || '').trim();

  const map = new Map<string, StaffMember[]>();
  const companyOfGroup = new Map<string, string>();
  for (const s of list) {
    const dept = String(s.department || '미지정').trim() || '미지정';
    const co = String(s.company || '').trim();
    const key = multiCompany && co ? `${co} · ${dept}` : dept;
    const arr = map.get(key) ?? [];
    arr.push(s);
    map.set(key, arr);
    if (!companyOfGroup.has(key)) companyOfGroup.set(key, co);
  }

  return Array.from(map.entries()).sort((a, b) => {
    if (mine) {
      const aMine = companyOfGroup.get(a[0]) === mine ? 0 : 1;
      const bMine = companyOfGroup.get(b[0]) === mine ? 0 : 1;
      if (aMine !== bMine) return aMine - bMine;
    }
    return a[0].localeCompare(b[0], 'ko');
  });
}
