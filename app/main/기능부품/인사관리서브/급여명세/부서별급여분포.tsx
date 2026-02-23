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
    <div className="border border-gray-200 p-4 bg-white rounded-lg shadow-sm">
      <div className="pb-2 border-b border-gray-100 mb-3">
        <h3 className="text-sm font-semibold text-gray-800">부서별 급여 분포</h3>
      </div>
      <div className="space-y-2">
        {list.map((x) => (
          <div key={x.dept} className="p-3 bg-[#f8fafc] rounded-lg border border-gray-200">
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm font-semibold text-gray-800">{x.dept}</span>
              <span className="text-[10px] text-gray-500">{x.count}명</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-600">총 인건비</span>
              <span className="font-semibold text-rose-600">{x.sum.toLocaleString()}원</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-600">평균 급여</span>
              <span className="font-medium text-gray-800">{x.avg.toLocaleString()}원</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
