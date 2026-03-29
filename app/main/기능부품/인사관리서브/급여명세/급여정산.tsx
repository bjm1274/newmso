'use client';
import { toast } from '@/lib/toast';
import type { StaffMember } from '@/types';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { calculateAttendanceDeduction } from '@/lib/attendance-deduction';
import { logAudit } from '@/lib/audit';
import { formatPayrollMutationError } from '@/lib/payroll-records';
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
import { buildPayrollVerificationReport } from '@/lib/payroll-governance';

interface SettlementEntry {
  base_salary: number;
  meal_allowance: number;
  night_duty_allowance: number;
  vehicle_allowance: number;
  childcare_allowance: number;
  research_allowance: number;
  other_taxfree: number;
  extra_allowance: number;
  overtime_pay: number;
  bonus: number;
  apply_tax: boolean;
  apply_insurance: boolean;
  attendance_deduction: number;
  attendance_deduction_detail: Record<string, unknown>;
  custom_deduction: number;
  dependent_count: number;
  child_count_8_20: number;
  withholding_rate_percent: 80 | 100 | 120;
  advance_pay: number;
}

export default function SalarySettlement({ staffs, selectedCo, onRefresh }: { staffs: StaffMember[]; selectedCo: string; onRefresh?: () => void }) {
  const [step, setStep] = useState(1);
  const [yearMonth, setYearMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedStaffs, setSelectedStaffs] = useState<StaffMember[]>([]);
  const [settlementData, setSettlementData] = useState<Record<string, SettlementEntry>>({});
  const [loading, setLoading] = useState(false);
  const [taxFreeLimits, setTaxFreeLimits] = useState<TaxFreeSettings>(DEFAULT_SETTINGS);
  const [taxInsuranceRates, setTaxInsuranceRates] = useState<TaxInsuranceRates>(DEFAULT_TAX_INSURANCE_RATES);

  useEffect(() => {
    let ok = true;
    (async () => {
      const s = await fetchTaxFreeSettings(selectedCo || '전체', parseInt(yearMonth.slice(0, 4)));
      if (ok) setTaxFreeLimits(s);
    })();
    return () => { ok = false; };
  }, [selectedCo, yearMonth]);

  useEffect(() => {
    let ok = true;
    (async () => {
      const rates = await fetchTaxInsuranceRates(selectedCo || '전체', parseInt(yearMonth.slice(0, 4), 10));
      if (ok) setTaxInsuranceRates(rates);
    })();
    return () => { ok = false; };
  }, [selectedCo, yearMonth]);

  const TAX_FREE_LIMITS = {
    meal: taxFreeLimits.meal_limit,
    vehicle: taxFreeLimits.vehicle_limit,
    childcare: taxFreeLimits.childcare_limit,
    research: taxFreeLimits.research_limit,
  };

  const filteredStaffs = staffs.filter((s: StaffMember) => selectedCo === '전체' || s.company === selectedCo);

  const toggleStaff = (staff: StaffMember) => {
    if (selectedStaffs.find(s => s.id === staff.id)) {
      setSelectedStaffs(selectedStaffs.filter(s => s.id !== staff.id));
    } else {
      setSelectedStaffs([...selectedStaffs, staff]);
    }
  };

  const handleNextStep = async () => {
    if (selectedStaffs.length === 0) return toast("정산 대상을 선택해 주세요.", 'warning');

    // 기본급여가 설정되지 않은 직원은 명세서를 생성하지 못하도록 1단계에서 차단
    const noBase = selectedStaffs.filter((s: StaffMember) => !Number(s.base_salary) || Number(s.base_salary) <= 0);
    if (noBase.length > 0) {
      const names = noBase.map((s: StaffMember) => s.name).join(', ');
      toast(`기본급(연봉)이 0원으로 설정된 직원이 포함되어 있어 급여 정산을 진행할 수 없습니다.\n\n` +
        `기본급을 먼저 직원 등록 화면에서 입력해 주세요.\n\n문제 대상: ${names}`, 'success');
      return;
    }
    if (false) {
      const verificationRowsPreview1 = selectedStaffs.map((staff: StaffMember) => {
      const data = settlementData[staff.id];
      const advancePay = Number(data?.advance_pay) || 0;
      const isAdvanceOnly = advancePay > 0;
      const calc = isAdvanceOnly ? null : calculateSalary(staff.id);
      return {
        staffId: staff.id,
        staffName: staff.name,
        companyName: staff.company,
        grossPay: isAdvanceOnly ? advancePay : Number(calc?.total || 0),
        taxablePay: isAdvanceOnly ? 0 : Number(calc?.taxable || 0),
        taxFreePay: isAdvanceOnly ? 0 : Number(calc?.taxfree || 0),
        deductionTotal: isAdvanceOnly ? 0 : Number(calc?.deduction || 0),
        netPay: isAdvanceOnly ? advancePay : Number(calc?.net || 0),
        customDeduction: Number(data?.custom_deduction || 0),
        attendanceDeduction: Number(data?.attendance_deduction || 0),
        advancePay,
        baseSalary: Number(data?.base_salary || 0),
        applyTax: data?.apply_tax !== false,
        exactTaxConfigured: hasExactIncomeTaxBracket(taxInsuranceRates),
        bankName: String(staff.bank_name || ''),
        bankAccount: String(staff.bank_account || ''),
      };
    });
    const verificationReportPreview1 = buildPayrollVerificationReport(verificationRowsPreview1, {
      requireExactTaxTable: false,
    });
    if (false && verificationReportPreview1.errorCount > 0) {
      toast(`검산 리포트에 오류 ${verificationReport.errorCount}건이 있어 확정할 수 없습니다.`, 'error');
      return;
    }

    const verificationRowsPreview2 = selectedStaffs.map((staff: StaffMember) => {
      const data = settlementData[staff.id];
      const advancePay = Number(data?.advance_pay) || 0;
      const isAdvanceOnly = advancePay > 0;
      const calc = isAdvanceOnly ? null : calculateSalary(staff.id);
      return {
        staffId: staff.id,
        staffName: staff.name,
        companyName: staff.company,
        grossPay: isAdvanceOnly ? advancePay : Number(calc?.total || 0),
        taxablePay: isAdvanceOnly ? 0 : Number(calc?.taxable || 0),
        taxFreePay: isAdvanceOnly ? 0 : Number(calc?.taxfree || 0),
        deductionTotal: isAdvanceOnly ? 0 : Number(calc?.deduction || 0),
        netPay: isAdvanceOnly ? advancePay : Number(calc?.net || 0),
        customDeduction: Number(data?.custom_deduction || 0),
        attendanceDeduction: Number(data?.attendance_deduction || 0),
        advancePay,
        baseSalary: Number(data?.base_salary || 0),
        applyTax: data?.apply_tax !== false,
        exactTaxConfigured: hasExactIncomeTaxBracket(taxInsuranceRates),
        bankName: String(staff.bank_name || ''),
        bankAccount: String(staff.bank_account || ''),
      };
    });
    const verificationReportPreview2 = buildPayrollVerificationReport(verificationRowsPreview2, {
      requireExactTaxTable: false,
    });
    if (false && verificationReportPreview2.errorCount > 0) {
      toast(`검산 리포트에 오류 ${verificationReport.errorCount}건이 있어 확정할 수 없습니다.`, 'error');
      return;
    }

    const finalizeVerificationRows = selectedStaffs.map((staff: StaffMember) => {
      const data = settlementData[staff.id];
      const advancePay = Number(data?.advance_pay) || 0;
      const isAdvanceOnly = advancePay > 0;
      const calc = isAdvanceOnly ? null : calculateSalary(staff.id);
      return {
        staffId: staff.id,
        staffName: staff.name,
        companyName: staff.company,
        grossPay: isAdvanceOnly ? advancePay : Number(calc?.total || 0),
        taxablePay: isAdvanceOnly ? 0 : Number(calc?.taxable || 0),
        taxFreePay: isAdvanceOnly ? 0 : Number(calc?.taxfree || 0),
        deductionTotal: isAdvanceOnly ? 0 : Number(calc?.deduction || 0),
        netPay: isAdvanceOnly ? advancePay : Number(calc?.net || 0),
        customDeduction: Number(data?.custom_deduction || 0),
        attendanceDeduction: Number(data?.attendance_deduction || 0),
        advancePay,
        baseSalary: Number(data?.base_salary || 0),
        applyTax: data?.apply_tax !== false,
        exactTaxConfigured: hasExactIncomeTaxBracket(taxInsuranceRates),
        bankName: String(staff.bank_name || ''),
        bankAccount: String(staff.bank_account || ''),
      };
    });
    const finalizeVerificationReport = buildPayrollVerificationReport(finalizeVerificationRows, {
      requireExactTaxTable: false,
    });
    if (false && finalizeVerificationReport.errorCount > 0) {
      toast(`검산 리포트에 오류 ${finalizeVerificationReport.errorCount}건이 있어 확정할 수 없습니다.`, 'error');
      return;
    }

      setLoading(true); // next-step
    }
    try {
      const staffIds = selectedStaffs.map((s: StaffMember) => s.id);
      const [year, month] = yearMonth.split('-').map((value) => Number(value));
      const lastDay = new Date(year, month, 0).getDate();
      const [startDate, endDate] = [`${yearMonth}-01`, `${yearMonth}-${String(lastDay).padStart(2, '0')}`];

      const { data: attendances, error: attendanceError } = await supabase
        .from('attendances')
        .select('*')
        .in('staff_id', staffIds)
        .gte('work_date', startDate)
        .lte('work_date', endDate);
      if (attendanceError) throw attendanceError;

      let attendanceRecordRows: Array<{
        staff_id: string;
        work_date: string;
        late_minutes?: number | null;
        early_leave_minutes?: number | null;
      }> = [];

      try {
        const { data, error } = await supabase
          .from('attendance_records')
          .select('staff_id, work_date, late_minutes, early_leave_minutes')
          .in('staff_id', staffIds)
          .gte('work_date', startDate)
          .lte('work_date', endDate);

        if (!error && Array.isArray(data)) {
          attendanceRecordRows = data;
        }
      } catch {
        // Some environments do not expose attendance_records yet.
      }

      const scheduledWorkDaysByStaff: Record<string, number> = {};
      try {
        const { data: shiftAssignments, error: shiftAssignmentsError } = await supabase
          .from('shift_assignments')
          .select('staff_id, work_date, shift_id')
          .in('staff_id', staffIds)
          .gte('work_date', startDate)
          .lte('work_date', endDate);

        if (!shiftAssignmentsError && Array.isArray(shiftAssignments) && shiftAssignments.length > 0) {
          const usedShiftIds = [...new Set(shiftAssignments.map((row) => String(row.shift_id || '')).filter(Boolean))];
          let offLikeShiftIds = new Set<string>();
          const scheduledWorkDateBuckets: Record<string, Set<string>> = {};

          if (usedShiftIds.length > 0) {
            try {
              const { data: workShifts, error: workShiftsError } = await supabase
                .from('work_shifts')
                .select('id, name')
                .in('id', usedShiftIds);

              if (!workShiftsError && Array.isArray(workShifts)) {
                offLikeShiftIds = new Set(
                  workShifts
                    .filter((shift) => /off|휴무|연차|leave/i.test(String(shift.name || '')))
                    .map((shift) => String(shift.id))
                );
              }
            } catch {
              // work_shifts lookup is optional for divisor improvements.
            }
          }

          shiftAssignments.forEach((row) => {
            const shiftId = String(row.shift_id || '').trim();
            if (!shiftId || offLikeShiftIds.has(shiftId)) return;

            const workDate = String(row.work_date || '').slice(0, 10);
            if (!workDate) return;

            const existing = scheduledWorkDateBuckets[row.staff_id] || new Set<string>();
            existing.add(workDate);
            scheduledWorkDateBuckets[row.staff_id] = existing;
          });

          Object.entries(scheduledWorkDateBuckets).forEach(([staffId, dates]) => {
            scheduledWorkDaysByStaff[staffId] = dates.size;
          });
        }
      } catch {
        // shift_assignments is optional for divisor improvements.
      }

      const ruleCompany = selectedCo === '전체' ? '전체' : selectedCo;
      const { data: rule, error: ruleError } = await supabase
        .from('attendance_deduction_rules')
        .select('*')
        .eq('company_name', ruleCompany)
        .maybeSingle();
      if (ruleError) throw ruleError;
      const { data: fallbackRule, error: fallbackRuleError } = await supabase
        .from('attendance_deduction_rules')
        .select('*')
        .eq('company_name', '전체')
        .maybeSingle();
      if (fallbackRuleError) throw fallbackRuleError;
      const r = rule || fallbackRule;

      const initialData: any = {};
      const attendanceMinuteMap = new Map(
        attendanceRecordRows.map((row) => [
          `${row.staff_id}_${String(row.work_date || '').slice(0, 10)}`,
          {
            late_minutes: row.late_minutes ?? null,
            early_leave_minutes: row.early_leave_minutes ?? null,
          },
        ])
      );

      selectedStaffs.forEach((s: StaffMember) => {
        const staffAtts = (attendances || [])
          .filter((a: any) => a.staff_id === s.id)
          .map((attendance: any) => ({
            ...attendance,
            ...(attendanceMinuteMap.get(`${attendance.staff_id}_${String(attendance.work_date || '').slice(0, 10)}`) || {}),
          }));
        const { total, detail } = calculateAttendanceDeduction(
          Number(s.base_salary) || 0,
          yearMonth,
          staffAtts,
          r
            ? {
                late_deduction_type: r.late_deduction_type,
                late_deduction_amount: r.late_deduction_amount,
                early_leave_deduction_type: r.early_leave_deduction_type,
                early_leave_deduction_amount: r.early_leave_deduction_amount,
                absent_use_daily_rate: r.absent_use_daily_rate,
              }
            : undefined,
          { scheduledWorkDays: scheduledWorkDaysByStaff[s.id] }
        );
        initialData[s.id] = {
          base_salary: s.base_salary || 0,
          meal_allowance: s.meal_allowance || 0,
          night_duty_allowance: s.night_duty_allowance || 0,
          vehicle_allowance: s.vehicle_allowance || 0,
          childcare_allowance: s.childcare_allowance || 0,
          research_allowance: s.research_allowance || 0,
          other_taxfree: s.other_taxfree || 0,
          extra_allowance: Number(s.overtime_allowance || 0) + Number(s.night_work_allowance || 0) + Number(s.holiday_work_allowance || 0) + Number(s.annual_leave_pay || 0),
          overtime_pay: 0,
          bonus: 0,
          apply_tax: (s.permissions?.insurance as Record<string, unknown>)?.income_tax !== false,
          apply_insurance: (s.permissions?.insurance as Record<string, unknown>)?.national !== false,
          attendance_deduction: total,
          attendance_deduction_detail: { ...detail, original_deduction: total },
          custom_deduction: 0,
          dependent_count:
            Number(
              s.dependent_count ??
              (s.permissions?.payroll as Record<string, unknown>)?.dependent_count ??
              (s.permissions?.tax as Record<string, unknown>)?.dependent_count ??
              s.permissions?.dependents ??
              0
            ) || 0,
          child_count_8_20:
            Number(
              (s as Record<string, unknown>).child_count_8_20 ??
              (s.permissions?.payroll as Record<string, unknown>)?.child_count_8_20 ??
              (s.permissions?.tax as Record<string, unknown>)?.child_count_8_20 ??
              0
            ) || 0,
          withholding_rate_percent: normalizeWithholdingRatePercent(
            ((s as Record<string, unknown>).withholding_rate_percent ??
              (s.permissions?.payroll as Record<string, unknown>)?.withholding_rate_percent ??
              (s.permissions?.tax as Record<string, unknown>)?.withholding_rate_percent ??
              100) as number | string | null | undefined
          ),
          advance_pay: 0,
        };
      });
      setSettlementData(initialData);
      setStep(2);
    } catch (e) {
      console.error(e);
      toast('근태 데이터 로드 실패', 'error');
    } finally {
      setLoading(false);
    }
  };

  const updateData = (id: string, field: string, value: any) => {
    setSettlementData((prev) => {
      const current = prev[id];
      if (!current) return prev;

      const nextEntry = { ...current, [field]: value } as SettlementEntry;

      if (field === 'dependent_count') {
        const nextDependentCount = Math.max(0, parseInt(String(value), 10) || 0);
        nextEntry.dependent_count = nextDependentCount;
        if ((nextEntry.child_count_8_20 || 0) > nextDependentCount) {
          nextEntry.child_count_8_20 = nextDependentCount;
        }
      }

      if (field === 'child_count_8_20') {
        nextEntry.child_count_8_20 = Math.min(
          Math.max(0, parseInt(String(value), 10) || 0),
          Math.max(0, Number(nextEntry.dependent_count) || 0),
        );
      }

      if (field === 'withholding_rate_percent') {
        nextEntry.withholding_rate_percent = normalizeWithholdingRatePercent(value);
      }

      return {
        ...prev,
        [id]: nextEntry,
      };
    });
  };

  const calculateSalary = (id: string) => {
    const data = settlementData[id];
    if (!data) {
      return {
        taxable: 0,
        taxfree: 0,
        total: 0,
        deduction: 0,
        deductionDetail: {},
        attendance_deduction: 0,
        net: 0,
      };
    }
    const hasExactWithholdingTable = hasExactIncomeTaxBracket(taxInsuranceRates);

    // 비과세 한도 체크 및 과세 전환 계산
    const meal_tf = Math.min(Number(data.meal_allowance), TAX_FREE_LIMITS.meal);
    const meal_taxable = Math.max(0, Number(data.meal_allowance) - TAX_FREE_LIMITS.meal);

    const vehicle_tf = Math.min(Number(data.vehicle_allowance), TAX_FREE_LIMITS.vehicle);
    const vehicle_taxable = Math.max(0, Number(data.vehicle_allowance) - TAX_FREE_LIMITS.vehicle);

    const childcare_tf = Math.min(Number(data.childcare_allowance), TAX_FREE_LIMITS.childcare);
    const childcare_taxable = Math.max(0, Number(data.childcare_allowance) - TAX_FREE_LIMITS.childcare);

    const nightDuty = Number(data.night_duty_allowance) || 0;

    const research_tf = Math.min(Number(data.research_allowance), TAX_FREE_LIMITS.research);
    const research_taxable = Math.max(0, Number(data.research_allowance) - TAX_FREE_LIMITS.research);

    const total_taxfree = meal_tf + vehicle_tf + childcare_tf + research_tf + nightDuty + Number(data.other_taxfree);

    // 과세 대상: 기본급 + 한도초과 비과세분 + 연장수당 + 상여 + 기타수당 - 근태차감
    const attendance_deduction = Number(data.attendance_deduction) || 0;
    const total_taxable = Number(data.base_salary) + meal_taxable + vehicle_taxable + childcare_taxable + research_taxable +
      Number(data.overtime_pay) + Number(data.bonus) + Number(data.extra_allowance) - attendance_deduction;

    const total_payment = total_taxable + total_taxfree;

    // 직원별 보험/복지 설정 가져오기 (Duru-nuri, Medical Benefit 등)
    const staff = staffs.find((s: StaffMember) => String(s.id) === String(id));
    const insSettings = (staff?.permissions?.insurance as Record<string, unknown>) || {};
    const isMedicalBenefit = Boolean(staff?.permissions?.is_medical_benefit) || false;

    // 두루누리 적용 여부 판단 (기간 체크)
    let isDuruNuriActive = Boolean(insSettings.duru_nuri) || false;
    if (isDuruNuriActive && insSettings.duru_nuri_start && insSettings.duru_nuri_end) {
      const current = yearMonth; // "YYYY-MM"
      isDuruNuriActive = (current >= String(insSettings.duru_nuri_start) && current <= String(insSettings.duru_nuri_end));
    }

    // 공제 상세: 4대보험은 저장된 연도별 요율을 사용합니다.
    let national_pension = 0, health_insurance = 0, long_term_care = 0, employment_insurance = 0, income_tax = 0, local_tax = 0;
    if (data.apply_insurance) {
      // 1. 국민연금 - 두루누리 80% 지원 적용 시 20%만 부과
      const full_national = Math.floor(total_taxable * taxInsuranceRates.national_pension_rate);
      national_pension = isDuruNuriActive ? Math.floor(full_national * 0.2) : full_national;

      // 2. 건강보험 - 의료급여 수급자는 제외(0원)
      if (!isMedicalBenefit) {
        health_insurance = Math.floor(total_taxable * taxInsuranceRates.health_insurance_rate);
        // 장기요양보험 = 건강보험료 × 12.95% (2026년 법적 기준, 국민건강보험법 시행령)
        long_term_care = Math.floor(health_insurance * 0.1295);
      }

      // 3. 고용보험 - 두루누리 80% 지원 적용 시 20%만 부과
      const full_employment = Math.floor(total_taxable * taxInsuranceRates.employment_insurance_rate);
      employment_insurance = isDuruNuriActive ? Math.floor(full_employment * 0.2) : full_employment;
    }
    const dependentCount = Math.max(0, Number(data.dependent_count) || 0);
    const qualifyingChildCount = Math.min(dependentCount, Math.max(0, Number(data.child_count_8_20) || 0));
    const withholdingRatePercent = normalizeWithholdingRatePercent(data.withholding_rate_percent);
    const baselineIncomeTax = calculateMonthlyIncomeTax(total_taxable, taxInsuranceRates, 0, {
      withholdingRatePercent: 100,
      qualifyingChildCount: 0,
    });
    const familyAdjustedIncomeTax = calculateMonthlyIncomeTax(total_taxable, taxInsuranceRates, dependentCount, {
      withholdingRatePercent: 100,
      qualifyingChildCount: 0,
    });
    const preRatioIncomeTax = calculateMonthlyIncomeTax(total_taxable, taxInsuranceRates, dependentCount, {
      withholdingRatePercent: 100,
      qualifyingChildCount,
    });
    const exactIncomeTax = calculateMonthlyIncomeTax(total_taxable, taxInsuranceRates, dependentCount, {
      withholdingRatePercent,
      qualifyingChildCount,
    });
    const dependentTaxCredit = hasExactWithholdingTable
      ? Math.max(0, baselineIncomeTax - familyAdjustedIncomeTax)
      : dependentCount * 12500;
    const childTaxCredit = hasExactWithholdingTable
      ? Math.max(0, familyAdjustedIncomeTax - preRatioIncomeTax)
      : calculateQualifyingChildTaxCredit(qualifyingChildCount);
    if (data.apply_tax && hasExactWithholdingTable) {
      income_tax = Math.max(0, exactIncomeTax);
      local_tax = Math.floor(income_tax * 0.1 / 10) * 10; // 지방소득세 10%, 10원 단위 절사 (국고금관리법 제47조)
    }
    const custom_deduction = Number(data.custom_deduction) || 0;
    const deduction = national_pension + health_insurance + long_term_care + employment_insurance + income_tax + local_tax + custom_deduction;
    const deductionDetail = {
      national_pension,
      health_insurance,
      long_term_care,
      employment_insurance,
      income_tax,
      local_tax,
      custom_deduction,
      dependent_count: dependentCount,
      child_count_8_20: qualifyingChildCount,
      withholding_rate_percent: withholdingRatePercent,
      dependent_tax_credit: dependentTaxCredit,
      child_tax_credit: childTaxCredit,
      income_tax_before_withholding_ratio: preRatioIncomeTax,
      is_duru_nuri: isDuruNuriActive,
      is_medical_benefit: isMedicalBenefit,
      tax_estimated: data.apply_tax && !hasExactWithholdingTable,
      missing_monthly_withholding_table: data.apply_tax && !hasExactWithholdingTable,
    };

    return {
      taxable: total_taxable,
      taxfree: total_taxfree,
      total: total_payment,
      deduction,
      deductionDetail,
      attendance_deduction,
      net: total_payment - deduction
    };
  };

  const handleFinalize = async () => {
    if (!confirm(`${selectedStaffs.length}명의 급여 정산을 확정하고 명세서를 생성하시겠습니까?`)) return;

    const needsExactIncomeTax = selectedStaffs.some((staff: StaffMember) => settlementData[staff.id]?.apply_tax);
    if (needsExactIncomeTax && !hasExactIncomeTaxBracket(taxInsuranceRates)) {
      toast('근로소득세 간이세액표가 설정되지 않아 급여를 안전하게 확정할 수 없습니다.\n\n' +
        '세율·보험요율 관리에서 income_tax_bracket을 먼저 설정한 뒤 다시 진행해 주세요.');
      return;
    }

    if (hasBlockingVerificationIssues) {
      toast(`검산 리포트에 오류 ${verificationReport.errorCount}건이 있어 확정할 수 없습니다.`, 'error');
      return;
    }

    setLoading(true);
    try {
      const advancePayAmount = (id: string) => Number(settlementData[id]?.advance_pay) || 0;
      const records = selectedStaffs.map(s => {
        const data = settlementData[s.id];
        const advancePay = advancePayAmount(s.id);
        const isAdvanceOnly = advancePay > 0;
        const calc = isAdvanceOnly ? null : calculateSalary(s.id);
        return {
          staff_id: s.id,
          year_month: yearMonth,
          base_salary: data.base_salary,
          meal_allowance: data.meal_allowance,
          night_duty_allowance: data.night_duty_allowance ?? 0,
          vehicle_allowance: data.vehicle_allowance,
          childcare_allowance: data.childcare_allowance,
          research_allowance: data.research_allowance,
          other_taxfree: data.other_taxfree,
          extra_allowance: data.extra_allowance,
          overtime_pay: data.overtime_pay,
          bonus: data.bonus,
          total_taxable: isAdvanceOnly ? 0 : calc!.taxable,
          total_taxfree: isAdvanceOnly ? 0 : calc!.taxfree,
          total_deduction: isAdvanceOnly ? 0 : calc!.deduction,
          deduction_detail: isAdvanceOnly ? {} : (calc!.deductionDetail || {}),
          net_pay: isAdvanceOnly ? advancePay : calc!.net,
          attendance_deduction: data.attendance_deduction || 0,
          attendance_deduction_detail: data.attendance_deduction_detail || {},
          advance_pay: advancePay,
          record_type: 'regular',
          status: '확정'
        };
      });

      const { error: payrollSaveError } = await supabase.from('payroll_records').upsert(records, { onConflict: 'staff_id,year_month' });
      if (payrollSaveError) throw payrollSaveError;
      const u = typeof window !== 'undefined' ? (() => { try { return JSON.parse(localStorage.getItem('erp_user') || '{}'); } catch { return {}; } })() : {};
      try {
        await logAudit(
          '급여수정',
          'payroll',
          yearMonth,
          {
            count: records.length,
            total: records.reduce((sum: number, record: any) => sum + (Number(record.net_pay) || 0), 0),
            year_month: yearMonth,
            records: records.map((record: any) => {
              const staff = selectedStaffs.find((candidate: any) => candidate.id === record.staff_id);
              return {
                staff_id: record.staff_id,
                staff_name: staff?.name || '-',
                employee_no: staff?.employee_no || null,
                company: staff?.company || '',
                department: staff?.department || '',
                base_salary: record.base_salary,
                total_taxable: record.total_taxable,
                total_taxfree: record.total_taxfree,
                total_deduction: record.total_deduction,
                attendance_deduction: record.attendance_deduction,
                advance_pay: record.advance_pay,
                net_pay: record.net_pay,
              };
            }),
          },
          u.id,
          u.name
        );
      } catch (auditError) {
        console.error('payroll audit log failed:', auditError);
      }

      toast("급여 정산 및 명세서 생성이 완료되었습니다. 법적 비과세 한도가 자동 적용되었습니다.", 'success');
      setStep(3);
      if (onRefresh) onRefresh();
    } catch (err) {
      const message = formatPayrollMutationError(err);
      console.error('payroll finalize failed:', {
        message,
        error: err,
        yearMonth,
        staffIds: selectedStaffs.map((staff: StaffMember) => staff.id),
      });
      toast(`정산 처리 중 오류가 발생했습니다. ${message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const verificationRows = selectedStaffs.map((staff: StaffMember) => {
    const data = settlementData[staff.id];
    const advancePay = Number(data?.advance_pay) || 0;
    const isAdvanceOnly = advancePay > 0;
    const calc = isAdvanceOnly ? null : calculateSalary(staff.id);
    return {
      staffId: staff.id,
      staffName: staff.name,
      companyName: staff.company,
      grossPay: isAdvanceOnly ? advancePay : Number(calc?.total || 0),
      taxablePay: isAdvanceOnly ? 0 : Number(calc?.taxable || 0),
      taxFreePay: isAdvanceOnly ? 0 : Number(calc?.taxfree || 0),
      deductionTotal: isAdvanceOnly ? 0 : Number(calc?.deduction || 0),
      netPay: isAdvanceOnly ? advancePay : Number(calc?.net || 0),
      customDeduction: Number(data?.custom_deduction || 0),
      attendanceDeduction: Number(data?.attendance_deduction || 0),
      advancePay,
      baseSalary: Number(data?.base_salary || 0),
      applyTax: data?.apply_tax !== false,
      exactTaxConfigured: hasExactIncomeTaxBracket(taxInsuranceRates),
      bankName: String(staff.bank_name || ''),
      bankAccount: String(staff.bank_account || ''),
    };
  });
  const verificationReport = buildPayrollVerificationReport(verificationRows, {
    requireExactTaxTable: selectedStaffs.some((staff: StaffMember) => settlementData[staff.id]?.apply_tax),
  });
  const hasBlockingVerificationIssues = verificationReport.errorCount > 0;

  return (
    <div className="bg-[var(--card)] rounded-[var(--radius-md)] border border-[var(--border)] shadow-sm overflow-hidden animate-in fade-in duration-300" data-testid="salary-settlement-view">
      <div className="bg-[var(--page-bg)] border-b border-[var(--border)] px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-[var(--foreground)]">급여 정산</h2>
          <p className="text-xs text-[var(--toss-gray-3)] mt-0.5">법적 비과세 한도 자동 반영</p>
        </div>
        <div className="flex border border-[var(--border)] rounded-[var(--radius-md)] p-0.5 bg-[var(--card)]">
          {[
            { step: 1, label: '대상 선택' },
            { step: 2, label: '수당·공제' },
            { step: 3, label: '완료' },
          ].map(({ step: s, label }) => (
            <div key={s} className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${step === s ? 'bg-[var(--accent)] text-white' : step > s ? 'text-[var(--accent)]' : 'text-[var(--toss-gray-3)]'}`}>
              {s}. {label}
            </div>
          ))}
        </div>
      </div>

      <div className="p-4">
        {step === 1 && (
          <div className="space-y-5">
            {!hasExactIncomeTaxBracket(taxInsuranceRates) && (
              <div data-testid="salary-settlement-missing-tax-warning" className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-sm font-bold text-amber-800">주의: 근로소득세 간이세액표가 설정되지 않았습니다.</p>
                <p className="mt-1 text-xs font-medium text-amber-700">
                  보험요율은 반영되지만, 소득세는 운영 확정에 사용할 수 없습니다. 정확한 세액표를 먼저 입력해야 합니다.
                </p>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <label className="text-sm text-[var(--toss-gray-4)]">정산 월</label>
                <input data-testid="salary-settlement-month-input" type="month" value={yearMonth} onChange={e => setYearMonth(e.target.value)} className="h-9 px-3 border border-[var(--border)] rounded-md text-sm font-medium" />
              </div>
              <p className="text-sm text-[var(--toss-gray-3)]">정산 대상을 선택하세요. (근태 자동 반영)</p>
              <button data-testid="salary-settlement-select-all" onClick={() => setSelectedStaffs(filteredStaffs)} className="text-sm font-medium text-[var(--accent)] hover:underline">전체 선택</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[380px] overflow-y-auto custom-scrollbar">
              {filteredStaffs.map((s: StaffMember) => (
                <div
                  key={s.id}
                  data-testid={`salary-settlement-staff-${s.id}`}
                  onClick={() => toggleStaff(s)}
                  className={`p-4 rounded-[var(--radius-md)] border cursor-pointer transition-colors flex items-center gap-3 ${selectedStaffs.find(ts => ts.id === s.id) ? 'border-[var(--accent)] bg-[var(--toss-blue-light)]/70 ring-1 ring-[var(--accent)]/30' : 'border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)]'
                    }`}
                >
                  <div className="w-10 h-10 rounded-[var(--radius-md)] bg-[var(--tab-bg)] flex items-center justify-center text-sm font-semibold text-[var(--accent)]">{s.name[0]}</div>
                  <div>
                    <p className="text-sm font-medium text-[var(--foreground)]">{s.name}</p>
                    <p className="text-xs text-[var(--toss-gray-3)]">기본급 ₩{(s.base_salary || 0).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
            <button data-testid="salary-settlement-next-button" onClick={handleNextStep} disabled={loading} className="w-full py-3.5 bg-[var(--accent)] text-white text-sm font-semibold rounded-[var(--radius-md)] hover:opacity-90 transition-colors disabled:opacity-50">{loading ? '로딩 중...' : '다음: 수당 설정 및 정산'}</button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            {!hasExactIncomeTaxBracket(taxInsuranceRates) && (
              <div data-testid="salary-settlement-finalize-block-warning" className="rounded-[var(--radius-md)] border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-sm font-bold text-red-700">급여 확정 차단: 정확한 근로소득세표가 없습니다.</p>
                <p className="mt-1 text-xs font-medium text-red-600">
                  보험요율은 적용되지만, 소득세는 아직 근사 계산입니다. 세액표가 설정되기 전에는 저장을 막습니다.
                </p>
              </div>
            )}
            <div className="max-h-[500px] overflow-y-auto space-y-4 p-2 custom-scrollbar">
              {selectedStaffs.map((s: StaffMember) => {
                const data = settlementData[s.id] || {
                  base_salary: Number(s.base_salary || 0),
                  meal_allowance: Number(s.meal_allowance || 0),
                  night_duty_allowance: Number((s as any).night_duty_allowance || 0),
                  vehicle_allowance: Number((s as any).vehicle_allowance || 0),
                  childcare_allowance: Number((s as any).childcare_allowance || 0),
                  research_allowance: Number((s as any).research_allowance || 0),
                  other_taxfree: 0,
                  extra_allowance: 0,
                  overtime_pay: 0,
                  bonus: 0,
                  custom_deduction: 0,
                  attendance_deduction: 0,
                  attendance_deduction_detail: {},
                  dependent_count: 0,
                  child_count_8_20: 0,
                  withholding_rate_percent: 100,
                  advance_pay: 0,
                  apply_tax: true,
                  apply_insurance: true,
                };
                const advancePay = Number(data?.advance_pay) || 0;
                const isAdvanceOnly = advancePay > 0;
                const res = isAdvanceOnly ? { net: advancePay, taxable: 0, taxfree: 0 } : calculateSalary(s.id);
                return (
                  <div key={s.id} data-testid={`salary-settlement-card-${s.id}`} className="p-4 bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] shadow-sm space-y-4 hover:border-[var(--accent)] transition-all">
                    <div className="flex justify-between items-center border-b border-[var(--muted)] pb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-[var(--toss-blue-light)] flex items-center justify-center text-xs font-bold text-[var(--accent)]">{s.name[0]}</div>
                        <div>
                          <p className="text-sm font-bold text-[var(--foreground)] leading-none">{s.name}</p>
                          <p className="text-[10px] text-[var(--toss-gray-3)] mt-1">{s.company} · {s.department}</p>
                        </div>
                        {isAdvanceOnly && <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-bold rounded">선지급</span>}
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-[var(--toss-gray-3)] font-bold">합계 예상 실지급액</p>
                        <p className="text-lg font-black text-[var(--accent)]">₩ {res.net.toLocaleString()}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-[var(--toss-gray-4)] ml-1">과세·기본급</label>
                        <input type="text" value={Number(data.base_salary).toLocaleString()} readOnly className="w-full h-8 px-3 bg-[var(--muted)] border-none rounded-lg text-xs font-bold text-[var(--toss-gray-4)]" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-[var(--accent)] ml-1">수당 합계(고정포함)</label>
                        <input type="text" value={Number(data.extra_allowance).toLocaleString()} onChange={(e) => updateData(s.id, 'extra_allowance', parseInt(e.target.value.replace(/,/g, '')) || 0)} className="w-full h-8 px-3 border border-[var(--border)] rounded-lg text-xs font-bold focus:ring-2 focus:ring-[var(--accent)]/20 outline-none" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-[var(--toss-gray-4)] ml-1">야간/당직 (비과세)</label>
                        <input type="text" value={Number(data.night_duty_allowance).toLocaleString()} onChange={(e) => updateData(s.id, 'night_duty_allowance', parseInt(e.target.value.replace(/,/g, '')) || 0)} className="w-full h-8 px-3 border border-[var(--border)] rounded-lg text-xs font-bold outline-none" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-[var(--toss-gray-4)] ml-1">연장/상여</label>
                        <input type="text" value={(Number(data.overtime_pay) + Number(data.bonus)).toLocaleString()} onChange={(e) => updateData(s.id, 'overtime_pay', parseInt(e.target.value.replace(/,/g, '')) || 0)} className="w-full h-8 px-3 border border-[var(--border)] rounded-lg text-xs font-bold outline-none" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-orange-600 ml-1">근태/기타차감</label>
                        <input type="text" value={Number(data.attendance_deduction).toLocaleString()} readOnly className="w-full h-8 px-3 border border-orange-200 bg-orange-50/30 rounded-lg text-xs font-bold text-orange-700 outline-none" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-amber-600 ml-1">선지급(차감)</label>
                        <input type="text" value={Number(data.advance_pay).toLocaleString()} onChange={(e) => updateData(s.id, 'advance_pay', parseInt(e.target.value.replace(/,/g, '')) || 0)} className="w-full h-8 px-3 border border-amber-200 bg-amber-50/30 rounded-lg text-xs font-bold text-amber-700 outline-none" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-emerald-700 ml-1">부양가족/인적공제</label>
                        <input
                          data-testid={`salary-settlement-dependent-count-${s.id}`}
                          type="number"
                          min={0}
                          max={10}
                          value={Number(data.dependent_count) || 0}
                          onChange={(e) => updateData(s.id, 'dependent_count', Math.max(0, parseInt(e.target.value, 10) || 0))}
                          className="w-full h-8 px-3 border border-emerald-200 bg-emerald-50/30 rounded-lg text-xs font-bold text-emerald-700 outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-emerald-700 ml-1">8~20세 자녀수</label>
                        <input
                          data-testid={`salary-settlement-child-count-${s.id}`}
                          type="number"
                          min={0}
                          max={Number(data.dependent_count) || 0}
                          value={Number(data.child_count_8_20) || 0}
                          onChange={(e) => updateData(s.id, 'child_count_8_20', e.target.value)}
                          className="w-full h-8 px-3 border border-emerald-200 bg-emerald-50/30 rounded-lg text-xs font-bold text-emerald-700 outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-sky-700 ml-1">원천징수 비율</label>
                        <select
                          data-testid={`salary-settlement-withholding-rate-${s.id}`}
                          value={Number(data.withholding_rate_percent) || 100}
                          onChange={(e) => updateData(s.id, 'withholding_rate_percent', parseInt(e.target.value, 10) || 100)}
                          className="w-full h-8 px-3 border border-sky-200 bg-sky-50/30 rounded-lg text-xs font-bold text-sky-700 outline-none"
                        >
                          <option value={80}>80%</option>
                          <option value={100}>100%</option>
                          <option value={120}>120%</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-orange-600 ml-1">기타 추가차감</label>
                        <input
                          data-testid={`salary-settlement-custom-deduction-${s.id}`}
                          type="text"
                          value={Number(data.custom_deduction).toLocaleString()}
                          onChange={(e) => updateData(s.id, 'custom_deduction', parseInt(e.target.value.replace(/,/g, '')) || 0)}
                          className="w-full h-8 px-3 border border-orange-200 bg-orange-50/30 rounded-lg text-xs font-bold text-orange-700 outline-none"
                        />
                      </div>
                      <div className="col-span-2 flex items-center justify-between bg-[var(--muted)] px-4 py-2 rounded-xl mt-1">
                        <div className="flex gap-4">
                          <span className="text-[10px] font-bold text-[var(--toss-gray-3)] uppercase">과세: ₩{res.taxable.toLocaleString()}</span>
                          <span className="text-[10px] font-bold text-[var(--toss-gray-3)] uppercase">비과세: ₩{res.taxfree.toLocaleString()}</span>
                          <span className="text-[10px] font-bold text-[var(--toss-gray-3)] uppercase">자동 근태차감: ₩{Number(data.attendance_deduction || 0).toLocaleString()}</span>
                        </div>
                        <div className="flex gap-2">
                          {data.attendance_deduction > 0 && (
                            <button onClick={() => updateData(s.id, 'attendance_deduction', 0)} className="text-[9px] font-bold text-emerald-600 bg-[var(--card)] px-2 py-0.5 rounded shadow-sm border border-emerald-100">근태차감 면제</button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--foreground)]">검산 리포트</p>
                  <p className="text-xs text-[var(--toss-gray-3)]">
                    오류 {verificationReport.errorCount}건 · 경고 {verificationReport.warningCount}건 · 참고 {verificationReport.infoCount}건
                  </p>
                </div>
                <div className="text-right text-xs text-[var(--toss-gray-3)]">
                  <p>실지급 합계 ₩{verificationReport.netTotal.toLocaleString()}</p>
                  <p>총 공제 ₩{verificationReport.deductionTotal.toLocaleString()}</p>
                </div>
              </div>
              {verificationReport.issues.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {verificationReport.issues.slice(0, 6).map((issue, index) => (
                    <div
                      key={`${issue.code}-${issue.staffId || 'common'}-${index}`}
                      className={`rounded-lg px-3 py-2 text-xs ${
                        issue.level === 'error'
                          ? 'border border-rose-200 bg-rose-50 text-rose-700'
                          : issue.level === 'warning'
                            ? 'border border-amber-200 bg-amber-50 text-amber-700'
                            : 'border border-sky-200 bg-sky-50 text-sky-700'
                      }`}
                    >
                      {issue.message}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                  검산 결과 치명적인 오류 없이 정산을 진행할 수 있습니다.
                </p>
              )}
            </div>
            <div className="flex gap-3 pt-2">
              <button data-testid="salary-settlement-back-button" onClick={() => setStep(1)} className="flex-1 py-3 bg-[var(--card)] border border-[var(--border)] text-[var(--toss-gray-4)] text-sm font-medium rounded-[var(--radius-md)] hover:bg-[var(--muted)]">이전</button>
              <button data-testid="salary-settlement-finalize-button" onClick={handleFinalize} disabled={loading || !hasExactIncomeTaxBracket(taxInsuranceRates) || hasBlockingVerificationIssues} className="flex-[2] py-3 bg-[var(--accent)] text-white text-sm font-semibold rounded-[var(--radius-md)] hover:opacity-90 disabled:opacity-50">
                {loading ? '처리 중...' : '저장하기 · 정산 확정'}
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div data-testid="salary-settlement-complete-step" className="py-10 text-center space-y-5 animate-in fade-in duration-300">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-3xl mx-auto">✓</div>
            <h3 className="text-xl font-bold text-[var(--foreground)]">정산이 완료되었습니다</h3>
            <p className="text-sm text-[var(--toss-gray-3)]">명세서가 생성되었습니다. 대장에서 확인하세요.</p>
            <button onClick={() => setStep(1)} className="px-4 py-2.5 bg-[var(--accent)] text-white text-sm font-medium rounded-[var(--radius-md)] hover:opacity-90">다시 정산하기</button>
          </div>
        )}
      </div>
    </div>
  );
}
