/** 모든 메뉴에서 통일된 회사 표시 순서: 박철홍정형외과 → 수연의원 → SY INC */
export const COMPANY_ORDER = ['전체', '박철홍정형외과', '수연의원', 'SY INC.'] as const;

export function sortCompaniesByName<T extends { name: string }>(list: T[]): T[] {
  const order = ['박철홍정형외과', '수연의원', 'SY INC.'];
  return [...list].sort((a, b) => {
    const ia = order.indexOf(a.name);
    const ib = order.indexOf(b.name);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return (a.name || '').localeCompare(b.name || '');
  });
}
