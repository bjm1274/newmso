'use client';

import { useMemo, useState } from 'react';
import type { StaffMember } from '@/types';
import { toast } from '@/lib/toast';
import { formatPayrollMutationError } from '@/lib/payroll-records';
import {
  PAYROLL_RECORD_TYPE_CONFLICT_TARGET,
  upsertPayrollRecordWithFallback,
} from '@/lib/payroll-record-upsert';
import { STORAGE_KEYS } from '@/lib/storage-keys';
import { logAudit } from '@/lib/audit';
import {
  calculateEmployeeInsuranceDeductions,
  calculateIndustrialAccidentInsurance,
  EMPLOYEE_INSURANCE_RATES_2026,
} from '@/lib/payroll-insurance-rates';
import {
  applyDuruNuriEmployeeSupport,
  getPayrollInsuranceSettings,
  getPayrollStaffAge,
  isDuruNuriActiveForYearMonth,
  resolvePayrollAsOfDate,
} from '@/lib/payroll-insurance-settings';
import { LucideIcon } from '../../조직도서브/조직도측면창';

const DAILY_WORKER_DEDUCTION_PER_DAY = 150_000;
const DAILY_WORKER_TAX_RATE = 0.06;
const DAILY_WORKER_TAX_CREDIT_RATE = 0.55;
const DAILY_WORKER_SMALL_TAX_THRESHOLD = 1_000;
const DAILY_WORKER_SOCIAL_INSURANCE_INCOME_THRESHOLD = 2_200_000;

const DAILY_PAYROLL_RECORD_OPTIONAL_COLUMNS = [
  'gross_pay',
  'base_salary',
  'meal_allowance',
  'night_duty_allowance',
  'vehicle_allowance',
  'childcare_allowance',
  'research_allowance',
  'other_taxfree',
  'extra_allowance',
  'overtime_pay',
  'bonus',
  'total_taxable',
  'total_taxfree',
  'total_deduction',
  'deduction_detail',
  'national_pension',
  'health_insurance',
  'long_term_care',
  'employment_insurance',
  'net_pay',
  'attendance_deduction',
  'advance_pay',
  'record_type',
] as const;

type DailyWorkerSettlementProps = {
  staffs?: StaffMember[];
  selectedCo?: string;
  yearMonth: string;
  onRefresh?: () => void;
};

type WageInputBasis = 'daily' | 'hourly';

const WAGE_INPUT_BASIS_OPTIONS: Array<{ id: WageInputBasis; label: string }> = [
  { id: 'daily', label: '일급 총액' },
  { id: 'hourly', label: '시급액' },
];

function money(value: number) {
  return `${Math.round(Number(value) || 0).toLocaleString()}원`;
}

function numberFromInput(value: string) {
  return Math.max(0, Number(value.replace(/,/g, '')) || 0);
}

function calculateDailyWorkerPayroll({
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
  const smallTaxExemptionApplied =
    applySmallTaxExemption && rawIncomeTax > 0 && rawIncomeTax < DAILY_WORKER_SMALL_TAX_THRESHOLD;
  const incomeTax = smallTaxExemptionApplied ? 0 : rawIncomeTax;
  const localTax = Math.floor((incomeTax * 0.1) / 10) * 10;
  const grossPay = grossPerDay * days;
  const nonTaxablePay = nonTaxablePerDay * days;
  const taxablePay = taxablePayPerDay * days;
  const totalTaxBase = taxBasePerDay * days;
  const totalCalculatedTax = calculatedTaxPerDay * days;
  const totalTaxCredit = taxCreditPerDay * days;
  const totalTax = incomeTax + localTax;
  const normalizedOtherDeductions = Math.max(0, Math.round(Number(otherDeductions) || 0));
  const totalDeduction = totalTax + normalizedOtherDeductions;

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
    smallTaxExemptionApplied,
    grossPay,
    nonTaxablePay,
    taxablePay,
    totalTaxBase,
    totalCalculatedTax,
    totalTaxCredit,
    incomeTax,
    localTax,
    totalTax,
    otherDeductions: normalizedOtherDeductions,
    totalDeduction,
    netPay: grossPay - totalDeduction,
  };
}

function calculateDailyWorkerInsurance({
  taxablePay,
  grossPay,
  workDays,
  workHoursPerDay,
  companyName,
  staff,
  yearMonth,
}: {
  taxablePay: number;
  grossPay: number;
  workDays: number;
  workHoursPerDay: number;
  companyName?: string;
  staff?: StaffMember | null;
  yearMonth: string;
}) {
  const days = Math.max(0, Math.floor(Number(workDays) || 0));
  const monthlyWorkHours = Math.max(0, Number(workHoursPerDay) || 0) * days;
  const socialInsuranceEligible =
    days >= 8 ||
    monthlyWorkHours >= 60 ||
    Math.max(0, Math.round(Number(grossPay) || 0)) >= DAILY_WORKER_SOCIAL_INSURANCE_INCOME_THRESHOLD;
  const base = Math.max(0, Math.round(Number(taxablePay) || 0));
  const asOf = resolvePayrollAsOfDate(yearMonth);
  const fullEmployeeInsurance = calculateEmployeeInsuranceDeductions(
    base,
    getPayrollStaffAge(staff, asOf) ?? 30,
    yearMonth,
  );
  const insuranceSettings = getPayrollInsuranceSettings(staff, asOf);
  const duruNuriActive = isDuruNuriActiveForYearMonth(
    insuranceSettings,
    String(yearMonth || '').slice(0, 7),
    Math.max(0, Math.round(Number(grossPay) || 0)),
  );
  const industrialAccident = calculateIndustrialAccidentInsurance(base, staff?.company || companyName);

  const fullNationalPension =
    socialInsuranceEligible && insuranceSettings.national ? fullEmployeeInsurance.nationalPension : 0;
  const nationalPension = duruNuriActive
    ? applyDuruNuriEmployeeSupport(
        fullNationalPension,
        base,
        EMPLOYEE_INSURANCE_RATES_2026.nationalPension,
      )
    : fullNationalPension;
  const healthInsurance =
    socialInsuranceEligible && insuranceSettings.health && !insuranceSettings.medicalBenefit
      ? fullEmployeeInsurance.healthInsurance
      : 0;
  const longTermCare =
    socialInsuranceEligible && insuranceSettings.health && !insuranceSettings.medicalBenefit
      ? fullEmployeeInsurance.longTermCare
      : 0;
  const fullEmploymentInsurance =
    days > 0 && insuranceSettings.employment ? fullEmployeeInsurance.employmentInsurance : 0;
  const employmentInsurance = duruNuriActive
    ? applyDuruNuriEmployeeSupport(
        fullEmploymentInsurance,
        base,
        EMPLOYEE_INSURANCE_RATES_2026.employmentInsurance,
      )
    : fullEmploymentInsurance;
  const employeeTotal = nationalPension + healthInsurance + longTermCare + employmentInsurance;

  return {
    monthlyWorkHours,
    socialInsuranceEligible,
    nationalPension,
    healthInsurance,
    longTermCare,
    employmentInsurance,
    employeeInsuranceTotal: employeeTotal,
    industrialAccidentEmployerAmount: industrialAccident.employerAmount,
    industrialAccidentEmployerRate: industrialAccident.employerRate,
    industrialAccidentIndustryLabel: industrialAccident.industryLabel,
    isDuruNuriActive: duruNuriActive,
    isMedicalBenefit: insuranceSettings.medicalBenefit,
    insuranceSettings: {
      national: socialInsuranceEligible && insuranceSettings.national,
      health: socialInsuranceEligible && insuranceSettings.health && !insuranceSettings.medicalBenefit,
      employment: days > 0 && insuranceSettings.employment,
      injury: insuranceSettings.injury,
      duru_nuri: duruNuriActive,
      medical_benefit: insuranceSettings.medicalBenefit,
      national_pension_age_eligible: insuranceSettings.nationalPensionAgeEligible,
    },
  };
}

export default function DailyWorkerSettlement({
  staffs = [],
  selectedCo = '전체',
  yearMonth,
  onRefresh,
}: DailyWorkerSettlementProps) {
  const candidates = useMemo(
    () => staffs.filter((staff) => selectedCo === '전체' || staff.company === selectedCo),
    [staffs, selectedCo],
  );
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [wageInputBasis, setWageInputBasis] = useState<WageInputBasis>('daily');
  const [dailyGrossPay, setDailyGrossPay] = useState(0);
  const [hourlyWage, setHourlyWage] = useState(0);
  const [workHoursPerDay, setWorkHoursPerDay] = useState(8);
  const [dailyNonTaxablePay, setDailyNonTaxablePay] = useState(0);
  const [workDays, setWorkDays] = useState(1);
  const [otherDeductions, setOtherDeductions] = useState(0);
  const [applySmallTaxExemption, setApplySmallTaxExemption] = useState(true);
  const [loading, setLoading] = useState(false);

  const selectedStaff = candidates.find((staff) => String(staff.id) === selectedStaffId) || null;
  const calculatedDailyGrossPay = useMemo(
    () =>
      wageInputBasis === 'hourly'
        ? Math.max(0, Number(hourlyWage) || 0) * Math.max(0, Number(workHoursPerDay) || 0)
        : dailyGrossPay,
    [dailyGrossPay, hourlyWage, wageInputBasis, workHoursPerDay],
  );
  const snapshot = useMemo(() => {
    const taxSnapshot = calculateDailyWorkerPayroll({
        dailyGrossPay: calculatedDailyGrossPay,
        dailyNonTaxablePay,
        workDays,
        otherDeductions,
        applySmallTaxExemption,
      });
    const insuranceSnapshot = calculateDailyWorkerInsurance({
      taxablePay: taxSnapshot.taxablePay,
      grossPay: taxSnapshot.grossPay,
      workDays: taxSnapshot.days,
      workHoursPerDay,
      companyName: selectedStaff?.company || selectedCo,
      staff: selectedStaff,
      yearMonth,
    });
    const totalDeduction = taxSnapshot.totalDeduction + insuranceSnapshot.employeeInsuranceTotal;

    return {
      ...taxSnapshot,
      ...insuranceSnapshot,
      totalDeduction,
      netPay: taxSnapshot.grossPay - totalDeduction,
    };
  }, [
    calculatedDailyGrossPay,
    dailyNonTaxablePay,
    workDays,
    otherDeductions,
    applySmallTaxExemption,
    wageInputBasis,
    workHoursPerDay,
    selectedStaff,
    selectedCo,
    yearMonth,
  ]);

  const buildRecord = (status: '임시저장' | '확정') => ({
    staff_id: selectedStaff?.id,
    year_month: yearMonth,
    gross_pay: snapshot.grossPay,
    base_salary: snapshot.grossPay,
    meal_allowance: 0,
    night_duty_allowance: 0,
    vehicle_allowance: 0,
    childcare_allowance: 0,
    research_allowance: 0,
    other_taxfree: snapshot.nonTaxablePay,
    extra_allowance: 0,
    overtime_pay: 0,
    bonus: 0,
    total_taxable: snapshot.taxablePay,
    total_taxfree: snapshot.nonTaxablePay,
    total_deduction: snapshot.totalDeduction,
    national_pension: snapshot.nationalPension,
    health_insurance: snapshot.healthInsurance,
    long_term_care: snapshot.longTermCare,
    employment_insurance: snapshot.employmentInsurance,
    deduction_detail: {
      payroll_type: 'daily_worker',
      daily_worker: {
        wage_input_basis: wageInputBasis,
        hourly_wage: wageInputBasis === 'hourly' ? Math.max(0, Math.round(Number(hourlyWage) || 0)) : null,
        work_hours_per_day: Math.max(0, Number(workHoursPerDay) || 0),
        daily_gross_pay: snapshot.grossPerDay,
        daily_non_taxable_pay: snapshot.nonTaxablePerDay,
        work_days: snapshot.days,
        daily_taxable_pay: snapshot.taxablePayPerDay,
        daily_deduction: DAILY_WORKER_DEDUCTION_PER_DAY,
        tax_base_per_day: snapshot.taxBasePerDay,
        calculated_tax_per_day: snapshot.calculatedTaxPerDay,
        earned_income_tax_credit_per_day: snapshot.taxCreditPerDay,
        income_tax_per_day: snapshot.determinedIncomeTaxPerDay,
        raw_income_tax: snapshot.rawIncomeTax,
        small_tax_exemption_applied: snapshot.smallTaxExemptionApplied,
        monthly_work_hours: snapshot.monthlyWorkHours,
        social_insurance_eligible: snapshot.socialInsuranceEligible,
        social_insurance_income_threshold: DAILY_WORKER_SOCIAL_INSURANCE_INCOME_THRESHOLD,
      },
      national_pension: snapshot.nationalPension,
      health_insurance: snapshot.healthInsurance,
      long_term_care: snapshot.longTermCare,
      employment_insurance: snapshot.employmentInsurance,
      is_duru_nuri: snapshot.isDuruNuriActive,
      is_medical_benefit: snapshot.isMedicalBenefit,
      insurance_settings: snapshot.insuranceSettings,
      industrial_accident_employer_amount: snapshot.industrialAccidentEmployerAmount,
      industrial_accident_employer_rate: snapshot.industrialAccidentEmployerRate,
      industrial_accident_industry_label: snapshot.industrialAccidentIndustryLabel,
      income_tax: snapshot.incomeTax,
      local_tax: snapshot.localTax,
      custom_deduction: snapshot.otherDeductions,
      apply_tax: true,
      apply_insurance: snapshot.employeeInsuranceTotal > 0,
    },
    net_pay: snapshot.netPay,
    attendance_deduction: 0,
    advance_pay: 0,
    record_type: 'daily',
    status,
  });

  const handleSave = async (status: '임시저장' | '확정') => {
    if (!selectedStaff) {
      toast('일용근로 정산 대상을 선택해 주세요.', 'warning');
      return;
    }
    if (snapshot.grossPerDay <= 0 || snapshot.days <= 0) {
      toast(
        wageInputBasis === 'hourly'
          ? '시급액, 1일 근무시간, 근무일수를 입력해 주세요.'
          : '일급 총액과 근무일수를 입력해 주세요.',
        'warning',
      );
      return;
    }
    if (status === '확정' && !confirm(`${selectedStaff.name}님의 일용근로 정산을 확정하시겠습니까?`)) return;

    setLoading(true);
    try {
      const record = buildRecord(status);
      const { error } = await upsertPayrollRecordWithFallback({
        record,
        optionalColumns: DAILY_PAYROLL_RECORD_OPTIONAL_COLUMNS,
        conflictTarget: PAYROLL_RECORD_TYPE_CONFLICT_TARGET,
        cacheKey: 'payroll_records:daily_worker_save',
      });
      if (error) throw error;

      const user =
        typeof window !== 'undefined'
          ? (() => {
              try {
                return JSON.parse(localStorage.getItem(STORAGE_KEYS.USER) || '{}');
              } catch {
                return {};
              }
            })()
          : {};

      try {
        await logAudit(
          status === '확정' ? '일용근로정산확정' : '일용근로정산임시저장',
          'payroll',
          yearMonth,
          {
            staff_id: selectedStaff.id,
            staff_name: selectedStaff.name,
            total: snapshot.grossPay,
            net_pay: snapshot.netPay,
            income_tax: snapshot.incomeTax,
            local_tax: snapshot.localTax,
          },
          user.id,
          user.name,
        );
      } catch (auditError) {
        console.error('daily worker payroll audit log failed:', auditError);
      }

      toast(
        status === '확정'
          ? '일용근로 정산이 확정되었습니다.'
          : '일용근로 정산이 임시저장되었습니다.',
        'success',
      );
      onRefresh?.();
    } catch (error) {
      const message = formatPayrollMutationError(error);
      console.error('daily worker payroll save failed:', {
        message,
        error,
        staffId: selectedStaff?.id,
        yearMonth,
      });
      toast(`저장 중 오류가 발생했습니다. ${message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[var(--card)] p-4 rounded-[var(--radius-md)] border border-[var(--border)] shadow-sm animate-in fade-in duration-300" data-testid="daily-settlement-view">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="erp-icon-box">
            <LucideIcon name="CalendarClock" size={18} />
          </span>
          <div>
            <h2 className="text-lg font-bold text-[var(--foreground)]">일용근로 정산</h2>
            <p className="mt-0.5 text-xs font-medium text-[var(--zinc-500)]">
              일급 또는 시급 기준 원천징수와 실지급액을 계산합니다.
            </p>
          </div>
        </div>
        <span className="erp-chip erp-chip-active">{yearMonth}</span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.15fr)]">
        <section className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-[var(--toss-gray-4)]">정산 대상자</label>
            <select
              data-testid="daily-settlement-staff-select"
              value={selectedStaffId}
              onChange={(event) => setSelectedStaffId(event.target.value)}
              className="w-full h-10 px-3 bg-[var(--input-bg)] border border-[var(--border)] rounded-md text-sm font-medium focus:ring-2 focus:ring-[var(--accent)] focus:border-[var(--accent)]"
            >
              <option value="">직원을 선택하세요</option>
              {candidates.map((staff) => (
                <option key={staff.id} value={String(staff.id)}>
                  {staff.name} ({staff.position || '-'})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <span className="text-xs font-medium text-[var(--toss-gray-4)]">급여 입력 기준</span>
            <div className="flex rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-muted)] p-1">
              {WAGE_INPUT_BASIS_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  data-testid={`daily-settlement-wage-basis-${option.id}`}
                  onClick={() => setWageInputBasis(option.id)}
                  className={`h-8 flex-1 rounded-[var(--radius-md)] px-3 text-xs font-bold transition ${
                    wageInputBasis === option.id
                      ? 'bg-[var(--card)] text-[var(--accent)] shadow-sm'
                      : 'text-[var(--zinc-500)] hover:text-[var(--foreground)]'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {wageInputBasis === 'daily' ? (
              <>
              <label className="space-y-1">
                <span className="text-xs font-medium text-[var(--toss-gray-4)]">일급 총액</span>
                <input
                  data-testid="daily-settlement-gross-pay"
                  type="number"
                  min={0}
                  step={1}
                  value={dailyGrossPay || ''}
                  onChange={(event) => setDailyGrossPay(numberFromInput(event.target.value))}
                  className="w-full h-10 px-3 border border-[var(--border)] rounded-md text-sm font-bold text-right outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
                />
              </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-[var(--toss-gray-4)]">1일 근무시간</span>
                  <input
                    data-testid="daily-settlement-hours-per-day"
                    type="number"
                    min={0}
                    step={0.5}
                    value={workHoursPerDay || ''}
                    onChange={(event) => setWorkHoursPerDay(numberFromInput(event.target.value))}
                    className="w-full h-10 px-3 border border-[var(--border)] rounded-md text-sm font-bold text-right outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
                  />
                </label>
              </>
            ) : (
              <>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-[var(--toss-gray-4)]">시급액</span>
                  <input
                    data-testid="daily-settlement-hourly-wage"
                    type="number"
                    min={0}
                    step={1}
                    value={hourlyWage || ''}
                    onChange={(event) => setHourlyWage(numberFromInput(event.target.value))}
                    className="w-full h-10 px-3 border border-[var(--border)] rounded-md text-sm font-bold text-right outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-[var(--toss-gray-4)]">1일 근무시간</span>
                  <input
                    data-testid="daily-settlement-hours-per-day"
                    type="number"
                    min={0}
                    step={0.5}
                    value={workHoursPerDay || ''}
                    onChange={(event) => setWorkHoursPerDay(numberFromInput(event.target.value))}
                    className="w-full h-10 px-3 border border-[var(--border)] rounded-md text-sm font-bold text-right outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
                  />
                </label>
              </>
            )}
            <label className="space-y-1">
              <span className="text-xs font-medium text-[var(--toss-gray-4)]">일 비과세</span>
              <input
                data-testid="daily-settlement-non-taxable-pay"
                type="number"
                min={0}
                step={1}
                value={dailyNonTaxablePay || ''}
                onChange={(event) => setDailyNonTaxablePay(numberFromInput(event.target.value))}
                className="w-full h-10 px-3 border border-[var(--border)] rounded-md text-sm font-bold text-right outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-[var(--toss-gray-4)]">근무일수</span>
              <input
                data-testid="daily-settlement-work-days"
                type="number"
                min={0}
                step={1}
                value={workDays || ''}
                onChange={(event) => setWorkDays(numberFromInput(event.target.value))}
                className="w-full h-10 px-3 border border-[var(--border)] rounded-md text-sm font-bold text-right outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-[var(--toss-gray-4)]">기타공제</span>
              <input
                data-testid="daily-settlement-other-deductions"
                type="number"
                min={0}
                step={1}
                value={otherDeductions || ''}
                onChange={(event) => setOtherDeductions(numberFromInput(event.target.value))}
                className="w-full h-10 px-3 border border-[var(--border)] rounded-md text-sm font-bold text-right outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
              />
            </label>
          </div>

          <label className="flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-2.5">
            <span className="text-xs font-bold text-[var(--foreground)]">소액부징수 적용</span>
            <input
              data-testid="daily-settlement-small-tax-exemption"
              type="checkbox"
              checked={applySmallTaxExemption}
              onChange={(event) => setApplySmallTaxExemption(event.target.checked)}
              className="h-4 w-4 rounded border-[var(--border)] text-[var(--accent)]"
            />
          </label>
        </section>

        <section className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] p-4">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-[var(--zinc-500)]">예상 실지급액</p>
              <p data-testid="daily-settlement-net-pay" className="mt-1 text-2xl font-black text-[var(--accent)]">
                {money(snapshot.netPay)}
              </p>
              <p className="mt-1 text-xs font-medium text-[var(--zinc-500)]">
                {wageInputBasis === 'hourly'
                  ? `시급 ${money(hourlyWage)} × ${Math.max(0, Number(workHoursPerDay) || 0)}시간 × ${snapshot.days}일`
                  : `일급 ${money(snapshot.grossPerDay)} × ${snapshot.days}일`}
              </p>
              {snapshot.grossPerDay > 0 && snapshot.taxBasePerDay <= 0 && (
                <p data-testid="daily-settlement-tax-note" className="mt-1 text-xs font-semibold text-[var(--zinc-500)]">
                  일급 환산액이 150,000원 이하라 일용근로 원천세가 0원입니다.
                </p>
              )}
            </div>
            {snapshot.smallTaxExemptionApplied && (
              <span className="erp-status erp-status-blue">소액부징수</span>
            )}
          </div>

          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)]">
            <table className="erp-table">
              <tbody>
                {[
                  ['총지급액', money(snapshot.grossPay), 'daily-settlement-gross-total'],
                  ['비과세 합계', money(snapshot.nonTaxablePay), 'daily-settlement-non-taxable-total'],
                  ['과세 지급액', money(snapshot.taxablePay), 'daily-settlement-taxable-total'],
                  ['일급 환산액', money(snapshot.grossPerDay), 'daily-settlement-gross-per-day'],
                  ['일 과세표준', money(snapshot.taxBasePerDay), 'daily-settlement-tax-base-per-day'],
                  ['일 산출세액', money(snapshot.calculatedTaxPerDay), 'daily-settlement-calculated-tax-per-day'],
                  ['일 세액공제', money(snapshot.taxCreditPerDay), 'daily-settlement-tax-credit-per-day'],
                  ['일 결정세액', money(snapshot.determinedIncomeTaxPerDay), 'daily-settlement-income-tax-per-day'],
                  ['일 근로소득공제', money(DAILY_WORKER_DEDUCTION_PER_DAY), 'daily-settlement-deduction-per-day'],
                  ['세액 계산 합계', money(snapshot.rawIncomeTax), 'daily-settlement-raw-income-tax-total'],
                  ['국민연금', money(snapshot.nationalPension), 'daily-settlement-national-pension'],
                  ['건강보험', money(snapshot.healthInsurance), 'daily-settlement-health-insurance'],
                  ['장기요양보험', money(snapshot.longTermCare), 'daily-settlement-long-term-care'],
                  ['고용보험', money(snapshot.employmentInsurance), 'daily-settlement-employment-insurance'],
                  ['소득세', money(snapshot.incomeTax), 'daily-settlement-income-tax-total'],
                  ['지방소득세', money(snapshot.localTax), 'daily-settlement-local-tax-total'],
                  ['기타공제', money(snapshot.otherDeductions), 'daily-settlement-other-deduction-total'],
                  ['공제 합계', money(snapshot.totalDeduction), 'daily-settlement-total-deduction'],
                  ['산재보험(사업주)', money(snapshot.industrialAccidentEmployerAmount), 'daily-settlement-industrial-accident-employer'],
                ].map(([label, value, testId], index) => (
                  <tr key={label}>
                    <td className={`font-bold ${index >= 4 ? 'text-[var(--danger)]' : 'text-[var(--zinc-500)]'}`}>
                      {label}
                    </td>
                    <td
                      data-testid={testId}
                      className={`text-right font-black ${index >= 4 ? 'text-[var(--danger)]' : 'text-[var(--foreground)]'}`}
                    >
                      {value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              data-testid="daily-settlement-draft-save-button"
              type="button"
              onClick={() => handleSave('임시저장')}
              disabled={loading}
              className="flex-1 rounded-[var(--radius-md)] bg-amber-500 px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {loading ? '처리 중...' : '임시 저장'}
            </button>
            <button
              data-testid="daily-settlement-finalize-button"
              type="button"
              onClick={() => handleSave('확정')}
              disabled={loading}
              className="flex-1 rounded-[var(--radius-md)] bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {loading ? '처리 중...' : '저장하기 · 정산 확정'}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
