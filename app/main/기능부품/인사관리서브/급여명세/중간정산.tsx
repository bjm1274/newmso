'use client';
import { toast } from '@/lib/toast';
import { db } from '@/lib/db-client';
import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import { getKoreanTodayString } from '@/lib/seoul-time';
import { useActionDialog } from '@/app/components/useActionDialog';
import { formatPayrollMutationError } from '@/lib/payroll-records';
import { upsertPayrollRecordWithFallback } from '@/lib/payroll-record-upsert';
import { STORAGE_KEYS } from '@/lib/storage-keys';
import {
  calculateDcRetirementBenefitFromMonthlyWage,
  formatWorkPeriod } from '@/lib/severance-pay';
import { logAudit } from '@/lib/audit';
import { fetchTaxFreeSettings, DEFAULT_SETTINGS, type TaxFreeSettings } from '@/lib/use-tax-free-settings';
import {
  calculateMonthlyIncomeTax,
  calculateQualifyingChildTaxCredit,
  fetchTaxInsuranceRates,
  DEFAULT_TAX_INSURANCE_RATES,
  hasExactIncomeTaxBracket,
  normalizeWithholdingRatePercent,
  type TaxInsuranceRates } from '@/lib/use-tax-insurance-rates';
import {
  calculateHourlyRateFromMonthlySalary,
  resolveWeeklyWorkingHours } from '@/lib/payroll-working-hours';
import { calcStatutoryDeductions } from '@/lib/payroll-deductions';
import { getPayrollInsuranceSettings, resolvePayrollAsOfDate, hasAnyEmployeePayrollInsurance } from '@/lib/payroll-insurance-settings';
import { NIGHT_DUTY_TAX_FREE_LIMIT } from '@/lib/tax-free-limits';
import { NP_INCOME_CEILING, NP_INCOME_FLOOR } from '@/lib/tax-free-limits';
import SmartDatePicker from '../../공통/SmartDatePicker';

const INTERIM_TIME_STEP_MINUTES = 10;
const HOLD_TO_INTERIM_UNIT_INPUT_MS = 450;
const RETIREMENT_BENEFIT_BASIS = 'DC';

type InterimAdjustmentKey =
  | 'nightDutyAdjustment'
  | 'overtimePay'
  | 'bonus'
  | 'allowanceDeduction'
  | 'attendanceDeduction';

type InterimAdjustments = Record<InterimAdjustmentKey, number | ''>;

const EMPTY_INTERIM_ADJUSTMENTS: InterimAdjustments = {
  nightDutyAdjustment: 0,
  overtimePay: 0,
  bonus: 0,
  allowanceDeduction: 0,
  attendanceDeduction: 0 };

function parseInterimWonInput(value: unknown) {
  const numeric = Number(String(value ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : 0;
}

function getInterimHourlyRate(staff: Record<string, unknown> | null) {
  if (!staff) return 0;

  const fixedMonthlyPay = [
    staff.base_salary ?? staff.base,
    staff.meal_allowance ?? staff.meal,
    staff.night_duty_allowance,
    staff.vehicle_allowance,
    staff.childcare_allowance,
    staff.research_allowance,
    staff.other_taxfree,
    staff.position_allowance,
    staff.overtime_allowance,
    staff.night_work_allowance,
    staff.holiday_work_allowance,
  ].reduce<number>((sum, value) => sum + parseInterimWonInput(value), 0);

  return calculateHourlyRateFromMonthlySalary(
    fixedMonthlyPay,
    resolveWeeklyWorkingHours(staff, 40),
    'ceil',
  );
}

function InterimTenMinuteUnitField({
  label,
  value,
  hourlyRate,
  onChange,
  testId,
  tone = 'default' }: {
  label: string;
  value: number | '';
  hourlyRate: number;
  onChange: (value: number | '') => void;
  testId: string;
  tone?: 'default' | 'deduction' | 'success';
}) {
  const amount = parseInterimWonInput(value);
  const [inputValue, setInputValue] = useState(
    value === '' || value === undefined || value === null ? '' : (value === 0 ? '0' : Number(value).toLocaleString())
  );

  useEffect(() => {
    const currentNumeric = parseInt(inputValue.replace(/,/g, ''), 10) || 0;
    const targetNumeric = Number(value) || 0;
    if (currentNumeric !== targetNumeric) {
      setInputValue(value === '' || value === undefined || value === null ? '' : (value === 0 ? '0' : Number(value).toLocaleString()));
    }
  }, [value]);

  const quickInputRef = useRef<HTMLInputElement>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openedByHoldRef = useRef(false);
  const [unitInputOpen, setUnitInputOpen] = useState(false);
  const [unitInputValue, setUnitInputValue] = useState('');
  const stepAmount = Math.round(parseInterimWonInput(hourlyRate) * (INTERIM_TIME_STEP_MINUTES / 60));
  const stepLabel = `${INTERIM_TIME_STEP_MINUTES}분`;
  const toneClass =
    tone === 'deduction'
      ? 'text-rose-600 border-rose-200 bg-rose-50/40'
      : tone === 'success'
        ? 'text-[var(--success)] border-[var(--success-light)] bg-[var(--success-light)]/20'
        : 'text-[var(--foreground)] border-[var(--border)] bg-[var(--input-bg)]';

  const clearHoldTimer = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };
  const getUnitCountText = () => {
    if (amount <= 0 || stepAmount <= 0) return '';
    return String(Math.round(amount / stepAmount));
  };
  const openUnitInput = () => {
    openedByHoldRef.current = true;
    setUnitInputValue(getUnitCountText());
    setUnitInputOpen(true);
    window.setTimeout(() => {
      quickInputRef.current?.focus();
      quickInputRef.current?.select();
    }, 0);
  };
  const startHoldToUnitInput = () => {
    clearHoldTimer();
    openedByHoldRef.current = false;
    holdTimerRef.current = setTimeout(openUnitInput, HOLD_TO_INTERIM_UNIT_INPUT_MS);
  };
  const applyStep = (direction: -1 | 1) => {
    if (openedByHoldRef.current) {
      openedByHoldRef.current = false;
      return;
    }
    onChange(Math.max(0, amount + stepAmount * direction));
  };
  const handleAmountChange = (event: ChangeEvent<HTMLInputElement>) => {
    const rawValue = event.target.value;
    setInputValue(rawValue);
    const numeric = rawValue.replace(/[^\d.-]/g, '');
    if (numeric === '') {
      onChange('');
    } else {
      onChange(parseInterimWonInput(rawValue));
    }
  };
  const applyUnitInput = () => {
    onChange(parseInterimWonInput(unitInputValue) * stepAmount);
    setUnitInputOpen(false);
  };

  useEffect(() => {
    return () => {
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    };
  }, []);

  return (
    <div className="relative space-y-1">
      <div className="flex items-center justify-between gap-2">
        <label className="text-[10px] font-bold text-[var(--toss-gray-4)]">{label}</label>
        <span className="text-[9px] font-bold text-[var(--toss-gray-3)]">
          {stepLabel} 단위 1 = {stepAmount.toLocaleString()}원
        </span>
      </div>
      <div className={`flex h-9 overflow-hidden rounded-md border ${toneClass}`}>
        <button
          type="button"
          data-testid={`${testId}-decrease`}
          onPointerDown={startHoldToUnitInput}
          onPointerUp={clearHoldTimer}
          onPointerLeave={clearHoldTimer}
          onPointerCancel={clearHoldTimer}
          onClick={() => applyStep(-1)}
          disabled={stepAmount <= 0 || amount <= 0}
          className="w-9 shrink-0 border-r border-current/20 text-sm font-black disabled:opacity-40"
          aria-label={`${label} ${stepLabel} 차감`}
        >
          -
        </button>
        <input
          data-testid={testId}
          type="text"
          inputMode="numeric"
          value={inputValue}
          onChange={handleAmountChange}
          className="min-w-0 flex-1 border-0 bg-transparent px-3 text-xs font-bold outline-none"
        />
        <button
          type="button"
          data-testid={`${testId}-increase`}
          onPointerDown={startHoldToUnitInput}
          onPointerUp={clearHoldTimer}
          onPointerLeave={clearHoldTimer}
          onPointerCancel={clearHoldTimer}
          onClick={() => applyStep(1)}
          disabled={stepAmount <= 0}
          className="w-9 shrink-0 border-l border-current/20 text-sm font-black disabled:opacity-40"
          aria-label={`${label} ${stepLabel} 추가`}
        >
          +
        </button>
      </div>
      {unitInputOpen && (
        <div
          data-testid={`${testId}-quick-input-panel`}
          className="absolute left-0 right-0 top-full z-30 mt-1 rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 shadow-lg"
        >
          <label className="mb-1 block text-[10px] font-bold text-[var(--toss-gray-4)]">
            {label} {stepLabel} 단위 입력
          </label>
          <div className="flex gap-2">
            <input
              ref={quickInputRef}
              data-testid={`${testId}-quick-input`}
              type="text"
              inputMode="numeric"
              value={unitInputValue}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setUnitInputValue(event.target.value.replace(/[^\d]/g, ''))}
              onKeyDown={(event) => {
                if (event.key === 'Enter') applyUnitInput();
                if (event.key === 'Escape') setUnitInputOpen(false);
              }}
              placeholder="개수"
              className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
            />
            <button
              type="button"
              data-testid={`${testId}-quick-apply`}
              onClick={applyUnitInput}
              className="rounded-md bg-[var(--accent)] px-3 py-2 text-xs font-bold text-white"
            >
              적용
            </button>
            <button
              type="button"
              data-testid={`${testId}-quick-close`}
              onClick={() => setUnitInputOpen(false)}
              className="rounded-md border border-[var(--border)] px-3 py-2 text-xs font-bold text-[var(--toss-gray-4)]"
            >
              닫기
            </button>
          </div>
          <p className="mt-1 text-[10px] font-semibold text-[var(--toss-gray-3)]">
            1 = {stepLabel} = {stepAmount.toLocaleString()}원
          </p>
        </div>
      )}
    </div>
  );
}

function calculateRetirementTax(severance: number, workDays: number): { tax: number; localTax: number } {
  if (severance <= 0 || workDays <= 0) return { tax: 0, localTax: 0 };
  
  // 1. 근속연수 계산 (1년 미만은 1년으로 봄)
  const years = Math.max(1, Math.ceil(workDays / 365.25));
  
  // 2. 근속연수공제 계산
  let serviceYearDeduction = 0;
  if (years <= 5) {
    serviceYearDeduction = 1000000 * years;
  } else if (years <= 10) {
    serviceYearDeduction = 5000000 + 2000000 * (years - 5);
  } else if (years <= 20) {
    serviceYearDeduction = 15000000 + 2500000 * (years - 10);
  } else {
    serviceYearDeduction = 40000000 + 3000000 * (years - 20);
  }
  
  // 3. 과세표준 계산
  const taxBase = Math.max(0, severance - serviceYearDeduction);
  if (taxBase <= 0) return { tax: 0, localTax: 0 };
  
  // 4. 환산급여 계산 (과세표준 / 근속연수 * 12)
  const translatedSalary = (taxBase / years) * 12;
  
  // 5. 환산급여공제 계산
  let translatedDeduction = 0;
  if (translatedSalary <= 8000000) {
    translatedDeduction = translatedSalary;
  } else if (translatedSalary <= 70000000) {
    translatedDeduction = 8000000 + 0.6 * (translatedSalary - 8000000);
  } else if (translatedSalary <= 120000000) {
    translatedDeduction = 45200000 + 0.55 * (translatedSalary - 70000000);
  } else if (translatedSalary <= 300000000) {
    translatedDeduction = 72700000 + 0.5 * (translatedSalary - 120000000);
  } else {
    translatedDeduction = 162700000 + 0.45 * (translatedSalary - 300000000);
  }
  
  // 6. 환산과세표준
  const translatedTaxBase = Math.max(0, translatedSalary - translatedDeduction);
  
  // 7. 환산산출세액 (기본 소득세율 적용)
  let translatedCalculatedTax = 0;
  if (translatedTaxBase <= 14000000) {
    translatedCalculatedTax = translatedTaxBase * 0.06;
  } else if (translatedTaxBase <= 50000000) {
    translatedCalculatedTax = 840000 + 0.15 * (translatedTaxBase - 14000000);
  } else if (translatedTaxBase <= 88000000) {
    translatedCalculatedTax = 6240000 + 0.24 * (translatedTaxBase - 50000000);
  } else if (translatedTaxBase <= 150000000) {
    translatedCalculatedTax = 15360000 + 0.35 * (translatedTaxBase - 88000000);
  } else if (translatedTaxBase <= 300000000) {
    translatedCalculatedTax = 37060000 + 0.38 * (translatedTaxBase - 150000000);
  } else if (translatedTaxBase <= 500000000) {
    translatedCalculatedTax = 94060000 + 0.4 * (translatedTaxBase - 300000000);
  } else if (translatedTaxBase <= 1000000000) {
    translatedCalculatedTax = 174060000 + 0.42 * (translatedTaxBase - 500000000);
  } else {
    translatedCalculatedTax = 384060000 + 0.45 * (translatedTaxBase - 1000000000);
  }
  
  // 8. 결정산출세액 (환산산출세액 / 12 * 근속연수)
  const calculatedTax = (translatedCalculatedTax / 12) * years;
  
  const tax = Math.floor(calculatedTax / 10) * 10;
  const localTax = Math.floor((tax * 0.1) / 10) * 10;
  
  return { tax, localTax };
}

export default function InterimSettlement({ staffs = [], selectedCo, onRefresh }: Record<string, unknown>) {
  const { dialog, openConfirm } = useActionDialog();
  const _staffs = (staffs as Record<string, unknown>[]) ?? [];
  const _onRefresh = onRefresh as (() => void) | undefined;
  const [selectedStaff, setSelectedStaff] = useState<Record<string, unknown> | null>(null);
  const [settlementDate, setSettlementDate] = useState(getKoreanTodayString());
  const [reason, setReason] = useState('퇴사');
  const [includeSeverance, setIncludeSeverance] = useState(true);
  const [loading, setLoading] = useState(false);
  const [filterRetirees, setFilterRetirees] = useState(false);
  const [taxFreeLimits, setTaxFreeLimits] = useState<TaxFreeSettings>(DEFAULT_SETTINGS);
  const [taxInsuranceRates, setTaxInsuranceRates] = useState<TaxInsuranceRates>(DEFAULT_TAX_INSURANCE_RATES);
  const [adjustments, setAdjustments] = useState<InterimAdjustments>({ ...EMPTY_INTERIM_ADJUSTMENTS });

  const filtered = selectedCo === '전체'
    ? _staffs
    : _staffs.filter((s: any) => s.company === selectedCo);

  const candidates = filterRetirees
    ? filtered.filter((s: any) => {
        const status = (s.status || '').toLowerCase();
        // resign_date가 정본 컬럼(payroll-fetch가 로딩). resigned_at은 일부 경로 호환용.
        return status === '퇴사' || status === '퇴직' || s.resign_date || s.resigned_at;
      })
    : filtered;

  const effectiveYear = parseInt(settlementDate.slice(0, 4), 10) || new Date().getFullYear();
  const companyScope =
    String((selectedStaff?.company as string | undefined) || (selectedCo as string | undefined) || '전체') || '전체';

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [settings, rates] = await Promise.all([
          fetchTaxFreeSettings(companyScope, effectiveYear),
          fetchTaxInsuranceRates(companyScope, effectiveYear),
        ]);
        if (!active) return;
        setTaxFreeLimits(settings);
        setTaxInsuranceRates(rates);
      } catch (error) {
        console.error('interim settlement tax config load failed:', error);
        if (!active) return;
        setTaxFreeLimits(DEFAULT_SETTINGS);
        setTaxInsuranceRates(DEFAULT_TAX_INSURANCE_RATES);
      }
    })();
    return () => {
      active = false;
    };
  }, [companyScope, effectiveYear]);

  useEffect(() => {
    setAdjustments({ ...EMPTY_INTERIM_ADJUSTMENTS });
  }, [selectedStaff?.id]);

  const updateAdjustment = (key: InterimAdjustmentKey, value: number | '') => {
    setAdjustments((prev) => ({
      ...prev,
      [key]: value === '' ? '' : parseInterimWonInput(value) }));
  };

  const calculateSettlement = (staff: any) => {
    const toAmount = (value: unknown) => Math.max(0, Number(value) || 0);
    const date = new Date(settlementDate);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    const workedDays = date.getDate();
    const prorate = (amount: number) => Math.floor((Math.max(0, amount) / lastDay) * workedDays);

    const base = toAmount(staff.base_salary ?? staff.base);
    const mealAllowance = toAmount(staff.meal_allowance ?? staff.meal);
    const nightDutyAllowance = toAmount(staff.night_duty_allowance);
    const vehicleAllowance = toAmount(staff.vehicle_allowance);
    const childcareAllowance = toAmount(staff.childcare_allowance);
    const researchAllowance = toAmount(staff.research_allowance);
    const otherTaxfreeAllowance = toAmount(staff.other_taxfree);
    const nightDutyAdjustment = toAmount(adjustments.nightDutyAdjustment);
    const overtimePay = toAmount(adjustments.overtimePay);
    const bonus = toAmount(adjustments.bonus);
    const allowanceDeduction = toAmount(adjustments.allowanceDeduction);
    const attendanceDeduction = toAmount(adjustments.attendanceDeduction);
    const recurringExtraAllowance =
      toAmount(staff.position_allowance) +
      toAmount(staff.overtime_allowance) +
      toAmount(staff.night_work_allowance) +
      toAmount(staff.holiday_work_allowance);
    const proRatedBase = prorate(base);
    const meal = prorate(mealAllowance);
    const nightDuty = prorate(nightDutyAllowance) + nightDutyAdjustment;
    const vehicle = prorate(vehicleAllowance);
    const childcare = prorate(childcareAllowance);
    const research = prorate(researchAllowance);
    const otherTaxfree = prorate(otherTaxfreeAllowance);
    const extraAllowance = prorate(recurringExtraAllowance);

    let severance = 0;
    let workDays = 0;
    let retirementTax = 0;
    let retirementLocalTax = 0;
    if (includeSeverance && reason === '퇴사') {
      const joined = staff.joined_at || staff.join_date || staff.hire_date;
      const resigned = staff.resigned_at || staff.resign_date || settlementDate;
      if (joined) {
        const j = new Date(joined);
        const r = new Date(resigned);
        workDays = Math.max(0, Math.floor((r.getTime() - j.getTime()) / (1000 * 60 * 60 * 24)));
        const monthlyAvgWage = base + (mealAllowance || 0);
        severance = calculateDcRetirementBenefitFromMonthlyWage(monthlyAvgWage, workDays);
        if (severance > 0) {
          const taxCalc = calculateRetirementTax(severance, workDays);
          retirementTax = taxCalc.tax;
          retirementLocalTax = taxCalc.localTax;
        }
      }
    }

    const mealTaxFree = Math.min(meal, taxFreeLimits.meal_limit);
    const mealTaxable = Math.max(0, meal - taxFreeLimits.meal_limit);
    const vehicleTaxFree = Math.min(vehicle, taxFreeLimits.vehicle_limit);
    const vehicleTaxable = Math.max(0, vehicle - taxFreeLimits.vehicle_limit);
    const childcareTaxFree = Math.min(childcare, taxFreeLimits.childcare_limit);
    const childcareTaxable = Math.max(0, childcare - taxFreeLimits.childcare_limit);
    const researchTaxFree = Math.min(research, taxFreeLimits.research_limit);
    const researchTaxable = Math.max(0, research - taxFreeLimits.research_limit);

    // 야간·당직 비과세 한도 (월 24만원, 소득세법 시행령 제17조) — lib/tax-free-limits SSOT 사용
    const nightDutyTaxFree = Math.min(nightDuty, NIGHT_DUTY_TAX_FREE_LIMIT);
    const nightDutyTaxable = Math.max(0, nightDuty - NIGHT_DUTY_TAX_FREE_LIMIT);

    // other_taxfree 비과세 한도 적용
    // other_taxfree_limit가 0 또는 미설정이면 무한 비과세 방지를 위해 전액 과세 처리
    const otherTaxfreeLimit = taxFreeLimits.other_taxfree_limit ?? 0;
    const otherTaxfreeTaxFree =
      otherTaxfreeLimit > 0
        ? Math.min(otherTaxfree, otherTaxfreeLimit)
        : 0;
    const otherTaxfreeTaxable =
      otherTaxfreeLimit > 0
        ? Math.max(0, otherTaxfree - otherTaxfreeLimit)
        : otherTaxfree;

    const totalTaxfree =
      mealTaxFree +
      vehicleTaxFree +
      childcareTaxFree +
      researchTaxFree +
      nightDutyTaxFree +
      otherTaxfreeTaxFree;
    // 근로소득 과세표준: severance(퇴직소득)는 분류과세(소득세법 §22)이므로 합산 제외
    // TODO: 퇴직소득세 분류과세 별도 계산 필요
    const totalTaxable =
      Math.max(
        0,
        proRatedBase +
          mealTaxable +
          vehicleTaxable +
          childcareTaxable +
          researchTaxable +
          nightDutyTaxable +
          otherTaxfreeTaxable +
          extraAllowance +
          overtimePay +
          bonus -
          allowanceDeduction -
          attendanceDeduction,
      );
    // 실지급 총액: severance는 과세표준에서 제외되지만 지급액에는 포함
    const total = totalTaxable + totalTaxfree + severance;

    const dependentCount = Math.max(
      0,
      Number(
        staff.dependent_count ??
        (staff.permissions?.payroll as Record<string, unknown> | undefined)?.dependent_count ??
        (staff.permissions?.tax as Record<string, unknown> | undefined)?.dependent_count ??
        staff.permissions?.dependents ??
        0
      ) || 0
    );
    const qualifyingChildCount = Math.min(
      dependentCount,
      Math.max(
        0,
        Number(
          staff.child_count_8_20 ??
          (staff.permissions?.payroll as Record<string, unknown> | undefined)?.child_count_8_20 ??
          (staff.permissions?.tax as Record<string, unknown> | undefined)?.child_count_8_20 ??
          0
        ) || 0
      )
    );
    const withholdingRatePercent = normalizeWithholdingRatePercent(
      (staff.withholding_rate_percent ??
        (staff.permissions?.payroll as Record<string, unknown> | undefined)?.withholding_rate_percent ??
        (staff.permissions?.tax as Record<string, unknown> | undefined)?.withholding_rate_percent ??
        100) as number | string | null | undefined
    );
    const resolvedIns = getPayrollInsuranceSettings(staff, resolvePayrollAsOfDate(settlementDate.slice(0, 7)));
    const insuranceSettings = (staff.permissions?.insurance as Record<string, unknown> | undefined) || {};
    const applyInsurance = hasAnyEmployeePayrollInsurance(resolvedIns);
    const applyTax = resolvedIns.incomeTax;
    const isMedicalBenefit = Boolean(staff.permissions?.is_medical_benefit) || false;

    let isDuruNuriActive = Boolean(insuranceSettings.duru_nuri) || false;
    if (isDuruNuriActive && insuranceSettings.duru_nuri_start && insuranceSettings.duru_nuri_end) {
      const current = settlementDate.slice(0, 7);
      isDuruNuriActive =
        current >= String(insuranceSettings.duru_nuri_start) &&
        current <= String(insuranceSettings.duru_nuri_end);
    }

    const hasExactWithholdingTable = hasExactIncomeTaxBracket(taxInsuranceRates);
    const deductions = calcStatutoryDeductions(totalTaxable, taxInsuranceRates, {
      applyInsurance,
      applyTax,
      isDuruNuriActive,
      isMedicalBenefit,
      dependentCount,
      qualifyingChildCount,
      withholdingRatePercent,
      applyNationalPension: resolvedIns.national,
      applyHealthInsurance: resolvedIns.health,
      applyEmploymentInsurance: resolvedIns.employment,
      nationalPensionAmount: insuranceSettings.national_amount != null ? Number(insuranceSettings.national_amount) : null,
      joinedAt: staff.joined_at || staff.join_date || null,
      yearMonth: settlementDate.slice(0, 7) });

    const nationalPension = deductions.national_pension;
    const healthInsurance = deductions.health_insurance;
    const longTermCare = deductions.long_term_care;
    const employmentInsurance = deductions.employment_insurance;
    const incomeTax = deductions.income_tax;
    const localTax = deductions.local_tax;

    const baselineIncomeTax = calculateMonthlyIncomeTax(totalTaxable, taxInsuranceRates, 0, {
      withholdingRatePercent: 100,
      qualifyingChildCount: 0 });
    const familyAdjustedIncomeTax = calculateMonthlyIncomeTax(totalTaxable, taxInsuranceRates, dependentCount, {
      withholdingRatePercent: 100,
      qualifyingChildCount: 0 });
    const preRatioIncomeTax = calculateMonthlyIncomeTax(totalTaxable, taxInsuranceRates, dependentCount, {
      withholdingRatePercent: 100,
      qualifyingChildCount });
    const dependentTaxCredit = hasExactWithholdingTable
      ? Math.max(0, baselineIncomeTax - familyAdjustedIncomeTax)
      : dependentCount * 12_500;
    const childTaxCredit = hasExactWithholdingTable
      ? Math.max(0, familyAdjustedIncomeTax - preRatioIncomeTax)
      : calculateQualifyingChildTaxCredit(qualifyingChildCount);

    const deduction = deductions.national_pension + deductions.health_insurance + deductions.long_term_care + deductions.employment_insurance + deductions.income_tax + deductions.local_tax + retirementTax + retirementLocalTax;
    const deductionDetail = {
      national_pension: nationalPension,
      health_insurance: healthInsurance,
      long_term_care: longTermCare,
      employment_insurance: employmentInsurance,
      income_tax: incomeTax,
      local_tax: localTax,
      retirement_income_tax: retirementTax,
      retirement_local_tax: retirementLocalTax,
      dependent_count: dependentCount,
      child_count_8_20: qualifyingChildCount,
      withholding_rate_percent: withholdingRatePercent,
      dependent_tax_credit: dependentTaxCredit,
      child_tax_credit: childTaxCredit,
      income_tax_before_withholding_ratio: preRatioIncomeTax,
      is_duru_nuri: isDuruNuriActive,
      is_medical_benefit: isMedicalBenefit,
      tax_estimated: applyTax && !hasExactWithholdingTable,
      missing_monthly_withholding_table: applyTax && !hasExactWithholdingTable,
      interim_adjustments: {
        night_duty_adjustment: nightDutyAdjustment,
        overtime_pay: overtimePay,
        bonus,
        allowance_deduction: allowanceDeduction,
        attendance_deduction: attendanceDeduction },
      retirement_benefit_basis: includeSeverance && reason === '퇴사' ? RETIREMENT_BENEFIT_BASIS : null };
    const net = total - deduction;

    return {
      proRatedBase,
      meal,
      nightDuty,
      vehicle,
      childcare,
      research,
      otherTaxfree,
      extraAllowance,
      severance,
      retirementBenefitBasis: RETIREMENT_BENEFIT_BASIS,
      workDays,
      totalTaxable,
      totalTaxfree,
      total,
      deduction,
      deductionDetail,
      net,
      workedDays,
      lastDay,
      nightDutyAdjustment,
      overtimePay,
      bonus,
      allowanceDeduction,
      attendanceDeduction };
  };

  const result = selectedStaff ? calculateSettlement(selectedStaff) : null;
  const interimHourlyRate = getInterimHourlyRate(selectedStaff);

  const handleConfirm = async () => {
    if (!selectedStaff) return toast('정산 대상을 선택해 주세요.', 'warning');
    const confirmed = await openConfirm({
      title: '중간정산 확정 저장',
      description: '정산 내역을 확정하고 저장합니다.\n확정 후 급여 레코드에 반영됩니다.',
      confirmText: '확정 저장',
      tone: 'accent' });
    if (!confirmed) return;

    setLoading(true);
    try {
      const calc = calculateSettlement(selectedStaff);
      const yearMonth = settlementDate.slice(0, 7);

      // E-1: 마감 잠금된 월은 중간정산 저장(확정)도 차단한다. 조회 실패 시 막지 않음(fail-open).
      const lockScopes = companyScope && companyScope !== '전체' ? ['전체', companyScope] : ['전체'];
      const { data: lockRows, error: lockError } = await db
        .from('payroll_locks')
        .select('year_month, company_name')
        .eq('year_month', yearMonth)
        .in('company_name', lockScopes);
      if (lockError) {
        console.error('payroll lock check failed:', lockError);
      } else if (Array.isArray(lockRows) && lockRows.length > 0) {
        toast(`${yearMonth} 급여가 마감 잠금되어 저장할 수 없습니다.\n재오픈 승인 후 다시 시도해 주세요.`, 'error');
        return;
      }

      const record: any = {
        staff_id: selectedStaff.id,
        year_month: yearMonth,
        base_salary: calc.proRatedBase,
        meal_allowance: calc.meal,
        night_duty_allowance: calc.nightDuty,
        vehicle_allowance: calc.vehicle,
        childcare_allowance: calc.childcare,
        research_allowance: calc.research,
        other_taxfree: calc.otherTaxfree,
        extra_allowance: calc.extraAllowance,
        overtime_pay: calc.overtimePay,
        bonus: calc.bonus,
        total_taxable: calc.totalTaxable,
        total_taxfree: calc.totalTaxfree,
        // 지급총액 기준을 net_pay 와 일치시킨다.
        // net_pay(calc.net) = calc.total - calc.deduction 이고 calc.total 에는 퇴직금(severance)이
        // 포함돼 있는데, gross_pay 만 퇴직금을 뺀 값(taxable+taxfree)으로 저장해 온 탓에
        // 같은 레코드에서 gross_pay < net_pay 가 되는 역전이 생겼다.
        // 정규 급여 저장 경로(급여정산.tsx:1233)도 gross_pay 에 calc.total 을 넣으므로 기준을 맞춘다.
        // (퇴직금 자체는 severance_pay 컬럼에 계속 별도 저장한다.)
        gross_pay: calc.total,
        total_deduction: calc.deduction,
        // R-2: 공제 항목을 top-level 컬럼에도 저장 (모바일 명세서·EDI가 deduction_detail 대신 읽음)
        national_pension: calc.deductionDetail.national_pension,
        health_insurance: calc.deductionDetail.health_insurance,
        long_term_care: calc.deductionDetail.long_term_care,
        employment_insurance: calc.deductionDetail.employment_insurance,
        // 근로소득세/지방소득세만 top-level 에 저장한다.
        // 퇴직소득은 분류과세(소득세법 §22)라 total_taxable 에 합산하지 않았는데(위 계산부 참조)
        // 세액만 근로소득 컬럼에 더해 두면, 홈택스 C13(소득구분 1004=근로소득)이
        // total_taxable 과 income_tax 를 나란히 쓰기 때문에 과세표준 없는 세액이
        // 근로소득 원천세 신고서에 실린다.
        // 퇴직소득세는 deduction_detail.retirement_income_tax / retirement_local_tax 로만 보관하고,
        // total_deduction 에는 계속 포함되어 실지급액 계산은 그대로 유지된다.
        income_tax: calc.deductionDetail.income_tax,
        local_tax: calc.deductionDetail.local_tax,
        deduction_detail: calc.deductionDetail,
        net_pay: calc.net,
        attendance_deduction: calc.allowanceDeduction + calc.attendanceDeduction,
        attendance_deduction_detail: {
          source: 'interim_manual_adjustment',
          allowance_deduction: calc.allowanceDeduction,
          attendance_deduction: calc.attendanceDeduction,
          amount: calc.allowanceDeduction + calc.attendanceDeduction },
        advance_pay: 0,
        status: '확정',
        record_type: 'interim',
        settlement_reason: reason,
        settlement_date: settlementDate,
        severance_pay: calc.severance };

      const { error: payrollSaveError } = await upsertPayrollRecordWithFallback({
        record: record as Record<string, unknown>,
        optionalColumns: [
          'meal_allowance',
          'night_duty_allowance',
          'vehicle_allowance',
          'childcare_allowance',
          'research_allowance',
          'other_taxfree',
          'gross_pay',
          'national_pension',
          'health_insurance',
          'long_term_care',
          'employment_insurance',
          'income_tax',
          'local_tax',
          'attendance_deduction',
          'attendance_deduction_detail',
          'advance_pay',
          'status',
          'record_type',
          'settlement_reason',
          'settlement_date',
          'severance_pay',
        ] });
      if (payrollSaveError) throw payrollSaveError;

      const u = typeof window !== 'undefined' ? (() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.USER) || '{}'); } catch { return {}; } })() : {};
      try {
        await logAudit('중간정산확정', 'payroll', yearMonth, { staff: selectedStaff.name, total: calc.total, severance: calc.severance, retirementBenefitBasis: calc.retirementBenefitBasis }, u.id, u.name);
      } catch (auditError) {
        console.error('interim payroll audit log failed:', auditError);
      }

      toast('중간정산이 저장되었습니다.', 'success');
      setSelectedStaff(null);
      if (_onRefresh) _onRefresh();
    } catch (e) {
      const message = formatPayrollMutationError(e);
      console.error('interim payroll finalize failed:', {
        message,
        error: e,
        staffId: selectedStaff?.id,
        settlementDate });
      toast(`저장 중 오류가 발생했습니다. ${message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[var(--card)] p-4 rounded-[var(--radius-md)] border border-[var(--border)] shadow-sm animate-in fade-in duration-300" data-testid="interim-settlement-view">
      {dialog}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filterRetirees}
                onChange={(e) => setFilterRetirees(e.target.checked)}
                className="w-4 h-4 rounded border-[var(--border)] text-[var(--accent)]"
              />
              <span className="text-xs font-medium text-[var(--toss-gray-4)]">퇴직자만 보기</span>
            </label>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-[var(--toss-gray-4)]">정산 대상자</label>
            <select
              data-testid="interim-settlement-staff-select"
              value={(selectedStaff?.id ?? '') as string}
              onChange={(e) => setSelectedStaff(candidates.find((s: any) => String(s.id) === e.target.value) || null)}
              className="w-full h-10 px-3 bg-[var(--input-bg)] border border-[var(--border)] rounded-md text-sm font-medium focus:ring-2 focus:ring-[var(--accent)] focus:border-[var(--accent)]"
            >
              <option value="">직원을 선택하세요</option>
              {candidates.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.position || '-'}) {s.status === '퇴사' ? '[퇴사]' : ''}
                </option>
              ))}
              {candidates.length === 0 && (
                <option value="" disabled>대상이 없습니다</option>
              )}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--toss-gray-4)]">정산 기준일</label>
              <SmartDatePicker
                data-testid="interim-settlement-date-input"
                value={settlementDate}
                onChange={val => setSettlementDate(val)}
                className="w-full h-10 px-3 bg-[var(--input-bg)] border border-[var(--border)] rounded-md text-sm font-medium"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--toss-gray-4)]">정산 사유</label>
              <select data-testid="interim-settlement-reason-select" value={reason} onChange={(e) => setReason(e.target.value)} className="w-full h-10 px-3 bg-[var(--input-bg)] border border-[var(--border)] rounded-md text-sm font-medium focus:ring-2 focus:ring-[var(--accent)]/30"
              >
                <option value="퇴사">중도 퇴사</option>
                <option value="휴직">휴직 시작</option>
                <option value="기타">기타 사유</option>
              </select>
            </div>
          </div>

          {reason === '퇴사' && (
            <div className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeSeverance}
                  onChange={(e) => setIncludeSeverance(e.target.checked)}
                  className="w-4 h-4 rounded border-[var(--border)] text-[var(--accent)]"
                />
                <span className="text-xs font-medium text-[var(--toss-gray-4)]">퇴직급여 포함</span>
              </label>
              {includeSeverance && (
                <div className="rounded-[var(--radius-md)] border border-[var(--accent)] bg-[var(--accent)] px-3 py-2 text-white shadow-sm">
                  <span className="block text-xs font-black">DC 기준</span>
                  <span className="mt-0.5 block text-[10px] font-semibold text-white/80">
                    연간 임금 1/12 적립 기준
                  </span>
                </div>
              )}
            </div>
          )}

          {selectedStaff && (
            <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--tab-bg)]/40 p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-black text-[var(--foreground)]">수당·차감 조정</h3>
                <button
                  type="button"
                  onClick={() => setAdjustments({ ...EMPTY_INTERIM_ADJUSTMENTS })}
                  className="rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-[10px] font-bold text-[var(--toss-gray-4)] hover:text-[var(--foreground)]"
                >
                  초기화
                </button>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <InterimTenMinuteUnitField
                  label="야간/당직 (비과세)"
                  value={adjustments.nightDutyAdjustment}
                  hourlyRate={interimHourlyRate}
                  onChange={(value) => updateAdjustment('nightDutyAdjustment', value)}
                  testId="interim-adjustment-night-duty"
                  tone="success"
                />
                <InterimTenMinuteUnitField
                  label="연장근로수당"
                  value={adjustments.overtimePay}
                  hourlyRate={interimHourlyRate}
                  onChange={(value) => updateAdjustment('overtimePay', value)}
                  testId="interim-adjustment-overtime-pay"
                />
                <InterimTenMinuteUnitField
                  label="상여"
                  value={adjustments.bonus}
                  hourlyRate={interimHourlyRate}
                  onChange={(value) => updateAdjustment('bonus', value)}
                  testId="interim-adjustment-bonus"
                />
                <InterimTenMinuteUnitField
                  label="수당 감액"
                  value={adjustments.allowanceDeduction}
                  hourlyRate={interimHourlyRate}
                  onChange={(value) => updateAdjustment('allowanceDeduction', value)}
                  testId="interim-adjustment-allowance-deduction"
                  tone="deduction"
                />
                <InterimTenMinuteUnitField
                  label="근태/기타차감"
                  value={adjustments.attendanceDeduction}
                  hourlyRate={interimHourlyRate}
                  onChange={(value) => updateAdjustment('attendanceDeduction', value)}
                  testId="interim-adjustment-attendance-deduction"
                  tone="deduction"
                />
              </div>
            </div>
          )}
        </div>

        <div className="bg-[var(--tab-bg)] p-4 rounded-[var(--radius-md)] border border-[var(--border)] flex flex-col justify-center">
          {result ? (
            <div className="space-y-4">
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-xs font-medium text-[var(--toss-gray-3)] mb-1">정산 총액 (세전)</p>
                  <p className="text-xl font-bold text-[var(--accent)]">{result.total.toLocaleString()}원</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium text-[var(--toss-gray-3)] mb-1">근무 일수</p>
                  <p className="text-sm font-semibold text-[var(--foreground)]">{result.workedDays} / {result.lastDay}일</p>
                </div>
              </div>
              <div className="space-y-1.5 pt-3 border-t border-[var(--border)]">
                <div className="flex justify-between text-xs font-medium text-[var(--toss-gray-4)]">
                  <span>기본급 (일할)</span>
                  <span>{result.proRatedBase.toLocaleString()}원</span>
                </div>
                <div className="flex justify-between text-xs font-medium text-[var(--toss-gray-4)]">
                  <span>식대 (일할)</span>
                  <span>{result.meal.toLocaleString()}원</span>
                </div>
                {result.vehicle > 0 && (
                  <div className="flex justify-between text-xs font-medium text-[var(--toss-gray-4)]">
                    <span>차량유지비 (일할)</span>
                    <span>{result.vehicle.toLocaleString()}원</span>
                  </div>
                )}
                {result.extraAllowance > 0 && (
                  <div className="flex justify-between text-xs font-medium text-[var(--toss-gray-4)]">
                    <span>고정수당 (일할)</span>
                    <span>{result.extraAllowance.toLocaleString()}원</span>
                  </div>
                )}
                {result.nightDutyAdjustment > 0 && (
                  <div className="flex justify-between text-xs font-medium text-[var(--success)]">
                    <span>야간/당직 추가</span>
                    <span>{result.nightDutyAdjustment.toLocaleString()}원</span>
                  </div>
                )}
                {result.overtimePay > 0 && (
                  <div className="flex justify-between text-xs font-medium text-[var(--toss-gray-4)]">
                    <span>연장근로수당 추가</span>
                    <span>{result.overtimePay.toLocaleString()}원</span>
                  </div>
                )}
                {result.bonus > 0 && (
                  <div className="flex justify-between text-xs font-medium text-[var(--toss-gray-4)]">
                    <span>상여</span>
                    <span>{result.bonus.toLocaleString()}원</span>
                  </div>
                )}
                {(result.allowanceDeduction + result.attendanceDeduction) > 0 && (
                  <div className="flex justify-between text-xs font-medium text-rose-600">
                    <span>수당/근태 차감</span>
                    <span>-{(result.allowanceDeduction + result.attendanceDeduction).toLocaleString()}원</span>
                  </div>
                )}
                {result.severance > 0 && (
                  <div className="flex justify-between text-xs font-medium text-emerald-700">
                    <span>퇴직급여 {result.retirementBenefitBasis} 기준 (재직 {formatWorkPeriod(result.workDays)})</span>
                    <span>{result.severance.toLocaleString()}원</span>
                  </div>
                )}
                {result.deduction - (result.deductionDetail.retirement_income_tax || 0) - (result.deductionDetail.retirement_local_tax || 0) > 0 && (
                  <div className="flex justify-between text-xs font-medium text-[var(--toss-gray-4)]">
                    <span>근로소득세 및 4대보험</span>
                    <span>{(result.deduction - (result.deductionDetail.retirement_income_tax || 0) - (result.deductionDetail.retirement_local_tax || 0)).toLocaleString()}원</span>
                  </div>
                )}
                {(result.deductionDetail.retirement_income_tax || 0) > 0 && (
                  <div className="flex justify-between text-xs font-medium text-rose-500">
                    <span>퇴직소득세 (지방세 포함)</span>
                    <span>-{(result.deductionDetail.retirement_income_tax + result.deductionDetail.retirement_local_tax).toLocaleString()}원</span>
                  </div>
                )}
                <div className="flex justify-between text-xs font-medium text-rose-600 pt-1">
                  <span>예상 공제</span>
                  <span>{result.deduction.toLocaleString()}원</span>
                </div>
                <div className="flex justify-between text-sm font-semibold text-[var(--foreground)]">
                  <span>예상 실지급액</span>
                  <span>{result.net.toLocaleString()}원</span>
                </div>
              </div>
              <button data-testid="interim-settlement-save-button" onClick={handleConfirm} disabled={loading} className="w-full py-3 bg-[var(--accent)] text-white text-sm font-semibold rounded-[var(--radius-md)] hover:opacity-90 disabled:opacity-50">
                {loading ? '저장 중...' : '저장하기'}
              </button>
            </div>
          ) : (
            <div className="text-center py-5">
              <p className="text-xs font-medium text-[var(--toss-gray-3)]">정산 대상을 선택하면 실시간 계산 결과가 표시됩니다.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
