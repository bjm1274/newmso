'use client';

import { useMemo, useState } from 'react';
import {
  calculateEmployeeInsuranceDeductions,
  calculateIndustrialAccidentInsurance,
  EMPLOYEE_INSURANCE_RATES_2026,
} from '@/lib/payroll-insurance-rates';
import { MONTHLY_STANDARD_HOURS } from '@/lib/tax-free-limits';
import { LucideIcon } from '../../조직도서브/조직도측면창';

type StaffLike = {
  id?: string | number;
  name?: string | null;
  company?: string | null;
  department?: string | null;
  position?: string | null;
  base?: number;
  base_salary?: number;
  meal_allowance?: number;
  vehicle_allowance?: number;
  transport_allowance?: number;
  childcare_allowance?: number;
  position_allowance?: number;
  job_allowance?: number;
  duty_allowance?: number;
  family_allowance?: number;
  license_allowance?: number;
};

type AllowanceKey =
  | 'meal'
  | 'transport'
  | 'childcare'
  | 'position'
  | 'duty'
  | 'family'
  | 'license'
  | 'overtime'
  | 'night'
  | 'holiday'
  | 'bonus';

type CalculatorMode = 'netPay' | 'ordinaryWage' | 'dailyWorker';
type WageInputBasis = 'daily' | 'hourly';

type Props = {
  staffs?: StaffLike[];
  selectedCo?: string;
};

type AllowancePreset = {
  key: AllowanceKey;
  label: string;
  defaultValue: number;
  taxFreeLimit?: number;
};

const ALLOWANCE_PRESETS: AllowancePreset[] = [
  { key: 'meal', label: '식대', defaultValue: 200_000, taxFreeLimit: 200_000 },
  { key: 'transport', label: '교통비', defaultValue: 200_000, taxFreeLimit: 200_000 },
  { key: 'childcare', label: '보육수당', defaultValue: 0, taxFreeLimit: 200_000 },
  { key: 'position', label: '직책수당', defaultValue: 0 },
  { key: 'duty', label: '직무수당', defaultValue: 0 },
  { key: 'family', label: '가족수당', defaultValue: 0 },
  { key: 'license', label: '자격수당', defaultValue: 0 },
  { key: 'overtime', label: '연장수당', defaultValue: 0 },
  { key: 'night', label: '야간수당', defaultValue: 0 },
  { key: 'holiday', label: '휴일수당', defaultValue: 0 },
  { key: 'bonus', label: '상여금', defaultValue: 0 },
];

const INITIAL_ALLOWANCES = Object.fromEntries(
  ALLOWANCE_PRESETS.map((item) => [item.key, item.defaultValue]),
) as Record<AllowanceKey, number>;

const DAILY_WORKER_DEDUCTION_PER_DAY = 150_000;
const DAILY_WORKER_TAX_RATE = 0.06;
const DAILY_WORKER_TAX_CREDIT_RATE = 0.55;
const DAILY_WORKER_SMALL_TAX_THRESHOLD = 1_000;

const WAGE_INPUT_BASIS_OPTIONS: Array<{ id: WageInputBasis; label: string }> = [
  { id: 'daily', label: '일급 총액' },
  { id: 'hourly', label: '시급액' },
];

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

function money(value: number) {
  return `${Math.round(value || 0).toLocaleString('ko-KR')}원`;
}

function NumberField({
  label,
  value,
  onChange,
  min = 0,
  step = 10_000,
  testId,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  step?: number;
  testId?: string;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[11px] font-bold text-[var(--zinc-500)]">{label}</span>
      <input
        data-testid={testId}
        type="number"
        min={min}
        step={step}
        value={value || ''}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
        className="h-10 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-3 text-right text-sm font-bold text-[var(--foreground)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15"
        placeholder="0"
      />
    </label>
  );
}

function calculateDailyWorkerSnapshot({
  dailyGrossPay,
  dailyNonTaxablePay,
  workDays,
  otherDeductions,
  applySmallTaxExemption,
}: {
  dailyGrossPay: number;
  dailyNonTaxablePay: number;
  workDays: number;
  otherDeductions: number;
  applySmallTaxExemption: boolean;
}) {
  const days = Math.max(0, Math.floor(Number(workDays) || 0));
  const grossPerDay = Math.max(0, Math.round(Number(dailyGrossPay) || 0));
  const nonTaxablePerDay = Math.min(
    grossPerDay,
    Math.max(0, Math.round(Number(dailyNonTaxablePay) || 0)),
  );
  const taxablePayPerDay = Math.max(0, grossPerDay - nonTaxablePerDay);
  const taxBasePerDay = Math.max(0, taxablePayPerDay - DAILY_WORKER_DEDUCTION_PER_DAY);
  const calculatedTaxPerDay = Math.floor(taxBasePerDay * DAILY_WORKER_TAX_RATE);
  const taxCreditPerDay = Math.floor(calculatedTaxPerDay * DAILY_WORKER_TAX_CREDIT_RATE);
  const determinedIncomeTaxPerDay = Math.max(0, calculatedTaxPerDay - taxCreditPerDay);
  const rawIncomeTax = determinedIncomeTaxPerDay * days;
  const incomeTax =
    applySmallTaxExemption && rawIncomeTax < DAILY_WORKER_SMALL_TAX_THRESHOLD
      ? 0
      : rawIncomeTax;
  const localTax = Math.floor((incomeTax * 0.1) / 10) * 10;
  const grossPay = grossPerDay * days;
  const nonTaxablePay = nonTaxablePerDay * days;
  const totalTaxBase = taxBasePerDay * days;
  const totalCalculatedTax = calculatedTaxPerDay * days;
  const totalTaxCredit = taxCreditPerDay * days;
  const totalTax = incomeTax + localTax;
  const totalOtherDeductions = Math.max(0, Math.round(Number(otherDeductions) || 0));

  return {
    days,
    grossPerDay,
    nonTaxablePerDay,
    taxablePayPerDay,
    taxBasePerDay,
    calculatedTaxPerDay,
    taxCreditPerDay,
    determinedIncomeTaxPerDay,
    rawIncomeTax,
    grossPay,
    nonTaxablePay,
    taxablePay: taxablePayPerDay * days,
    totalTaxBase,
    totalCalculatedTax,
    totalTaxCredit,
    incomeTax,
    localTax,
    totalTax,
    otherDeductions: totalOtherDeductions,
    netPay: grossPay - totalTax - totalOtherDeductions,
  };
}

function StatCard({
  label,
  value,
  icon,
  tone = 'blue',
}: {
  label: string;
  value: string;
  icon: string;
  tone?: 'blue' | 'green' | 'amber' | 'rose';
}) {
  const toneClass = {
    blue: 'bg-[var(--accent-selected-subtle)] text-[var(--accent)]',
    green: 'bg-[var(--success-light)] text-[var(--success)]',
    amber: 'bg-[var(--warning-light)] text-[var(--warning)]',
    rose: 'bg-[var(--danger-light)] text-[var(--danger)]',
  }[tone];

  return (
    <div className="erp-stat-card flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11px] font-bold text-[var(--zinc-500)]">{label}</p>
        <p className="mt-1 truncate text-lg font-black text-[var(--foreground)]">{value}</p>
      </div>
      <span className={`erp-icon-box ${toneClass}`}>
        <LucideIcon name={icon} size={18} />
      </span>
    </div>
  );
}

export default function PayrollCalculator({ staffs = [], selectedCo = '전체' }: Props) {
  const [mode, setMode] = useState<CalculatorMode>('netPay');
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [baseSalary, setBaseSalary] = useState(3_000_000);
  const [dependents, setDependents] = useState(0);
  const [compareMode, setCompareMode] = useState(false);
  const [compareBase, setCompareBase] = useState(3_500_000);
  const [allowances, setAllowances] = useState<Record<AllowanceKey, number>>(INITIAL_ALLOWANCES);
  const [overtimeHours, setOvertimeHours] = useState(0);
  const [nightHours, setNightHours] = useState(0);
  const [holidayHours, setHolidayHours] = useState(0);
  const [unusedLeave, setUnusedLeave] = useState(0);
  const [dailyWageInputBasis, setDailyWageInputBasis] = useState<WageInputBasis>('daily');
  const [dailyGrossPay, setDailyGrossPay] = useState(0);
  const [dailyHourlyWage, setDailyHourlyWage] = useState(0);
  const [dailyWorkHoursPerDay, setDailyWorkHoursPerDay] = useState(8);
  const [dailyNonTaxablePay, setDailyNonTaxablePay] = useState(0);
  const [dailyWorkDays, setDailyWorkDays] = useState(5);
  const [dailyOtherDeductions, setDailyOtherDeductions] = useState(0);
  const [applyDailySmallTaxExemption, setApplyDailySmallTaxExemption] = useState(true);

  const filteredStaffs = useMemo(
    () => (selectedCo === '전체' ? staffs : staffs.filter((staff) => staff.company === selectedCo)),
    [selectedCo, staffs],
  );

  const selectedStaff = filteredStaffs.find((staff) => String(staff.id) === selectedStaffId);

  const updateAllowance = (key: AllowanceKey, value: number) => {
    setAllowances((prev) => ({ ...prev, [key]: value }));
  };

  const applyStaff = (staffId: string) => {
    setSelectedStaffId(staffId);
    const staff = filteredStaffs.find((item) => String(item.id) === staffId);
    if (!staff) return;

    setBaseSalary(Number(staff.base_salary ?? staff.base ?? 0));
    setAllowances((prev) => ({
      ...prev,
      meal: Number(staff.meal_allowance ?? prev.meal),
      transport: Number(staff.transport_allowance ?? staff.vehicle_allowance ?? prev.transport),
      childcare: Number(staff.childcare_allowance ?? prev.childcare),
      position: Number(staff.position_allowance ?? prev.position),
      duty: Number(staff.job_allowance ?? staff.duty_allowance ?? prev.duty),
      family: Number(staff.family_allowance ?? prev.family),
      license: Number(staff.license_allowance ?? prev.license),
    }));
  };

  const calculateSnapshot = (base: number) => {
    const totalAllowance = Object.values(allowances).reduce((sum, value) => sum + value, 0);
    const nonTaxable = ALLOWANCE_PRESETS.reduce(
      (sum, item) => sum + (item.taxFreeLimit ? Math.min(allowances[item.key] || 0, item.taxFreeLimit) : 0),
      0,
    );
    const gross = base + totalAllowance;
    const taxableBase = Math.max(0, gross - nonTaxable);
    const insurance = calculateEmployeeInsuranceDeductions(taxableBase);
    const incomeTax = Math.max(0, calcIncomeTax(taxableBase) - dependents * 12_500);
    const localTax = Math.floor(incomeTax * 0.1);
    const totalDeduction = insurance.total + incomeTax + localTax;
    const industrialAccident = calculateIndustrialAccidentInsurance(taxableBase, selectedCo);

    return {
      gross,
      nonTaxable,
      taxableBase,
      insurance,
      incomeTax,
      localTax,
      totalDeduction,
      industrialAccident,
      netPay: gross - totalDeduction,
    };
  };

  const netPaySnapshot = useMemo(
    () => calculateSnapshot(baseSalary),
    [allowances, baseSalary, dependents, selectedCo],
  );
  const compareSnapshot = useMemo(
    () => (compareMode ? calculateSnapshot(compareBase) : null),
    [allowances, compareBase, compareMode, dependents, selectedCo],
  );
  const dailyWorkerGrossPayPerDay = useMemo(
    () =>
      dailyWageInputBasis === 'hourly'
        ? Math.max(0, Number(dailyHourlyWage) || 0) * Math.max(0, Number(dailyWorkHoursPerDay) || 0)
        : dailyGrossPay,
    [dailyGrossPay, dailyHourlyWage, dailyWageInputBasis, dailyWorkHoursPerDay],
  );
  const dailyWorkerSnapshot = useMemo(
    () =>
      calculateDailyWorkerSnapshot({
        dailyGrossPay: dailyWorkerGrossPayPerDay,
        dailyNonTaxablePay,
        workDays: dailyWorkDays,
        otherDeductions: dailyOtherDeductions,
        applySmallTaxExemption: applyDailySmallTaxExemption,
      }),
    [applyDailySmallTaxExemption, dailyNonTaxablePay, dailyOtherDeductions, dailyWorkDays, dailyWorkerGrossPayPerDay],
  );

  const ordinaryMealTaxable = Math.max(0, allowances.meal - 200_000);
  const ordinaryTransportTaxable = Math.max(0, allowances.transport - 200_000);
  const ordinaryWage =
    baseSalary +
    allowances.position +
    allowances.duty +
    allowances.family +
    allowances.license +
    ordinaryMealTaxable +
    ordinaryTransportTaxable;
  const hourlyWage = ordinaryWage > 0 ? ordinaryWage / MONTHLY_STANDARD_HOURS : 0;
  const holidayBaseHours = Math.min(holidayHours, 8);
  const holidayExtraHours = Math.max(0, holidayHours - 8);
  const overtimePay = hourlyWage * 1.5 * overtimeHours;
  const nightPay = hourlyWage * 0.5 * nightHours;
  const holidayPay = hourlyWage * 1.5 * holidayBaseHours + hourlyWage * 2 * holidayExtraHours;
  const annualLeavePay = hourlyWage * 8 * unusedLeave;

  const downloadOrdinaryWageCsv = () => {
    const rows = [
      ['항목', '금액(원)'],
      ['기본급', baseSalary],
      ['직책수당', allowances.position],
      ['직무수당', allowances.duty],
      ['가족수당', allowances.family],
      ['자격수당', allowances.license],
      ['식대 과세분', ordinaryMealTaxable],
      ['교통비 과세분', ordinaryTransportTaxable],
      ['통상임금 합계', ordinaryWage],
      ['시간급 통상임금', Math.round(hourlyWage)],
      ['연장수당', Math.round(overtimePay)],
      ['야간수당', Math.round(nightPay)],
      ['휴일수당', Math.round(holidayPay)],
      ['연차수당', Math.round(annualLeavePay)],
    ];
    const csv = rows.map((row) => row.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `급여계산기_${selectedStaff?.name || '직원'}_${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const deductionRows = [
    {
      label: `국민연금 ${(EMPLOYEE_INSURANCE_RATES_2026.nationalPension * 100).toFixed(2)}%`,
      value: netPaySnapshot.insurance.nationalPension,
    },
    {
      label: `건강보험 ${(EMPLOYEE_INSURANCE_RATES_2026.healthInsurance * 100).toFixed(3)}%`,
      value: netPaySnapshot.insurance.healthInsurance,
    },
    {
      label: `장기요양 ${(EMPLOYEE_INSURANCE_RATES_2026.longTermCare * 100).toFixed(4)}%`,
      value: netPaySnapshot.insurance.longTermCare,
    },
    {
      label: `고용보험 ${(EMPLOYEE_INSURANCE_RATES_2026.employmentInsurance * 100).toFixed(1)}%`,
      value: netPaySnapshot.insurance.employmentInsurance,
    },
    { label: '소득세 간이계산', value: netPaySnapshot.incomeTax },
    { label: '지방소득세', value: netPaySnapshot.localTax },
  ];

  const summaryCards =
    mode === 'dailyWorker'
      ? [
          { label: '일용 실지급액', value: money(dailyWorkerSnapshot.netPay), icon: 'WalletCards', tone: 'blue' as const },
          { label: '총지급액', value: money(dailyWorkerSnapshot.grossPay), icon: 'Banknote', tone: 'green' as const },
          { label: '원천징수 합계', value: money(dailyWorkerSnapshot.totalTax), icon: 'ReceiptText', tone: 'rose' as const },
          { label: '비과세 합계', value: money(dailyWorkerSnapshot.nonTaxablePay), icon: 'ShieldCheck', tone: 'amber' as const },
        ]
      : [
          { label: '예상 실수령액', value: money(netPaySnapshot.netPay), icon: 'WalletCards', tone: 'blue' as const },
          { label: '통상시급', value: `${Math.round(hourlyWage).toLocaleString('ko-KR')}원`, icon: 'Clock3', tone: 'green' as const },
          { label: '총공제', value: money(netPaySnapshot.totalDeduction), icon: 'ReceiptText', tone: 'rose' as const },
          { label: '비과세', value: money(netPaySnapshot.nonTaxable), icon: 'ShieldCheck', tone: 'amber' as const },
        ];

  return (
    <div className="erp-page space-y-4 p-4 md:p-5" data-testid="payroll-calculator-view">
      <div className="erp-toolbar flex-wrap justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="erp-icon-box">
            <LucideIcon name="Calculator" size={18} />
          </span>
          <div className="min-w-0">
            <p className="mt-0.5 text-xs font-medium text-[var(--zinc-500)]">
              실수령액과 통상임금 기준 수당을 한 화면에서 계산합니다.
            </p>
          </div>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <select
            value={selectedStaffId}
            onChange={(event) => applyStaff(event.target.value)}
            className="h-10 min-w-[220px] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-3 text-sm font-bold text-[var(--foreground)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15"
          >
            <option value="">직원 선택</option>
            {filteredStaffs.map((staff) => (
              <option key={String(staff.id)} value={String(staff.id)}>
                {staff.name} {staff.company ? `(${staff.company})` : ''}
              </option>
            ))}
          </select>
          <div className="flex rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-muted)] p-1">
            {[
              { id: 'netPay' as const, label: '실수령' },
              { id: 'ordinaryWage' as const, label: '통상임금' },
              { id: 'dailyWorker' as const, label: '일용근로' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                data-testid={`payroll-calculator-mode-${item.id}`}
                onClick={() => setMode(item.id)}
                className={`h-8 rounded-[var(--radius-md)] px-3 text-xs font-bold transition ${
                  mode === item.id
                    ? 'bg-[var(--card)] text-[var(--accent)] shadow-sm'
                    : 'text-[var(--zinc-500)] hover:text-[var(--foreground)]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="erp-stat-grid">
        {summaryCards.map((card) => (
          <StatCard key={card.label} {...card} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.1fr)]">
        <section className="erp-panel min-w-0 overflow-hidden">
          <div className="erp-panel-header">
            <div>
              <h3 className="text-sm font-black text-[var(--foreground)]">계산 입력</h3>
              <p className="mt-0.5 text-xs font-medium text-[var(--zinc-500)]">
                {mode === 'dailyWorker' ? '일급 또는 시급 기준 원천징수액을 계산합니다.' : '직원 선택 시 등록된 급여 정보를 불러옵니다.'}
              </p>
            </div>
          </div>
          {mode === 'dailyWorker' ? (
            <div className="space-y-4 p-4">
              <div className="space-y-2">
                <span className="text-[11px] font-bold text-[var(--zinc-500)]">급여 입력 기준</span>
                <div className="flex rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-muted)] p-1">
                  {WAGE_INPUT_BASIS_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      data-testid={`daily-worker-wage-basis-${option.id}`}
                      onClick={() => setDailyWageInputBasis(option.id)}
                      className={`h-8 flex-1 rounded-[var(--radius-md)] px-3 text-xs font-bold transition ${
                        dailyWageInputBasis === option.id
                          ? 'bg-[var(--card)] text-[var(--accent)] shadow-sm'
                          : 'text-[var(--zinc-500)] hover:text-[var(--foreground)]'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {dailyWageInputBasis === 'daily' ? (
                  <NumberField
                    label="일급 총액"
                    value={dailyGrossPay}
                    onChange={setDailyGrossPay}
                    step={1}
                    testId="daily-worker-gross-pay"
                  />
                ) : (
                  <>
                    <NumberField
                      label="시급액"
                      value={dailyHourlyWage}
                      onChange={setDailyHourlyWage}
                      step={1}
                      testId="daily-worker-hourly-wage"
                    />
                    <NumberField
                      label="1일 근무시간"
                      value={dailyWorkHoursPerDay}
                      onChange={setDailyWorkHoursPerDay}
                      step={0.5}
                      testId="daily-worker-hours-per-day"
                    />
                  </>
                )}
                <NumberField
                  label="일 비과세"
                  value={dailyNonTaxablePay}
                  onChange={setDailyNonTaxablePay}
                  step={1}
                  testId="daily-worker-non-taxable-pay"
                />
                <NumberField
                  label="근무일수"
                  value={dailyWorkDays}
                  onChange={setDailyWorkDays}
                  min={0}
                  step={1}
                  testId="daily-worker-work-days"
                />
                <NumberField
                  label="기타공제"
                  value={dailyOtherDeductions}
                  onChange={setDailyOtherDeductions}
                  step={1}
                  testId="daily-worker-other-deductions"
                />
              </div>
              <label className="flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-2.5">
                <span className="text-xs font-bold text-[var(--foreground)]">소액부징수 적용</span>
                <input
                  data-testid="daily-worker-small-tax-exemption"
                  type="checkbox"
                  checked={applyDailySmallTaxExemption}
                  onChange={(event) => setApplyDailySmallTaxExemption(event.target.checked)}
                  className="h-4 w-4 rounded border-[var(--border)] text-[var(--accent)]"
                />
              </label>
            </div>
          ) : (
            <div className="space-y-4 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <NumberField label="기본급" value={baseSalary} onChange={setBaseSalary} />
                <NumberField label="부양가족 수" value={dependents} onChange={setDependents} min={0} step={1} />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {ALLOWANCE_PRESETS.map((item) => (
                  <div key={item.key} className="min-w-0">
                    <NumberField
                      label={item.taxFreeLimit ? `${item.label} (한도 ${money(item.taxFreeLimit)})` : item.label}
                      value={allowances[item.key]}
                      onChange={(value) => updateAllowance(item.key, value)}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="erp-panel min-w-0 overflow-hidden">
          <div className="erp-panel-header">
            <div>
              <h3 className="text-sm font-black text-[var(--foreground)]">
                {mode === 'netPay' ? '실수령액 결과' : mode === 'ordinaryWage' ? '통상임금 결과' : '일용근로 결과'}
              </h3>
              <p className="mt-0.5 text-xs font-medium text-[var(--zinc-500)]">
                {mode === 'dailyWorker' ? `${dailyWorkerSnapshot.days}일 지급 기준` : selectedStaff ? `${selectedStaff.name} 기준` : '입력값 기준'}
              </p>
            </div>
            {mode !== 'dailyWorker' && (
              <button
                type="button"
                onClick={downloadOrdinaryWageCsv}
                className="inline-flex h-9 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 text-xs font-bold text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                <LucideIcon name="Download" size={14} />
                CSV
              </button>
            )}
          </div>

          {mode === 'netPay' ? (
            <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)]">
                <table className="erp-table">
                  <tbody>
                    <tr>
                      <td className="font-bold text-[var(--zinc-500)]">총지급액</td>
                      <td className="text-right font-black">{money(netPaySnapshot.gross)}</td>
                    </tr>
                    <tr>
                      <td className="font-bold text-[var(--zinc-500)]">과세 기준액</td>
                      <td className="text-right font-black">{money(netPaySnapshot.taxableBase)}</td>
                    </tr>
                    {deductionRows.map((row) => (
                      <tr key={row.label}>
                        <td className="font-bold text-[var(--zinc-500)]">{row.label}</td>
                        <td className="text-right font-semibold text-[var(--foreground)]">{money(row.value)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td className="font-black text-[var(--danger)]">총공제</td>
                      <td className="text-right font-black text-[var(--danger)]">
                        {money(netPaySnapshot.totalDeduction)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="space-y-3">
                <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-subtle)] p-4">
                  <p className="text-xs font-bold text-[var(--zinc-500)]">산재보험 회사부담</p>
                  <p className="mt-1 text-lg font-black text-[var(--foreground)]">
                    {money(netPaySnapshot.industrialAccident.employerAmount)}
                  </p>
                  <p className="mt-1 text-[11px] font-medium text-[var(--zinc-500)]">
                    {(netPaySnapshot.industrialAccident.employerRate * 100).toFixed(2)}%
                  </p>
                </div>

                <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs font-black text-[var(--foreground)]">기본급 비교</p>
                    <button
                      type="button"
                      onClick={() => setCompareMode((value) => !value)}
                      className={`rounded-[var(--radius-sm)] px-2.5 py-1 text-[11px] font-black ${
                        compareMode
                          ? 'bg-[var(--accent)] text-white'
                          : 'bg-[var(--surface-muted)] text-[var(--zinc-500)]'
                      }`}
                    >
                      {compareMode ? 'ON' : 'OFF'}
                    </button>
                  </div>
                  {compareMode ? (
                    <div className="space-y-3">
                      <NumberField label="비교 기본급" value={compareBase} onChange={setCompareBase} />
                      {compareSnapshot && (
                        <div className="space-y-1.5 text-xs">
                          <div className="flex justify-between gap-3">
                            <span className="font-bold text-[var(--zinc-500)]">비교 실수령</span>
                            <span className="font-black text-[var(--foreground)]">{money(compareSnapshot.netPay)}</span>
                          </div>
                          <div className="flex justify-between gap-3">
                            <span className="font-bold text-[var(--zinc-500)]">차액</span>
                            <span
                              className={`font-black ${
                                compareSnapshot.netPay >= netPaySnapshot.netPay
                                  ? 'text-[var(--success)]'
                                  : 'text-[var(--danger)]'
                              }`}
                            >
                              {compareSnapshot.netPay >= netPaySnapshot.netPay ? '+' : ''}
                              {money(compareSnapshot.netPay - netPaySnapshot.netPay)}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs font-medium leading-relaxed text-[var(--zinc-500)]">
                      비교를 켜면 다른 기본급 적용 시 실수령액 차이를 볼 수 있습니다.
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : mode === 'ordinaryWage' ? (
            <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <NumberField label="연장근무 시간" value={overtimeHours} onChange={setOvertimeHours} step={1} />
                  <NumberField label="야간근무 시간" value={nightHours} onChange={setNightHours} step={1} />
                  <NumberField label="휴일근무 시간" value={holidayHours} onChange={setHolidayHours} step={1} />
                  <NumberField label="미사용 연차 일수" value={unusedLeave} onChange={setUnusedLeave} step={1} />
                </div>

                <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-subtle)] p-4">
                  <p className="text-xs font-bold text-[var(--zinc-500)]">월 통상임금</p>
                  <p className="mt-1 text-2xl font-black text-[var(--foreground)]">{money(ordinaryWage)}</p>
                  <p className="mt-1 text-xs font-medium text-[var(--zinc-500)]">
                    기준시간 {MONTHLY_STANDARD_HOURS}시간
                  </p>
                </div>
              </div>

              <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)]">
                <table className="erp-table">
                  <tbody>
                    {[
                      ['시간급 통상임금', `${Math.round(hourlyWage).toLocaleString('ko-KR')}원/시간`],
                      ['연장수당', money(overtimePay)],
                      ['야간수당', money(nightPay)],
                      ['휴일수당', money(holidayPay)],
                      ['연차수당', money(annualLeavePay)],
                      ['수당 합계', money(overtimePay + nightPay + holidayPay + annualLeavePay)],
                    ].map(([label, value], index) => (
                      <tr key={label}>
                        <td className={`font-bold ${index === 0 ? 'text-[var(--accent)]' : 'text-[var(--zinc-500)]'}`}>
                          {label}
                        </td>
                        <td
                          className={`text-right font-black ${
                            index === 0 || index === 5 ? 'text-[var(--accent)]' : 'text-[var(--foreground)]'
                          }`}
                        >
                          {value}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
              <div className="space-y-4">
                <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-subtle)] p-4">
                  <p className="text-xs font-bold text-[var(--zinc-500)]">예상 실지급액</p>
                  <p data-testid="daily-worker-net-pay" className="mt-1 text-2xl font-black text-[var(--foreground)]">
                    {money(dailyWorkerSnapshot.netPay)}
                  </p>
                  <p className="mt-1 text-xs font-medium text-[var(--zinc-500)]">
                    {dailyWageInputBasis === 'hourly'
                      ? `시급 ${money(dailyHourlyWage)} × ${Math.max(0, Number(dailyWorkHoursPerDay) || 0)}시간 × ${dailyWorkerSnapshot.days}일`
                      : `일급 ${money(dailyWorkerSnapshot.grossPerDay)} × ${dailyWorkerSnapshot.days}일`}
                  </p>
                  {dailyWorkerSnapshot.grossPerDay > 0 && dailyWorkerSnapshot.taxBasePerDay <= 0 && (
                    <p data-testid="daily-worker-tax-note" className="mt-1 text-xs font-semibold text-[var(--zinc-500)]">
                      일급 환산액이 150,000원 이하라 일용근로 원천세가 0원입니다.
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3">
                    <p className="text-[11px] font-bold text-[var(--zinc-500)]">일 과세대상</p>
                    <p data-testid="daily-worker-taxable-per-day" className="mt-1 text-sm font-black text-[var(--foreground)]">
                      {money(dailyWorkerSnapshot.taxablePayPerDay)}
                    </p>
                  </div>
                  <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3">
                    <p className="text-[11px] font-bold text-[var(--zinc-500)]">일 결정세액</p>
                    <p data-testid="daily-worker-income-tax-per-day" className="mt-1 text-sm font-black text-[var(--foreground)]">
                      {money(dailyWorkerSnapshot.determinedIncomeTaxPerDay)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)]">
                <table className="erp-table">
                  <tbody>
                    {[
                      ['총지급액', money(dailyWorkerSnapshot.grossPay), 'daily-worker-gross-total'],
                      ['비과세 합계', money(dailyWorkerSnapshot.nonTaxablePay), 'daily-worker-non-taxable-total'],
                      ['과세 지급액', money(dailyWorkerSnapshot.taxablePay), 'daily-worker-taxable-total'],
                      ['일급 환산액', money(dailyWorkerSnapshot.grossPerDay), 'daily-worker-gross-per-day'],
                      ['일 과세표준', money(dailyWorkerSnapshot.taxBasePerDay), 'daily-worker-tax-base-per-day'],
                      ['일 산출세액', money(dailyWorkerSnapshot.calculatedTaxPerDay), 'daily-worker-calculated-tax-per-day'],
                      ['일 세액공제', money(dailyWorkerSnapshot.taxCreditPerDay), 'daily-worker-tax-credit-per-day'],
                      ['일 결정세액', money(dailyWorkerSnapshot.determinedIncomeTaxPerDay), 'daily-worker-income-tax-per-day-detail'],
                      ['일 근로소득공제', money(DAILY_WORKER_DEDUCTION_PER_DAY), 'daily-worker-deduction-per-day'],
                      ['세액 계산 합계', money(dailyWorkerSnapshot.rawIncomeTax), 'daily-worker-raw-income-tax-total'],
                      ['소득세', money(dailyWorkerSnapshot.incomeTax), 'daily-worker-income-tax-total'],
                      ['지방소득세', money(dailyWorkerSnapshot.localTax), 'daily-worker-local-tax-total'],
                      ['기타공제', money(dailyWorkerSnapshot.otherDeductions), 'daily-worker-other-deduction-total'],
                      ['원천징수 합계', money(dailyWorkerSnapshot.totalTax), 'daily-worker-total-tax'],
                    ].map(([label, value, testId], index) => (
                      <tr key={label}>
                        <td className={`font-bold ${index >= 4 ? 'text-[var(--danger)]' : 'text-[var(--zinc-500)]'}`}>
                          {label}
                        </td>
                        <td
                          data-testid={testId}
                          className={`text-right font-black ${
                            index >= 4 ? 'text-[var(--danger)]' : 'text-[var(--foreground)]'
                          }`}
                        >
                          {value}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
