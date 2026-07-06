'use client';

import { useEffect, useState } from 'react';
import { toast } from '@/lib/toast';
import { db } from '@/lib/db-client';
import { calculateAttendanceDeduction } from '@/lib/attendance-deduction';
import { logAudit } from '@/lib/audit';
import { formatPayrollMutationError } from '@/lib/payroll-records';
import {
  calculateMonthlyIncomeTax,
  calculateQualifyingChildTaxCredit,
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
import { NIGHT_DUTY_TAX_FREE_LIMIT } from '@/lib/tax-free-limits';
import { calcStatutoryDeductions } from '@/lib/payroll-deductions';
import { getPayrollInsuranceSettings, resolvePayrollAsOfDate, hasAnyEmployeePayrollInsurance } from '@/lib/payroll-insurance-settings';
import RiskActionDialog from '../RiskActionDialog';
import type { StaffMember } from '@/types';
import { STORAGE_KEYS } from '@/lib/storage-keys';
import type { TaxFreeSettings } from '@/lib/use-tax-free-settings';
import type {
  SettlementEntry,
  TaxableAllowanceBreakdown,
  SalaryAmountField,
  SalaryChangeHistoryRow,
  SalaryChangeProrationSummary,
  SavedPayrollRecord } from './급여정산-types';
import {
  PAYROLL_RECORD_OPTIONAL_COLUMNS,
  EMPTY_TAXABLE_ALLOWANCE_BREAKDOWN,
  getRegularHourlyRate,
  getTaxableAllowanceBreakdownTotal,
  getStaffTaxableAllowanceBreakdown,
  normalizeTaxableAllowanceBreakdown,
  resolveSalaryAmountForSettlement,
  getEmploymentProratedBaseForMonth } from './급여정산-utils';
import { SettlementStaffCard } from './급여정산-SettlementStaffCard';
import { VerificationReportPanel } from './급여정산-VerificationReportPanel';
import { KOREAN_PUBLIC_HOLIDAY_DATES } from '@/lib/korean-public-holidays';

export interface Step2SettlementProps {
  selectedStaffs: StaffMember[];
  yearMonth: string;
  selectedCo: string;
  taxFreeLimits: TaxFreeSettings;
  taxInsuranceRates: TaxInsuranceRates;
  savedRecordsByStaff: Record<string, SavedPayrollRecord>;
  salaryChangesByStaff: Record<string, SalaryChangeHistoryRow[]>;
  isLocked: boolean;
  onBack: () => void;
  onSaveSuccess: () => void;
  setSavedRecordsByStaff?: React.Dispatch<React.SetStateAction<Record<string, SavedPayrollRecord>>>;
  onRefresh?: () => void;
}

export function Step2Settlement({
  selectedStaffs,
  yearMonth,
  selectedCo,
  taxFreeLimits,
  taxInsuranceRates,
  savedRecordsByStaff,
  salaryChangesByStaff,
  isLocked,
  onBack,
  onSaveSuccess,
  setSavedRecordsByStaff,
  onRefresh }: Step2SettlementProps) {
  const [settlementData, setSettlementData] = useState<Record<string, SettlementEntry>>({});
  const [showFinalizeReview, setShowFinalizeReview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [companyWithholdingRate, setCompanyWithholdingRate] = useState<number>(100);

  const TAX_FREE_LIMITS = {
    meal: taxFreeLimits.meal_limit,
    vehicle: taxFreeLimits.vehicle_limit,
    childcare: taxFreeLimits.childcare_limit,
    research: taxFreeLimits.research_limit };

  // 회사 급여기준(company_payroll_policies)의 '원천징수 비율'을 정산 단일 기본값으로 로드
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

    const autoOvertimePay = Math.round((autoOvertimeMins / 60) * calculatedHourlyRate * 1.5);
    // [휴일수당/야간수당 자동 계산 제외 요구사항에 따라 계산 0 처리]
    const autoHolidayPay  = 0;
    const autoNightPay    = 0;
    const recommendedOvertimePay = autoOvertimePay;

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
      if (field === 'holiday_work_allowance' || field === 'night_work_allowance') {
        fallbackVal = 0;
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

  useEffect(() => {
    let active = true;
    const loadData = async () => {
      setLoading(true);
      try {
        const staffIds = selectedStaffs.map((s) => String(s.id));
        if (staffIds.length === 0) {
          if (active) {
            setSettlementData({});
            setLoading(false);
          }
          return;
        }
        const [year, month] = yearMonth.split('-').map(Number);
        const lastDay = new Date(year, month, 0).getDate();
        const [startDate, endDate] = [`${yearMonth}-01`, `${yearMonth}-${String(lastDay).padStart(2, '0')}`];

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

                    if (checkIn && checkOut) {
                      const dayOfWeek = new Date(workDate).getDay();
                      const isSunday = dayOfWeek === 0;
                      const isSaturday = dayOfWeek === 6;
                      const isHoliday =
                        isSunday ||
                        isSaturday ||
                        holidaysSet.has(workDate) ||
                        rosterOffSet.has(`${staffId}_${workDate}`);

                      if (isHoliday) {
                        const actualCheckInDate = new Date(checkIn);
                        const actualCheckOutDate = new Date(checkOut);
                        if (
                          staffAutoAllowances[staffId] &&
                          !Number.isNaN(actualCheckInDate.getTime()) &&
                          !Number.isNaN(actualCheckOutDate.getTime())
                        ) {
                          const actualWorkMins = Math.max(
                            0,
                            (actualCheckOutDate.getTime() - actualCheckInDate.getTime()) / 60000 - 60
                          );
                          const actualWorkHours = actualWorkMins / 60;
                          // [비결재 연장근무 수당 자동반영 제외 요구사항에 따라 실제 출퇴근 기반 휴일근무 시간 합산 제거]
                          // staffAutoAllowances[staffId].holidayHours += actualWorkHours;
                        }
                      }

                      if (!isHoliday && boundary.shiftKnown && boundary.endHour !== null && boundary.endMinute !== null) {
                        const scheduledStart = buildDateWithTime(workDate, boundary.hour, boundary.minute);
                        const scheduledEnd = buildDateWithTime(workDate, boundary.endHour, boundary.endMinute);
                        if (scheduledEnd.getTime() <= scheduledStart.getTime()) {
                          scheduledEnd.setDate(scheduledEnd.getDate() + 1);
                        }

                        const actualCheckOut = new Date(checkOut);
                        if (!Number.isNaN(actualCheckOut.getTime())) {
                          const endMin = boundary.endHour * 60 + boundary.endMinute;
                          const startMin = boundary.hour * 60 + boundary.minute;
                          const isNightShift = endMin < startMin;
                          if (isNightShift && actualCheckOut.getTime() < scheduledStart.getTime()) {
                            scheduledStart.setDate(scheduledStart.getDate() - 1);
                            scheduledEnd.setDate(scheduledEnd.getDate() - 1);
                          }

                          if (actualCheckOut.getTime() > scheduledEnd.getTime()) {
                            const otMins = Math.round((actualCheckOut.getTime() - scheduledEnd.getTime()) / 60000);
                            if (otMins >= 10) {
                              if (staffAutoAllowances[staffId]) {
                                // [비결재 연장근무 수당 자동반영 제외 요구사항에 따라 실제 출퇴근 기반 평일 연장시간 합산 제거]
                                // staffAutoAllowances[staffId].overtimeMins += otMins;
                              }
                            }
                          }
                        }
                      }

                      if (staffAutoAllowances[staffId]) {
                        const ciDate = new Date(checkIn);
                        const coDate = new Date(checkOut);
                        if (!Number.isNaN(ciDate.getTime()) && !Number.isNaN(coDate.getTime())) {
                          const ciMs = ciDate.getTime();
                          const coMs = coDate.getTime();
                          let nightMins = 0;
                          const checkInDay = new Date(ciDate);
                          checkInDay.setHours(0, 0, 0, 0);

                          for (let dayOffset = 0; dayOffset <= 2; dayOffset++) {
                            const dayStart = checkInDay.getTime() + dayOffset * 86400000;
                            const nightStart1 = dayStart + 22 * 3600000;
                            const nightEnd1   = dayStart + 24 * 3600000;
                            const overlap1Start = Math.max(ciMs, nightStart1);
                            const overlap1End   = Math.min(coMs, nightEnd1);
                            if (overlap1End > overlap1Start) {
                              nightMins += Math.round((overlap1End - overlap1Start) / 60000);
                            }
                            const nightStart2 = dayStart;
                            const nightEnd2   = dayStart + 6 * 3600000;
                            const overlap2Start = Math.max(ciMs, nightStart2);
                            const overlap2End   = Math.min(coMs, nightEnd2);
                            if (overlap2End > overlap2Start) {
                              nightMins += Math.round((overlap2End - overlap2Start) / 60000);
                            }
                          }

                          // [비결재 연장근무 수당 자동반영 제외 요구사항에 따라 실제 출퇴근 기반 야간 시간 합산 제거]
                          // staffAutoAllowances[staffId].nightWorkMins += nightMins;
                        }
                      }
                    }
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
            }
          }
        } catch (e) {
          console.warn('roster loader failed:', e);
        }

        // ─── 승인된 전자결재(연장근무 신청) 반영 로직 추가 ───
        try {
          const { data: approvals, error: approvalsError } = await db
            .from('approvals')
            .select('id, sender_id, type, title, status, meta_data, created_at')
            .eq('status', '승인')
            .in('sender_id', staffIds);

          if (approvalsError) {
            console.error('Approvals query failed:', approvalsError);
          } else if (approvals && Array.isArray(approvals)) {
            approvals.forEach((app) => {
              let meta: any = null;
              try {
                meta = typeof app.meta_data === 'string' ? JSON.parse(app.meta_data) : app.meta_data;
              } catch (e) {
                return;
              }

              if (meta?.form_slug === 'overtime' || app.type === '연장근무') {
                const senderId = String(app.sender_id || '');
                const items = Array.isArray(meta?.items) ? meta.items : [];

                items.forEach((item: any) => {
                  const itemDate = item?.date;
                  if (itemDate && itemDate >= startDate && itemDate <= endDate) {
                    const mins = Number(item?.minutes || 0);
                    if (mins > 0 && staffAutoAllowances[senderId]) {
                      staffAutoAllowances[senderId].overtimeMins += mins;
                    }
                  }
                });
              }
            });
          }
        } catch (otApprovalErr) {
          console.error('Failed to parse overtime approvals:', otApprovalErr);
        }

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
            salaryChangesByStaff,
            autoAllow.overtimeMins,
            autoAllow.holidayHours,
            autoAllow.nightWorkMins,
          );
        });

        if (active) {
          setSettlementData(initialData);
          setLoading(false);
        }
      } catch (e) {
        console.error(e);
        toast('근태 데이터 로드 실패', 'error');
        if (active) setLoading(false);
      }
    };

    loadData();
    return () => { active = false; };
  }, [selectedStaffs, yearMonth, selectedCo, companyWithholdingRate]);

  const updateData = (id: string, field: string, value: any) => {
    setSettlementData((prev) => {
      const current = prev[id];
      if (!current) return prev;

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

    const meal_tf = Math.min(Number(data.meal_allowance), TAX_FREE_LIMITS.meal);
    const meal_taxable = Math.max(0, Number(data.meal_allowance) - TAX_FREE_LIMITS.meal);

    const vehicle_tf = Math.min(Number(data.vehicle_allowance), TAX_FREE_LIMITS.vehicle);
    const vehicle_taxable = Math.max(0, Number(data.vehicle_allowance) - TAX_FREE_LIMITS.vehicle);

    const childcare_tf = Math.min(Number(data.childcare_allowance), TAX_FREE_LIMITS.childcare);
    const childcare_taxable = Math.max(0, Number(data.childcare_allowance) - TAX_FREE_LIMITS.childcare);

    const nightDutyRaw = Number(data.night_duty_allowance) || 0;
    const nightDuty_tf = Math.min(nightDutyRaw, NIGHT_DUTY_TAX_FREE_LIMIT);
    const nightDuty_taxable = Math.max(0, nightDutyRaw - NIGHT_DUTY_TAX_FREE_LIMIT);

    const research_tf = Math.min(Number(data.research_allowance), TAX_FREE_LIMITS.research);
    const research_taxable = Math.max(0, Number(data.research_allowance) - TAX_FREE_LIMITS.research);

    const otherTaxfreeRaw = Number(data.other_taxfree) || 0;
    const otherTaxfreeLimit = taxFreeLimits.other_taxfree_limit || 0;
    const otherTaxfree_tf = otherTaxfreeLimit > 0 ? Math.min(otherTaxfreeRaw, otherTaxfreeLimit) : 0;
    const otherTaxfree_taxable = otherTaxfreeRaw - otherTaxfree_tf;

    const total_taxfree = meal_tf + vehicle_tf + childcare_tf + research_tf + nightDuty_tf + otherTaxfree_tf;

    const attendance_deduction = Number(data.attendance_deduction) || 0;
    const total_taxable = Number(data.base_salary) + meal_taxable + vehicle_taxable + childcare_taxable + research_taxable +
      nightDuty_taxable + otherTaxfree_taxable +
      Number(data.overtime_pay) + Number(data.bonus) + Number(data.extra_allowance) - attendance_deduction;

    const total_payment = total_taxable + total_taxfree;

    const staff = selectedStaffs.find((s: StaffMember) => String(s.id) === String(id));
    const insSettings = (staff?.permissions?.insurance as Record<string, unknown>) || {};
    const isMedicalBenefit = Boolean(staff?.permissions?.is_medical_benefit) || false;

    let isDuruNuriActive = Boolean(insSettings.duru_nuri) || false;
    if (isDuruNuriActive && insSettings.duru_nuri_start && insSettings.duru_nuri_end) {
      const current = yearMonth;
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

      if (setSavedRecordsByStaff) {
        setSavedRecordsByStaff((prev) => ({
          ...prev,
          ...Object.fromEntries(records.map((record) => [String(record.staff_id), record as SavedPayrollRecord])) }));
      }

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
    onSaveSuccess();
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

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[var(--accent)]"></div>
        <p className="text-sm text-[var(--toss-gray-3)] font-medium">근태 및 급여 변경 데이터 로드 중...</p>
      </div>
    );
  }

  return (
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
        <button data-testid="salary-settlement-back-button" onClick={onBack} className="flex-1 py-3 bg-[var(--card)] border border-[var(--border)] text-[var(--toss-gray-4)] text-sm font-medium rounded-[var(--radius-md)] hover:bg-[var(--muted)]">이전</button>
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
