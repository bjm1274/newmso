'use client';
import { useState, useMemo } from 'react';

// 2026년 기준 법정 요율
const RATES = {
  nationalPension: 0.045,
  healthInsurance: 0.03545,
  longTermCare: 0.03545 * 0.1282,
  employmentInsurance: 0.008,
};

function calcIncomeTax(monthly: number): number {
  // 간이세액표 근사치 (비과세 공제 후)
  const annual = monthly * 12;
  if (annual <= 14000000) return Math.floor(annual * 0.06 / 12);
  if (annual <= 50000000) return Math.floor((840000 + (annual - 14000000) * 0.15) / 12);
  if (annual <= 88000000) return Math.floor((6240000 + (annual - 50000000) * 0.24) / 12);
  if (annual <= 150000000) return Math.floor((15360000 + (annual - 88000000) * 0.35) / 12);
  return Math.floor((37060000 + (annual - 150000000) * 0.38) / 12);
}

const ALLOWANCE_PRESETS = [
  { key: 'meal', label: '식대', defaultVal: 200000, note: '월 20만원 비과세' },
  { key: 'transport', label: '교통비', defaultVal: 200000, note: '월 20만원 비과세' },
  { key: 'position', label: '직급수당', defaultVal: 0 },
  { key: 'duty', label: '직책수당', defaultVal: 0 },
  { key: 'overtime', label: '연장수당', defaultVal: 0, note: '통상시급×1.5' },
  { key: 'night', label: '야간수당', defaultVal: 0, note: '통상시급×0.5' },
  { key: 'holiday', label: '휴일수당', defaultVal: 0 },
  { key: 'bonus', label: '성과급', defaultVal: 0, note: '분기/연간' },
  { key: 'license', label: '자격수당', defaultVal: 0 },
  { key: 'childcare', label: '보육수당', defaultVal: 100000, note: '월 10만원 비과세' },
];

const NON_TAXABLE_KEYS = new Set(['meal', 'transport', 'childcare']);

export default function SalarySimulator() {
  const [baseSalary, setBaseSalary] = useState(3000000);
  const [allowances, setAllowances] = useState<Record<string, number>>(
    Object.fromEntries(ALLOWANCE_PRESETS.map(a => [a.key, a.defaultVal]))
  );
  const [dependents, setDependents] = useState(0);
  const [compareMode, setCompareMode] = useState(false);
  const [compareBase, setCompareBase] = useState(3500000);

  const calc = useMemo(() => {
    const totalAllowance = Object.values(allowances).reduce((s, v) => s + v, 0);
    const nonTaxable = ALLOWANCE_PRESETS.filter(a => NON_TAXABLE_KEYS.has(a.key))
      .reduce((s, a) => s + Math.min(allowances[a.key] || 0, a.defaultVal), 0);
    const gross = baseSalary + totalAllowance;
    const taxableBase = baseSalary + totalAllowance - nonTaxable;

    const np = Math.floor(taxableBase * RATES.nationalPension);
    const hi = Math.floor(taxableBase * RATES.healthInsurance);
    const ltc = Math.floor(hi * RATES.longTermCare);
    const ei = Math.floor(taxableBase * RATES.employmentInsurance);
    const it = Math.max(0, calcIncomeTax(taxableBase) - dependents * 12500);
    const lit = Math.floor(it * 0.1);
    const totalDeduction = np + hi + ltc + ei + it + lit;
    const net = gross - totalDeduction;

    return { gross, taxableBase, np, hi, ltc, ei, it, lit, totalDeduction, net, nonTaxable };
  }, [baseSalary, allowances, dependents]);

  const calcCompare = useMemo(() => {
    if (!compareMode) return null;
    const totalAllowance = Object.values(allowances).reduce((s, v) => s + v, 0);
    const nonTaxable = ALLOWANCE_PRESETS.filter(a => NON_TAXABLE_KEYS.has(a.key))
      .reduce((s, a) => s + Math.min(allowances[a.key] || 0, a.defaultVal), 0);
    const gross = compareBase + totalAllowance;
    const taxableBase = compareBase + totalAllowance - nonTaxable;
    const np = Math.floor(taxableBase * RATES.nationalPension);
    const hi = Math.floor(taxableBase * RATES.healthInsurance);
    const ltc = Math.floor(hi * RATES.longTermCare);
    const ei = Math.floor(taxableBase * RATES.employmentInsurance);
    const it = Math.max(0, calcIncomeTax(taxableBase) - dependents * 12500);
    const lit = Math.floor(it * 0.1);
    const totalDeduction = np + hi + ltc + ei + it + lit;
    const net = gross - totalDeduction;
    return { gross, np, hi, ltc, ei, it, lit, totalDeduction, net };
  }, [compareMode, compareBase, allowances, dependents]);

  const fmt = (n: number) => n.toLocaleString('ko-KR');
  const pct = (n: number, total: number) => total > 0 ? ((n / total) * 100).toFixed(1) : '0.0';

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row gap-5">
        {/* 입력 패널 */}
        <div className="flex-1 space-y-4">
          <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[16px] p-5 shadow-sm">
            <h3 className="text-sm font-bold text-[var(--foreground)] mb-4 flex items-center gap-2">
              <span className="w-1 h-4 bg-[var(--toss-blue)] rounded" /> 기본급 설정
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-[var(--toss-gray-3)] block mb-1">기본급 (원/월)</label>
                <input
                  type="number"
                  step={10000}
                  value={baseSalary}
                  onChange={e => setBaseSalary(Number(e.target.value) || 0)}
                  className="w-full px-4 py-3 border border-[var(--toss-border)] rounded-[12px] text-sm font-bold bg-[var(--toss-card)] outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/20 focus:border-[var(--toss-blue)]"
                />
                <p className="text-[10px] text-[var(--toss-gray-3)] mt-1">연환산: {fmt(baseSalary * 12)}원</p>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[var(--toss-gray-3)] block mb-1">부양가족 수 (본인 제외)</label>
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={dependents}
                  onChange={e => setDependents(Number(e.target.value) || 0)}
                  className="w-full px-4 py-3 border border-[var(--toss-border)] rounded-[12px] text-sm font-bold bg-[var(--toss-card)] outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/20"
                />
                <p className="text-[10px] text-[var(--toss-gray-3)] mt-1">1인당 소득세 12,500원 추가 공제</p>
              </div>
            </div>
          </div>

          <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[16px] p-5 shadow-sm">
            <h3 className="text-sm font-bold text-[var(--foreground)] mb-4 flex items-center gap-2">
              <span className="w-1 h-4 bg-emerald-500 rounded" /> 수당 항목
            </h3>
            <div className="space-y-2">
              {ALLOWANCE_PRESETS.map(a => (
                <div key={a.key} className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-[var(--foreground)] w-24 shrink-0">
                    {a.label}
                    {a.note && <span className="text-[9px] text-[var(--toss-gray-3)] ml-1">({a.note})</span>}
                  </span>
                  <input
                    type="number"
                    step={10000}
                    min={0}
                    value={allowances[a.key]}
                    onChange={e => setAllowances(prev => ({ ...prev, [a.key]: Number(e.target.value) || 0 }))}
                    className="flex-1 px-3 py-2 border border-[var(--toss-border)] rounded-[10px] text-sm font-bold bg-[var(--toss-card)] outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/20 text-right"
                  />
                  <span className="text-[10px] text-[var(--toss-gray-3)] w-8">원</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 결과 패널 */}
        <div className="lg:w-80 space-y-4">
          <div className="bg-gradient-to-br from-[var(--toss-blue)] to-blue-600 rounded-[18px] p-6 text-white shadow-lg">
            <p className="text-xs font-semibold opacity-80 mb-1">실수령액</p>
            <p className="text-3xl font-bold mb-1">{fmt(calc.net)}원</p>
            <p className="text-xs opacity-70">총급여 {fmt(calc.gross)}원 · 공제 {fmt(calc.totalDeduction)}원</p>
            <div className="mt-4 pt-4 border-t border-white/20">
              <div className="flex justify-between text-xs">
                <span className="opacity-75">공제율</span>
                <span className="font-bold">{pct(calc.totalDeduction, calc.gross)}%</span>
              </div>
              <div className="flex justify-between text-xs mt-1">
                <span className="opacity-75">비과세</span>
                <span className="font-bold">{fmt(calc.nonTaxable)}원</span>
              </div>
            </div>
          </div>

          <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[16px] p-5 shadow-sm">
            <h4 className="text-xs font-bold text-[var(--toss-gray-3)] uppercase mb-3">공제 항목 상세</h4>
            <div className="space-y-1.5">
              {[
                { label: '국민연금 (4.5%)', val: calc.np },
                { label: '건강보험 (3.545%)', val: calc.hi },
                { label: '장기요양보험', val: calc.ltc },
                { label: '고용보험 (0.8%)', val: calc.ei },
                { label: '소득세 (간이)', val: calc.it },
                { label: '지방소득세 (10%)', val: calc.lit },
              ].map((d, i) => (
                <div key={i} className="flex justify-between items-center text-xs">
                  <span className="text-[var(--toss-gray-4)]">{d.label}</span>
                  <span className="font-semibold text-[var(--foreground)]">{fmt(d.val)}원</span>
                </div>
              ))}
              <div className="pt-2 border-t border-[var(--toss-border)] flex justify-between items-center">
                <span className="text-xs font-bold text-[var(--toss-gray-4)]">총 공제</span>
                <span className="text-sm font-bold text-red-500">{fmt(calc.totalDeduction)}원</span>
              </div>
            </div>
          </div>

          {/* 비교 모드 */}
          <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[16px] p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold text-[var(--toss-gray-3)] uppercase">연봉 비교</h4>
              <button
                onClick={() => setCompareMode(v => !v)}
                className={`text-[10px] px-3 py-1 rounded-full font-bold transition-colors ${compareMode ? 'bg-[var(--toss-blue)] text-white' : 'bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)]'}`}
              >
                {compareMode ? 'ON' : 'OFF'}
              </button>
            </div>
            {compareMode && (
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-semibold text-[var(--toss-gray-3)] block mb-1">비교 기본급</label>
                  <input
                    type="number"
                    step={10000}
                    value={compareBase}
                    onChange={e => setCompareBase(Number(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-[var(--toss-border)] rounded-[10px] text-sm font-bold bg-[var(--toss-card)] outline-none"
                  />
                </div>
                {calcCompare && (
                  <div className="space-y-1 pt-2 border-t border-[var(--toss-border)]">
                    <div className="flex justify-between text-xs">
                      <span className="text-[var(--toss-gray-3)]">비교 실수령</span>
                      <span className="font-bold text-emerald-600">{fmt(calcCompare.net)}원</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-[var(--toss-gray-3)]">차액</span>
                      <span className={`font-bold ${calcCompare.net > calc.net ? 'text-emerald-600' : 'text-red-500'}`}>
                        {calcCompare.net >= calc.net ? '+' : ''}{fmt(calcCompare.net - calc.net)}원
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-[var(--toss-gray-3)]">비교 총급여</span>
                      <span className="text-[var(--toss-gray-4)]">{fmt(calcCompare.gross)}원</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-[var(--toss-gray-3)]">비교 총공제</span>
                      <span className="text-red-400">{fmt(calcCompare.totalDeduction)}원</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <p className="text-[10px] text-[var(--toss-gray-3)] leading-relaxed">
        ※ 2026년 법정 요율 기준 근사값입니다. 실제 급여는 식대 20만원·교통비 20만원·보육수당 10만원 비과세 적용 후 산출되며, 연말정산 환급·추납이 발생할 수 있습니다.
      </p>
    </div>
  );
}
