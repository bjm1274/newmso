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
    <div className="bg-white p-5 border border-gray-200 rounded-lg shadow-sm max-w-md">
      <div className="pb-3 border-b border-gray-100 mb-4">
        <h3 className="text-lg font-bold text-gray-900">퇴직금 계산기</h3>
        <p className="text-xs text-gray-500 mt-0.5">근로기준법 · 1일평균임금 × 30 × (재직일/365) × 1/2</p>
      </div>
      <div className="space-y-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-600">월 평균임금 (원)</label>
          <input type="number" value={avgWage} onChange={e => setAvgWage(parseInt(e.target.value, 10) || 0)} className="w-full h-10 px-3 rounded-md border border-gray-300 text-sm font-medium" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-600">입사일</label>
          <input type="date" value={joinDate} onChange={e => setJoinDate(e.target.value)} className="w-full h-10 px-3 rounded-md border border-gray-300 text-sm font-medium" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-600">퇴직예정일</label>
          <input type="date" value={retireDate} onChange={e => setRetireDate(e.target.value)} className="w-full h-10 px-3 rounded-md border border-gray-300 text-sm font-medium" />
        </div>
      </div>
      <div className="mt-5 p-4 bg-[#eef2f7] rounded-lg border border-gray-200">
        <p className="text-xs font-medium text-gray-500">재직기간</p>
        <p className="text-base font-semibold text-gray-800">{formatWorkPeriod(workDays)}</p>
        <p className="text-xs font-medium text-gray-500 mt-3">예상 퇴직금</p>
        <p className="text-xl font-bold text-blue-600">₩{amount.toLocaleString()}</p>
      </div>
    </div>
  );
}
