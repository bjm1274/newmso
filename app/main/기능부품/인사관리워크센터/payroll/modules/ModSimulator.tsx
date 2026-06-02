'use client';

import { useMemo, useState, useEffect } from 'react';
import { usePayrollData } from '../payroll-context';
import {
  calculateEmployeeInsuranceDeductions,
} from '@/lib/payroll-insurance-rates';
import { calculateAge } from '../payroll-policy';
import {
  calculateMonthlyIncomeTax,
  fetchTaxInsuranceRates,
  DEFAULT_TAX_INSURANCE_RATES,
  hasExactIncomeTaxBracket,
  type TaxInsuranceRates,
} from '@/lib/use-tax-insurance-rates';

/**
 * #3 급여 시뮬레이터 — 좌측 입력 / 우측 실시간 계산
 *
 * 계산:
 *   gross = base + overtime + night + holiday
 *   4대보험 = calculateEmployeeInsuranceDeductions(taxable, age)
 *   간이세액 = (taxable - 비과세) × 6% (단순 추정 — 실제는 간이세액표)
 *   지방세 = 소득세 × 10%
 *   net = gross - 4대보험 - 소득세 - 지방세
 *
 * JM6: 모든 input label 연결, 키보드 포커스, aria-live 결과 영역
 * JM5: 정수 계산만 (Math.floor)
 */

function parseNumber(v: string): number {
  const clean = v.replace(/,/g, '').trim();
  const n = Number(clean);
  return Number.isFinite(n) ? Math.floor(n) : 0;
}

function formatInt(n: number): string {
  return n.toLocaleString();
}

interface SimulatorInputs {
  staffId: string;
  base: number;
  overtimeHours: number;
  nightHours: number;
  holidayHours: number;
  taxableExtra: number;
  taxFreeExtra: number;
}

interface SimulatorResult {
  gross: number;
  overtimePay: number;
  nightPay: number;
  holidayPay: number;
  insurance: number;
  incomeTax: number;
  localTax: number;
  netPay: number;
  hourly: number;
}

function computeSimulation(
  input: SimulatorInputs,
  age: number,
  taxInsuranceRates: TaxInsuranceRates | null,
  dependentCount: number
): SimulatorResult {
  const hourly = Math.floor(input.base / 209);
  const overtimePay = Math.floor(hourly * input.overtimeHours * 1.5);
  const nightPay = Math.floor(hourly * input.nightHours * 1.5);
  const holidayPay = Math.floor(hourly * input.holidayHours * 1.5);
  const gross = input.base + overtimePay + nightPay + holidayPay + input.taxableExtra;

  const taxable = Math.max(0, gross - input.taxFreeExtra);
  const ins = calculateEmployeeInsuranceDeductions(taxable, age);
  
  const rates = taxInsuranceRates || DEFAULT_TAX_INSURANCE_RATES;
  const incomeTax = calculateMonthlyIncomeTax(
    taxable,
    rates,
    dependentCount,
    {
      withholdingRatePercent: 100,
      qualifyingChildCount: 0,
    }
  );
  const localTax = Math.floor((incomeTax * 0.1) / 10) * 10;

  const netPay = gross - ins.total - incomeTax - localTax;

  return {
    gross,
    overtimePay,
    nightPay,
    holidayPay,
    insurance: ins.total,
    incomeTax,
    localTax,
    netPay,
    hourly,
  };
}

export default function ModSimulator() {
  const data = usePayrollData();

  const [staffId, setStaffId] = useState<string>('');
  const [base, setBase] = useState<string>('3,800,000');
  const [overtimeHours, setOvertimeHours] = useState<string>('18');
  const [nightHours, setNightHours] = useState<string>('12');
  const [holidayHours, setHolidayHours] = useState<string>('4');
  const [taxableExtra, setTaxableExtra] = useState<string>('0');
  const [taxFreeExtra, setTaxFreeExtra] = useState<string>('200000');

  const [taxInsuranceRates, setTaxInsuranceRates] = useState<TaxInsuranceRates | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const year = new Date().getFullYear();
        const rates = await fetchTaxInsuranceRates(data.selectedCo || '전체', year);
        if (active) setTaxInsuranceRates(rates);
      } catch (err) {
        console.error('Failed to fetch tax rates in simulator:', err);
      }
    })();
    return () => {
      active = false;
    };
  }, [data.selectedCo]);

  // 직원 선택 시 그 직원의 salary로 base 자동 채우기
  const selectedStaff = useMemo(
    () => data.staffs.find((s) => String(s.id) === staffId),
    [data.staffs, staffId],
  );
  const age = useMemo(() => calculateAge(selectedStaff?.birth_date) ?? 30, [selectedStaff]);

  const dependentCount = useMemo(() => {
    if (!selectedStaff) return 1;
    return Number(
      selectedStaff.dependent_count ??
      (selectedStaff.permissions?.payroll as Record<string, unknown> | undefined)?.dependent_count ??
      (selectedStaff.permissions?.tax as Record<string, unknown> | undefined)?.dependent_count ??
      1
    ) || 1;
  }, [selectedStaff]);

  const inputs: SimulatorInputs = {
    staffId,
    base: parseNumber(base),
    overtimeHours: parseNumber(overtimeHours),
    nightHours: parseNumber(nightHours),
    holidayHours: parseNumber(holidayHours),
    taxableExtra: parseNumber(taxableExtra),
    taxFreeExtra: parseNumber(taxFreeExtra),
  };

  const result = useMemo(
    () => computeSimulation(inputs, age, taxInsuranceRates, dependentCount),
    [inputs, age, taxInsuranceRates, dependentCount],
  );

  const handlePickStaff = (id: string) => {
    setStaffId(id);
    const s = data.staffs.find((st) => String(st.id) === id);
    if (s?.salary) setBase(s.salary.toLocaleString());
  };

  const breakdown: { label: string; amount: number; type: 'add' | 'sub' | 'neutral' }[] = [
    { label: '기본급',     amount: inputs.base,        type: 'neutral' },
    { label: '초과수당',   amount: result.overtimePay, type: 'add' },
    { label: '야간수당',   amount: result.nightPay,    type: 'add' },
    { label: '휴일수당',   amount: result.holidayPay,  type: 'add' },
    { label: '과세 기타',  amount: inputs.taxableExtra, type: 'add' },
    { label: '비과세 차감(식대 등)', amount: inputs.taxFreeExtra, type: 'neutral' },
    { label: '4대보험',    amount: result.insurance,   type: 'sub' },
    { label: '소득세',     amount: result.incomeTax,   type: 'sub' },
    { label: '지방세',     amount: result.localTax,    type: 'sub' },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <form
        className="app-card p-4 flex flex-col gap-3"
        onSubmit={(e) => e.preventDefault()}
      >
        <h3 className="section-title">직원 선택 · 계산 조건</h3>

        <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--toss-gray-4)]">
          대상 직원
          <select
            value={staffId}
            onChange={(e) => handlePickStaff(e.target.value)}
            className="text-[13px] px-2 py-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] font-medium text-[var(--foreground)]"
          >
            <option value="">— 직접 입력 (미선택) —</option>
            {data.staffs.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.name} · {s.department ?? '-'} · {s.position ?? '-'}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--toss-gray-4)]">
            월 기본급 (원)
            <input
              type="text"
              inputMode="numeric"
              value={base}
              onChange={(e) => setBase(e.target.value)}
              className="text-[13px] px-2 py-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-right tabular-nums"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--toss-gray-4)]">
            시급 환산
            <output className="text-[13px] px-2 py-2 rounded-[var(--radius-md)] bg-[var(--muted)] text-right tabular-nums text-[var(--foreground)] font-bold">
              {formatInt(result.hourly)} 원
            </output>
          </label>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--toss-gray-4)]">
            초과 (h)
            <input
              type="number"
              min="0"
              value={overtimeHours}
              onChange={(e) => setOvertimeHours(e.target.value)}
              className="text-[13px] px-2 py-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-right tabular-nums"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--toss-gray-4)]">
            야간 (h)
            <input
              type="number"
              min="0"
              value={nightHours}
              onChange={(e) => setNightHours(e.target.value)}
              className="text-[13px] px-2 py-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-right tabular-nums"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--toss-gray-4)]">
            휴일 (h)
            <input
              type="number"
              min="0"
              value={holidayHours}
              onChange={(e) => setHolidayHours(e.target.value)}
              className="text-[13px] px-2 py-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-right tabular-nums"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--toss-gray-4)]">
            과세 기타 (원)
            <input
              type="text"
              inputMode="numeric"
              value={taxableExtra}
              onChange={(e) => setTaxableExtra(e.target.value)}
              className="text-[13px] px-2 py-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-right tabular-nums"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--toss-gray-4)]">
            비과세 (식대 등)
            <input
              type="text"
              inputMode="numeric"
              value={taxFreeExtra}
              onChange={(e) => setTaxFreeExtra(e.target.value)}
              className="text-[13px] px-2 py-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-right tabular-nums"
            />
          </label>
        </div>

        <p className="text-[10px] text-[var(--toss-gray-3)] mt-1">
          ※ 4대보험 요율은 2026 기준 / 소득세는 회사의 간이세액표 및 부양가족 수 기준으로 정확하게 자동 계산됩니다.
        </p>
      </form>

      <div className="app-card p-4" aria-live="polite">
        <h3 className="section-title">예상 지급액</h3>
        <div className="mt-3 p-4 rounded-[var(--radius-md)] bg-[var(--accent-light)]">
          <div className="text-[11px] text-[var(--toss-gray-4)]">실수령 예상</div>
          <div className="text-[28px] font-extrabold tabular-nums text-[var(--accent)]">
            {formatInt(result.netPay)}
            <span className="ml-1 text-[14px] font-bold">원</span>
          </div>
          <div className="text-[11px] text-[var(--toss-gray-4)]">
            세전 {formatInt(result.gross)} · 공제 {formatInt(result.insurance + result.incomeTax + result.localTax)}
          </div>
        </div>
        <ul className="mt-3 flex flex-col gap-1.5">
          {breakdown.map((row) => (
            <li
              key={row.label}
              className="flex items-center justify-between px-2 py-1.5 rounded-[var(--radius-sm)] hover:bg-[var(--muted)]"
            >
              <span className="text-[12px] text-[var(--toss-gray-4)]">{row.label}</span>
              <b
                className={`text-[12px] tabular-nums ${
                  row.type === 'add'
                    ? 'text-[var(--accent)]'
                    : row.type === 'sub'
                      ? 'text-[var(--danger)]'
                      : 'text-[var(--foreground)]'
                }`}
              >
                {row.type === 'add' && '+'}
                {row.type === 'sub' && '-'}
                {formatInt(row.amount)}
              </b>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
