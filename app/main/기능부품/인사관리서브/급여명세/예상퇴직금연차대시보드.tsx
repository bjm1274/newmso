'use client';
import { useState } from 'react';
import { calculateSeverancePay, formatWorkPeriod } from '@/lib/severance-pay';

export default function SeveranceLeaveDashboard({ staffs = [] }: any) {
  const [filterCo, setFilterCo] = useState('전체');
  const filtered = filterCo === '전체' ? staffs : staffs.filter((s: any) => s.company === filterCo);
  const active = filtered.filter((s: any) => (s.status || '재직') !== '퇴사');

  const items = active.map((s: any) => {
    const joined = s.joined_at || s.join_date;
    const now = new Date();
    const j = joined ? new Date(joined) : now;
    const workDays = Math.max(0, Math.floor((now.getTime() - j.getTime()) / (1000 * 60 * 60 * 24)));
    const avgWage = (s.base_salary || s.base || 0) + (s.meal_allowance || s.meal || 0);
    const severance = calculateSeverancePay(avgWage, workDays);
    const years = workDays / 365;
    const leaveTotal = years >= 1 ? 15 + Math.floor((years - 1) / 1) : 11;
    const leaveUsed = s.annual_leave_used || 0;
    const leaveRemain = Math.max(0, (s.annual_leave_total ?? leaveTotal) - leaveUsed);
    return {
      ...s,
      workDays,
      severance,
      leaveTotal: s.annual_leave_total ?? leaveTotal,
      leaveUsed,
      leaveRemain,
    };
  });

  return (
    <div className="border border-gray-200 p-6 bg-white rounded-[1.75rem] shadow-sm">
      <h3 className="text-[11px] font-black text-indigo-600 uppercase tracking-widest mb-4">예상 퇴직금 · 연차</h3>
      <div className="flex items-center gap-2 mb-4">
        <select value={filterCo} onChange={(e) => setFilterCo(e.target.value)} className="p-2 border rounded-lg text-xs font-bold">
          <option value="전체">전체</option>
          {(Array.from(new Set(staffs.map((s: any) => s.company))).filter(Boolean) as string[]).map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className="max-h-[320px] overflow-y-auto space-y-3 custom-scrollbar">
        {items.map((x: any) => (
          <div key={x.id} className="p-4 bg-gray-50 rounded-xl border border-gray-100">
            <div className="flex justify-between items-start mb-2">
              <span className="text-sm font-black text-gray-900">{x.name}</span>
              <span className="text-[10px] text-gray-500">{formatWorkPeriod(x.workDays)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="font-bold text-gray-600">예상 퇴직금</span>
              <span className="font-black text-indigo-600">{x.severance.toLocaleString()}원</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="font-bold text-gray-600">잔여 연차</span>
              <span className="font-black text-emerald-600">{x.leaveRemain}일</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
