'use client';
import { useState } from 'react';
import {
  calculateDcRetirementBenefitFromMonthlyWage,
  formatWorkPeriod,
} from '@/lib/severance-pay';
import SmartDatePicker from '../../공통/SmartDatePicker';

export default function SeveranceCalculator() {
  const [inputMode, setInputMode] = useState<'monthly' | 'annual'>('monthly');
  const [monthlyAvgWage, setMonthlyAvgWage] = useState(3000000);
  const [annualWage, setAnnualWage] = useState(36000000);
  const [joinDate, setJoinDate] = useState('');
  const [retireDate, setRetireDate] = useState(new Date().toISOString().slice(0, 10));

  const join = joinDate ? new Date(joinDate) : new Date();
  const retire = retireDate ? new Date(retireDate) : new Date();
  const workDays = Math.max(0, Math.floor((retire.getTime() - join.getTime()) / (24 * 60 * 60 * 1000)));

  const resolvedMonthlyAvg = inputMode === 'annual'
    ? Math.round(annualWage / 12)
    : monthlyAvgWage;

  const amount = calculateDcRetirementBenefitFromMonthlyWage(resolvedMonthlyAvg, workDays);
  const monthlyContribution = Math.round(resolvedMonthlyAvg / 12);

  return (
    <div className="bg-[var(--card)] p-4 border border-[var(--border)] rounded-[var(--radius-md)] shadow-sm max-w-md space-y-4">
      <div className="pb-3 border-b border-[var(--border)]">
        <h3 className="text-lg font-bold text-[var(--foreground)]">퇴직급여 계산기</h3>
        <p className="text-xs text-[var(--toss-gray-3)] mt-0.5">
          DC 기준으로 연간 임금총액의 1/12 부담금을 추정합니다. 1년 미만 근속 시 미발생합니다.
        </p>
      </div>

      {/* 입력 모드 선택 */}
      <div className="flex gap-2">
        {(['monthly', 'annual'] as const).map(mode => (
          <button
            key={mode}
            onClick={() => setInputMode(mode)}
            className={`flex-1 py-1.5 text-xs font-bold rounded-[var(--radius-md)] border transition-all ${
              inputMode === mode
                ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                : 'bg-[var(--card)] text-[var(--toss-gray-4)] border-[var(--border)]'
            }`}
          >
            {mode === 'monthly' ? '월 평균임금으로 추정' : '연간 임금총액 입력'}
          </button>
        ))}
      </div>

      {inputMode === 'monthly' ? (
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-[var(--toss-gray-4)]">
              월 평균임금 (원)
              <span className="ml-1 text-[10px] text-[var(--toss-gray-3)]">— 월 임금 기준 단순 추정</span>
            </label>
            <input
              type="number"
              value={monthlyAvgWage}
              onChange={e => setMonthlyAvgWage(parseInt(e.target.value, 10) || 0)}
              className="w-full h-10 px-3 rounded-md border border-[var(--border)] text-sm font-medium bg-[var(--card)]"
            />
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <label className="text-xs font-medium text-[var(--toss-gray-4)]">
            연간 임금총액 (원)
            <span className="ml-1 text-[10px] text-[var(--toss-gray-3)]">— DC 부담금 산정 기준</span>
          </label>
          <input
            type="number"
            value={annualWage}
            onChange={e => setAnnualWage(parseInt(e.target.value, 10) || 0)}
            className="w-full h-10 px-3 rounded-md border border-[var(--border)] text-sm font-medium bg-[var(--card)]"
          />
        </div>
      )}

      <p className="text-[11px] text-[var(--toss-gray-3)] bg-[var(--muted)] rounded-[var(--radius-md)] p-2">
        DC 월 부담금 추정: <strong>{monthlyContribution.toLocaleString()}원</strong>
        <span className="block mt-1">연간 부담금 추정: <strong>{resolvedMonthlyAvg.toLocaleString()}원</strong></span>
      </p>

      <div className="space-y-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-[var(--toss-gray-4)]">입사일</label>
          <SmartDatePicker value={joinDate} onChange={val => setJoinDate(val)} className="w-full h-10 px-3 rounded-md border border-[var(--border)] text-sm font-medium bg-[var(--card)]" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-[var(--toss-gray-4)]">퇴직일</label>
          <SmartDatePicker value={retireDate} onChange={val => setRetireDate(val)} className="w-full h-10 px-3 rounded-md border border-[var(--border)] text-sm font-medium bg-[var(--card)]" />
        </div>
      </div>

      <div className="p-4 bg-[var(--tab-bg)] rounded-[var(--radius-md)] border border-[var(--border)]">
        <p className="text-xs font-medium text-[var(--toss-gray-3)]">재직기간</p>
        <p className="text-base font-semibold text-[var(--foreground)]">{joinDate ? formatWorkPeriod(workDays) : '입사일을 입력하세요'}</p>
        <p className="text-xs font-medium text-[var(--toss-gray-3)] mt-3">예상 퇴직급여 (DC 기준)</p>
        {!joinDate ? (
          <p className="text-sm font-bold text-[var(--toss-gray-3)]">입사일을 입력하면 계산됩니다</p>
        ) : workDays < 365 ? (
          <p className="text-sm font-bold text-[var(--toss-gray-3)]">1년 미만 근속 — 퇴직급여 미발생</p>
        ) : (
          <p className="text-xl font-bold text-[var(--accent)]">₩{amount.toLocaleString()}</p>
        )}
      </div>
    </div>
  );
}
