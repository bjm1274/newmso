'use client';
import { toast } from '@/lib/toast';
import type { StaffMember } from '@/types';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { withMissingColumnsFallback } from '@/lib/supabase-compat';
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
  type TaxInsuranceRates,
} from '@/lib/use-tax-insurance-rates';
import { buildPayrollVerificationReport } from '@/lib/payroll-governance';
import {
  buildShiftBoundary,
  buildFallbackShiftBoundary,
  calculateEarlyLeaveMinutes,
  buildDateWithTime,
} from '../../마이페이지/출퇴근기록/checkin-utils';
import { decideCheckInStatus } from '../../마이페이지/출퇴근기록/late-status';
import { upsertPayrollRecordsWithFallback } from '@/lib/payroll-record-upsert';
import { NP_INCOME_CEILING, NP_INCOME_FLOOR } from '@/lib/tax-free-limits';
import RiskActionDialog from '../RiskActionDialog';
import type {
  SettlementEntry,
  TaxableAllowanceBreakdown,
  SalaryAmountField,
  SalaryChangeHistoryRow,
  SalaryChangeProrationSummary,
  SavedPayrollRecord,
} from './급여정산-types';
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
} from './급여정산-utils';
import { Step1TargetSelection } from './급여정산-Step1TargetSelection';
import { SettlementStaffCard } from './급여정산-SettlementStaffCard';
import { VerificationReportPanel } from './급여정산-VerificationReportPanel';
import { Step3Complete } from './급여정산-Step3Complete';

export default function SalarySettlement({ staffs, selectedCo, onRefresh }: { staffs: StaffMember[]; selectedCo: string; onRefresh?: () => void }) {
  const [step, setStep] = useState(1);
  const [yearMonth, setYearMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedStaffs, setSelectedStaffs] = useState<StaffMember[]>([]);
  const [showFinalizeReview, setShowFinalizeReview] = useState(false);
  const [settlementData, setSettlementData] = useState<Record<string, SettlementEntry>>({});
  const [loading, setLoading] = useState(false);
  const [taxFreeLimits, setTaxFreeLimits] = useState<TaxFreeSettings>(DEFAULT_SETTINGS);
  const [taxInsuranceRates, setTaxInsuranceRates] = useState<TaxInsuranceRates>(DEFAULT_TAX_INSURANCE_RATES);
  const [savedRecordsByStaff, setSavedRecordsByStaff] = useState<Record<string, SavedPayrollRecord>>({});
  const [salaryChangesByStaff, setSalaryChangesByStaff] = useState<Record<string, SalaryChangeHistoryRow[]>>({});

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
          return supabase
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

  const getSavedDeductionDetail = (savedRecord?: SavedPayrollRecord | null) =>
    savedRecord?.deduction_detail && typeof savedRecord.deduction_detail === 'object'
      ? (savedRecord.deduction_detail as Record<string, unknown>)
      : {};

  const buildSettlementEntry = (
    staff: StaffMember,
    attendanceDeduction: number,
    attendanceDetail: Record<string, unknown>,
    salaryChangeMap: Record<string, SalaryChangeHistoryRow[]> = salaryChangesByStaff,
    autoOvertimeMins = 0,
    autoHolidayHours = 0,
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
        status: savedRecord?.status,
      });
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
    const changeAwareBreakdown: TaxableAllowanceBreakdown = { ...EMPTY_TAXABLE_ALLOWANCE_BREAKDOWN };
    const taxableChangeFields: Array<Exclude<keyof TaxableAllowanceBreakdown, 'manual_extra_allowance'>> = [
      'position_allowance',
      'overtime_allowance',
      'night_work_allowance',
      'holiday_work_allowance',
      'annual_leave_pay',
    ];
    taxableChangeFields.forEach((field) => {
      const result = resolveSalaryAmountForSettlement({
        savedValue: undefined,
        fallback: staffBreakdown[field],
        field,
        yearMonth,
        salaryChanges: staffSalaryChanges,
        staff,
        status: savedRecord?.status,
      });
      changeAwareBreakdown[field] = result.amount;
      if (result.summary) salaryChangeProration.push(result.summary);
    });

    // 통상시급 환산용 임시 draft 엔트리 빌드 후 통상시급 산출
    const draftEntryForHourlyRate: Partial<SettlementEntry> = {
      base_salary: baseSalary,
      meal_allowance: mealAllowance,
      night_duty_allowance: nightDutyAllowance,
      vehicle_allowance: vehicleAllowance,
      childcare_allowance: childcareAllowance,
      research_allowance: researchAllowance,
      other_taxfree: otherTaxfree,
      taxable_allowance_breakdown: changeAwareBreakdown,
    };
    const calculatedHourlyRate = getRegularHourlyRate(staff, draftEntryForHourlyRate);

    // 자동 가산수당 금액 계산 (가산 1.5배 적용)
    const autoOvertimePay = Math.round((autoOvertimeMins / 60) * calculatedHourlyRate * 1.5);
    const autoHolidayPay = Math.round(autoHolidayHours * calculatedHourlyRate * 1.5);
    const recommendedOvertimePay = autoOvertimePay + autoHolidayPay;

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
      apply_tax: savedDeductionDetail.apply_tax !== false && (staff.permissions?.insurance as Record<string, unknown>)?.income_tax !== false,
      apply_insurance: savedDeductionDetail.apply_insurance !== false && (staff.permissions?.insurance as Record<string, unknown>)?.national !== false,
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
      withholding_rate_percent: normalizeWithholdingRatePercent(
        (savedDeductionDetail.withholding_rate_percent ??
          (staff as Record<string, unknown>).withholding_rate_percent ??
          (staff.permissions?.payroll as Record<string, unknown>)?.withholding_rate_percent ??
          (staff.permissions?.tax as Record<string, unknown>)?.withholding_rate_percent ??
          100) as number | string | null | undefined,
      ),
      advance_pay: Number(savedRecord?.advance_pay ?? 0) || 0,
      salary_change_proration: salaryChangeProration,
      saved_status: String(savedRecord?.status || ''),
      taxable_allowance_breakdown: nextBreakdown,
      auto_overtime_pay: autoOvertimePay,
      auto_holiday_pay: autoHolidayPay,
      auto_overtime_minutes: autoOvertimeMins,
      auto_holiday_hours: autoHolidayHours,
      calculated_hourly_rate: calculatedHourlyRate,
    };
  };

  const handleNextStep = async () => {
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
        const { data: list } = await supabase
          .from('company_holidays')
          .select('holiday_date, company_name')
          .eq('is_active', 1)
          .gte('holiday_date', startDate)
          .lte('holiday_date', endDate);
        companyHolidaysList = list || [];
      } catch (holidayQueryError) {
        console.error('company holidays query failed:', holidayQueryError);
      }

      const ruleCompany = selectedCo === '전체' ? '전체' : selectedCo;
      const holidaysSet = new Set(
        companyHolidaysList
          .filter((h) => h.company_name === '전체' || h.company_name === ruleCompany)
          .map((h) => String(h.holiday_date).slice(0, 10))
      );

      const { data: attendances, error: attendanceError } = await supabase
        .from('attendances')
        .select('*')
        .in('staff_id', staffIds)
        .gte('work_date', startDate)
        .lte('work_date', endDate);
      if (attendanceError) throw attendanceError;

      const staffAutoAllowances: Record<string, { overtimeMins: number; holidayHours: number }> = {};
      selectedStaffs.forEach((s) => {
        staffAutoAllowances[String(s.id)] = { overtimeMins: 0, holidayHours: 0 };
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
                        shift_type: shift.shift_type ? String(shift.shift_type) : null,
                      },
                    ])
                );

                // shiftAssignment 날짜별 shift 정보 맵: "staffId_workDate" → shiftId
                const assignmentMap = new Map<string, string>();
                shiftAssignments.forEach((row) => {
                  const shiftId = String(row.shift_id || '').trim();
                  if (!shiftId || offLikeShiftIds.has(shiftId)) return;
                  const workDate = String(row.work_date || '').slice(0, 10);
                  if (!workDate) return;
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
                          rosterAssigned: true,
                        }
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
                        early_leave_minutes: earlyLeaveMinutes,
                      });
                    }

                    // ─── 자동 수당(연장/휴일) 적산 로직 ───
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
                      const isHoliday = isSunday || isSaturday || holidaysSet.has(workDate);

                      if (isHoliday) {
                        if (staffAutoAllowances[staffId]) {
                          staffAutoAllowances[staffId].holidayHours += scheduledHours;
                        }
                      }

                      // 3. 연장근로 시간 계산
                      if (boundary.shiftKnown && boundary.endHour !== null && boundary.endMinute !== null) {
                        const scheduledStart = buildDateWithTime(workDate, boundary.hour, boundary.minute);
                        const scheduledEnd = buildDateWithTime(workDate, boundary.endHour, boundary.endMinute);
                        if (scheduledEnd.getTime() <= scheduledStart.getTime()) {
                          scheduledEnd.setDate(scheduledEnd.getDate() + 1);
                        }

                        const actualCheckOut = new Date(checkOut);
                        if (!Number.isNaN(actualCheckOut.getTime())) {
                          // 야간 체크아웃 일자 보정
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
                    }
                    // ─── 자동 수당(연장/휴일) 적산 로직 끝 ───
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

      const initialData: Record<string, SettlementEntry> = {};
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
        const autoAllow = staffAutoAllowances[s.id] || { overtimeMins: 0, holidayHours: 0 };
        initialData[s.id] = buildSettlementEntry(
          s,
          total,
          detail,
          latestSalaryChangesByStaff,
          autoAllow.overtimeMins,
          autoAllow.holidayHours
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
        [id]: nextEntry,
      };
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
      // 1. 국민연금 - 기준소득월액 상·하한 적용 (2025.7~2026.6: 상한 617만원, 하한 39만원)
      //    두루누리 80% 지원 적용 시 근로자 부담분 20%만 부과
      const npBase = Math.min(Math.max(total_taxable, NP_INCOME_FLOOR), NP_INCOME_CEILING);
      const full_national = Math.floor(npBase * taxInsuranceRates.national_pension_rate);
      national_pension = isDuruNuriActive ? Math.floor(full_national * 0.2) : full_national;

      // 2. 건강보험 - 의료급여 수급자는 제외(0원)
      //    장기요양보험 = 과세소득 × DB 저장 요율(기본 0.46% ≈ 건강보험료×12.95%)
      if (!isMedicalBenefit) {
        health_insurance = Math.floor(total_taxable * taxInsuranceRates.health_insurance_rate);
        long_term_care = Math.floor(total_taxable * taxInsuranceRates.long_term_care_rate);
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
      apply_tax: data.apply_tax,
      apply_insurance: data.apply_insurance,
      taxable_allowance_breakdown: data.taxable_allowance_breakdown,
      salary_change_proration: data.salary_change_proration || [],
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

  const persistSettlement = async (targetStatus: '임시저장' | '확정') => {
    setLoading(true);
    try {
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
          calculated_hourly_rate: Number(data?.calculated_hourly_rate || 0),
        };

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
          deduction_detail: deductionDetail,
          net_pay: netPay,
          attendance_deduction: Math.round(Number(data?.attendance_deduction) || 0),
          attendance_deduction_detail: data?.attendance_deduction_detail || {},
          advance_pay: advancePay,
          record_type: 'regular',
          status: targetStatus,
        };
      });

      const { error: payrollSaveError } = await upsertPayrollRecordsWithFallback({
        records: records as Record<string, unknown>[],
        optionalColumns: [...PAYROLL_RECORD_OPTIONAL_COLUMNS],
      });
      if (payrollSaveError) throw payrollSaveError;

      setSavedRecordsByStaff((prev) => ({
        ...prev,
        ...Object.fromEntries(records.map((record) => [String(record.staff_id), record as SavedPayrollRecord])),
      }));
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
        staffIds: selectedStaffs.map((staff: StaffMember) => staff.id),
      });
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
              net_pay_before_advance: Math.round(Number(calc?.net || 0)),
            },
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
        optionalColumns: [...PAYROLL_RECORD_OPTIONAL_COLUMNS],
      });
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
              net_pay: record.net_pay,
            };
          }),
        },
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
                disabled={loading}
                className="flex-1 py-3 bg-amber-500 text-white text-sm font-semibold rounded-[var(--radius-md)] hover:opacity-90 disabled:opacity-50"
              >
                {loading ? '처리 중...' : '임시 저장'}
              </button>
              <button data-testid="salary-settlement-finalize-button" onClick={() => setShowFinalizeReview(true)} disabled={loading || !hasExactIncomeTaxBracket(taxInsuranceRates) || hasBlockingVerificationIssues} className="flex-[2] py-3 bg-[var(--accent)] text-white text-sm font-semibold rounded-[var(--radius-md)] hover:opacity-90 disabled:opacity-50">
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
