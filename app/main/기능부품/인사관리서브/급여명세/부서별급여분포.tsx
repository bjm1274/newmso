'use client';
import { useState } from 'react';

export default function DeptSalaryDistribution({ staffs = [], selectedCo }: any) {
  const filtered = selectedCo === '전체' ? staffs : staffs.filter((s: any) => s.company === selectedCo);
  const map: Record<string, { sum: number; count: number }> = {};
  filtered.forEach((s: any) => {
    const dept = s.department || '미지정';
    const base = s.base_salary ?? s.base ?? 0;
    if (!map[dept]) map[dept] = { sum: 0, count: 0 };
    map[dept].sum += base;
    map[dept].count += 1;
  });
  const list = Object.entries(map).map(([dept, v]) => ({ dept, ...v, avg: v.count ? Math.round(v.sum / v.count) : 0 }));

  return (
    <div className="border border-gray-200 p-6 bg-white rounded-[1.75rem] shadow-sm">
      <h3 className="text-[11px] font-black text-rose-600 uppercase tracking-widest mb-4">부서별 급여 분포</h3>
      <div className="space-y-4">
        {list.map((x) => (
          <div key={x.dept} className="p-4 bg-gray-50 rounded-xl">
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm font-black text-gray-800">{x.dept}</span>
              <span className="text-[10px] text-gray-500">{x.count}명</span>
            </div>
            <div className="flex justify-between text-xs">
              <span>총 인건비</span>
              <span className="font-black text-rose-600">{x.sum.toLocaleString()}원</span>
            </div>
            <div className="flex justify-between text-xs">
              <span>평균 급여</span>
              <span className="font-bold">{x.avg.toLocaleString()}원</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
