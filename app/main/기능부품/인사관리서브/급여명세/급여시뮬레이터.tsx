'use client';

import { useMemo, useState } from 'react';
import {
  calculateEmployeeInsuranceDeductions,
  calculateIndustrialAccidentInsurance,
  EMPLOYEE_INSURANCE_RATES_2026,
} from '@/lib/payroll-insurance-rates';

type AllowancePreset = {
  key: string;
  label: string;
  defaultVal: number;
  note?: string;
};

const ALLOWANCE_PRESETS: AllowancePreset[] = [
  { key: 'meal', label: '식대', defaultVal: 200_000, note: '비과세 한도 20만원' },
  { key: 'transport', label: '교통비', defaultVal: 200_000, note: '비과세 한도 20만원' },
  { key: 'position', label: '직책수당', defaultVal: 0 },
  { key: 'duty', label: '직무수당', defaultVal: 0 },
  { key: 'overtime', label: '연장수당', defaultVal: 0 },
  { key: 'night', label: '야간수당', defaultVal: 0 },
  { key: 'holiday', label: '휴일수당', defaultVal: 0 },
  { key: 'bonus', label: '상여금', defaultVal: 0 },
  { key: 'license', label: '자격수당', defaultVal: 0 },
  { key: 'childcare', label: '보육수당', defaultVal: 200_000, note: '비과세 한도 20만원' },
];

const NON_TAXABLE_KEYS = new Set(['meal', 'transport', 'childcare']);

function calcIncomeTax(monthly: number): number {
  const annual = monthly * 12;
  let annualTax = 0;

  if (annual <= 14_000_000) annualTax = annual * 0.06;
  else if (annual <= 50_000_000) annualTax = 840_000 + (annual - 14_000_000) * 0.15;
  else if (annual <= 88_000_000) annualTax = 6_240_000 + (annual - 50_000_000) * 0.24;
  else if (annual <= 150_000_000) annualTax = 15_360_000 + (annual - 88_000_000) * 0.35;
  else if (annual <= 300_000_000) annualTax = 37_060_000 + (annual - 150_000_000) * 0.38;
  else if (annual <= 500_000_000) annualTax = 94_060_000 + (annual - 300_000_000) * 0.4;
  else if (annual <= 1_000_000_000) annualTax = 174_060_000 + (annual - 500_000_000) * 0.42;
  else annualTax = 384_060_000 + (annual - 1_000_000_000) * 0.45;

  return Math.floor(annualTax / 12);
}

export default function SalarySimulator() {
  const [baseSalary, setBaseSalary] = useState(3_000_000);
  const [dependents, setDependents] = useState(0);
  const [compareMode, setCompareMode] = useState(false);
  const [compareBase, setCompareBase] = useState(3_500_000);
  const [allowances, setAllowances] = useState<Record<string, number>>(
    Object.fromEntries(ALLOWANCE_PRESETS.map((item) => [item.key, item.defaultVal])),
  );

  const calculateSnapshot = (base: number) => {
    const totalAllowance = Object.values(allowances).reduce((sum, value) => sum + value, 0);
    const nonTaxable = ALLOWANCE_PRESETS.filter((item) => NON_TAXABLE_KEYS.has(item.key)).reduce(
      (sum, item) => sum + Math.min(allowances[item.key] || 0, item.defaultVal),
      0,
    );
    const gross = base + totalAllowance;
    const taxableBase = base + totalAllowance - nonTaxable;
    const insurance = calculateEmployeeInsuranceDeductions(taxableBase);
    const incomeTax = Math.max(0, calcIncomeTax(taxableBase) - dependents * 12_500);
    const localTax = Math.floor(incomeTax * 0.1);
    const totalDeduction = insurance.total + incomeTax + localTax;
    const industrialAccident = calculateIndustrialAccidentInsurance(taxableBase, 'SY INC.');

    return {
      gross,
      taxableBase,
      nonTaxable,
      np: insurance.nationalPension,
      hi: insurance.healthInsurance,
      ltc: insurance.longTermCare,
      ei: insurance.employmentInsurance,
      it: incomeTax,
      lit: localTax,
      totalDeduction,
      net: gross - totalDeduction,
      industrialAccident,
    };
  };

  const calc = useMemo(() => calculateSnapshot(baseSalary), [baseSalary, allowances, dependents]);
  const compare = useMemo(
    () => (compareMode ? calculateSnapshot(compareBase) : null),
    [compareMode, compareBase, allowances, dependents],
  );

  const fmt = (value: number) => value.toLocaleString('ko-KR');

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
            <h3 className="mb-4 text-sm font-bold text-[var(--foreground)]">기본 급여 설정</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1">
                <span className="block text-[11px] font-semibold text-[var(--toss-gray-3)]">기본급</span>
                <input
                  type="number"
                  step={10000}
                  value={baseSalary}
                  onChange={(event) => setBaseSalary(Number(event.target.value) || 0)}
                  className="w-full rounded-[var(--radius-md)] border border-[var(--border)] px-4 py-3 text-sm font-bold outline-none"
                />
              </label>
              <label className="space-y-1">
                <span className="block text-[11px] font-semibold text-[var(--toss-gray-3)]">부양가족 수</span>
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={dependents}
                  onChange={(event) => setDependents(Number(event.target.value) || 0)}
                  className="w-full rounded-[var(--radius-md)] border border-[var(--border)] px-4 py-3 text-sm font-bold outline-none"
                />
              </label>
            </div>
          </section>

          <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
            <h3 className="mb-4 text-sm font-bold text-[var(--foreground)]">수당 항목</h3>
            <div className="space-y-2">
              {ALLOWANCE_PRESETS.map((item) => (
                <div key={item.key} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 text-xs font-semibold text-[var(--foreground)]">
                    {item.label}
                  </span>
                  <input
                    type="number"
                    step={10000}
                    min={0}
                    value={allowances[item.key]}
                    onChange={(event) =>
                      setAllowances((prev) => ({ ...prev, [item.key]: Number(event.target.value) || 0 }))
                    }
                    className="flex-1 rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-right text-sm font-bold outline-none"
                  />
                  <span className="text-[10px] text-[var(--toss-gray-3)]">원</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-4">
          <section className="rounded-[var(--radius-xl)] bg-gradient-to-br from-[var(--accent)] to-blue-600 p-4 text-white shadow-sm">
            <p className="text-xs font-semibold opacity-80">예상 실수령액</p>
            <p className="mt-1 text-3xl font-black">{fmt(calc.net)}원</p>
            <p className="mt-1 text-xs opacity-80">
              총지급 {fmt(calc.gross)}원 · 총공제 {fmt(calc.totalDeduction)}원
            </p>
          </section>

          <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
            <h4 className="mb-3 text-xs font-bold text-[var(--toss-gray-3)]">공제 항목</h4>
            <div className="space-y-2 text-xs">
              {[
                { label: `국민연금 (${(EMPLOYEE_INSURANCE_RATES_2026.nationalPension * 100).toFixed(2)}%)`, value: calc.np },
                { label: `건강보험 (${(EMPLOYEE_INSURANCE_RATES_2026.healthInsurance * 100).toFixed(3)}%)`, value: calc.hi },
                { label: `장기요양보험 (${(EMPLOYEE_INSURANCE_RATES_2026.longTermCare * 100).toFixed(4)}%)`, value: calc.ltc },
                { label: `고용보험 (${(EMPLOYEE_INSURANCE_RATES_2026.employmentInsurance * 100).toFixed(1)}%)`, value: calc.ei },
                { label: '소득세(간이)', value: calc.it },
                { label: '지방소득세', value: calc.lit },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between">
                  <span className="text-[var(--toss-gray-4)]">{item.label}</span>
                  <span className="font-semibold text-[var(--foreground)]">{fmt(item.value)}원</span>
                </div>
              ))}
            </div>
            <div className="mt-3 border-t border-[var(--border)] pt-3 text-xs text-[var(--toss-gray-3)]">
              <p>산재보험은 근로자 공제가 아니라 회사 부담입니다.</p>
              <p className="mt-1 font-semibold text-rose-600">
                산재보험(회사부담): {fmt(calc.industrialAccident.employerAmount)}원 ({(calc.industrialAccident.employerRate * 100).toFixed(2)}%)
              </p>
            </div>
          </section>

          <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-xs font-bold text-[var(--toss-gray-3)]">기본급 비교</h4>
              <button
                onClick={() => setCompareMode((value) => !value)}
                className={`rounded-full px-3 py-1 text-[10px] font-bold ${compareMode ? 'bg-[var(--accent)] text-white' : 'bg-[var(--muted)] text-[var(--toss-gray-4)]'}`}
              >
                {compareMode ? 'ON' : 'OFF'}
              </button>
            </div>
            {compareMode ? (
              <div className="space-y-3">
                <input
                  type="number"
                  step={10000}
                  value={compareBase}
                  onChange={(event) => setCompareBase(Number(event.target.value) || 0)}
                  className="w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm font-bold outline-none"
                />
                {compare && (
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-[var(--toss-gray-3)]">비교 실수령액</span>
                      <span className="font-bold text-emerald-600">{fmt(compare.net)}원</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--toss-gray-3)]">차액</span>
                      <span className={`font-bold ${compare.net >= calc.net ? 'text-emerald-600' : 'text-red-500'}`}>
                        {compare.net >= calc.net ? '+' : ''}
                        {fmt(compare.net - calc.net)}원
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-[var(--toss-gray-3)]">비교 모드를 켜면 다른 기본급과 실수령액을 비교할 수 있습니다.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
