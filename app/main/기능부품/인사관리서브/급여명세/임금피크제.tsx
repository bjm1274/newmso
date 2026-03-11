'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

// 임금피크제: 일정 나이/근속 이후 급여를 단계적으로 감액
const DEFAULT_STEPS = [
  { ageFrom: 55, ageTo: 56, rate: 0.9 },
  { ageFrom: 56, ageTo: 57, rate: 0.8 },
  { ageFrom: 57, ageTo: 58, rate: 0.7 },
  { ageFrom: 58, ageTo: 60, rate: 0.6 },
];

function calcAge(birthDate: string): number {
  if (!birthDate) return 0;
  const birth = new Date(birthDate);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age--;
  return age;
}

export default function WagePeakCalculator({ staffs = [], selectedCo, user }: { staffs: any[]; selectedCo: string; user: any }) {
  const [peakAge, setPeakAge] = useState(55);
  const [steps, setSteps] = useState(DEFAULT_STEPS);
  const [showSettings, setShowSettings] = useState(false);

  const filteredStaffs = staffs.filter(s => selectedCo === '전체' || s.company === selectedCo);

  const getWageRate = (age: number) => {
    if (age < peakAge) return 1.0;
    const step = steps.find(s => age >= s.ageFrom && age < s.ageTo);
    return step ? step.rate : (age >= steps[steps.length - 1]?.ageTo ? steps[steps.length - 1].rate : 1.0);
  };

  const enriched = filteredStaffs.map(s => {
    const age = calcAge(s.birth_date || s.birthdate || '');
    const base = s.base_salary || s.base || 3000000;
    const rate = getWageRate(age);
    const adjustedSalary = Math.round(base * rate / 1000) * 1000;
    const reduction = base - adjustedSalary;
    const isPeakTarget = age >= peakAge;
    return { ...s, age, base, rate, adjustedSalary, reduction, isPeakTarget };
  });

  const peakTargets = enriched.filter(s => s.isPeakTarget);
  const totalReduction = peakTargets.reduce((sum, s) => sum + s.reduction, 0);
  const totalOriginal = peakTargets.reduce((sum, s) => sum + s.base, 0);

  return (
    <div className="p-4 md:p-8 space-y-5">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-[var(--foreground)]">임금피크제 자동 계산</h2>
        </div>
        <button onClick={() => setShowSettings(v => !v)} className="px-3 py-1.5 bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)] rounded-[10px] text-xs font-bold">
          {showSettings ? '설정 닫기' : '요율 설정'}
        </button>
      </div>

      {/* 설정 패널 */}
      {showSettings && (
        <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[16px] p-5 space-y-3">
          <div className="flex items-center gap-3">
            <label className="text-xs font-bold text-[var(--foreground)] whitespace-nowrap">피크 시작 나이</label>
            <input type="number" value={peakAge} min={50} max={65} onChange={e => setPeakAge(Number(e.target.value))}
              className="w-24 px-3 py-1.5 border border-[var(--toss-border)] rounded-[10px] text-sm bg-[var(--toss-card)] outline-none" />
            <span className="text-xs text-[var(--toss-gray-3)]">세 이후 임금피크 적용</span>
          </div>
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-[var(--toss-gray-3)]">단계별 감액 비율</p>
            {steps.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-[var(--toss-gray-3)] w-20">{s.ageFrom}~{s.ageTo}세</span>
                <input type="number" value={Math.round(s.rate * 100)} min={50} max={100}
                  onChange={e => setSteps(prev => prev.map((st, idx) => idx === i ? { ...st, rate: Number(e.target.value) / 100 } : st))}
                  className="w-20 px-2 py-1 border border-[var(--toss-border)] rounded-[8px] text-sm bg-[var(--toss-card)] outline-none" />
                <span className="text-xs text-[var(--toss-gray-3)]">%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 요약 */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: '임금피크 대상', value: peakTargets.length + '명', color: 'text-orange-600' },
          { label: '월 총 감액', value: totalReduction.toLocaleString() + '원', color: 'text-red-500' },
          { label: '감액 전 합계', value: totalOriginal.toLocaleString() + '원', color: 'text-[var(--toss-gray-3)]' },
        ].map(c => (
          <div key={c.label} className="p-3 bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[14px] text-center">
            <p className={`text-base font-bold ${c.color}`}>{c.value}</p>
            <p className="text-[9px] text-[var(--toss-gray-3)] mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      {/* 임금피크 대상자 */}
      {peakTargets.length > 0 && (
        <div>
          <p className="text-[11px] font-bold text-[var(--toss-gray-3)] mb-2">임금피크 적용 직원 ({peakAge}세 이상)</p>
          <div className="space-y-2">
            {peakTargets.map(s => (
              <div key={s.id} className="flex items-center justify-between p-4 bg-orange-50 border border-orange-200 rounded-[14px]">
                <div>
                  <p className="text-sm font-bold text-[var(--foreground)]">{s.name} <span className="text-xs text-orange-600">({s.age}세)</span></p>
                  <p className="text-[10px] text-[var(--toss-gray-3)]">{s.position} · {s.department}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-[var(--toss-gray-3)] line-through">{s.base.toLocaleString()}원</p>
                  <p className="text-sm font-bold text-orange-600">{s.adjustedSalary.toLocaleString()}원 <span className="text-[10px]">({Math.round(s.rate * 100)}%)</span></p>
                  <p className="text-[9px] text-red-500">감액: {s.reduction.toLocaleString()}원/월</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 전체 직원 테이블 */}
      <div>
        <p className="text-[11px] font-bold text-[var(--toss-gray-3)] mb-2">전체 직원 현황</p>
        <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[16px] overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left" style={{ minWidth: '600px' }}>
              <thead className="bg-[var(--toss-gray-1)]/60 border-b border-[var(--toss-border)]">
                <tr>
                  {['성명', '나이', '직위', '기본급', '적용 비율', '적용 후 급여', '월 감액'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-[10px] font-semibold text-[var(--toss-gray-3)]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--toss-border)]">
                {enriched.map(s => (
                  <tr key={s.id} className={`${s.isPeakTarget ? 'bg-orange-50/50' : 'hover:bg-[var(--toss-gray-1)]/30'}`}>
                    <td className="px-3 py-2 text-xs font-bold text-[var(--foreground)]">{s.name}</td>
                    <td className="px-3 py-2 text-xs">{s.age > 0 ? s.age + '세' : '-'}</td>
                    <td className="px-3 py-2 text-xs text-[var(--toss-gray-3)]">{s.position}</td>
                    <td className="px-3 py-2 text-xs text-right">{s.base.toLocaleString()}</td>
                    <td className="px-3 py-2 text-xs text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${s.isPeakTarget ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                        {Math.round(s.rate * 100)}%
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-right font-bold">{s.adjustedSalary.toLocaleString()}</td>
                    <td className="px-3 py-2 text-xs text-right text-red-500">{s.reduction > 0 ? '-' + s.reduction.toLocaleString() : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <p className="text-[10px] text-[var(--toss-gray-3)]">* 생년월일이 등록된 직원에게만 나이 계산이 적용됩니다.</p>
    </div>
  );
}
