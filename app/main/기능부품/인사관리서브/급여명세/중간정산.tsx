'use client';
import { toast } from '@/lib/toast';
import { useState, useEffect } from 'react';
import { formatPayrollMutationError } from '@/lib/payroll-records';
import { supabase } from '@/lib/supabase';
import { calculateSeverancePay, formatWorkPeriod } from '@/lib/severance-pay';
import { logAudit } from '@/lib/audit';
import { fetchTaxFreeSettings, DEFAULT_SETTINGS, type TaxFreeSettings } from '@/lib/use-tax-free-settings';
import {
  calculateMonthlyIncomeTax,
  calculateQualifyingChildTaxCredit,
  fetchTaxInsuranceRates,
  DEFAULT_TAX_INSURANCE_RATES,
  hasExactIncomeTaxBracket,
  normalizeWithholdingRatePercent,
  type TaxInsuranceRates,
} from '@/lib/use-tax-insurance-rates';
import SmartDatePicker from '../../공통/SmartDatePicker';

export default function InterimSettlement({ staffs = [], selectedCo, onRefresh }: Record<string, unknown>) {
  const _staffs = (staffs as Record<string, unknown>[]) ?? [];
  const _onRefresh = onRefresh as (() => void) | undefined;
  const [selectedStaff, setSelectedStaff] = useState<Record<string, unknown> | null>(null);
  const [settlementDate, setSettlementDate] = useState(new Date().toISOString().split('T')[0]);
  const [reason, setReason] = useState('퇴사');
  const [includeSeverance, setIncludeSeverance] = useState(true);
  const [loading, setLoading] = useState(false);
  const [filterRetirees, setFilterRetirees] = useState(false);
  const [taxFreeLimits, setTaxFreeLimits] = useState<TaxFreeSettings>(DEFAULT_SETTINGS);
  const [taxInsuranceRates, setTaxInsuranceRates] = useState<TaxInsuranceRates>(DEFAULT_TAX_INSURANCE_RATES);

  const filtered = selectedCo === '전체'
    ? _staffs
    : _staffs.filter((s: any) => s.company === selectedCo);

  const candidates = filterRetirees
    ? filtered.filter((s: any) => (s.status || '').toLowerCase() === '퇴사' || s.resigned_at)
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
    const recurringExtraAllowance =
      toAmount(staff.position_allowance) +
      toAmount(staff.overtime_allowance) +
      toAmount(staff.night_work_allowance) +
      toAmount(staff.holiday_work_allowance);
    const proRatedBase = prorate(base);
    const meal = prorate(mealAllowance);
    const nightDuty = prorate(nightDutyAllowance);
    const vehicle = prorate(vehicleAllowance);
    const childcare = prorate(childcareAllowance);
    const research = prorate(researchAllowance);
    const otherTaxfree = prorate(otherTaxfreeAllowance);
    const extraAllowance = prorate(recurringExtraAllowance);

    let severance = 0;
    let workDays = 0;
    if (includeSeverance && reason === '퇴사') {
      const joined = staff.joined_at || staff.join_date;
      const resigned = staff.resigned_at || settlementDate;
      if (joined) {
        const j = new Date(joined);
        const r = new Date(resigned);
        workDays = Math.max(0, Math.floor((r.getTime() - j.getTime()) / (1000 * 60 * 60 * 24)));
        const avgWage = base + (mealAllowance || 0);
        severance = calculateSeverancePay(avgWage, workDays);
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

    const totalTaxfree =
      mealTaxFree +
      vehicleTaxFree +
      childcareTaxFree +
      researchTaxFree +
      nightDuty +
      otherTaxfree;
    const totalTaxable =
      proRatedBase +
      mealTaxable +
      vehicleTaxable +
      childcareTaxable +
      researchTaxable +
      extraAllowance +
      severance;
    const total = totalTaxable + totalTaxfree;

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
    const insuranceSettings = (staff.permissions?.insurance as Record<string, unknown> | undefined) || {};
    const applyInsurance = insuranceSettings.national !== false;
    const applyTax = insuranceSettings.income_tax !== false;
    const isMedicalBenefit = Boolean(staff.permissions?.is_medical_benefit) || false;

    let isDuruNuriActive = Boolean(insuranceSettings.duru_nuri) || false;
    if (isDuruNuriActive && insuranceSettings.duru_nuri_start && insuranceSettings.duru_nuri_end) {
      const current = settlementDate.slice(0, 7);
      isDuruNuriActive =
        current >= String(insuranceSettings.duru_nuri_start) &&
        current <= String(insuranceSettings.duru_nuri_end);
    }

    const hasExactWithholdingTable = hasExactIncomeTaxBracket(taxInsuranceRates);
    let nationalPension = 0;
    let healthInsurance = 0;
    let longTermCare = 0;
    let employmentInsurance = 0;
    let incomeTax = 0;
    let localTax = 0;

    if (applyInsurance) {
      const fullNationalPension = Math.floor(totalTaxable * taxInsuranceRates.national_pension_rate);
      nationalPension = isDuruNuriActive ? Math.floor(fullNationalPension * 0.2) : fullNationalPension;

      if (!isMedicalBenefit) {
        healthInsurance = Math.floor(totalTaxable * taxInsuranceRates.health_insurance_rate);
        longTermCare = Math.floor(totalTaxable * taxInsuranceRates.long_term_care_rate);
      }

      const fullEmploymentInsurance = Math.floor(totalTaxable * taxInsuranceRates.employment_insurance_rate);
      employmentInsurance = isDuruNuriActive ? Math.floor(fullEmploymentInsurance * 0.2) : fullEmploymentInsurance;
    }

    const baselineIncomeTax = calculateMonthlyIncomeTax(totalTaxable, taxInsuranceRates, 0, {
      withholdingRatePercent: 100,
      qualifyingChildCount: 0,
    });
    const familyAdjustedIncomeTax = calculateMonthlyIncomeTax(totalTaxable, taxInsuranceRates, dependentCount, {
      withholdingRatePercent: 100,
      qualifyingChildCount: 0,
    });
    const preRatioIncomeTax = calculateMonthlyIncomeTax(totalTaxable, taxInsuranceRates, dependentCount, {
      withholdingRatePercent: 100,
      qualifyingChildCount,
    });
    const exactIncomeTax = calculateMonthlyIncomeTax(totalTaxable, taxInsuranceRates, dependentCount, {
      withholdingRatePercent,
      qualifyingChildCount,
    });
    const dependentTaxCredit = hasExactWithholdingTable
      ? Math.max(0, baselineIncomeTax - familyAdjustedIncomeTax)
      : dependentCount * 12_500;
    const childTaxCredit = hasExactWithholdingTable
      ? Math.max(0, familyAdjustedIncomeTax - preRatioIncomeTax)
      : calculateQualifyingChildTaxCredit(qualifyingChildCount);

    if (applyTax && hasExactWithholdingTable) {
      incomeTax = Math.max(0, exactIncomeTax);
      localTax = Math.floor((incomeTax * 0.1) / 10) * 10;
    }

    const deduction = nationalPension + healthInsurance + longTermCare + employmentInsurance + incomeTax + localTax;
    const deductionDetail = {
      national_pension: nationalPension,
      health_insurance: healthInsurance,
      long_term_care: longTermCare,
      employment_insurance: employmentInsurance,
      income_tax: incomeTax,
      local_tax: localTax,
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
    };
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
      workDays,
      totalTaxable,
      totalTaxfree,
      total,
      deduction,
      deductionDetail,
      net,
      workedDays,
      lastDay,
    };
  };

  const result = selectedStaff ? calculateSettlement(selectedStaff) : null;

  const handleConfirm = async () => {
    if (!selectedStaff) return toast('정산 대상을 선택해 주세요.', 'warning');
    if (!confirm('정산 내역을 확정하고 저장하시겠습니까?')) return;

    setLoading(true);
    try {
      const calc = calculateSettlement(selectedStaff);
      const yearMonth = settlementDate.slice(0, 7) + '-I';

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
        overtime_pay: 0,
        bonus: 0,
        total_taxable: calc.totalTaxable,
        total_taxfree: calc.totalTaxfree,
        total_deduction: calc.deduction,
        deduction_detail: calc.deductionDetail,
        net_pay: calc.net,
        attendance_deduction: 0,
        advance_pay: 0,
        status: '확정',
        record_type: 'interim',
        settlement_reason: reason,
        settlement_date: settlementDate,
        severance_pay: calc.severance,
      };

      const { error: payrollSaveError } = await supabase.from('payroll_records').upsert(record, { onConflict: 'staff_id,year_month' });
      if (payrollSaveError) throw payrollSaveError;

      const u = typeof window !== 'undefined' ? (() => { try { return JSON.parse(localStorage.getItem('erp_user') || '{}'); } catch { return {}; } })() : {};
      try {
        await logAudit('중간정산확정', 'payroll', yearMonth, { staff: selectedStaff.name, total: calc.total, severance: calc.severance }, u.id, u.name);
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
        settlementDate,
      });
      toast(`저장 중 오류가 발생했습니다. ${message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[var(--card)] p-4 rounded-[var(--radius-md)] border border-[var(--border)] shadow-sm animate-in fade-in duration-300" data-testid="interim-settlement-view">
      <div className="mb-4 pb-3 border-b border-[var(--border)]">
        <h2 className="text-lg font-bold text-[var(--foreground)]">중간정산</h2>
      </div>

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
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeSeverance}
                  onChange={(e) => setIncludeSeverance(e.target.checked)}
                  className="w-4 h-4 rounded border-[var(--border)] text-[var(--accent)]"
                />
                <span className="text-xs font-medium text-[var(--toss-gray-4)]">퇴직금 포함</span>
              </label>
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
                {result.severance > 0 && (
                  <div className="flex justify-between text-xs font-medium text-emerald-700">
                    <span>퇴직금 (재직 {formatWorkPeriod(result.workDays)})</span>
                    <span>{result.severance.toLocaleString()}원</span>
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
