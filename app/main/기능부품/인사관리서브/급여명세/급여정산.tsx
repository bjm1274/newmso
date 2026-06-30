'use client';
import { toast } from '@/lib/toast';
import { getKoreanMonthString } from '@/lib/seoul-time';
import { KOREAN_PUBLIC_HOLIDAY_DATES } from '@/lib/korean-public-holidays';
import type { StaffMember } from '@/types';
import { useEffect, useState } from 'react';
import { db } from '@/lib/db-client';
import { withMissingColumnsFallback } from '@/lib/db-compat';
import { STORAGE_KEYS } from '@/lib/storage-keys';
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
  type TaxInsuranceRates } from '@/lib/use-tax-insurance-rates';
import { buildPayrollVerificationReport } from '@/lib/payroll-governance';
import {
  buildShiftBoundary,
  buildFallbackShiftBoundary,
  calculateEarlyLeaveMinutes,
  buildDateWithTime } from '../../마이페이지/출퇴근기록/checkin-utils';
import { decideCheckInStatus } from '../../마이페이지/출퇴근기록/late-status';
import { upsertPayrollRecordsWithFallback } from '@/lib/payroll-record-upsert';
import { NP_INCOME_CEILING, NP_INCOME_FLOOR, NIGHT_DUTY_TAX_FREE_LIMIT } from '@/lib/tax-free-limits';
import { calcStatutoryDeductions } from '@/lib/payroll-deductions';
import { getPayrollInsuranceSettings, resolvePayrollAsOfDate, hasAnyEmployeePayrollInsurance } from '@/lib/payroll-insurance-settings';
import RiskActionDialog from '../RiskActionDialog';
import type {
  SettlementEntry,
  TaxableAllowanceBreakdown,
  SalaryAmountField,
  SalaryChangeHistoryRow,
  SalaryChangeProrationSummary,
  SavedPayrollRecord } from './급여정산-types';
import {
  PAYROLL_RECORD_OPTIONAL_COLUMNS,
  PAYROLL_RECORD_LOAD_OPTIONAL_COLUMNS,
  EMPTY_TAXABLE_ALLOWANCE_BREAKDOWN,
  getRegularHourlyRate,
  getTaxableAllowanceBreakdownTotal,
  getStaffTaxableAllowanceBreakdown,
  normalizeTaxableAllowanceBreakdown,
  resolveSalaryAmountForSettlement,
  fetchSalaryChangeHistoryForMonth,
  getEmploymentProratedBaseForMonth } from './급여정산-utils';
import { Step1TargetSelection } from './급여정산-Step1TargetSelection';
import { SettlementStaffCard } from './급여정산-SettlementStaffCard';
import { VerificationReportPanel } from './급여정산-VerificationReportPanel';
import { Step3Complete } from './급여정산-Step3Complete';
import { isActiveStaff } from '@/lib/active-staff';

export default function SalarySettlement({
  staffs,
  selectedCo,
  onRefresh,
  initialStep = 1 }: {
  staffs: StaffMember[];
  selectedCo: string;
  onRefresh?: () => void;
  initialStep?: number;
}) {
  const [step, setStep] = useState(initialStep);
  const [yearMonth, setYearMonth] = useState(getKoreanMonthString());
  const [selectedStaffs, setSelectedStaffs] = useState<StaffMember[]>([]);
  const [showFinalizeReview, setShowFinalizeReview] = useState(false);
  const [settlementData, setSettlementData] = useState<Record<string, SettlementEntry>>({});
  const [loading, setLoading] = useState(false);
  const [taxFreeLimits, setTaxFreeLimits] = useState<TaxFreeSettings>(DEFAULT_SETTINGS);
  const [taxInsuranceRates, setTaxInsuranceRates] = useState<TaxInsuranceRates>(DEFAULT_TAX_INSURANCE_RATES);
  const [savedRecordsByStaff, setSavedRecordsByStaff] = useState<Record<string, SavedPayrollRecord>>({});
  const [salaryChangesByStaff, setSalaryChangesByStaff] = useState<Record<string, SalaryChangeHistoryRow[]>>({});
  // 회사 급여기준의 원천징수 비율(단일 기본값) — 요청 #4
  const [companyWithholdingRate, setCompanyWithholdingRate] = useState<number>(100);
  const [isLocked, setIsLocked] = useState(false);

  // 마감 잠금 여부 조회
  useEffect(() => {
    let ok = true;
    (async () => {
      try {
        const { data: lockRows } = await db
          .from('payroll_locks')
          .select('company_name')
          .eq('year_month', yearMonth);
        if (ok) {
          if (Array.isArray(lockRows) && lockRows.length > 0) {
            if (selectedCo === '전체') {
              setIsLocked(true);
            } else {
              setIsLocked(lockRows.some((row: any) => row.company_name === '전체' || row.company_name === selectedCo));
            }
          } else {
            setIsLocked(false);
          }
        }
      } catch (e) {
        console.warn('Failed to check lock state:', e);
        if (ok) setIsLocked(false);
      }
    })();
    return () => { ok = false; };
  }, [selectedCo, yearMonth]);

  // initialStep이 변경되면 step도 업데이트
  useEffect(() => {
    setStep(initialStep);
  }, [initialStep]);

  // initialStep이 2이고 selectedStaffs가 비어있을 때, 필터링된 모든 직원을 자동 선택하도록 처리
  useEffect(() => {
    if (initialStep === 2 && selectedStaffs.length === 0 && staffs.length > 0) {
      const activeStaffs = staffs.filter((s: StaffMember) => {
        if (selectedCo !== '전체' && s.company !== selectedCo) return false;
        
        const isRetired = !isActiveStaff(s);
        if (isRetired) {
          const resignDate = s.resigned_at || s.resign_date;
          if (typeof resignDate === 'string' && resignDate.trim()) {
            const resignMonth = resignDate.trim().slice(0, 7);
            if (resignDate.trim().endsWith('-01')) {
              const [y, m] = resignMonth.split('-').map(Number);
              const prevMonth = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
              if (prevMonth !== yearMonth) return false;
            } else {
              if (resignMonth !== yearMonth) return false;
            }
          } else {
            return false;
          }
        }
        return true;
      });
      setSelectedStaffs(activeStaffs);
    }
  }, [initialStep, staffs, selectedCo, yearMonth]);

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

  // 회사 급여기준(company_payroll_policies)의 '원천징수 비율'을 정산 단일 기본값으로 로드 (요청 #4)
  useEffect(() => {
    let ok = true;
    (async () => {
      try {
        const scope = selectedCo && selectedCo !== '전체' ? [selectedCo, '전체'] : ['전체'];
        const { data } = await db
          .from('company_payroll_policies')
          .select('company_name, rule_value')
          .eq('rule_label', '원천징수 비율')
          .in('company_name', scope);
        if (!ok) return;
        const rows = Array.isArray(data) ? (data as { company_name?: string; rule_value?: string }[]) : [];
        const chosen = rows.find((r) => r.company_name === selectedCo) || rows.find((r) => r.company_name === '전체');
        const parsed = chosen ? parseInt(String(chosen.rule_value ?? '').replace(/[^\d]/g, ''), 10) : NaN;
        setCompanyWithholdingRate(Number.isFinite(parsed) && parsed > 0 ? parsed : 100);
      } catch {
        if (ok) setCompanyWithholdingRate(100);
      }
    })();
    return () => { ok = false; };
  }, [selectedCo]);

  const TAX_FREE_LIMITS = {
    meal: taxFreeLimits.meal_limit,
    vehicle: taxFreeLimits.vehicle_limit,
    childcare: taxFreeLimits.childcare_limit,
    research: taxFreeLimits.research_limit };

  const filteredStaffs = staffs.filter((s: StaffMember) => {
    if (selectedCo !== '전체' && s.company !== selectedCo) return false;
    
    const isRetired = !isActiveStaff(s);
    if (isRetired) {
      const resignDate = s.resigned_at || s.resign_date;
      if (typeof resignDate === 'string' && resignDate.trim()) {
        const resignMonth = resignDate.trim().slice(0, 7);
        // 만약 퇴사일이 정산월의 1일이면, 실제 마지막 근무일은 이전 달의 말일이므로 이전 달 정산 대상입니다.
        if (resignDate.trim().endsWith('-01')) {
          const [y, m] = resignMonth.split('-').map(Number);
          const prevMonth = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
          if (prevMonth !== yearMonth) return false;
        } else {
          if (resignMonth !== yearMonth) return false;
        }
      } else {
        return false;
      }
    }
    
    return true;
  });

  useEffect(() => {
    let active = true;
    (async () => {
      const staffIds = filteredStaffs.map((staff) => String(staff.id));
      if (staffIds.length === 0) {
        if (active) setSavedRecordsByStaff({});
        return;
      }

      const requiredColumns = ['staff_id', 'year_month', 'base_salary', 'extra_allowance', 'overtime_pay', 'bonus'];
      const { data, error } = await withMissingColumnsFallback(
        (omittedColumns) => {
          const selectColumns = [
            ...requiredColumns,
            ...PAYROLL_RECORD_LOAD_OPTIONAL_COLUMNS.filter((column) => !omittedColumns.has(column)),
          ].join(', ');
          return db
            .from('payroll_records')
            .select(selectColumns)
            .eq('year_month', yearMonth)
            .in('staff_id', staffIds);
        },
        [...PAYROLL_RECORD_LOAD_OPTIONAL_COLUMNS],
      );

      if (!active) return;

      if (error) {
        console.error('saved payroll records load failed:', error);
        setSavedRecordsByStaff({});
        return;
      }

      const nextMap = Object.fromEntries(
        ((data || []) as unknown as SavedPayrollRecord[])
          .filter((record) => !record.record_type || record.record_type === 'regular')
          .map((record) => [String(record.staff_id), record]),
      );
      setSavedRecordsByStaff(nextMap);
    })();

    return () => {
      active = false;
    };
  }, [staffs, selectedCo, yearMonth]);

  const toggleStaff = (staff: StaffMember) => {
    if (selectedStaffs.find(s => s.id === staff.id)) {
      setSelectedStaffs(selectedStaffs.filter(s => s.id !== staff.id));
    } else {
      setSelectedStaffs([...selectedStaffs, staff]);
    }
  };

  const getSavedDeductionDetail = (savedRecord?: SavedPayrollRecord | null): Record<string, any> =>
    savedRecord?.deduction_detail && typeof savedRecord.deduction_detail === 'object'
      ? (savedRecord.deduction_detail as Record<string, any>)
      : {};

  const buildSettlementEntry = (
    staff: StaffMember,
    attendanceDeduction: number,
    attendanceDetail: Record<string, unknown>,
    salaryChangeMap: Record<string, SalaryChangeHistoryRow[]> = salaryChangesByStaff,
    autoOvertimeMins = 0,
    autoHolidayHours = 0,
    autoNightWorkMins = 0,
  ): SettlementEntry => {
    const savedRecord = savedRecordsByStaff[String(staff.id)];
    const staffSalaryChanges = salaryChangeMap[String(staff.id)] || [];
    const savedDeductionDetail = getSavedDeductionDetail(savedRecord);
    const salaryChangeProration: SalaryChangeProrationSummary[] = [];
    const resolveAmount = (field: SalaryAmountField, savedValue: unknown, fallback: unknown) => {
      const result = resolveSalaryAmountForSettlement({
        savedValue,
        fallback,
        field,
        yearMonth,
        salaryChanges: staffSalaryChanges,
        staff,
        status: savedRecord?.status });
      if (result.summary) salaryChangeProration.push(result.summary);
      return result.amount;
    };

    const baseSalary = resolveAmount('base_salary', savedRecord?.base_salary, staff.base_salary);
    const mealAllowance = resolveAmount('meal_allowance', savedRecord?.meal_allowance, staff.meal_allowance);
    const nightDutyAllowance = resolveAmount(
      'night_duty_allowance',
      savedRecord?.night_duty_allowance,
      staff.night_duty_allowance,
    );
    const vehicleAllowance = resolveAmount('vehicle_allowance', savedRecord?.vehicle_allowance, staff.vehicle_allowance);
    const childcareAllowance = resolveAmount('childcare_allowance', savedRecord?.childcare_allowance, staff.childcare_allowance);
    const researchAllowance = resolveAmount('research_allowance', savedRecord?.research_allowance, staff.research_allowance);
    const otherTaxfree = resolveAmount('other_taxfree', savedRecord?.other_taxfree, staff.other_taxfree);

    const staffBreakdown = getStaffTaxableAllowanceBreakdown(staff);

    // 통상시급은 월 통상임금 전액 기준, 일할 미적용 (C-08)
    // 중도입사·중도퇴사자도 소정근로에 대한 통상시급은 마스터 원액 기준으로 산정해야
    // 연장/야간/휴일 가산수당 과소를 방지한다 (검산 45% 과소 버그 수정).
    // 정상 입사자(일할 없음)는 resolveAmount 결과 = 마스터 원액이므로 결과 동일(no-op).
    const draftEntryForHourlyRate: Partial<SettlementEntry> = {
      base_salary: Number(staff.base_salary) || 0,
      meal_allowance: Number(staff.meal_allowance) || 0,
      night_duty_allowance: Number(staff.night_duty_allowance) || 0,
      vehicle_allowance: Number(staff.vehicle_allowance) || 0,
      childcare_allowance: Number(staff.childcare_allowance) || 0,
      research_allowance: Number(staff.research_allowance) || 0,
      other_taxfree: Number(staff.other_taxfree) || 0,
      taxable_allowance_breakdown: getStaffTaxableAllowanceBreakdown(staff) };
    const calculatedHourlyRate = getRegularHourlyRate(staff, draftEntryForHourlyRate);

    // 자동 가산수당 금액 계산
    // 평일 연장: 소정시간 초과분 × 1.5배 (근로기준법 §56①)
    const autoOvertimePay = Math.round((autoOvertimeMins / 60) * calculatedHourlyRate * 1.5);
    // C-11: 휴일근로 8h 이내 1.5배, 8h 초과분 2.0배 (근로기준법 §56②)
    const holidayHours8    = Math.min(8, autoHolidayHours);
    const holidayHoursOver8 = Math.max(0, autoHolidayHours - 8);
    const autoHolidayPay  = Math.round(holidayHours8 * calculatedHourlyRate * 1.5 + holidayHoursOver8 * calculatedHourlyRate * 2.0);
    // C-10: 야간근로(22:00~06:00) 0.5배 가산 (근로기준법 §56③, 연장 여부 무관)
    const autoNightPay    = Math.round((autoNightWorkMins / 60) * calculatedHourlyRate * 0.5);
    // 휴일수당(autoHolidayPay)은 아래 recommendedOvertimePay(연장근로 실적 필드추천)에서 제외하며,
    // 대신 holiday_work_allowance(휴일수당 필드)에 자동 세팅됩니다.
    const recommendedOvertimePay = autoOvertimePay + autoNightPay;

    const changeAwareBreakdown: TaxableAllowanceBreakdown = { ...EMPTY_TAXABLE_ALLOWANCE_BREAKDOWN };
    const taxableChangeFields: Array<Exclude<keyof TaxableAllowanceBreakdown, 'manual_extra_allowance'>> = [
      'position_allowance',
      'overtime_allowance',
      'night_work_allowance',
      'holiday_work_allowance',
      'annual_leave_pay',
    ];
    taxableChangeFields.forEach((field) => {
      let fallbackVal = staffBreakdown[field];
      if (field === 'holiday_work_allowance') {
        fallbackVal = autoHolidayHours > 0 ? autoHolidayPay : 0;
      }
      const result = resolveSalaryAmountForSettlement({
        savedValue: undefined,
        fallback: fallbackVal,
        field,
        yearMonth,
        salaryChanges: staffSalaryChanges,
        staff,
        status: savedRecord?.status });
      changeAwareBreakdown[field] = result.amount;
      if (result.summary) salaryChangeProration.push(result.summary);
    });

    // 만약 이미 저장된 연장수당 정보가 있으면 보존하고, 없을 경우 추천액으로 pre-fill
    const overtimePay = Number(
      savedRecord?.overtime_pay !== null && savedRecord?.overtime_pay !== undefined
        ? savedRecord.overtime_pay
        : recommendedOvertimePay
    ) || 0;

    const savedBreakdown = normalizeTaxableAllowanceBreakdown(savedDeductionDetail.taxable_allowance_breakdown);
    const hasSavedBreakdown = getTaxableAllowanceBreakdownTotal(savedBreakdown) > 0;
    const savedLooksLikeCurrentBreakdown = taxableChangeFields.every(
      (field) => Math.round(Number(savedBreakdown[field] || 0)) === Math.round(Number(staffBreakdown[field] || 0)),
    );
    const nextBreakdown =
      hasSavedBreakdown && !(salaryChangeProration.length > 0 && savedLooksLikeCurrentBreakdown)
        ? savedBreakdown
        : changeAwareBreakdown;
    const defaultExtraAllowance = getTaxableAllowanceBreakdownTotal(staffBreakdown);
    const calculatedExtraAllowance = getTaxableAllowanceBreakdownTotal(changeAwareBreakdown);
    const savedExtraAllowance = savedRecord?.extra_allowance;
    let persistedExtraAllowance = Number(savedExtraAllowance ?? calculatedExtraAllowance) || 0;
    if (
      savedExtraAllowance !== null &&
      savedExtraAllowance !== undefined &&
      Math.round(Number(savedExtraAllowance) || 0) === Math.round(defaultExtraAllowance) &&
      Math.round(calculatedExtraAllowance) !== Math.round(defaultExtraAllowance)
    ) {
      persistedExtraAllowance = calculatedExtraAllowance;
    }
    const fixedAllowanceBase =
      Number(nextBreakdown.position_allowance || 0) +
      Number(nextBreakdown.overtime_allowance || 0) +
      Number(nextBreakdown.night_work_allowance || 0) +
      Number(nextBreakdown.holiday_work_allowance || 0) +
      Number(nextBreakdown.annual_leave_pay || 0);

    nextBreakdown.manual_extra_allowance = Math.max(0, persistedExtraAllowance - fixedAllowanceBase);

    return {
      base_salary: baseSalary,
      meal_allowance: mealAllowance,
      night_duty_allowance: nightDutyAllowance,
      vehicle_allowance: vehicleAllowance,
      childcare_allowance: childcareAllowance,
      research_allowance: researchAllowance,
      other_taxfree: otherTaxfree,
      extra_allowance: persistedExtraAllowance,
      overtime_pay: overtimePay,
      bonus: Number(savedRecord?.bonus ?? 0) || 0,
      apply_tax: (staff.permissions?.insurance as Record<string, unknown>)?.income_tax !== false,
      apply_insurance: hasAnyEmployeePayrollInsurance(getPayrollInsuranceSettings(staff, resolvePayrollAsOfDate(yearMonth))),
      attendance_deduction: Number(savedRecord?.attendance_deduction ?? attendanceDeduction) || 0,
      attendance_deduction_detail:
        savedRecord?.attendance_deduction_detail && typeof savedRecord.attendance_deduction_detail === 'object'
          ? savedRecord.attendance_deduction_detail
          : { ...attendanceDetail, original_deduction: attendanceDeduction },
      custom_deduction: Number(savedDeductionDetail.custom_deduction || 0) || 0,
      dependent_count:
        Number(
          savedDeductionDetail.dependent_count ??
          staff.dependent_count ??
          (staff.permissions?.payroll as Record<string, unknown>)?.dependent_count ??
          (staff.permissions?.tax as Record<string, unknown>)?.dependent_count ??
          staff.permissions?.dependents ??
          0,
        ) || 0,
      child_count_8_20:
        Number(
          savedDeductionDetail.child_count_8_20 ??
          (staff as Record<string, unknown>).child_count_8_20 ??
          (staff.permissions?.payroll as Record<string, unknown>)?.child_count_8_20 ??
          (staff.permissions?.tax as Record<string, unknown>)?.child_count_8_20 ??
          0,
        ) || 0,
      // 원천징수 비율: 개별/기존저장 값 우선 적용하고 없을 시 회사 기본값 폴백 (요청 #4 하위호환)
      withholding_rate_percent: normalizeWithholdingRatePercent(
        savedDeductionDetail.withholding_rate_percent ??
          (staff as Record<string, unknown>).withholding_rate_percent ??
          (staff.permissions?.payroll as Record<string, unknown>)?.withholding_rate_percent ??
          (staff.permissions?.tax as Record<string, unknown>)?.withholding_rate_percent ??
          companyWithholdingRate
      ),
      advance_pay: Number(savedRecord?.advance_pay ?? 0) || 0,
      salary_change_proration: salaryChangeProration,
      saved_status: String(savedRecord?.status || ''),
      taxable_allowance_breakdown: nextBreakdown,
      auto_overtime_pay: autoOvertimePay,
      auto_holiday_pay: autoHolidayPay,
      auto_overtime_minutes: autoOvertimeMins,
      auto_holiday_hours: autoHolidayHours,
      auto_night_pay: autoNightPay,
      auto_night_minutes: autoNightWorkMins,
      calculated_hourly_rate: calculatedHourlyRate };
  };

  const handleNextStep = async () => {
    if (isLocked) {
      toast("해당 월의 급여 정산이 마감(잠금)되어 진행할 수 없습니다.", "error");
      return;
    }
    if (selectedStaffs.length === 0) return toast("정산 대상을 선택해 주세요.", 'warning');

    // 기본급여가 설정되지 않은 직원은 명세서를 생성하지 못하도록 1단계에서 차단
    const noBase = selectedStaffs.filter((s: StaffMember) => !Number(s.base_salary) || Number(s.base_salary) <= 0);
    if (noBase.length > 0) {
      const names = noBase.map((s: StaffMember) => s.name).join(', ');
      toast(`기본급(연봉)이 0원으로 설정된 직원이 포함되어 있어 급여 정산을 진행할 수 없습니다.\n\n` +
        `기본급을 먼저 직원 등록 화면에서 입력해 주세요.\n\n문제 대상: ${names}`, 'warning');
      return;
    }

    try {
      const staffIds = selectedStaffs.map((s: StaffMember) => String(s.id));
      const [year, month] = yearMonth.split('-').map((value) => Number(value));
      const lastDay = new Date(year, month, 0).getDate();
      const [startDate, endDate] = [`${yearMonth}-01`, `${yearMonth}-${String(lastDay).padStart(2, '0')}`];
      let latestSalaryChangesByStaff: Record<string, SalaryChangeHistoryRow[]> = {};

      try {
        latestSalaryChangesByStaff = await fetchSalaryChangeHistoryForMonth(yearMonth, staffIds);
        setSalaryChangesByStaff(latestSalaryChangesByStaff);
      } catch (salaryChangeError) {
        console.error('salary change history load failed:', salaryChangeError);
        setSalaryChangesByStaff({});
        toast('급여 변경 이력 조회에 실패해 현재 등록 금액 기준으로 정산합니다.', 'warning');
      }

      // 회사 공휴일 조회
      let companyHolidaysList: any[] = [];
      try {
        const { data: list } = await db
          .from('company_holidays')
          .select('holiday_date, company_name')
          .gte('holiday_date', startDate)
          .lte('holiday_date', endDate);
        companyHolidaysList = list || [];
      } catch (holidayQueryError) {
        console.error('company holidays query failed:', holidayQueryError);
      }

      const ruleCompany = selectedCo === '전체' ? '전체' : selectedCo;
      // 공휴일 근무 휴일수당 산정용 집합.
      // (1) 법정 공휴일(코드 상수) — DB 미등록이어도 휴일 인정
      // (2) 회사 커스텀 공휴일(company_holidays) — 'YYYY-MM-DD' 및 'M/D'(연도 없는 형식) 모두 정산연도로 보정
      const settlementYear = String(startDate || '').slice(0, 4);
      const normalizeHolidayDate = (raw: unknown): string | null => {
        const s = String(raw || '').trim();
        const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
        if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
        const md = s.match(/^(\d{1,2})\/(\d{1,2})$/);
        if (md && settlementYear) return `${settlementYear}-${md[1].padStart(2, '0')}-${md[2].padStart(2, '0')}`;
        return null;
      };
      const holidaysSet = new Set<string>([
        ...KOREAN_PUBLIC_HOLIDAY_DATES,
        ...companyHolidaysList
          .filter((h) => h.company_name === '전체' || h.company_name === ruleCompany)
          .map((h) => normalizeHolidayDate(h.holiday_date))
          .filter((d): d is string => Boolean(d)),
      ]);

      const { data: attendances, error: attendanceError } = await db
        .from('attendances')
        .select('*')
        .in('staff_id', staffIds)
        .gte('work_date', startDate)
        .lte('work_date', endDate);
      if (attendanceError) throw attendanceError;

      const staffAutoAllowances: Record<string, { overtimeMins: number; holidayHours: number; nightWorkMins: number }> = {};
      selectedStaffs.forEach((s) => {
        staffAutoAllowances[String(s.id)] = { overtimeMins: 0, holidayHours: 0, nightWorkMins: 0 };
      });

      const attendanceRecordRows: Array<{
        staff_id: string;
        work_date: string;
        late_minutes?: number | null;
        early_leave_minutes?: number | null;
      }> = [];

      const scheduledWorkDaysByStaff: Record<string, number> = {};
      try {
        // shift_assignments: 일별 배정 근무유형 (shift_id = 근태기록 기준 shift_id).
        // 다중 근무유형 전환 후에도 각 날짜별 shift_id는 shift_assignments에 유지되므로 로직 변경 불필요.
        // 추가 배정 근무유형은 staff_shift_assignments 테이블에서 관리.
        const { data: shiftAssignments, error: shiftAssignmentsError } = await db
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
              const { data: workShifts, error: workShiftsError } = await db
                .from('work_shifts')
                .select('id, name, start_time, end_time, shift_type')
                .in('id', usedShiftIds);

              if (!workShiftsError && Array.isArray(workShifts)) {
                offLikeShiftIds = new Set(
                  workShifts
                    .filter((shift) => /off|휴무|연차|leave/i.test(String(shift.name || '')))
                    .map((shift) => String(shift.id))
                );

                // shiftId → 시작/종료 시각 맵 구성 (지각·조퇴 판정용)
                const shiftTimeMap = new Map<
                  string,
                  { start_time: string; end_time: string; shift_type: string | null }
                >(
                  workShifts
                    .filter((shift) => !offLikeShiftIds.has(String(shift.id)))
                    .map((shift) => [
                      String(shift.id),
                      {
                        start_time: String(shift.start_time || ''),
                        end_time: String(shift.end_time || ''),
                        shift_type: shift.shift_type ? String(shift.shift_type) : null },
                    ])
                );

                // shiftAssignment 날짜별 shift 정보 맵: "staffId_workDate" → shiftId
                const assignmentMap = new Map<string, string>();
                const rosterOffSet = new Set<string>();
                shiftAssignments.forEach((row) => {
                  const shiftId = String(row.shift_id || '').trim();
                  if (!shiftId) return;
                  const workDate = String(row.work_date || '').slice(0, 10);
                  if (!workDate) return;
                  if (offLikeShiftIds.has(shiftId)) {
                    rosterOffSet.add(`${row.staff_id}_${workDate}`);
                    return;
                  }
                  assignmentMap.set(`${row.staff_id}_${workDate}`, shiftId);
                });

                // attendances 레코드에서 지각·조퇴 분 계산
                if (Array.isArray(attendances)) {
                  for (const att of attendances) {
                    const staffId = String(att.staff_id || '');
                    const workDate = String(att.work_date || '').slice(0, 10);
                    if (!staffId || !workDate) continue;

                    const checkIn = att.check_in_time ? String(att.check_in_time) : null;
                    const checkOut = att.check_out_time ? String(att.check_out_time) : null;

                    const assignedShiftId = assignmentMap.get(`${staffId}_${workDate}`);
                    const shiftInfo = assignedShiftId ? shiftTimeMap.get(assignedShiftId) : null;

                    const boundary = shiftInfo
                      ? {
                          ...buildShiftBoundary(shiftInfo.start_time, shiftInfo.end_time),
                          shiftType: shiftInfo.shift_type ?? null,
                          rosterAssigned: true }
                      : buildFallbackShiftBoundary();

                    let lateMinutes: number | null = null;
                    let earlyLeaveMinutes: number | null = null;

                    if (checkIn && boundary.shiftKnown) {
                      const status = decideCheckInStatus(boundary, checkIn);
                      if (status === '지각') {
                        const scheduledStart = new Date(workDate);
                        scheduledStart.setHours(boundary.hour, boundary.minute, 0, 0);
                        const actual = new Date(checkIn);
                        lateMinutes = Math.max(
                          0,
                          Math.round((actual.getTime() - scheduledStart.getTime()) / 60000),
                        );
                      }
                    }

                    if (checkOut) {
                      const mins = calculateEarlyLeaveMinutes(workDate, checkOut, boundary);
                      if (mins > 0) earlyLeaveMinutes = mins;
                    }

                    if (lateMinutes !== null || earlyLeaveMinutes !== null) {
                      attendanceRecordRows.push({
                        staff_id: staffId,
                        work_date: workDate,
                        late_minutes: lateMinutes,
                        early_leave_minutes: earlyLeaveMinutes });
                    }

                    // ─── 자동 수당(연장/휴일/야간) 적산 로직 ───
                    if (checkIn && checkOut) {
                      // 1. 소정 근로시간 환산 (휴게 1시간 차감 반영)
                      let scheduledHours = 8;
                      if (boundary.shiftKnown && boundary.endHour !== null && boundary.endMinute !== null) {
                        const scheduledStart = buildDateWithTime(workDate, boundary.hour, boundary.minute);
                        const scheduledEnd = buildDateWithTime(workDate, boundary.endHour, boundary.endMinute);
                        if (scheduledEnd.getTime() <= scheduledStart.getTime()) {
                          scheduledEnd.setDate(scheduledEnd.getDate() + 1);
                        }
                        const shiftDuration = (scheduledEnd.getTime() - scheduledStart.getTime()) / 3600000;
                        scheduledHours = Math.max(0, shiftDuration - 1);
                      }

                      // 2. 휴일 및 법정공휴일 근무 판정
                      const dayOfWeek = new Date(workDate).getDay();
                      const isSunday = dayOfWeek === 0;
                      const isSaturday = dayOfWeek === 6;
                      const isHoliday =
                        isSunday ||
                        isSaturday ||
                        holidaysSet.has(workDate) ||
                        rosterOffSet.has(`${staffId}_${workDate}`);

                      if (isHoliday) {
                        // C-11: 휴일 실근무시간(checkIn~checkOut - 휴게1h) 기준으로
                        //        8h 이내/초과 분리 집계. 소정시간 대신 실근무 사용.
                        const actualCheckInDate = new Date(checkIn);
                        const actualCheckOutDate = new Date(checkOut);
                        if (
                          staffAutoAllowances[staffId] &&
                          !Number.isNaN(actualCheckInDate.getTime()) &&
                          !Number.isNaN(actualCheckOutDate.getTime())
                        ) {
                          const actualWorkMins = Math.max(
                            0,
                            (actualCheckOutDate.getTime() - actualCheckInDate.getTime()) / 60000 - 60 // 휴게 1h 차감
                          );
                          const actualWorkHours = actualWorkMins / 60;
                          // holidayHours8: 8h 이내 부분, holidayHoursOver8: 초과 부분
                          // 단일 필드 대신 holidayHours에 {h8, hOver8} 인코딩하면 기존 타입 파괴되므로
                          // holidayHours 필드를 "8h 이내 실시간"으로 재정의하고
                          // overtimeMins 필드를 재활용하는 대신 새 전용 필드를 사용.
                          // staffAutoAllowances 타입에 holidayHoursOver8 추가 없이도
                          // 계산은 buildSettlementEntry에서 수행하므로, 여기서는
                          // holidayHours = min(8, actualWorkHours),
                          // 그리고 8h 초과분은 overtimeMins 에 넣지 않고
                          // holidayHours에 실근무시간 전체를 넣되 over8 식별자를 포함한다.
                          // → 가장 안전한 방법: holidayHours에 실근무시간 전체(소수 포함)를 넣는다.
                          //   buildSettlementEntry에서 min(8,x)*1.5 + max(0,x-8)*2.0 로 분기.
                          staffAutoAllowances[staffId].holidayHours += actualWorkHours;
                        }
                        // 휴일이면 overtimeMins에 추가하지 않음(중복 가산 방지 — C-11).
                      }

                      // 3. 연장근로 시간 계산 (평일만)
                      if (!isHoliday && boundary.shiftKnown && boundary.endHour !== null && boundary.endMinute !== null) {
                        const scheduledStart = buildDateWithTime(workDate, boundary.hour, boundary.minute);
                        const scheduledEnd = buildDateWithTime(workDate, boundary.endHour, boundary.endMinute);
                        if (scheduledEnd.getTime() <= scheduledStart.getTime()) {
                          scheduledEnd.setDate(scheduledEnd.getDate() + 1);
                        }

                        const actualCheckOut = new Date(checkOut);
                        if (!Number.isNaN(actualCheckOut.getTime())) {
                          // 야간 체크아웃 일자 보정 (교대제용, 동작 불변)
                          const endMin = boundary.endHour * 60 + boundary.endMinute;
                          const startMin = boundary.hour * 60 + boundary.minute;
                          const isNightShift = endMin < startMin;
                          if (isNightShift && actualCheckOut.getTime() < scheduledStart.getTime()) {
                            scheduledStart.setDate(scheduledStart.getDate() - 1);
                            scheduledEnd.setDate(scheduledEnd.getDate() - 1);
                          }

                          if (actualCheckOut.getTime() > scheduledEnd.getTime()) {
                            const otMins = Math.round((actualCheckOut.getTime() - scheduledEnd.getTime()) / 60000);
                            if (otMins >= 10) { // 10분 이상 지체 근로만 연장 인정
                              if (staffAutoAllowances[staffId]) {
                                staffAutoAllowances[staffId].overtimeMins += otMins;
                              }
                            }
                          }
                        }
                      }

                      // 4. C-10: 야간근로(22:00~06:00) 분 집계
                      //    휴일/평일 무관, checkIn~checkOut 중 야간대 교집합.
                      if (staffAutoAllowances[staffId]) {
                        const ciDate = new Date(checkIn);
                        const coDate = new Date(checkOut);
                        if (!Number.isNaN(ciDate.getTime()) && !Number.isNaN(coDate.getTime())) {
                          // 실근무 구간을 분(epoch minutes)으로 환산
                          const ciMs = ciDate.getTime();
                          const coMs = coDate.getTime();

                          // 야간대(22:00~06:00)를 하루 단위로 분할하여 교집합 계산.
                          // checkIn 날짜 기준으로 최대 2일치 야간대를 검사.
                          let nightMins = 0;
                          const checkInDay = new Date(ciDate);
                          checkInDay.setHours(0, 0, 0, 0);

                          for (let dayOffset = 0; dayOffset <= 2; dayOffset++) {
                            const dayStart = checkInDay.getTime() + dayOffset * 86400000;
                            // 야간 전반: 22:00~24:00
                            const nightStart1 = dayStart + 22 * 3600000;
                            const nightEnd1   = dayStart + 24 * 3600000;
                            const overlap1Start = Math.max(ciMs, nightStart1);
                            const overlap1End   = Math.min(coMs, nightEnd1);
                            if (overlap1End > overlap1Start) {
                              nightMins += Math.round((overlap1End - overlap1Start) / 60000);
                            }
                            // 야간 후반: 00:00~06:00
                            const nightStart2 = dayStart;
                            const nightEnd2   = dayStart + 6 * 3600000;
                            const overlap2Start = Math.max(ciMs, nightStart2);
                            const overlap2End   = Math.min(coMs, nightEnd2);
                            if (overlap2End > overlap2Start) {
                              nightMins += Math.round((overlap2End - overlap2Start) / 60000);
                            }
                          }

                          staffAutoAllowances[staffId].nightWorkMins += nightMins;
                        }
                      }
                    }
                    // ─── 자동 수당(연장/휴일/야간) 적산 로직 끝 ───
                  }
                }
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

      // ruleCompany is already declared above
      const { data: rule, error: ruleError } = await db
        .from('attendance_deduction_rules')
        .select('*')
        .eq('company_name', ruleCompany)
        .maybeSingle();
      if (ruleError) throw ruleError;
      const { data: fallbackRule, error: fallbackRuleError } = await db
        .from('attendance_deduction_rules')
        .select('*')
        .eq('company_name', '전체')
        .maybeSingle();
      if (fallbackRuleError) throw fallbackRuleError;
      const r = rule || fallbackRule;

      const initialData: Record<string, SettlementEntry> = {};
      const attendanceMinuteMap = new Map(
        attendanceRecordRows.map((row) => [
          `${row.staff_id}_${String(row.work_date || '').slice(0, 10)}`,
          {
            late_minutes: row.late_minutes ?? null,
            early_leave_minutes: row.early_leave_minutes ?? null },
        ])
      );

      selectedStaffs.forEach((s: StaffMember) => {
        const staffAtts = (attendances || [])
          .filter((a: any) => a.staff_id === s.id)
          .map((attendance: any) => ({
            ...attendance,
            ...(attendanceMinuteMap.get(`${attendance.staff_id}_${String(attendance.work_date || '').slice(0, 10)}`) || {}) }));
        const { total, detail } = calculateAttendanceDeduction(
          // A-2: 중도입사·중도퇴사자는 분모(소정근로일수)가 부분월이므로
          // 분자도 일할 후 기본급으로 맞춰 결근차감 과대공제를 방지한다.
          getEmploymentProratedBaseForMonth(s, yearMonth, s.base_salary),
          yearMonth,
          staffAtts,
          r
            ? {
                late_deduction_type: r.late_deduction_type,
                late_deduction_amount: r.late_deduction_amount,
                early_leave_deduction_type: r.early_leave_deduction_type,
                early_leave_deduction_amount: r.early_leave_deduction_amount,
                absent_use_daily_rate: r.absent_use_daily_rate }
            : undefined,
          { scheduledWorkDays: scheduledWorkDaysByStaff[s.id] }
        );
        const autoAllow = staffAutoAllowances[s.id] || { overtimeMins: 0, holidayHours: 0, nightWorkMins: 0 };
        initialData[s.id] = buildSettlementEntry(
          s,
          total,
          detail,
          latestSalaryChangesByStaff,
          autoAllow.overtimeMins,
          autoAllow.holidayHours,
          autoAllow.nightWorkMins,
        );
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

      // 과세 수당 개별 항목 편집: taxable_allowance_breakdown 하위값 갱신 + extra_allowance(과세수당 합계) 재계산
      if (field.startsWith('taxable_allowance_breakdown.')) {
        const subField = field.slice('taxable_allowance_breakdown.'.length) as keyof TaxableAllowanceBreakdown;
        const numericValue = value === '' ? 0 : Math.max(0, Math.round(Number(value) || 0));
        const nextBreakdown = { ...current.taxable_allowance_breakdown, [subField]: numericValue };
        const nextExtra =
          Number(nextBreakdown.position_allowance || 0) +
          Number(nextBreakdown.overtime_allowance || 0) +
          Number(nextBreakdown.night_work_allowance || 0) +
          Number(nextBreakdown.holiday_work_allowance || 0) +
          Number(nextBreakdown.annual_leave_pay || 0) +
          Number(nextBreakdown.manual_extra_allowance || 0);
        return {
          ...prev,
          [id]: { ...current, taxable_allowance_breakdown: nextBreakdown, extra_allowance: nextExtra } };
      }

      const nextEntry = { ...current, [field]: value } as SettlementEntry;

      if (field === 'dependent_count') {
        const nextDependentCount = value === '' ? 0 : Math.max(0, parseInt(String(value), 10) || 0);
        nextEntry.dependent_count = value === '' ? '' : nextDependentCount;
        if ((Number(nextEntry.child_count_8_20) || 0) > nextDependentCount) {
          nextEntry.child_count_8_20 = value === '' ? '' : nextDependentCount;
        }
      }

      if (field === 'child_count_8_20') {
        nextEntry.child_count_8_20 = value === '' ? '' : Math.min(
          Math.max(0, parseInt(String(value), 10) || 0),
          Math.max(0, Number(nextEntry.dependent_count) || 0),
        );
      }

      if (field === 'withholding_rate_percent') {
        nextEntry.withholding_rate_percent = normalizeWithholdingRatePercent(value);
      }

      return {
        ...prev,
        [id]: nextEntry };
    });
  };

  const getAdvanceAdjustedNet = (netAmount: number, advancePay: number) =>
    Math.round(Number(netAmount || 0) - Math.round(Number(advancePay || 0)));

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
        net: 0 };
    }
    const hasExactWithholdingTable = hasExactIncomeTaxBracket(taxInsuranceRates);

    // 비과세 한도 체크 및 과세 전환 계산
    const meal_tf = Math.min(Number(data.meal_allowance), TAX_FREE_LIMITS.meal);
    const meal_taxable = Math.max(0, Number(data.meal_allowance) - TAX_FREE_LIMITS.meal);

    const vehicle_tf = Math.min(Number(data.vehicle_allowance), TAX_FREE_LIMITS.vehicle);
    const vehicle_taxable = Math.max(0, Number(data.vehicle_allowance) - TAX_FREE_LIMITS.vehicle);

    const childcare_tf = Math.min(Number(data.childcare_allowance), TAX_FREE_LIMITS.childcare);
    const childcare_taxable = Math.max(0, Number(data.childcare_allowance) - TAX_FREE_LIMITS.childcare);

    // nightDuty 비과세 한도 (C-04): 소득세법 시행령 야간근로수당 비과세 한도
    // 한도 상수는 lib/tax-free-limits 의 NIGHT_DUTY_TAX_FREE_LIMIT(월 24만원) 사용
    const nightDutyRaw = Number(data.night_duty_allowance) || 0;
    const nightDuty_tf = Math.min(nightDutyRaw, NIGHT_DUTY_TAX_FREE_LIMIT);
    const nightDuty_taxable = Math.max(0, nightDutyRaw - NIGHT_DUTY_TAX_FREE_LIMIT);

    const research_tf = Math.min(Number(data.research_allowance), TAX_FREE_LIMITS.research);
    const research_taxable = Math.max(0, Number(data.research_allowance) - TAX_FREE_LIMITS.research);

    // other_taxfree 비과세 한도 (C-04): 한도 0/미설정이면 전액 과세로 간주 (무한 비과세 방지)
    const otherTaxfreeRaw = Number(data.other_taxfree) || 0;
    const otherTaxfreeLimit = taxFreeLimits.other_taxfree_limit || 0;
    const otherTaxfree_tf = otherTaxfreeLimit > 0 ? Math.min(otherTaxfreeRaw, otherTaxfreeLimit) : 0;
    const otherTaxfree_taxable = otherTaxfreeRaw - otherTaxfree_tf;

    const total_taxfree = meal_tf + vehicle_tf + childcare_tf + research_tf + nightDuty_tf + otherTaxfree_tf;

    // 과세 대상: 기본급 + 한도초과 비과세분 + 연장수당 + 상여 + 기타수당 - 근태차감
    const attendance_deduction = Number(data.attendance_deduction) || 0;
    const total_taxable = Number(data.base_salary) + meal_taxable + vehicle_taxable + childcare_taxable + research_taxable +
      nightDuty_taxable + otherTaxfree_taxable +
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

    const dependentCount = Math.max(0, Number(data.dependent_count) || 0);
    const qualifyingChildCount = Math.min(dependentCount, Math.max(0, Number(data.child_count_8_20) || 0));
    const withholdingRatePercent = normalizeWithholdingRatePercent(data.withholding_rate_percent);

    const resolvedIns = getPayrollInsuranceSettings(staff, resolvePayrollAsOfDate(yearMonth));

    const deductions = calcStatutoryDeductions(total_taxable, taxInsuranceRates, {
      applyInsurance: data.apply_insurance !== false,
      applyTax: data.apply_tax !== false,
      isDuruNuriActive,
      isMedicalBenefit,
      dependentCount,
      qualifyingChildCount,
      withholdingRatePercent,
      applyNationalPension: resolvedIns.national,
      applyHealthInsurance: resolvedIns.health,
      applyEmploymentInsurance: resolvedIns.employment });

    const national_pension = deductions.national_pension;
    const health_insurance = deductions.health_insurance;
    const long_term_care = deductions.long_term_care;
    const employment_insurance = deductions.employment_insurance;
    const income_tax = deductions.income_tax;
    const local_tax = deductions.local_tax;

    const baselineIncomeTax = calculateMonthlyIncomeTax(total_taxable, taxInsuranceRates, 0, {
      withholdingRatePercent: 100,
      qualifyingChildCount: 0 });
    const familyAdjustedIncomeTax = calculateMonthlyIncomeTax(total_taxable, taxInsuranceRates, dependentCount, {
      withholdingRatePercent: 100,
      qualifyingChildCount: 0 });
    const preRatioIncomeTax = calculateMonthlyIncomeTax(total_taxable, taxInsuranceRates, dependentCount, {
      withholdingRatePercent: 100,
      qualifyingChildCount });
    const dependentTaxCredit = hasExactWithholdingTable
      ? Math.max(0, baselineIncomeTax - familyAdjustedIncomeTax)
      : dependentCount * 12500;
    const childTaxCredit = hasExactWithholdingTable
      ? Math.max(0, familyAdjustedIncomeTax - preRatioIncomeTax)
      : calculateQualifyingChildTaxCredit(qualifyingChildCount);

    const custom_deduction = Number(data.custom_deduction) || 0;
    const deduction = deductions.national_pension + deductions.health_insurance + deductions.long_term_care + deductions.employment_insurance + deductions.income_tax + deductions.local_tax + custom_deduction;
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
      apply_tax: data.apply_tax,
      apply_insurance: data.apply_insurance,
      taxable_allowance_breakdown: data.taxable_allowance_breakdown,
      salary_change_proration: data.salary_change_proration || [],
      tax_estimated: data.apply_tax && !hasExactWithholdingTable,
      missing_monthly_withholding_table: data.apply_tax && !hasExactWithholdingTable };

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

  const persistSettlement = async (targetStatus: '임시저장' | '확정') => {
    setLoading(true);
    try {
      // E-1: 마감 잠금된 월은 임시저장·확정을 모두 차단한다(클라이언트 가드).
      // 잠금 스코프는 '전체' 또는 선택 회사. 조회 실패 시 막지 않음(fail-open).
      const { data: lockRows, error: lockError } = await db
        .from('payroll_locks')
        .select('year_month, company_name')
        .eq('year_month', yearMonth);
      
      let isSaveLocked = false;
      if (lockRows && lockRows.length > 0) {
        if (selectedCo === '전체') {
          isSaveLocked = true;
        } else {
          isSaveLocked = lockRows.some((row: any) => row.company_name === '전체' || row.company_name === selectedCo);
        }
      }

      if (lockError) {
        console.error('payroll lock check failed:', lockError);
      } else if (isSaveLocked) {
        toast(
          `${yearMonth} 급여가 마감 잠금되어 저장할 수 없습니다.\n재오픈 승인 후 다시 시도해 주세요.`,
          'error',
        );
        return null;
      }

      const records = selectedStaffs.map((staff) => {
        const staffId = String(staff.id);
        const data = settlementData[staffId];
        const calc = calculateSalary(staffId);
        const advancePay = Math.round(Number(data?.advance_pay || 0));
        const netPay = getAdvanceAdjustedNet(Number(calc?.net || 0), advancePay);
        const deductionDetail = {
          ...(calc?.deductionDetail || {}),
          dependent_count: Number(data?.dependent_count || 0),
          child_count_8_20: Number(data?.child_count_8_20 || 0),
          withholding_rate_percent: normalizeWithholdingRatePercent(data?.withholding_rate_percent),
          custom_deduction: Number(data?.custom_deduction || 0),
          apply_tax: data?.apply_tax !== false,
          apply_insurance: data?.apply_insurance !== false,
          taxable_allowance_breakdown: data?.taxable_allowance_breakdown || EMPTY_TAXABLE_ALLOWANCE_BREAKDOWN,
          salary_change_proration: data?.salary_change_proration || [],
          advance_pay_deduction: advancePay,
          net_pay_before_advance: Math.round(Number(calc?.net || 0)),
          auto_overtime_pay: Number(data?.auto_overtime_pay || 0),
          auto_holiday_pay: Number(data?.auto_holiday_pay || 0),
          auto_overtime_minutes: Number(data?.auto_overtime_minutes || 0),
          auto_holiday_hours: Number(data?.auto_holiday_hours || 0),
          auto_night_pay: Number(data?.auto_night_pay || 0),
          auto_night_minutes: Number(data?.auto_night_minutes || 0),
          calculated_hourly_rate: Number(data?.calculated_hourly_rate || 0) };
        // calc.deductionDetail은 조기 반환 분기 때문에 `{전체}|{}` 유니온이므로 Record로 캐스트 후 읽는다.
        const dd = (calc?.deductionDetail ?? {}) as Record<string, unknown>;

        return {
          staff_id: staff.id,
          year_month: yearMonth,
          base_salary: Math.round(Number(data?.base_salary) || 0),
          meal_allowance: Math.round(Number(data?.meal_allowance) || 0),
          night_duty_allowance: Math.round(Number(data?.night_duty_allowance) || 0),
          vehicle_allowance: Math.round(Number(data?.vehicle_allowance) || 0),
          childcare_allowance: Math.round(Number(data?.childcare_allowance) || 0),
          research_allowance: Math.round(Number(data?.research_allowance) || 0),
          other_taxfree: Math.round(Number(data?.other_taxfree) || 0),
          extra_allowance: Math.round(Number(data?.extra_allowance) || 0),
          overtime_pay: Math.round(Number(data?.overtime_pay) || 0),
          bonus: Math.round(Number(data?.bonus) || 0),
          total_taxable: Math.round(Number(calc?.taxable || 0)),
          total_taxfree: Math.round(Number(calc?.taxfree || 0)),
          total_deduction: Math.round(Number(calc?.deduction || 0)),
          // R-2: 4대보험·소득세 공제를 top-level 컬럼에도 저장한다.
          // 모바일 급여명세서·내정보·워크센터 4대보험 요약·EDI는 deduction_detail JSON이 아니라
          // 이 컬럼들을 읽으므로, 미저장 시 직원 명세서에 공제가 전부 0원으로 표시되는 문제를 해소.
          national_pension: Math.round(Number(dd.national_pension || 0)),
          health_insurance: Math.round(Number(dd.health_insurance || 0)),
          long_term_care: Math.round(Number(dd.long_term_care || 0)),
          employment_insurance: Math.round(Number(dd.employment_insurance || 0)),
          income_tax: Math.round(Number(dd.income_tax || 0)),
          local_tax: Math.round(Number(dd.local_tax || 0)),
          deduction_detail: deductionDetail,
          net_pay: netPay,
          attendance_deduction: Math.round(Number(data?.attendance_deduction) || 0),
          attendance_deduction_detail: data?.attendance_deduction_detail || {},
          advance_pay: advancePay,
          record_type: 'regular',
          status: targetStatus };
      });

      const { error: payrollSaveError } = await upsertPayrollRecordsWithFallback({
        records: records as Record<string, unknown>[],
        optionalColumns: [
          ...PAYROLL_RECORD_OPTIONAL_COLUMNS,
          'national_pension',
          'health_insurance',
          'long_term_care',
          'employment_insurance',
          'income_tax',
          'local_tax',
        ] });
      if (payrollSaveError) throw payrollSaveError;

      setSavedRecordsByStaff((prev) => ({
        ...prev,
        ...Object.fromEntries(records.map((record) => [String(record.staff_id), record as SavedPayrollRecord])) }));
      setSettlementData((prev) =>
        Object.fromEntries(
          Object.entries(prev).map(([staffId, value]) => [
            staffId,
            selectedStaffs.some((staff) => String(staff.id) === staffId)
              ? { ...value, saved_status: targetStatus }
              : value,
          ]),
        ) as Record<string, SettlementEntry>,
      );

      if (onRefresh) onRefresh();
      return records;
    } catch (err) {
      const message = formatPayrollMutationError(err);
      console.error('payroll save failed:', {
        message,
        error: err,
        yearMonth,
        status: targetStatus,
        staffIds: selectedStaffs.map((staff: StaffMember) => staff.id) });
      toast(`정산 저장 중 오류가 발생했습니다. ${message}`, 'error');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const handleDraftSaveLegacy = async () => {
    const records = await persistSettlement('임시저장');
    if (!records) return;
    toast(`${records.length}명의 급여정산이 임시저장되었습니다.`, 'success');
  };

  const handleFinalizeLegacy = async () => {
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
          const staffId = String(s.id);
          const data = settlementData[staffId];
          const advancePay = Math.round(advancePayAmount(staffId));
          const calc = calculateSalary(staffId);
          return {
            staff_id: s.id,
            year_month: yearMonth,
            base_salary: Math.round(Number(data.base_salary) || 0),
          meal_allowance: Math.round(Number(data.meal_allowance) || 0),
          night_duty_allowance: Math.round(Number(data.night_duty_allowance) || 0),
          vehicle_allowance: Math.round(Number(data.vehicle_allowance) || 0),
          childcare_allowance: Math.round(Number(data.childcare_allowance) || 0),
            research_allowance: Math.round(Number(data.research_allowance) || 0),
            other_taxfree: Math.round(Number(data.other_taxfree) || 0),
            extra_allowance: Math.round(Number(data.extra_allowance) || 0),
            overtime_pay: Math.round(Number(data.overtime_pay) || 0),
            bonus: Math.round(Number(data.bonus) || 0),
            total_taxable: Math.round(Number(calc?.taxable || 0)),
            total_taxfree: Math.round(Number(calc?.taxfree || 0)),
            total_deduction: Math.round(Number(calc?.deduction || 0)),
            deduction_detail: {
              ...(calc?.deductionDetail || {}),
              advance_pay_deduction: advancePay,
              net_pay_before_advance: Math.round(Number(calc?.net || 0)) },
            net_pay: getAdvanceAdjustedNet(Number(calc?.net || 0), advancePay),
            attendance_deduction: Math.round(Number(data.attendance_deduction) || 0),
            attendance_deduction_detail: data.attendance_deduction_detail || {},
            advance_pay: advancePay,
          record_type: 'regular',
          status: '확정'
        };
      });

      const { error: payrollSaveError } = await upsertPayrollRecordsWithFallback({
        records: records as Record<string, unknown>[],
        optionalColumns: [...PAYROLL_RECORD_OPTIONAL_COLUMNS] });
      if (payrollSaveError) throw payrollSaveError;
      const u = typeof window !== 'undefined' ? (() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.USER) || '{}'); } catch { return {}; } })() : {};
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
                net_pay: record.net_pay };
            }) },
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
        staffIds: selectedStaffs.map((staff: StaffMember) => staff.id) });
      toast(`정산 처리 중 오류가 발생했습니다. ${message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  void handleDraftSaveLegacy;
  void handleFinalizeLegacy;

  const handleDraftSave = async () => {
    const records = await persistSettlement('임시저장');
    if (!records) return;
    toast(`${records.length}명의 급여정산이 임시저장되었습니다.`, 'success');
  };

  const handleFinalize = async () => {
    const needsExactIncomeTax = selectedStaffs.some((staff: StaffMember) => settlementData[staff.id]?.apply_tax);
    if (needsExactIncomeTax && !hasExactIncomeTaxBracket(taxInsuranceRates)) {
      toast('근로소득세 간이세액표가 설정되지 않아 급여를 안전하게 확정할 수 없습니다.\n\n세율·보험요율 관리에서 income_tax_bracket을 먼저 설정한 뒤 다시 진행해 주세요.');
      return;
    }

    if (hasBlockingVerificationIssues) {
      toast(`검산 리포트에 오류 ${verificationReport.errorCount}건이 있어 확정할 수 없습니다.`, 'error');
      return;
    }

    const savedRecords = await persistSettlement('확정');
    if (!savedRecords) return;

    const u = typeof window !== 'undefined'
      ? (() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.USER) || '{}'); } catch { return {}; } })()
      : {};

    try {
      await logAudit(
        '급여확정',
        'payroll',
        yearMonth,
        {
          count: savedRecords.length,
          total: savedRecords.reduce((sum: number, record: any) => sum + (Number(record.net_pay) || 0), 0),
          year_month: yearMonth,
          records: savedRecords.map((record: any) => {
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
              net_pay: record.net_pay };
          }) },
        u.id,
        u.name,
      );
    } catch (auditError) {
      console.error('payroll audit log failed:', auditError);
    }

    toast('급여 정산과 정산 확정이 완료되었습니다.', 'success');
    setStep(3);
  };

  const verificationRows = selectedStaffs.map((staff: StaffMember) => {
    const staffId = String(staff.id);
    const data = settlementData[staffId];
    const advancePay = Number(data?.advance_pay) || 0;
    const calc = calculateSalary(staffId);
    const netAfterAdvance = getAdvanceAdjustedNet(Number(calc?.net || 0), advancePay);
    return {
      staffId: staff.id,
      staffName: staff.name,
      companyName: staff.company,
      grossPay: Number(calc?.total || 0),
      taxablePay: Number(calc?.taxable || 0),
      taxFreePay: Number(calc?.taxfree || 0),
      deductionTotal: Number(calc?.deduction || 0),
      netPay: netAfterAdvance,
      customDeduction: Number(data?.custom_deduction || 0),
      attendanceDeduction: Number(data?.attendance_deduction || 0),
      advancePay,
      baseSalary: Number(data?.base_salary || 0),
      applyTax: data?.apply_tax !== false,
      exactTaxConfigured: hasExactIncomeTaxBracket(taxInsuranceRates),
      bankName: String(staff.bank_name || ''),
      bankAccount: String(staff.bank_account || '') };
  });
  const verificationReport = buildPayrollVerificationReport(verificationRows, {
    requireExactTaxTable: selectedStaffs.some((staff: StaffMember) => settlementData[staff.id]?.apply_tax) });
  const hasBlockingVerificationIssues = verificationReport.errorCount > 0;

  return (
    <div className="bg-[var(--card)] rounded-[var(--radius-md)] border border-[var(--border)] shadow-sm overflow-hidden animate-in fade-in duration-300" data-testid="salary-settlement-view">
      <div className="bg-[var(--page-bg)] border-b border-[var(--border)] px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs text-[var(--toss-gray-3)]">법적 비과세 한도 자동 반영</p>
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

      {isLocked && (
        <div className="bg-red-500/10 border-b border-red-500/20 text-red-700 px-4 py-2.5 text-[12.5px] font-semibold flex items-center gap-2">
          <span>⚠️</span>
          <span>해당 월의 급여 정산이 마감(잠금)되어 데이터를 수정하거나 추가적인 정산 단계를 진행할 수 없습니다.</span>
        </div>
      )}

      <div className="p-4">
        {step === 1 && (
          <Step1TargetSelection
            hasExactTaxTable={hasExactIncomeTaxBracket(taxInsuranceRates)}
            yearMonth={yearMonth}
            onYearMonthChange={setYearMonth}
            filteredStaffs={filteredStaffs}
            selectedStaffs={selectedStaffs}
            savedRecordsByStaff={savedRecordsByStaff}
            onSelectAll={() => setSelectedStaffs(filteredStaffs)}
            onToggleStaff={toggleStaff}
            onNext={handleNextStep}
            loading={loading}
            isLocked={isLocked}
          />
        )}

        {step === 2 && (
          <div className="space-y-5">
            {!hasExactIncomeTaxBracket(taxInsuranceRates) && (
              <div data-testid="salary-settlement-finalize-block-warning" className="rounded-[var(--radius-md)] border border-red-500/20 bg-red-500/10 px-4 py-3">
                <p className="text-sm font-bold text-red-700">급여 확정 차단: 정확한 근로소득세표가 없습니다.</p>
                <p className="mt-1 text-xs font-medium text-red-600">
                  보험요율은 적용되지만, 소득세는 아직 근사 계산입니다. 세액표가 설정되기 전에는 저장을 막습니다.
                </p>
              </div>
            )}
            <div className="max-h-[500px] overflow-y-auto space-y-4 p-2 custom-scrollbar">
              {selectedStaffs.map((s: StaffMember) => {
                const staffId = String(s.id);
                const data = settlementData[staffId] || buildSettlementEntry(s, 0, {});
                const res = calculateSalary(staffId);
                const hourlyRate = getRegularHourlyRate(s, data);
                return (
                  <SettlementStaffCard
                    key={s.id}
                    staff={s}
                    data={data}
                    res={res}
                    hourlyRate={hourlyRate}
                    getAdvanceAdjustedNet={getAdvanceAdjustedNet}
                    onUpdate={updateData}
                  />
                );
              })}
            </div>
            <VerificationReportPanel report={verificationReport} />
            <div className="flex gap-3 pt-2">
              <button data-testid="salary-settlement-back-button" onClick={() => setStep(1)} className="flex-1 py-3 bg-[var(--card)] border border-[var(--border)] text-[var(--toss-gray-4)] text-sm font-medium rounded-[var(--radius-md)] hover:bg-[var(--muted)]">이전</button>
              <button
                data-testid="salary-settlement-draft-save-button"
                onClick={handleDraftSave}
                disabled={loading || isLocked}
                className="flex-1 py-3 bg-amber-500 text-white text-sm font-semibold rounded-[var(--radius-md)] hover:opacity-90 disabled:opacity-50"
              >
                {loading ? '처리 중...' : '임시 저장'}
              </button>
              <button data-testid="salary-settlement-finalize-button" onClick={() => setShowFinalizeReview(true)} disabled={loading || isLocked || !hasExactIncomeTaxBracket(taxInsuranceRates) || hasBlockingVerificationIssues} className="flex-[2] py-3 bg-[var(--accent)] text-white text-sm font-semibold rounded-[var(--radius-md)] hover:opacity-90 disabled:opacity-50">
                {loading ? '처리 중...' : '저장하기 · 정산 확정'}
              </button>
            </div>
          </div>
        )}

        {step === 3 && <Step3Complete onRestart={() => setStep(1)} />}
      </div>

      <RiskActionDialog
        open={showFinalizeReview}
        title="급여 정산 확정 전 검토"
        description="확정 후 급여 레코드와 명세서 생성 기준이 저장됩니다. 대상자, 금액, 검산 결과를 확인하세요."
        targetLabel={`${yearMonth} 급여 · ${selectedStaffs.length}명`}
        tone="warning"
        loading={loading}
        items={[
          { label: '실지급 합계', value: `₩${verificationReport.netTotal.toLocaleString()}`, tone: 'success' },
          { label: '총 공제', value: `₩${verificationReport.deductionTotal.toLocaleString()}` },
          { label: '검산 결과', value: `오류 ${verificationReport.errorCount}건 · 경고 ${verificationReport.warningCount}건`, tone: verificationReport.errorCount > 0 ? 'danger' : verificationReport.warningCount > 0 ? 'warning' : 'success' },
          { label: '세액표', value: hasExactIncomeTaxBracket(taxInsuranceRates) ? '확정 가능' : '설정 필요', tone: hasExactIncomeTaxBracket(taxInsuranceRates) ? 'success' : 'danger' },
        ]}
        changes={[
          { label: '정산 상태', before: '임시/미확정', after: '확정' },
          { label: '대상자', before: '선택 단계', after: selectedStaffs.slice(0, 4).map((staff) => staff.name).join(', ') + (selectedStaffs.length > 4 ? ` 외 ${selectedStaffs.length - 4}명` : '') },
          { label: '명세 기준', before: '화면 입력값', after: `${yearMonth} 확정 레코드` },
        ]}
        impacts={[
          'payroll_records에 선택 직원의 해당 월 정산 값이 확정 상태로 저장됩니다.',
          '실지급액, 과세/비과세, 공제, 근태 차감, 선지급 차감이 감사 로그에 남습니다.',
          '확정된 데이터는 급여명세서, 신고 파일, 연말/퇴직 정산 기준으로 사용됩니다.',
        ]}
        warnings={[
          '은행 계좌와 실지급액이 지급 파일과 일치하는지 확인하세요.',
          '확정 후 수정은 재정산 또는 별도 감사 로그가 필요한 운영 작업입니다.',
        ]}
        confirmLabel="정산 확정"
        onCancel={() => setShowFinalizeReview(false)}
        onConfirm={async () => {
          await handleFinalize();
          setShowFinalizeReview(false);
        }}
      />
    </div>
  );
}
