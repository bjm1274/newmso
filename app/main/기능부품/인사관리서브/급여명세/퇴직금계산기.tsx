'use client';
import { useState } from 'react';
import { calculateSeverancePay, formatWorkPeriod } from '@/lib/severance-pay';

export default function SeveranceCalculator() {
  const [avgWage, setAvgWage] = useState(3000000);
  const [joinDate, setJoinDate] = useState('');
  const [retireDate, setRetireDate] = useState(new Date().toISOString().slice(0, 10));

  const join = joinDate ? new Date(joinDate) : new Date();
  const retire = retireDate ? new Date(retireDate) : new Date();
  const workDays = Math.max(0, Math.floor((retire.getTime() - join.getTime()) / (24 * 60 * 60 * 1000)));
  const amount = calculateSeverancePay(avgWage, workDays);

  return (
    <div className="bg-[var(--toss-card)] p-5 border border-[var(--toss-border)] rounded-[12px] shadow-sm max-w-md">
      <div className="pb-3 border-b border-[var(--toss-border)] mb-4">
        <h3 className="text-lg font-bold text-[var(--foreground)]">퇴직금 계산기</h3>
        <p className="text-xs text-[var(--toss-gray-3)] mt-0.5">근로기준법 · 1일평균임금 × 30 × (재직일/365) × 1/2</p>
      </div>
      <div className="space-y-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-[var(--toss-gray-4)]">월 평균임금 (원)</label>
          <input type="number" value={avgWage} onChange={e => setAvgWage(parseInt(e.target.value, 10) || 0)} className="w-full h-10 px-3 rounded-md border border-[var(--toss-border)] text-sm font-medium" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-[var(--toss-gray-4)]">입사일</label>
          <input type="date" value={joinDate} onChange={e => setJoinDate(e.target.value)} className="w-full h-10 px-3 rounded-md border border-[var(--toss-border)] text-sm font-medium" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-[var(--toss-gray-4)]">퇴직예정일</label>
          <input type="date" value={retireDate} onChange={e => setRetireDate(e.target.value)} className="w-full h-10 px-3 rounded-md border border-[var(--toss-border)] text-sm font-medium" />
        </div>
      </div>
      <div className="mt-5 p-4 bg-[var(--tab-bg)] rounded-[12px] border border-[var(--toss-border)]">
        <p className="text-xs font-medium text-[var(--toss-gray-3)]">재직기간</p>
        <p className="text-base font-semibold text-[var(--foreground)]">{formatWorkPeriod(workDays)}</p>
        <p className="text-xs font-medium text-[var(--toss-gray-3)] mt-3">예상 퇴직금</p>
        <p className="text-xl font-bold text-[var(--toss-blue)]">₩{amount.toLocaleString()}</p>
      </div>
    </div>
  );
}
