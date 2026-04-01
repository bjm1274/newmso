'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { withMissingColumnsFallback } from '@/lib/supabase-compat';
import SmartMonthPicker from '../../공통/SmartMonthPicker';
import { calculateAttendanceDeduction, type AttendanceRecord, type DeductionRule } from '@/lib/attendance-deduction';

type StaffLite = {
  id: string;
  name: string;
  company?: string;
  department?: string;
  base_salary?: number | null;
  status?: string;
};

type AttendanceDeductionSimulatorProps = {
  staffs: StaffLite[];
  selectedCo: string;
};

const EMPTY_RULE: DeductionRule = {
  late_deduction_type: 'fixed',
  late_deduction_amount: 10000,
  early_leave_deduction_type: 'fixed',
  early_leave_deduction_amount: 10000,
  absent_use_daily_rate: true,
};

const ATTENDANCE_REQUIRED_COLUMNS = [
  'staff_id',
  'work_date',
  'status',
  'check_in_time',
  'check_out_time',
] as const;

const ATTENDANCE_OPTIONAL_COLUMNS = ['late_minutes', 'early_leave_minutes'] as const;

function buildSelectColumns(
  requiredColumns: readonly string[],
  optionalColumns: readonly string[] = [],
  omittedColumns?: ReadonlySet<string>,
) {
  return [...requiredColumns, ...optionalColumns.filter((column) => !omittedColumns?.has(column))].join(', ');
}

function normalizeQueryError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    return {
      code: record.code ?? null,
      message: String(record.message ?? ''),
      details: String(record.details ?? ''),
      hint: String(record.hint ?? ''),
    };
  }

  return { message: String(error ?? 'unknown error') };
}

export default function AttendanceDeductionSimulator({
  staffs,
  selectedCo,
}: AttendanceDeductionSimulatorProps) {
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [baseSalary, setBaseSalary] = useState<number>(0);
  const [rule, setRule] = useState<DeductionRule>(EMPTY_RULE);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [scheduledWorkDays, setScheduledWorkDays] = useState<number>(0);

  const filteredStaffs = useMemo(
    () =>
      staffs.filter((staff) => {
        if (selectedCo !== '전체' && staff.company !== selectedCo) return false;
        return staff.status !== '퇴사';
      }),
    [selectedCo, staffs]
  );

  useEffect(() => {
    if (!selectedStaffId && filteredStaffs[0]?.id) {
      setSelectedStaffId(filteredStaffs[0].id);
    }
  }, [filteredStaffs, selectedStaffId]);

  useEffect(() => {
    const staff = filteredStaffs.find((item) => item.id === selectedStaffId);
    setBaseSalary(Number(staff?.base_salary || 0));
  }, [filteredStaffs, selectedStaffId]);

  useEffect(() => {
    let active = true;

    const fetchRule = async () => {
      try {
        const companies = selectedCo !== '전체' ? [selectedCo, '전체'] : ['전체'];
        const { data, error } = await supabase
          .from('attendance_deduction_rules')
          .select('*')
          .in('company_name', companies)
          .order('updated_at', { ascending: false });

        if (error) throw error;

        const preferred =
          (data || []).find((item: any) => item.company_name === selectedCo) ||
          (data || []).find((item: any) => item.company_name === '전체');

        if (active && preferred) {
          setRule({
            late_deduction_type: preferred.late_deduction_type || 'fixed',
            late_deduction_amount: Number(preferred.late_deduction_amount || 0),
            early_leave_deduction_type: preferred.early_leave_deduction_type || 'fixed',
            early_leave_deduction_amount: Number(preferred.early_leave_deduction_amount || 0),
            absent_use_daily_rate: preferred.absent_use_daily_rate ?? true,
          });
        }
      } catch (error) {
        console.error('근태 차감 규칙 조회 실패:', error);
        if (active) setRule(EMPTY_RULE);
      }
    };

    void fetchRule();
    return () => {
      active = false;
    };
  }, [selectedCo]);

  useEffect(() => {
    let active = true;

    const fetchAttendance = async () => {
      if (!selectedStaffId) {
        if (active) {
          setRecords([]);
          setScheduledWorkDays(0);
        }
        return;
      }

      const [year, month] = selectedMonth.split('-').map(Number);
      const lastDay = new Date(year, month, 0).getDate();
      const startDate = `${selectedMonth}-01`;
      const endDate = `${selectedMonth}-${String(lastDay).padStart(2, '0')}`;

      try {
        const { data: attendanceRows, error: attendanceError } = await withMissingColumnsFallback(
          (omittedColumns) =>
            supabase
              .from('attendances')
              .select(buildSelectColumns(ATTENDANCE_REQUIRED_COLUMNS, ATTENDANCE_OPTIONAL_COLUMNS, omittedColumns))
              .eq('staff_id', selectedStaffId)
              .gte('work_date', startDate)
              .lte('work_date', endDate),
          [...ATTENDANCE_OPTIONAL_COLUMNS],
        );

        if (attendanceError) throw attendanceError;

        const { data: shiftRows, error: shiftError } = await supabase
          .from('shift_assignments')
          .select('staff_id, work_date, shift_id')
          .eq('staff_id', selectedStaffId)
          .gte('work_date', startDate)
          .lte('work_date', endDate);

        if (shiftError) {
          console.warn('근태 차감 시뮬레이터 근무 배정 조회 실패:', {
            month: selectedMonth,
            staffId: selectedStaffId,
            selectedCo,
            error: normalizeQueryError(shiftError),
          });
        }

        const normalizedAttendanceRows = (attendanceRows || []) as unknown as AttendanceRecord[];

        if (active) {
          setRecords(normalizedAttendanceRows);
          setScheduledWorkDays((shiftRows || []).filter((row: any) => row.shift_id).length);
        }
      } catch (error) {
        console.error('근태 차감 시뮬레이터 조회 실패:', {
          month: selectedMonth,
          staffId: selectedStaffId,
          selectedCo,
          error: normalizeQueryError(error),
        });
        if (active) {
          setRecords([]);
          setScheduledWorkDays(0);
        }
      }
    };

    void fetchAttendance();
    return () => {
      active = false;
    };
  }, [selectedCo, selectedMonth, selectedStaffId]);

  const result = useMemo(
    () => calculateAttendanceDeduction(baseSalary, selectedMonth, records, rule, { scheduledWorkDays }),
    [baseSalary, records, rule, scheduledWorkDays, selectedMonth]
  );

  const selectedStaff = filteredStaffs.find((staff) => staff.id === selectedStaffId);

  return (
    <div className="space-y-4" data-testid="attendance-deduction-simulator-view">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="text-sm font-bold text-[var(--foreground)]">근태 차감 시뮬레이터</h3>
            <p className="mt-1 text-xs font-medium text-[var(--toss-gray-4)]">
              지각/조퇴/결근 근태를 기준으로 예상 차감액을 미리 검산합니다.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <select
              value={selectedStaffId}
              onChange={(event) => setSelectedStaffId(event.target.value)}
              className="rounded-xl border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-xs font-semibold text-[var(--foreground)]"
            >
              <option value="">직원 선택</option>
              {filteredStaffs.map((staff) => (
                <option key={staff.id} value={staff.id}>
                  {staff.name} ({staff.department || '부서 미지정'})
                </option>
              ))}
            </select>
            <SmartMonthPicker
              value={selectedMonth}
              onChange={setSelectedMonth}
              className="rounded-xl border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-xs font-semibold text-[var(--foreground)]"
            />
            <input
              type="number"
              value={baseSalary || 0}
              onChange={(event) => setBaseSalary(Number(event.target.value) || 0)}
              className="rounded-xl border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-xs font-semibold text-[var(--foreground)]"
              placeholder="기본급"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
          <h4 className="text-sm font-bold text-[var(--foreground)]">차감 계산 결과</h4>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-blue-100 bg-blue-500/10 p-4">
              <p className="text-[11px] font-bold text-blue-600">총 차감액</p>
              <p className="mt-2 text-2xl font-bold text-blue-700">₩ {result.total.toLocaleString()}</p>
            </div>
            <div className="rounded-xl border border-orange-100 bg-orange-500/10 p-4">
              <p className="text-[11px] font-bold text-orange-600">지각 차감</p>
              <p className="mt-2 text-xl font-bold text-orange-700">₩ {result.detail.late.toLocaleString()}</p>
            </div>
            <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
              <p className="text-[11px] font-bold text-amber-600">조퇴 차감</p>
              <p className="mt-2 text-xl font-bold text-amber-700">₩ {result.detail.early_leave.toLocaleString()}</p>
            </div>
            <div className="rounded-xl border border-red-100 bg-red-500/10 p-4">
              <p className="text-[11px] font-bold text-red-600">결근 차감</p>
              <p className="mt-2 text-xl font-bold text-red-700">₩ {result.detail.absent.toLocaleString()}</p>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--hover-bg)] p-4 text-xs text-[var(--toss-gray-4)]">
            <p>직원: <span className="font-semibold text-[var(--foreground)]">{selectedStaff?.name || '미선택'}</span></p>
            <p className="mt-1">기본급: ₩ {baseSalary.toLocaleString()}</p>
            <p className="mt-1">실제 배정 근무일수: {scheduledWorkDays || 0}일</p>
            <p className="mt-1">대상 근태 기록: {records.length}건</p>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
          <h4 className="text-sm font-bold text-[var(--foreground)]">적용 규칙</h4>
          <div className="mt-4 space-y-3 text-xs">
            <div className="rounded-xl border border-[var(--border)] p-3">
              <p className="font-semibold text-[var(--foreground)]">지각 차감</p>
              <p className="mt-1 text-[var(--toss-gray-4)]">
                {rule.late_deduction_type === 'hourly'
                  ? `시급/시간 기준 (${rule.late_deduction_amount.toLocaleString()} 기준값)`
                  : `회당 고정액 (${rule.late_deduction_amount.toLocaleString()}원)`}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--border)] p-3">
              <p className="font-semibold text-[var(--foreground)]">조퇴 차감</p>
              <p className="mt-1 text-[var(--toss-gray-4)]">
                {rule.early_leave_deduction_type === 'hourly'
                  ? `시급/시간 기준 (${rule.early_leave_deduction_amount.toLocaleString()} 기준값)`
                  : `회당 고정액 (${rule.early_leave_deduction_amount.toLocaleString()}원)`}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--border)] p-3">
              <p className="font-semibold text-[var(--foreground)]">결근 차감</p>
              <p className="mt-1 text-[var(--toss-gray-4)]">
                {rule.absent_use_daily_rate ? '실제 근무일수 기준 일할 차감' : '차감 안 함'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
