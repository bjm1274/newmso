'use client';

import { useState } from 'react';
import {
  getMinimumWageByYear,
  MINIMUM_WAGE_2025,
  MINIMUM_WAGE_2026,
  MONTHLY_STANDARD_HOURS,
} from '@/lib/tax-free-limits';

const MIN_WAGE_TABLE: Record<number, number> = {
  2024: 9860,
  2025: MINIMUM_WAGE_2025,
  2026: MINIMUM_WAGE_2026,
};

const MONTHLY_HOURS = MONTHLY_STANDARD_HOURS;

function getMinWage(year: number): number {
  return MIN_WAGE_TABLE[year] || getMinimumWageByYear(year);
}

function getMonthlyMinWage(year: number): number {
  return getMinWage(year) * MONTHLY_HOURS;
}

type StaffCheck = {
  id: string;
  name: string;
  position: string;
  department: string;
  comparablePay: number;
  minWage: number;
  diff: number;
  isViolation: boolean;
};

export default function MinWageChecker({
  staffs = [],
  selectedCo,
}: {
  staffs: any[];
  selectedCo: string;
  user: any;
}) {
  const today = new Date();
  const [checkYear, setCheckYear] = useState(today.getFullYear());
  const [showViolationOnly, setShowViolationOnly] = useState(false);

  const filteredStaffs = staffs.filter((staff) => selectedCo === '전체' || staff.company === selectedCo);
  const minWageHourly = getMinWage(checkYear);
  const minWageMonthly = getMonthlyMinWage(checkYear);

  const checks: StaffCheck[] = filteredStaffs.map((staff) => {
    const comparablePay =
      Number(staff.base_salary || staff.base || 0) + Number(staff.position_allowance || 0);
    const diff = comparablePay - minWageMonthly;

    return {
      id: String(staff.id || ''),
      name: String(staff.name || ''),
      position: String(staff.position || ''),
      department: String(staff.department || ''),
      comparablePay,
      minWage: minWageMonthly,
      diff,
      isViolation: diff < 0,
    };
  });

  const violations = checks.filter((check) => check.isViolation);
  const displayed = showViolationOnly ? violations : checks;
  const totalShortfall = violations.reduce((sum, check) => sum + Math.abs(check.diff), 0);

  return (
    <div className="space-y-5 p-4 md:p-4">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-base font-bold text-[var(--foreground)]">최저임금 미달 자동 경고</h2>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={checkYear}
            onChange={(event) => setCheckYear(Number(event.target.value))}
            className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-bold outline-none"
          >
            {Object.keys(MIN_WAGE_TABLE).map((year) => (
              <option key={year} value={year}>
                {year}년
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 rounded-[var(--radius-lg)] border border-blue-500/20 bg-blue-500/10 p-4">
        <div>
          <p className="text-[10px] font-semibold text-blue-600">{checkYear}년 최저임금 (시급)</p>
          <p className="text-xl font-bold text-blue-700">{minWageHourly.toLocaleString()}원</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold text-blue-600">월 환산 ({MONTHLY_HOURS}시간 기준)</p>
          <p className="text-xl font-bold text-blue-700">{minWageMonthly.toLocaleString()}원</p>
        </div>
        {violations.length > 0 ? (
          <div className="ml-auto">
            <p className="text-[10px] font-semibold text-red-500">미달 직원 총 부족액</p>
            <p className="text-xl font-bold text-red-600">{totalShortfall.toLocaleString()}원</p>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: '검토 인원', value: `${checks.length}명`, color: 'text-[var(--foreground)]' },
          {
            label: '미달 직원',
            value: `${violations.length}명`,
            color: violations.length > 0 ? 'text-red-600' : 'text-green-600',
          },
          {
            label: '준수율',
            value:
              checks.length > 0
                ? `${Math.round(((checks.length - violations.length) / checks.length) * 100)}%`
                : '100%',
            color: 'text-green-600',
          },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3 text-center"
          >
            <p className={`text-lg font-bold ${card.color}`}>{card.value}</p>
            <p className="mt-0.5 text-[9px] text-[var(--toss-gray-3)]">{card.label}</p>
          </div>
        ))}
      </div>

      {violations.length > 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-red-500/20 bg-red-500/10 p-4">
          <p className="mb-2 text-sm font-bold text-red-600">최저임금 미달 경고</p>
          <p className="text-xs text-red-500">
            {violations.map((check) => check.name).join(', ')} 등 {violations.length}명의 직원이 {checkYear}년
            최저임금({minWageMonthly.toLocaleString()}원)에 미달합니다. 즉시 급여 기준을 점검해 주세요.
          </p>
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowViolationOnly((value) => !value)}
          className={`rounded-full px-3 py-1.5 text-xs font-bold transition-all ${
            showViolationOnly ? 'bg-red-500 text-white' : 'bg-[var(--muted)] text-[var(--toss-gray-4)]'
          }`}
        >
          미달만 보기
        </button>
        <span className="text-xs text-[var(--toss-gray-3)]">{displayed.length}명</span>
      </div>

      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left" style={{ minWidth: '600px' }}>
            <thead className="border-b border-[var(--border)] bg-[var(--muted)]/60">
              <tr>
                {['성명', '직위', '부서', '비교 급여', '최저임금 기준', '차액', '상태'].map((header) => (
                  <th
                    key={header}
                    className="whitespace-nowrap px-3 py-2.5 text-[10px] font-semibold text-[var(--toss-gray-3)]"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {displayed.map((check) => (
                <tr
                  key={check.id}
                  className={check.isViolation ? 'bg-red-500/10' : 'hover:bg-[var(--muted)]/30'}
                >
                  <td className="px-3 py-2.5 text-xs font-bold text-[var(--foreground)]">{check.name}</td>
                  <td className="px-3 py-2.5 text-xs text-[var(--toss-gray-3)]">{check.position}</td>
                  <td className="px-3 py-2.5 text-xs text-[var(--toss-gray-3)]">{check.department}</td>
                  <td className="px-3 py-2.5 text-right text-xs font-bold">
                    {check.comparablePay > 0 ? check.comparablePay.toLocaleString() : '미등록'}
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs">{check.minWage.toLocaleString()}</td>
                  <td
                    className={`px-3 py-2.5 text-right text-xs font-bold ${
                      check.isViolation ? 'text-red-600' : 'text-green-600'
                    }`}
                  >
                    {check.comparablePay > 0 ? `${check.diff >= 0 ? '+' : ''}${check.diff.toLocaleString()}` : '-'}
                  </td>
                  <td className="px-3 py-2.5">
                    {check.comparablePay === 0 ? (
                      <span className="rounded-[var(--radius-md)] bg-[var(--tab-bg)] px-2 py-0.5 text-[9px] font-bold text-[var(--toss-gray-4)]">
                        미등록
                      </span>
                    ) : check.isViolation ? (
                      <span className="rounded-[var(--radius-md)] bg-red-500/20 px-2 py-0.5 text-[9px] font-bold text-red-600">
                        미달
                      </span>
                    ) : (
                      <span className="rounded-[var(--radius-md)] bg-green-500/20 px-2 py-0.5 text-[9px] font-bold text-green-700">
                        준수
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {displayed.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-5 text-center text-xs text-[var(--toss-gray-3)]">
                    {showViolationOnly ? '최저임금 미달 직원이 없습니다.' : '직원이 없습니다.'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[10px] text-[var(--toss-gray-3)]">
        * 기본급과 직책수당을 합산한 비교 급여 기준입니다. 월 환산시간은 {MONTHLY_HOURS}시간(주 40시간 기준)입니다.
      </p>
    </div>
  );
}
