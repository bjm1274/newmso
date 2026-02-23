'use client';
import { useMemo } from 'react';

export default function LaborCostSimulation({ staffs, selectedCo }: any) {
  const filtered = selectedCo === '전체' ? staffs : staffs.filter((s: any) => s.company === selectedCo);

  const byDept = useMemo(() => {
    const map: Record<string, { count: number; total: number }> = {};
    filtered.forEach((s: any) => {
      const dept = s.department || '미지정';
      if (!map[dept]) map[dept] = { count: 0, total: 0 };
      map[dept].count++;
      map[dept].total += Number(s.base_salary) || 0;
    });
    return map;
  }, [filtered]);

  const byPosition = useMemo(() => {
    const map: Record<string, { count: number; total: number }> = {};
    filtered.forEach((s: any) => {
      const pos = s.position || '미지정';
      if (!map[pos]) map[pos] = { count: 0, total: 0 };
      map[pos].count++;
      map[pos].total += Number(s.base_salary) || 0;
    });
    return map;
  }, [filtered]);

  const grandTotal = filtered.reduce((s: number, st: any) => s + (Number(st.base_salary) || 0), 0);

  return (
    <div className="bg-white border border-[var(--toss-border)] rounded-[12px] p-6 shadow-sm">
      <h3 className="text-sm font-semibold text-[var(--foreground)] mb-4">💰 인건비 예측 (부서·직급별)</h3>
      <div className="space-y-4">
        <div>
          <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase mb-2">부서별</p>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {Object.entries(byDept).map(([dept, v]) => (
              <div key={dept} className="flex justify-between text-xs">
                <span className="font-bold text-[var(--toss-gray-4)]">{dept} ({v.count}명)</span>
                <span className="font-semibold">{v.total.toLocaleString()}원</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase mb-2">직급별</p>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {Object.entries(byPosition).map(([pos, v]) => (
              <div key={pos} className="flex justify-between text-xs">
                <span className="font-bold text-[var(--toss-gray-4)]">{pos} ({v.count}명)</span>
                <span className="font-semibold">{v.total.toLocaleString()}원</span>
              </div>
            ))}
          </div>
        </div>
        <div className="pt-3 border-t border-[var(--toss-border)] flex justify-between">
          <span className="text-xs font-semibold text-[var(--toss-gray-4)]">월 인건비 합계</span>
          <span className="text-sm font-semibold text-[var(--toss-blue)]">₩{grandTotal.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}
