'use client';
import { useState } from 'react';

export default function TurnoverDashboard({ staffs = [] }: any) {
  const total = staffs.length;
  const resigned = staffs.filter((s: any) => (s.status || '').toLowerCase() === '퇴사').length;
  const active = total - resigned;
  const turnover = total ? ((resigned / total) * 100).toFixed(1) : '0';

  const workDaysList = staffs
    .filter((s: any) => (s.status || '재직') !== '퇴사')
    .map((s: any) => {
      const j = s.joined_at || s.join_date;
      if (!j) return 0;
      return Math.floor((Date.now() - new Date(j).getTime()) / (1000 * 60 * 60 * 24));
    });
  const avgTenure = workDaysList.length ? Math.round(workDaysList.reduce((a: number, b: number) => a + b, 0) / workDaysList.length) : 0;
  const avgYears = (avgTenure / 365).toFixed(1);

  return (
    <div className="border border-gray-200 p-6 bg-white rounded-[1.75rem] shadow-sm">
      <h3 className="text-[11px] font-black text-slate-600 uppercase tracking-widest mb-4">이직률 · 근속률</h3>
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 bg-red-50 rounded-xl">
          <p className="text-[10px] font-bold text-red-600 uppercase">이직률</p>
          <p className="text-2xl font-black text-red-700">{turnover}%</p>
          <p className="text-[10px] text-red-500">퇴사 {resigned}명 / 전체 {total}명</p>
        </div>
        <div className="p-4 bg-blue-50 rounded-xl">
          <p className="text-[10px] font-bold text-blue-600 uppercase">평균 근속</p>
          <p className="text-2xl font-black text-blue-700">{avgYears}년</p>
          <p className="text-[10px] text-blue-500">재직 {active}명 기준</p>
        </div>
      </div>
    </div>
  );
}
