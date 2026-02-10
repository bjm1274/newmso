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
    <div className="bg-white p-8 border border-gray-100 rounded-2xl shadow-xl max-w-md">
      <h3 className="text-xl font-black text-gray-900 mb-2">퇴직금 계산기</h3>
      <p className="text-[10px] text-gray-500 font-bold mb-6">근로기준법 기준 · 1일평균임금 × 30 × (재직일/365) × 1/2</p>
      <div className="space-y-4">
        <div>
          <label className="text-[10px] font-black text-gray-400 uppercase">월 평균임금 (원)</label>
          <input type="number" value={avgWage} onChange={e => setAvgWage(parseInt(e.target.value, 10) || 0)} className="w-full p-4 mt-1 rounded-xl border border-gray-200 font-bold" />
        </div>
        <div>
          <label className="text-[10px] font-black text-gray-400 uppercase">입사일</label>
          <input type="date" value={joinDate} onChange={e => setJoinDate(e.target.value)} className="w-full p-4 mt-1 rounded-xl border border-gray-200 font-bold" />
        </div>
        <div>
          <label className="text-[10px] font-black text-gray-400 uppercase">퇴직예정일</label>
          <input type="date" value={retireDate} onChange={e => setRetireDate(e.target.value)} className="w-full p-4 mt-1 rounded-xl border border-gray-200 font-bold" />
        </div>
      </div>
      <div className="mt-6 p-6 bg-blue-50 rounded-2xl border border-blue-100">
        <p className="text-[10px] font-black text-blue-600 uppercase">재직기간</p>
        <p className="text-lg font-black text-gray-800">{formatWorkPeriod(workDays)}</p>
        <p className="text-[10px] font-black text-blue-600 uppercase mt-4">예상 퇴직금</p>
        <p className="text-2xl font-black text-blue-700">₩{amount.toLocaleString()}</p>
      </div>
    </div>
  );
}
