'use client';
import { useState } from 'react';

// 연도별 최저임금 (시급, 원)
const MIN_WAGE_TABLE: Record<number, number> = {
  2024: 9860,
  2025: 10030,
  2026: 10320,
};

const MONTHLY_HOURS = 209; // 월 소정근로시간 (주 40시간 기준)

function getMinWage(year: number): number {
  return MIN_WAGE_TABLE[year] || MIN_WAGE_TABLE[2026];
}

function getMonthlyMinWage(year: number): number {
  return getMinWage(year) * MONTHLY_HOURS;
}

type StaffCheck = {
  id: string;
  name: string;
  position: string;
  department: string;
  base: number;
  minWage: number;
  diff: number;
  isViolation: boolean;
};

export default function MinWageChecker({ staffs = [], selectedCo, user }: { staffs: any[]; selectedCo: string; user: any }) {
  const today = new Date();
  const [checkYear, setCheckYear] = useState(today.getFullYear());
  const [showViolationOnly, setShowViolationOnly] = useState(false);

  const filteredStaffs = staffs.filter(s => selectedCo === '전체' || s.company === selectedCo);
  const minWageHourly = getMinWage(checkYear);
  const minWageMonthly = getMonthlyMinWage(checkYear);

  const checks: StaffCheck[] = filteredStaffs.map(s => {
    const base = s.base_salary || s.base || 0;
    const diff = base - minWageMonthly;
    return {
      id: s.id, name: s.name, position: s.position || '', department: s.department || '',
      base, minWage: minWageMonthly, diff, isViolation: diff < 0,
    };
  });

  const violations = checks.filter(c => c.isViolation);
  const displayed = showViolationOnly ? violations : checks;

  const totalShortfall = violations.reduce((sum, c) => sum + Math.abs(c.diff), 0);

  return (
    <div className="p-4 md:p-4 space-y-5">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-[var(--foreground)]">최저임금 미달 자동 경고</h2>
        </div>
        <div className="flex items-center gap-2">
          <select value={checkYear} onChange={e => setCheckYear(Number(e.target.value))} className="px-3 py-2 border border-[var(--border)] rounded-[var(--radius-md)] text-sm font-bold bg-[var(--card)] outline-none">
            {Object.keys(MIN_WAGE_TABLE).map(y => <option key={y} value={y}>{y}년</option>)}
          </select>
        </div>
      </div>

      {/* 기준 안내 */}
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-[var(--radius-lg)] p-4 flex flex-wrap gap-4">
        <div>
          <p className="text-[10px] font-semibold text-blue-600">{checkYear}년 최저임금 (시급)</p>
          <p className="text-xl font-bold text-blue-700">{minWageHourly.toLocaleString()}원</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold text-blue-600">월 환산 ({MONTHLY_HOURS}시간 기준)</p>
          <p className="text-xl font-bold text-blue-700">{minWageMonthly.toLocaleString()}원</p>
        </div>
        {violations.length > 0 && (
          <div className="ml-auto">
            <p className="text-[10px] font-semibold text-red-500">미달 직원 총 부족액/월</p>
            <p className="text-xl font-bold text-red-600">{totalShortfall.toLocaleString()}원</p>
          </div>
        )}
      </div>

      {/* 요약 */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: '검사 인원', value: checks.length + '명', color: 'text-[var(--foreground)]' },
          { label: '미달 직원', value: violations.length + '명', color: violations.length > 0 ? 'text-red-600' : 'text-green-600' },
          { label: '준수율', value: checks.length > 0 ? Math.round((checks.length - violations.length) / checks.length * 100) + '%' : '100%', color: 'text-green-600' },
        ].map(c => (
          <div key={c.label} className="p-3 bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] text-center">
            <p className={`text-lg font-bold ${c.color}`}>{c.value}</p>
            <p className="text-[9px] text-[var(--toss-gray-3)] mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      {violations.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-[var(--radius-lg)] p-4">
          <p className="text-sm font-bold text-red-600 mb-2">최저임금 미달 경고</p>
          <p className="text-xs text-red-500">
            {violations.map(v => v.name).join(', ')} 등 {violations.length}명의 직원이 {checkYear}년 최저임금({minWageMonthly.toLocaleString()}원)에 미달합니다.
            즉시 급여를 조정하거나 근로계약을 재검토하세요.
          </p>
        </div>
      )}

      {/* 필터 */}
      <div className="flex items-center gap-2">
        <button onClick={() => setShowViolationOnly(v => !v)}
          className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${showViolationOnly ? 'bg-red-500/100 text-white' : 'bg-[var(--muted)] text-[var(--toss-gray-4)]'}`}>
          미달만 보기
        </button>
        <span className="text-xs text-[var(--toss-gray-3)]">{displayed.length}명</span>
      </div>

      {/* 목록 */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left" style={{ minWidth: '600px' }}>
            <thead className="bg-[var(--muted)]/60 border-b border-[var(--border)]">
              <tr>
                {['성명', '직위', '부서', '현재 기본급', '최저임금 기준', '차액', '상태'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-[10px] font-semibold text-[var(--toss-gray-3)] whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {displayed.map(c => (
                <tr key={c.id} className={c.isViolation ? 'bg-red-500/10' : 'hover:bg-[var(--muted)]/30'}>
                  <td className="px-3 py-2.5 text-xs font-bold text-[var(--foreground)]">{c.name}</td>
                  <td className="px-3 py-2.5 text-xs text-[var(--toss-gray-3)]">{c.position}</td>
                  <td className="px-3 py-2.5 text-xs text-[var(--toss-gray-3)]">{c.department}</td>
                  <td className="px-3 py-2.5 text-xs text-right font-bold">{c.base > 0 ? c.base.toLocaleString() : '미등록'}</td>
                  <td className="px-3 py-2.5 text-xs text-right">{c.minWage.toLocaleString()}</td>
                  <td className={`px-3 py-2.5 text-xs text-right font-bold ${c.isViolation ? 'text-red-600' : 'text-green-600'}`}>
                    {c.base > 0 ? (c.diff >= 0 ? '+' : '') + c.diff.toLocaleString() : '-'}
                  </td>
                  <td className="px-3 py-2.5">
                    {c.base === 0 ? (
                      <span className="px-2 py-0.5 rounded-[var(--radius-md)] text-[9px] font-bold bg-[var(--tab-bg)] text-[var(--toss-gray-4)]">미등록</span>
                    ) : c.isViolation ? (
                      <span className="px-2 py-0.5 rounded-[var(--radius-md)] text-[9px] font-bold bg-red-500/20 text-red-600">미달</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-[var(--radius-md)] text-[9px] font-bold bg-green-500/20 text-green-700">준수</span>
                    )}
                  </td>
                </tr>
              ))}
              {displayed.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-5 text-center text-xs text-[var(--toss-gray-3)]">
                    {showViolationOnly ? '최저임금 미달 직원이 없습니다.' : '직원이 없습니다.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[10px] text-[var(--toss-gray-3)]">* 직원 정보에서 기본급(base_salary)이 등록된 경우에만 정확한 비교가 가능합니다. 월 환산시간: {MONTHLY_HOURS}시간 (주 40시간 기준).</p>
    </div>
  );
}
