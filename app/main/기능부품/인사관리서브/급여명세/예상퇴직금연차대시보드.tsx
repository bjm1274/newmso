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
    let leaveTotal = 0;
    if (years >= 1) {
      leaveTotal = 15;
      if (years >= 3) {
        leaveTotal = Math.min(25, 15 + Math.floor((years - 1) / 2));
      }
    } else {
      leaveTotal = Math.min(11, Math.floor(workDays / 30));
    }
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
    <div className="border border-[var(--toss-border)] p-4 bg-[var(--toss-card)] rounded-[12px] shadow-sm">
      <div className="pb-2 border-b border-[var(--toss-border)] mb-3">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">예상 퇴직금 · 연차</h3>
      </div>
      <div className="flex items-center gap-2 mb-3">
        <select value={filterCo} onChange={(e) => setFilterCo(e.target.value)} className="h-9 px-3 border border-[var(--toss-border)] rounded-md text-xs font-medium">
          <option value="전체">전체</option>
          {(Array.from(new Set(staffs.map((s: any) => s.company))).filter(Boolean) as string[]).map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className="max-h-[320px] overflow-y-auto space-y-2 custom-scrollbar">
        {items.map((x: any) => (
          <div key={x.id} className="p-3 bg-[var(--page-bg)] rounded-[12px] border border-[var(--toss-border)]">
            <div className="flex justify-between items-start mb-1.5">
              <span className="text-sm font-semibold text-[var(--foreground)]">{x.name}</span>
              <span className="text-[11px] text-[var(--toss-gray-3)]">{formatWorkPeriod(x.workDays)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="font-medium text-[var(--toss-gray-4)]">예상 퇴직금</span>
              <span className="font-semibold text-indigo-600">{x.severance.toLocaleString()}원</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="font-medium text-[var(--toss-gray-4)]">잔여 연차</span>
              <span className="font-semibold text-emerald-600">{x.leaveRemain}일</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
