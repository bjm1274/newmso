'use client';
import { toast } from '@/lib/toast';
import type { StaffMember as AppStaffMember } from '@/types';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useActionDialog } from '@/app/components/useActionDialog';
import { withMissingColumnsFallback } from '@/lib/supabase-compat';
import { filterRosterShiftsForDepartment } from '@/lib/roster-shift-team-filter';
import { isActiveStaff } from '@/lib/active-staff';
import SmartMonthPicker from '../../공통/SmartMonthPicker';
import AttendanceIssueAnalysisSuite from '../근태이상통합분석';
import LeaveManagement from '../휴가신청/휴가관리메인';
import AttendanceDeductionSimulator from '../휴가신청/근태차감시뮬레이터';
import AttendanceAnomalyPanel from '../휴가신청/근태이상탐지';
import { MenuIcon } from '../../조직도서브/조직도측면창';
import { ResponsiveTable, type Column } from '@/app/components/ResponsiveTable';
import AttendanceBulkEditModal from './근태일괄수정모달';

type StaffMember = {
  id: string;
  name: string;
  position: string;
  department: string;
  company: string;
  shift_type?: string;
  status?: string | null;
  [key: string]: unknown;
};

const ROSTER_CREATOR_POSITIONS = ['간호과장', '간호부장', '실장'];
const ROSTER_APPROVER_POSITIONS = ['총무부장', '이사'];
const ROSTER_APPROVER_COMPANIES = ['SY INC.'];
const LEGACY_ROSTER_APPROVAL_TYPE = 'roster_schedule_approval';
const LEGACY_APPROVAL_PENDING_STATUS = '\uB300\uAE30';
const LEGACY_APPROVAL_APPROVED_STATUS = '\uC2B9\uC778';
const LEGACY_APPROVAL_REJECTED_STATUS = '\uBC18\uB824';

type AttendanceMainView = 'calendar' | 'dashboard' | 'schedule' | 'leave' | 'issues';

type AttendanceMainProps = {
  staffs: StaffMember[];
  selectedCo: string;
  user?: AppStaffMember | Record<string, unknown> | null;
  onRefresh?: () => void;
  initialView?: AttendanceMainView;
  initialLeaveTab?: string;
};

function padDay(day: number) {
  return String(day).padStart(2, '0');
}

function buildAttendanceKey(staffId: string, workDate: string) {
  return `${staffId}_${workDate}`;
}

function isMissingRosterWorkflowTableError(error: unknown, tableName: string) {
  const payload = error as {
    code?: string | null;
    message?: string | null;
    details?: string | null;
    hint?: string | null;
  } | null;
  const code = String(payload?.code || '').trim();
  const message = [payload?.message, payload?.details, payload?.hint]
    .map((value) => String(value || '').toLowerCase())
    .join(' ');

  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    message.includes(tableName.toLowerCase()) ||
    (message.includes('schema cache') && message.includes('could not find the table'))
  );
}

function mapLegacyApprovalRequest(row: any) {
  const metaData =
    row?.meta_data && typeof row.meta_data === 'object' && !Array.isArray(row.meta_data)
      ? (row.meta_data as Record<string, unknown>)
      : {};
  const rawStatus = String(row?.status || '').trim();

  return {
    id: row?.id,
    company_name: String(metaData.company_name || row?.sender_company || '').trim(),
      team_name: String(metaData.team_name || '').trim() || '전체',
    year_month: String(metaData.year_month || '').trim(),
    assignments: Array.isArray(metaData.assignments) ? metaData.assignments : [],
    requested_by: String(row?.sender_id || '').trim() || null,
    requested_by_name: String(row?.sender_name || '').trim() || null,
    status:
      rawStatus === LEGACY_APPROVAL_PENDING_STATUS
        ? 'pending'
        : rawStatus === LEGACY_APPROVAL_APPROVED_STATUS
          ? 'approved'
          : rawStatus === LEGACY_APPROVAL_REJECTED_STATUS
            ? 'rejected'
            : rawStatus,
    created_at: row?.created_at || null,
    meta_data: metaData,
    _source: 'approvals',
  };
}

function isLegacyApprovalRequest(request: any) {
  return String(request?._source || '').trim() === 'approvals';
}

function resolveAttendanceStatus(attendance: any, isWeekend = false) {
  const rawStatus = String(attendance?.status || '').trim();
  if (rawStatus === 'present' || rawStatus === 'late' || rawStatus === 'early_leave') {
    if (attendance?.check_in_time || attendance?.check_out_time) return rawStatus;
    return '';
  }
  if (rawStatus) return rawStatus;
  if (attendance?.check_in_time || attendance?.check_out_time) return 'present';
  return isWeekend ? 'holiday' : '';
}

type ApprovedLeaveRow = {
  staff_id: string;
  start_date: string;
  end_date: string;
  leave_type: string;
  status: string;
};

/** 버그 B 수정: 특정 직원·날짜에 승인된 연차/휴가가 있으면 대응 status 문자열을 반환 */
function resolveLeaveStatusForDate(
  staffId: string,
  dateStr: string,
  approvedLeaves: ApprovedLeaveRow[],
): string | null {
  const match = approvedLeaves.find((row) => {
    if (row.staff_id !== staffId) return false;
    const start = String(row.start_date || '').slice(0, 10);
    const end = String(row.end_date || row.start_date || '').slice(0, 10);
    return dateStr >= start && dateStr <= end;
  });
  if (!match) return null;
  const lt = String(match.leave_type || '').trim();
  if (lt === '반차' || lt.startsWith('반차') || lt === 'half_leave') return 'half_leave';
  if (lt === '병가' || lt === 'sick_leave') return 'sick_leave';
  return 'annual_leave';
}

/**
 * 버그 B 수정: 근태 기록과 승인 연차를 합산하여 최종 상태를 결정한다.
 * - 실제 출퇴근 기록이 있으면 우선
 * - 없거나 absent인데 승인 연차가 있으면 연차 상태로 대체
 */
function resolveAttendanceStatusWithLeave(
  attendance: any,
  leaveStatus: string | null | undefined,
  isWeekend = false,
): string {
  const attStatus = resolveAttendanceStatus(attendance, isWeekend);
  if (attStatus === 'present' || attStatus === 'late' || attStatus === 'early_leave') {
    return attStatus;
  }
  if ((!attStatus || attStatus === 'absent') && leaveStatus) {
    return leaveStatus;
  }
  return attStatus;
}

function isWorkedAttendanceStatus(status: string) {
  return status === 'present' || status === 'late' || status === 'early_leave';
}

const ATTENDANCE_STATUS_META = {
  present: { label: '정상 출근', color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30', ring: 'ring-emerald-200 dark:ring-emerald-800/50', dot: 'bg-emerald-500' },
  late: { label: '지각', color: 'text-orange-700 dark:text-orange-400', bg: 'bg-orange-500/10 dark:bg-orange-900/30', ring: 'ring-orange-200 dark:ring-orange-800/50', dot: 'bg-orange-500' },
  early_leave: { label: '조퇴', color: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30', ring: 'ring-amber-200 dark:ring-amber-800/50', dot: 'bg-amber-500' },
  absent: { label: '결근', color: 'text-rose-700 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-900/30', ring: 'ring-rose-200 dark:ring-rose-800/50', dot: 'bg-rose-500' },
  annual_leave: { label: '연차', color: 'text-blue-700 dark:text-blue-400', bg: 'bg-blue-500/10 dark:bg-blue-900/30', ring: 'ring-blue-200 dark:ring-blue-800/50', dot: 'bg-blue-500' },
  sick_leave: { label: '병가', color: 'text-purple-700 dark:text-purple-400', bg: 'bg-purple-500/10 dark:bg-purple-900/30', ring: 'ring-purple-200 dark:ring-purple-800/50', dot: 'bg-purple-500' },
  half_leave: { label: '반차', color: 'text-cyan-700 dark:text-cyan-400', bg: 'bg-cyan-50 dark:bg-cyan-900/30', ring: 'ring-cyan-200 dark:ring-cyan-800/50', dot: 'bg-cyan-500' },
  holiday: { label: '휴일', color: 'text-[var(--toss-gray-4)] dark:text-[var(--toss-gray-3)]', bg: 'bg-[var(--tab-bg)] dark:bg-zinc-800', ring: 'ring-zinc-200 dark:ring-zinc-700', dot: 'bg-zinc-400' },
  missing: { label: '기록 없음', color: 'text-[var(--toss-gray-4)] dark:text-[var(--toss-gray-3)]', bg: 'bg-[var(--page-bg)] dark:bg-zinc-800/80', ring: 'ring-zinc-200 dark:ring-zinc-700', dot: 'bg-zinc-400' },
} as const;

function getAttendanceStatusMeta(status: string) {
  return ATTENDANCE_STATUS_META[(status || 'missing') as keyof typeof ATTENDANCE_STATUS_META] || ATTENDANCE_STATUS_META.missing;
}

function isWeekendDate(dateStr: string) {
  const dayOfWeek = new Date(dateStr).getDay();
  return dayOfWeek === 0 || dayOfWeek === 6;
}

type ShiftBand = 'day' | 'evening' | 'night' | 'off';

function normalizeShiftSearchText(...values: Array<unknown>) {
  return values
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ');
}

function hasBandPrefix(rawText: string, compactText: string, prefix: 'd' | 'e' | 'n' | 'o') {
  if (compactText === prefix) return true;
  if (compactText.startsWith(`${prefix}/`) || compactText.startsWith(`${prefix}-`) || compactText.startsWith(`${prefix}_`)) {
    return true;
  }
  if (compactText.startsWith(`${prefix}병동`) || compactText.startsWith(`${prefix}ward`) || compactText.startsWith(`${prefix}shift`)) {
    return true;
  }
  return rawText.split(/[\s/_()[\]-]+/).some((token) => token === prefix);
}

function resolveRosterShiftBand(
  shift:
    | {
        name?: string | null;
        start_time?: string | null;
        end_time?: string | null;
        shift_type?: string | null;
        description?: string | null;
      }
    | null
    | undefined
): ShiftBand {
  const rawText = normalizeShiftSearchText(shift?.name, shift?.shift_type, shift?.description);
  const compactText = rawText.replace(/\s+/g, '');
  const hasStartTime = Boolean(String(shift?.start_time || '').trim());
  const hasEndTime = Boolean(String(shift?.end_time || '').trim());
  const startHour = Number(String(shift?.start_time || '').slice(0, 2) || '0');
  const endHour = Number(String(shift?.end_time || '').slice(0, 2) || '0');
  const overnight = Boolean(hasStartTime && hasEndTime && startHour > endHour);

  if (
    rawText.includes('off') ||
    rawText.includes('휴무') ||
    rawText.includes('비번') ||
    rawText.includes('오프') ||
    hasBandPrefix(rawText, compactText, 'o')
  ) {
    return 'off';
  }

  if (
    rawText.includes('night') ||
    rawText.includes('나이트') ||
    rawText.includes('야간') ||
    hasBandPrefix(rawText, compactText, 'n') ||
    (hasStartTime && startHour >= 20) ||
    (hasStartTime && startHour <= 4) ||
    overnight ||
    (hasEndTime && endHour <= 8)
  ) {
    return 'night';
  }

  if (
    rawText.includes('evening') ||
    rawText.includes('eve') ||
    rawText.includes('이브닝') ||
    rawText.includes('오후') ||
    hasBandPrefix(rawText, compactText, 'e') ||
    (hasStartTime && startHour >= 12 && startHour < 20)
  ) {
    return 'evening';
  }

  return 'day';
}

function isWorkedShiftAssignment(
  shiftId: string | null | undefined,
  shiftLookup: Map<string, { id?: string | null; name?: string | null; start_time?: string | null; end_time?: string | null; shift_type?: string | null; description?: string | null }>
) {
  if (!shiftId) return false;
  return resolveRosterShiftBand(shiftLookup.get(String(shiftId)) || null) !== 'off';
}

function getShiftBandColorClass(band: ShiftBand, variant: 'tool' | 'cell') {
  if (variant === 'tool') {
    switch (band) {
      case 'day':
        return 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/40';
      case 'evening':
        return 'bg-orange-500/10 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 border-orange-500/20 dark:border-orange-800/50 hover:bg-orange-500/20 dark:hover:bg-orange-900/40';
      case 'night':
        return 'bg-blue-500/10 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-500/20 dark:border-blue-800/50 hover:bg-blue-500/20 dark:hover:bg-blue-900/40';
      case 'off':
        return 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800/50 hover:bg-rose-100 dark:hover:bg-rose-900/40';
      default:
        return 'bg-[var(--tab-bg)] dark:bg-zinc-900 text-[var(--toss-gray-4)] dark:text-[var(--toss-gray-3)] border-[var(--border)] dark:border-zinc-700 hover:bg-[var(--tab-bg)] dark:hover:bg-zinc-800';
    }
  }

  switch (band) {
    case 'day':
      return 'bg-emerald-100/50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-bold';
    case 'evening':
      return 'bg-orange-500/20/50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 font-bold';
    case 'night':
      return 'bg-blue-500/20/50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-bold';
    case 'off':
      return 'bg-rose-100/50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 font-bold';
    default:
      return 'bg-[var(--tab-bg)] dark:bg-zinc-800 text-[var(--toss-gray-4)] dark:text-[var(--toss-gray-3)] font-bold';
  }
}

function getShiftCellLabel(shift: { name?: string | null } | null | undefined) {
  return String(shift?.name || '').trim();
}

function buildWeekDates(anchorDate: string) {
  const baseDate = anchorDate ? new Date(anchorDate) : new Date();
  const start = new Date(baseDate);
  start.setDate(baseDate.getDate() - baseDate.getDay());

  return Array.from({ length: 7 }, (_, index) => {
    const current = new Date(start);
    current.setDate(start.getDate() + index);
    return current.toISOString().slice(0, 10);
  });
}

function formatAttendanceMinutes(minutes: unknown) {
  const resolvedMinutes = Number(minutes) || 0;
  if (!resolvedMinutes) return '-';
  return `${Math.floor(resolvedMinutes / 60)}h ${resolvedMinutes % 60}m`;
}

function buildMonthCalendarCells(selectedMonth: string) {
  const [year, month] = selectedMonth.split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return [];

  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0).getDate();
  const leadingEmptyCells = firstDay.getDay();
  const cells: Array<{ key: string; dateStr: string | null; day: number | null; isCurrentMonth: boolean; isWeekend: boolean }> = [];

  for (let index = 0; index < leadingEmptyCells; index += 1) {
    cells.push({
      key: `empty-leading-${index}`,
      dateStr: null,
      day: null,
      isCurrentMonth: false,
      isWeekend: index === 0,
    });
  }

  for (let day = 1; day <= lastDay; day += 1) {
    const dateStr = `${selectedMonth}-${padDay(day)}`;
    const weekday = new Date(dateStr).getDay();
    cells.push({
      key: dateStr,
      dateStr,
      day,
      isCurrentMonth: true,
      isWeekend: weekday === 0 || weekday === 6,
    });
  }

  while (cells.length % 7 !== 0) {
    const index = cells.length;
    cells.push({
      key: `empty-trailing-${index}`,
      dateStr: null,
      day: null,
      isCurrentMonth: false,
      isWeekend: index % 7 === 0,
    });
  }

  return cells;
}

// 근무형태에 "교대근무 전용 스케줄 여부"(is_shift)가 체크된 경우에만
// 근무표 생성 도구상자에 노출한다.
function isShiftBasedShift(shift: Record<string, unknown>): boolean {
  return shift?.is_shift === true;
}

export default function AttendanceMain({ staffs, selectedCo, user, onRefresh, initialView = 'calendar', initialLeaveTab }: AttendanceMainProps) {
  const { dialog, openConfirm, openPrompt } = useActionDialog();
  const [viewMode, setViewMode] = useState<AttendanceMainView>(initialView);
  const [calendarDetailView, setCalendarDetailView] = useState<'day' | 'week' | 'month'>('month');
  const [isCalendarDetailOpen, setIsCalendarDetailOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [attendanceData, setAttendanceData] = useState<any[]>([]);
  // 버그 B 수정: 승인된 연차/휴가 데이터 — 근태 상태 표시 시 결근 오판 방지
  const [approvedLeaves, setApprovedLeaves] = useState<Array<{
    staff_id: string;
    start_date: string;
    end_date: string;
    leave_type: string;
    status: string;
  }>>([]);
  const [loading, setLoading] = useState(false);
  const [workShifts, setWorkShifts] = useState<any[]>([]);
  const [shiftAssignments, setShiftAssignments] = useState<Record<string, string>>({}); // key: `${staff_id}_${work_date}` -> shift_id or ''
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);

  // Roster planner
  const [rosterTeam, setRosterTeam] = useState<string>('전체');
  const [approvalPending, setApprovalPending] = useState(false);
  const [approvalStatus, setApprovalStatus] = useState<'idle'|'pending'|'approved'|'rejected'>('idle');
  const [approvalRejectReason, setApprovalRejectReason] = useState('');
  const [pendingApprovals, setPendingApprovals] = useState<any[]>([]);
  const [rosterWarnings, setRosterWarnings] = useState<string[]>([]);

  // Shift Swap State
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [swapData, setSwapData] = useState<{ staffId: string; date: string; currentShiftId: string | null } | null>(null);
  const [pendingSwaps, setPendingSwaps] = useState<any[]>([]);
  
  // 일괄 수정 모달 내부 상태는 AttendanceBulkEditModal에서 자체 관리한다.

  const filtered = useMemo(
    () => selectedCo === '전체' ? staffs : staffs.filter((s: StaffMember) => s.company === selectedCo),
    [selectedCo, staffs]
  );

  const attendanceMap = useMemo(() => {
    const map = new Map<string, any>();
    attendanceData.forEach((attendance) => {
      const staffId = String(attendance?.staff_id || '').trim();
      const workDate = String(attendance?.work_date || '').trim();
      if (!staffId || !workDate) return;
      map.set(buildAttendanceKey(staffId, workDate), attendance);
    });
    return map;
  }, [attendanceData]);

  const calendarCells = useMemo(() => buildMonthCalendarCells(selectedMonth), [selectedMonth]);

  const calendarAttendanceSummary = useMemo(() => {
    const summary = new Map<string, {
      worked: number;
      late: number;
      earlyLeave: number;
      absent: number;
      annualLeave: number;
      sickLeave: number;
      halfLeave: number;
      totalRecords: number;
    }>();

    // 버그 B 수정: attendanceData 기록이 있는 직원만이 아니라, 연차 승인 직원도 집계한다.
    // 먼저 attendanceData 기반으로 집계 후, 기록이 없지만 연차가 있는 직원을 보완한다.
    attendanceData.forEach((attendance) => {
      const workDate = String(attendance?.work_date || '').trim();
      if (!workDate || !workDate.startsWith(`${selectedMonth}-`)) return;

      const dayOfWeek = new Date(workDate).getDay();
      const leaveStatus = resolveLeaveStatusForDate(
        String(attendance?.staff_id || '').trim(),
        workDate,
        approvedLeaves,
      );
      const status = resolveAttendanceStatusWithLeave(attendance, leaveStatus, dayOfWeek === 0 || dayOfWeek === 6);
      if (!summary.has(workDate)) {
        summary.set(workDate, {
          worked: 0,
          late: 0,
          earlyLeave: 0,
          absent: 0,
          annualLeave: 0,
          sickLeave: 0,
          halfLeave: 0,
          totalRecords: 0,
        });
      }

      const current = summary.get(workDate)!;
      current.totalRecords += 1;

      if (status === 'late') {
        current.worked += 1;
        current.late += 1;
        return;
      }

      if (status === 'early_leave') {
        current.worked += 1;
        current.earlyLeave += 1;
        return;
      }

      if (status === 'present') {
        current.worked += 1;
        return;
      }

      if (status === 'absent') {
        current.absent += 1;
        return;
      }

      if (status === 'annual_leave') {
        current.annualLeave += 1;
        return;
      }

      if (status === 'sick_leave') {
        current.sickLeave += 1;
        return;
      }

      if (status === 'half_leave') {
        current.halfLeave += 1;
      }
    });

    // 출퇴근 기록은 없지만 연차가 승인된 직원을 날짜별로 보완한다 (버그 B 핵심 수정)
    approvedLeaves.forEach((leave) => {
      const start = String(leave.start_date || '').slice(0, 10);
      const end = String(leave.end_date || leave.start_date || '').slice(0, 10);
      const [sy, sm, sd] = start.split('-').map(Number);
      const [ey, em, ed] = end.split('-').map(Number);
      const startMs = new Date(sy, (sm || 1) - 1, sd || 1).getTime();
      const endMs = new Date(ey, (em || 1) - 1, ed || 1).getTime();
      const [my, mm] = selectedMonth.split('-').map(Number);
      const monthStartMs = new Date(my, (mm || 1) - 1, 1).getTime();
      const monthEndMs = new Date(my, mm || 1, 0).getTime();

      const effectiveStart = Math.max(startMs, monthStartMs);
      const effectiveEnd = Math.min(endMs, monthEndMs);

      for (let ms = effectiveStart; ms <= effectiveEnd; ms += 86400000) {
        const d = new Date(ms);
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        // 이미 attendanceData에서 집계된 직원·날짜는 건너뜀
        const hasAttRecord = attendanceData.some(
          (a) => String(a.staff_id || '') === leave.staff_id && String(a.work_date || '').slice(0, 10) === dateStr,
        );
        if (hasAttRecord) continue;

        const lt = String(leave.leave_type || '').trim();
        let leaveStatusKey: string;
        if (lt === '반차' || lt.startsWith('반차')) leaveStatusKey = 'halfLeave';
        else if (lt === '병가') leaveStatusKey = 'sickLeave';
        else leaveStatusKey = 'annualLeave';

        if (!summary.has(dateStr)) {
          summary.set(dateStr, { worked: 0, late: 0, earlyLeave: 0, absent: 0, annualLeave: 0, sickLeave: 0, halfLeave: 0, totalRecords: 0 });
        }
        const current = summary.get(dateStr)!;
        current.totalRecords += 1;
        (current as Record<string, number>)[leaveStatusKey] = ((current as Record<string, number>)[leaveStatusKey] || 0) + 1;
      }
    });

    return summary;
  }, [attendanceData, approvedLeaves, selectedMonth]);

  const fetchAttendance = async () => {
    setLoading(true);
    try {
      const staffIds = filtered.map((s: StaffMember) => s.id);
      if (staffIds.length === 0) {
        setAttendanceData([]);
        setApprovedLeaves([]);
        return;
      }
      // 달력 월간 격자는 항상 표시되므로 한 달 전체 데이터가 필요하다.
      // (과거: 일별 상세일 때 선택한 하루만 조회 → 날짜 클릭 시 격자의
      //  다른 날이 모두 '기록 없음'으로 비던 버그)
      const monthStart = `${selectedMonth}-01`;
      const monthEnd = `${selectedMonth}-${String(daysInMonth).padStart(2, '0')}`;
      let startDate = monthStart;
      let endDate = monthEnd;
      if (viewMode === 'calendar') {
        // 주별 상세가 월 경계를 넘을 수 있어 해당 주 범위까지 포함한다.
        const weekDates = buildWeekDates(selectedDate);
        if (weekDates[0] < startDate) startDate = weekDates[0];
        if (weekDates[weekDates.length - 1] > endDate) endDate = weekDates[weekDates.length - 1];
      }

      // 버그 B 수정: 근태와 연차 데이터를 병렬 조회 (JM2: 단일 왕복)
      const [attendanceResult, leaveResult] = await Promise.all([
        supabase
          .from('attendances')
          .select('*')
          .in('staff_id', staffIds)
          .gte('work_date', startDate)
          .lte('work_date', endDate),
        supabase
          .from('leave_requests')
          .select('staff_id, start_date, end_date, leave_type, status')
          .in('staff_id', staffIds)
          .eq('status', '승인')
          .lte('start_date', endDate)
          .gte('end_date', startDate),
      ]);

      if (attendanceResult.error) throw attendanceResult.error;
      setAttendanceData(attendanceResult.data || []);

      // leave_requests 오류는 근태 표시를 막지 않도록 분리 처리 (JM3)
      if (leaveResult.error) {
        console.error('[fetchAttendance] 연차 조회 실패:', leaveResult.error);
        setApprovedLeaves([]);
      } else {
        setApprovedLeaves((leaveResult.data || []) as typeof approvedLeaves);
      }
    } catch (err) {
      console.error('근태 조회 실패:', err);
      setAttendanceData([]);
      setApprovedLeaves([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendance();
  }, [selectedMonth, selectedDate, selectedCo, viewMode, filtered]);

  // 근무표 편성: work_shifts 로드
  useEffect(() => {
    if (viewMode !== 'schedule') return;
    void withMissingColumnsFallback(
      (omittedColumns) => {
        const columns = [
          'id',
          'name',
          'start_time',
          'end_time',
          'description',
          'shift_type',
          'company_name',
          'weekly_work_days',
          'is_weekend_work',
          'is_shift',
        ].filter((column) => !omittedColumns.has(column));

        let query = supabase
          .from('work_shifts')
          .select(columns.join(', '))
          .eq('is_active', true);

        if (selectedCo !== '전체') {
          query = query.eq('company_name', selectedCo);
        }

        return query.order('start_time', { ascending: true });
      },
      ['description', 'shift_type', 'company_name', 'weekly_work_days', 'is_weekend_work', 'is_shift']
    ).then(({ data, error }) => {
      if (error) {
        console.error('근무형태 조회 실패:', error);
        setWorkShifts([]);
        return;
      }

      setWorkShifts(data || []);
    });
  }, [selectedCo, viewMode]);

  const loadShiftAssignments = async () => {
    if (viewMode !== 'schedule' || filtered.length === 0) {
      setShiftAssignments({});
      return;
    }
    const [y, m] = selectedMonth.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const start = `${selectedMonth}-01`;
    const end = `${selectedMonth}-${String(lastDay).padStart(2, '0')}`;
    const { data } = await supabase
      .from('shift_assignments')
      .select('staff_id, work_date, shift_id')
      .in('staff_id', filtered.map((s: StaffMember) => s.id))
      .gte('work_date', start)
      .lte('work_date', end);

    const map: Record<string, string> = {};
    (data || []).forEach((r: Record<string, unknown>) => {
      map[`${r.staff_id}_${r.work_date}`] = (r.shift_id as string) || '';
    });
    setShiftAssignments(map);
  };

  // 근무표 편성: 선택 월의 shift_assignments 로드
  useEffect(() => {
    void loadShiftAssignments();
  }, [viewMode, selectedMonth, filtered]);

  const setAssignment = (staffId: string, workDate: string, shiftId: string | null) => {
    const key = `${staffId}_${workDate}`;
    setShiftAssignments((prev) => ({ ...prev, [key]: shiftId || '' }));
    const companyName = filtered.find((s: StaffMember) => s.id === staffId)?.company;
    supabase
      .from('shift_assignments')
      .upsert(
        { staff_id: staffId, work_date: workDate, shift_id: shiftId || null, company_name: companyName },
        { onConflict: 'staff_id,work_date' }
      )
      .then(() => { });
  };

  // Position-based access
  const userPosition = String(user?.position || '');
  const userRole = String(user?.role || '');
  const userCompany = String(user?.company || '');
  const userPermissions = ((user as Record<string, any> | null)?.permissions || {}) as Record<string, any>;
  const explicitRosterCreatePermission = Object.prototype.hasOwnProperty.call(userPermissions, 'hr_근무표생성')
    ? userPermissions.hr_근무표생성 === true
    : null;
  const canCreateRosterByPosition = ROSTER_CREATOR_POSITIONS.includes(userPosition) || ['admin', 'master'].includes(userRole) || ['최고관리자', '시스템관리자', '대표', '관리자'].includes(userPosition);
  const canCreateRoster = explicitRosterCreatePermission ?? canCreateRosterByPosition;
  const canApproveRoster = ROSTER_APPROVER_POSITIONS.includes(userPosition) || (ROSTER_APPROVER_COMPANIES.includes(userCompany) && userPosition === '이사') || ['admin', 'master'].includes(userRole) || ['최고관리자', '시스템관리자'].includes(userPosition);

  useEffect(() => {
    setViewMode(initialView);
  }, [initialView]);

  // Team list
  const teamList = useMemo(() => {
    const teams = Array.from(new Set(filtered.map((s: StaffMember) => s.department).filter(Boolean)));
    return ['전체', ...teams.sort()];
  }, [filtered]);

  const rosterFiltered = useMemo(() => {
    const activeOnly = filtered.filter((s: StaffMember) => isActiveStaff(s));
    if (rosterTeam === '전체') return activeOnly;
    return activeOnly.filter((s: StaffMember) => s.department === rosterTeam);
  }, [filtered, rosterTeam]);
  const visibleWorkShifts = useMemo(() => {
    const scopedDepartment = rosterTeam === '전체' ? '' : rosterTeam;
    const scopedShifts = filterRosterShiftsForDepartment(scopedDepartment, workShifts as any[]);
    return scopedShifts.length > 0 ? scopedShifts : workShifts;
  }, [rosterTeam, workShifts]);
  const toolboxShifts = useMemo(() => {
    const seen = new Set<string>();
    const result: typeof visibleWorkShifts = [];
    for (const sh of visibleWorkShifts) {
      const name = String((sh as any).name || '').trim();
      if (!name) continue;
      if (!isShiftBasedShift(sh as Record<string, unknown>)) continue;
      if (seen.has(name)) continue;
      seen.add(name);
      result.push(sh);
    }
    return result;
  }, [visibleWorkShifts]);
  const shiftLookup = useMemo(
    () => new Map((workShifts || []).map((shift: any) => [String(shift.id || ''), shift])),
    [workShifts]
  );

  useEffect(() => {
    if (!activeTool || activeTool === 'eraser') return;
    if (!visibleWorkShifts.some((shift: any) => shift.id === activeTool)) {
      setActiveTool(null);
    }
  }, [activeTool, visibleWorkShifts]);

  const handleSwapRequest = async (targetDate: string, reason: string) => {
    if (!swapData || !user) return;
    try {
      const { error } = await supabase.from('roster_swap_requests').insert({
        company_name: selectedCo || '본사',
        team_name: rosterTeam,
        requested_by: user.id,
        requested_by_name: user.name,
        staff_id: swapData.staffId,
        work_date: swapData.date,
        target_date: targetDate,
        current_shift_id: swapData.currentShiftId,
        reason: reason,
        status: 'pending'
      });
      if (error) throw error;
      toast('근무 교환 요청이 전송되었습니다.');
      setShowSwapModal(false);
    } catch (e) {
      toast('교환 요청 중 오류가 발생했습니다.');
    }
  };

  const handleApproveSwap = async (req: any) => {
    try {
      setAssignment(req.staff_id, req.work_date, null);
      const { error } = await supabase.from('roster_swap_requests').update({
        status: 'approved',
        approved_by: user?.id,
        approved_at: new Date().toISOString(),
      }).eq('id', req.id);
      if (error) throw error;
      setPendingSwaps(p => p.filter(x => x.id !== req.id));
      toast('교환 요청을 승인했습니다.');
    } catch (e) {
      toast('승인 중 오류 발생');
    }
  };

  const handleRejectSwap = async (req: any, reason: string) => {
    await supabase.from('roster_swap_requests').update({
      status: 'rejected',
      reject_reason: reason,
      rejected_by: user?.id,
      rejected_at: new Date().toISOString(),
    }).eq('id', req.id);
    setPendingSwaps(p => p.filter(x => x.id !== req.id));
    toast('교환 요청을 반려했습니다.');
  };

  // Validate schedule for labor law
  const validateSchedule = useMemo(() => {
    if (viewMode !== 'schedule') return [];
    const warnings: string[] = [];
    const [y, m] = selectedMonth.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();

    rosterFiltered.forEach((staff: StaffMember) => {
      // Check 52h per week
      for (let weekStart = 1; weekStart <= lastDay; weekStart += 7) {
        let weekHours = 0;
        for (let d = weekStart; d < weekStart + 7 && d <= lastDay; d++) {
          const dStr = `${selectedMonth}-${String(d).padStart(2, '0')}`;
          const key = `${staff.id}_${dStr}`;
          const shiftId = shiftAssignments[key];
          if (isWorkedShiftAssignment(shiftId, shiftLookup)) {
            const shift = shiftLookup.get(String(shiftId));
            if (shift?.start_time && shift?.end_time) {
              const [sh, sm] = shift.start_time.split(':').map(Number);
              const [eh, em] = shift.end_time.split(':').map(Number);
              let hours = (eh * 60 + em - sh * 60 - sm) / 60;
              if (hours < 0) hours += 24; // overnight
              weekHours += hours;
            } else {
              weekHours += 8; // default 8h
            }
          }
        }
        if (weekHours > 52) {
          const weekNum = Math.ceil(weekStart / 7);
          warnings.push(`⚠️ 주 52시간 초과: ${staff.name} (${Math.round(weekHours)}h, ${weekNum}주차)`);
        }
      }

      // Check consecutive 7+ days
      let consecutive = 0;
      let startDay = 0;
      for (let d = 1; d <= lastDay + 1; d++) {
        const dStr = `${selectedMonth}-${String(d).padStart(2, '0')}`;
        const key = `${staff.id}_${dStr}`;
        const isWorkedDay = d <= lastDay && isWorkedShiftAssignment(shiftAssignments[key], shiftLookup);
        if (isWorkedDay) {
          if (consecutive === 0) startDay = d;
          consecutive++;
        } else {
          if (consecutive >= 7) {
            const endDate = `${selectedMonth}-${String(d - 1).padStart(2, '0')}`;
            warnings.push(`⚠️ 연속 7일 근무: ${staff.name} (${selectedMonth}-${String(startDay).padStart(2, '0')} ~ ${endDate})`);
          }
          consecutive = 0;
        }
      }
    });
    return warnings;
  }, [viewMode, shiftAssignments, rosterFiltered, shiftLookup, selectedMonth]);

  // Fetch pending approvals & swaps
  useEffect(() => {
    if (viewMode !== 'schedule') return;
    if (canApproveRoster || canCreateRoster) {
      const userId = String(user?.id || '').trim();
      const loadLegacyPendingApprovals = async () => {
        let query = supabase
          .from('approvals')
          .select('id, sender_id, sender_name, sender_company, status, current_approver_id, meta_data, created_at')
          .eq('type', LEGACY_ROSTER_APPROVAL_TYPE)
          .eq('status', LEGACY_APPROVAL_PENDING_STATUS)
          .order('created_at', { ascending: false });

        if (userId) {
          query = query.or(`current_approver_id.eq.${userId},sender_id.eq.${userId}`);
        }

        const { data, error } = await query;
        if (error) {
          console.error('legacy roster approval list fetch failed:', error);
          setPendingApprovals([]);
          return;
        }

        setPendingApprovals((data || []).map(mapLegacyApprovalRequest));
      };

      supabase.from('roster_approval_requests').select('*').eq('status', 'pending').order('created_at', { ascending: false }).then(async ({ data, error }) => {
        if (error) {
          if (!isMissingRosterWorkflowTableError(error, 'roster_approval_requests')) {
            console.error('근무표 승인 대기 목록 조회 실패:', error);
            setPendingApprovals([]);
            return;
          }
          await loadLegacyPendingApprovals();
          return;
        }
        setPendingApprovals(data || []);
      });
      // Hypothetical swap requests table
      supabase.from('roster_swap_requests').select('*').eq('status', 'pending').order('created_at', { ascending: false }).then(({ data, error }) => {
        if (error) {
          if (!isMissingRosterWorkflowTableError(error, 'roster_swap_requests')) {
            console.error('근무 교환 요청 조회 실패:', error);
          }
          setPendingSwaps([]);
          return;
        }
        setPendingSwaps(data || []);
      });
    }
  }, [viewMode, canApproveRoster, canCreateRoster, user?.id]);

  const handleSubmitApproval = async () => {
    if (!user?.id) return toast('로그인 정보를 확인해주세요.', 'error');
    const assignments = Object.entries(shiftAssignments)
      .filter(([, v]) => v)
      .map(([k, v]) => {
        const [staff_id, work_date] = k.split('_');
        return { staff_id, work_date, shift_id: v };
      });
    if (assignments.length === 0) return toast('근무표에 배정된 근무가 없습니다.', 'warning');

    setApprovalPending(true);
    try {
      const response = await fetch('/api/roster/approval-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: selectedCo === '전체' ? (userCompany || '') : selectedCo,
          teamName: rosterTeam,
          yearMonth: selectedMonth,
          assignments,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || '승인요청 중 오류가 발생했습니다.');
      }

      setApprovalStatus('pending');
      toast(
        Number(payload?.notifiedApproverCount || 0) > 0
          ? `승인요청이 전송되었습니다. 승인자 ${payload.notifiedApproverCount}명에게 알림을 보냈습니다.`
          : '승인요청이 전송되었습니다. 총무부장/이사의 승인을 기다려주세요.',
        'success',
      );
    } catch (e) {
      console.error(e);
      toast((e as Error)?.message || '승인요청 중 오류가 발생했습니다.', 'error');
    } finally {
      setApprovalPending(false);
    }
  };

  const handleApprove = async (request: any) => {
    try {
      const nowIso = new Date().toISOString();
      const legacyRequest = isLegacyApprovalRequest(request);

      // 1. Update status
      if (legacyRequest) {
        const metaData =
          request?.meta_data && typeof request.meta_data === 'object' && !Array.isArray(request.meta_data)
            ? request.meta_data
            : {};
        const { error: approvalError } = await supabase.from('approvals').update({
          status: LEGACY_APPROVAL_APPROVED_STATUS,
          current_approver_id: null,
          meta_data: {
            ...metaData,
            roster_approval_status: 'approved',
            roster_approved_by: user?.id || null,
            roster_approved_at: nowIso,
          },
        }).eq('id', request.id);
        if (approvalError) throw approvalError;
      } else {
        const { error: approvalError } = await supabase.from('roster_approval_requests').update({
          status: 'approved',
          approved_by: user?.id,
          approved_at: nowIso,
          updated_at: nowIso,
        }).eq('id', request.id);
        if (approvalError) throw approvalError;
      }

      // 2. Apply to shift_assignments
      const companyName = request.company_name;
      for (const a of (request.assignments || [])) {
        await supabase.from('shift_assignments').upsert(
          { staff_id: a.staff_id, work_date: a.work_date, shift_id: a.shift_id, company_name: companyName },
          { onConflict: 'staff_id,work_date' }
        );
      }

      // 3. Save to document_repository
      const shiftNames = workShifts.reduce((m: Record<string,string>, s: any) => { m[s.id] = s.name; return m; }, {});
      const staffNames = staffs.reduce((m: Record<string,string>, s: StaffMember) => { m[s.id] = s.name; return m; }, {});
      const docContent = (request.assignments || []).map((a: any) =>
        `${staffNames[a.staff_id] || a.staff_id}\t${a.work_date}\t${shiftNames[a.shift_id] || a.shift_id}`
      ).join('\n');

      await supabase.from('document_repository').insert({
        title: `[근무표] ${request.team_name || '전체'} ${request.year_month} 승인`,
        category: '규정',
        content: `승인일: ${new Date().toLocaleDateString('ko-KR')}\n승인자: ${user?.name || ''}\n요청자: ${request.requested_by_name || ''}\n\n직원명\t근무일\t근무형태\n${docContent}`,
        company_name: companyName || '전체',
        created_by: user?.id,
        version: 1,
      });

      if (request.requested_by) {
        await supabase.from('notifications').insert({
          user_id: request.requested_by,
          type: 'approval',
          title: `📋 근무표 승인 완료: ${request.team_name || '전체'} ${request.year_month}`,
          body: `${user?.name || '확인자'}님이 근무표를 승인했습니다.`,
          metadata: {
            id: request.id,
            approval_id: legacyRequest ? request.id : null,
            roster_request_id: request.id,
            type: 'approval',
            approval_view: 'roster_schedule',
            approval_source: legacyRequest ? 'approvals' : 'roster_approval_requests',
            approval_status: 'approved',
            team_name: request.team_name || '전체',
            year_month: request.year_month || selectedMonth,
          },
        });
      }

      if (false && request.requested_by) {
        await supabase.from('notifications').insert({
          user_id: request.requested_by,
          type: 'approval',
          title: `📋 근무표 반려: ${request.team_name || '전체'} ${request.year_month}`,
          body: `${user?.name || '확인자'}님이 근무표를 반려했습니다.`,
          metadata: {
            id: request.id,
            approval_id: legacyRequest ? request.id : null,
            roster_request_id: request.id,
            type: 'approval',
            approval_view: 'roster_schedule',
            approval_source: legacyRequest ? 'approvals' : 'roster_approval_requests',
            approval_status: 'rejected',
            reject_reason: null,
            team_name: request.team_name || '전체',
            year_month: request.year_month || selectedMonth,
          },
        });
      }

      setPendingApprovals(prev => prev.filter(p => p.id !== request.id));
      toast('근무표가 승인되어 적용되었습니다. 문서보관함에도 저장되었습니다.', 'success');
    } catch (e) {
      console.error(e);
      toast('승인 처리 중 오류가 발생했습니다.', 'error');
    }
  };

  const handleReject = async (request: any, reason: string) => {
    try {
      const nowIso = new Date().toISOString();
      const legacyRequest = isLegacyApprovalRequest(request);

      if (legacyRequest) {
        const metaData =
          request?.meta_data && typeof request.meta_data === 'object' && !Array.isArray(request.meta_data)
            ? request.meta_data
            : {};
        const { error } = await supabase.from('approvals').update({
          status: LEGACY_APPROVAL_REJECTED_STATUS,
          current_approver_id: null,
          meta_data: {
            ...metaData,
            roster_approval_status: 'rejected',
            roster_rejected_by: user?.id || null,
            roster_rejected_at: nowIso,
            roster_reject_reason: reason,
          },
        }).eq('id', request.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('roster_approval_requests').update({
          status: 'rejected',
          rejected_by: user?.id,
          rejected_at: nowIso,
          reject_reason: reason,
          updated_at: nowIso,
        }).eq('id', request.id);
        if (error) throw error;
      }

      if (request.requested_by) {
        await supabase.from('notifications').insert({
          user_id: request.requested_by,
          type: 'approval',
          title: `📋 근무표 반려: ${request.team_name || '전체'} ${request.year_month}`,
          body: `${user?.name || '승인자'}님이 근무표를 반려했습니다.`,
          metadata: {
            id: request.id,
            approval_id: legacyRequest ? request.id : null,
            roster_request_id: request.id,
            type: 'approval',
            approval_view: 'roster_schedule',
            approval_source: legacyRequest ? 'approvals' : 'roster_approval_requests',
            approval_status: 'rejected',
            reject_reason: reason,
            team_name: request.team_name || '전체',
            year_month: request.year_month || selectedMonth,
          },
        });
      }

      setPendingApprovals(prev => prev.filter(p => p.id !== request.id));
      toast('근무표가 반려되었습니다.', 'success');
    } catch (e) {
      console.error(e);
      toast('반려 처리 중 오류가 발생했습니다.', 'error');
    }
  };

  // 월별 일수 계산
  const getDaysInMonth = (monthStr: string) => {
    const [year, month] = monthStr.split('-').map(Number);
    return new Date(year, month, 0).getDate();
  };

  const daysInMonth = getDaysInMonth(selectedMonth);
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const weekDates = useMemo(() => buildWeekDates(selectedDate), [selectedDate]);

  const syncSelectedDate = (dateStr: string) => {
    setSelectedDate(dateStr);
    if (dateStr?.slice(0, 7)) setSelectedMonth(dateStr.slice(0, 7));
  };

  const mainViewButtonKey =
    viewMode === 'dashboard' ||
    viewMode === 'schedule' ||
    viewMode === 'leave' ||
    viewMode === 'issues'
      ? viewMode
      : 'calendar';

  const handleAttendanceViewChange = (nextView: AttendanceMainView | 'daily' | 'monthly') => {
    if (nextView === 'calendar' || nextView === 'daily' || nextView === 'monthly') {
      setViewMode('calendar');
      setCalendarDetailView(nextView === 'daily' ? 'day' : nextView === 'monthly' ? 'month' : 'week');
      return;
    }
    setViewMode(nextView);
  };

  const calendarDetailColumns = useMemo(() => {
    if (calendarDetailView === 'week') {
      return weekDates.map((dateStr) => ({
        key: dateStr,
        dateStr,
        day: Number(dateStr.slice(-2)),
        weekday: new Date(dateStr).getDay(),
        isWeekend: isWeekendDate(dateStr),
      }));
    }

    return daysArray.map((day) => {
      const dateStr = `${selectedMonth}-${String(day).padStart(2, '0')}`;
      return {
        key: dateStr,
        dateStr,
        day,
        weekday: new Date(dateStr).getDay(),
        isWeekend: isWeekendDate(dateStr),
      };
    });
  }, [calendarDetailView, daysArray, selectedMonth, weekDates]);

  const stats = useMemo(() => {
    // 버그 B 수정: 연차 반영하여 absent 카운트에서 연차 제외
    const resolvedStatuses = attendanceData.map((attendance: any) => {
      const leaveStatus = resolveLeaveStatusForDate(
        String(attendance?.staff_id || '').trim(),
        String(attendance?.work_date || '').slice(0, 10),
        approvedLeaves,
      );
      return resolveAttendanceStatusWithLeave(attendance, leaveStatus, false);
    });
    const total = resolvedStatuses.filter(Boolean).length;
    const present = resolvedStatuses.filter((status) => status === 'present').length;
    const late = resolvedStatuses.filter((status) => status === 'late').length;
    const earlyLeave = resolvedStatuses.filter((status) => status === 'early_leave').length;
    const absent = resolvedStatuses.filter((status) => status === 'absent').length;
    const rate = total > 0 ? Math.round((present / total) * 100) : 0;

    const atRiskStaff: Record<string, unknown>[] = [];
    filtered.forEach((s: StaffMember) => {
      const myStatuses = attendanceData
        .filter((a: any) => a.staff_id === s.id)
        .map((attendance: any) => {
          const leaveStatus = resolveLeaveStatusForDate(
            s.id,
            String(attendance?.work_date || '').slice(0, 10),
            approvedLeaves,
          );
          return resolveAttendanceStatusWithLeave(attendance, leaveStatus, false);
        });
      const lates = myStatuses.filter((status) => status === 'late').length;
      const absents = myStatuses.filter((status) => status === 'absent').length;
      if (lates >= 3 || absents >= 2) {
        atRiskStaff.push({ name: s.name, dept: s.department, lates, absents });
      }
    });

    return { total, present, late, earlyLeave, absent, rate, atRiskStaff };
  }, [attendanceData, approvedLeaves, filtered]);

  const dayPanelColumns = useMemo((): Column<StaffMember>[] => [
    {
      key: 'name',
      label: '직원 정보',
      primary: true,
      render: (s) => (
        <div className="flex flex-col">
          <span className="font-bold text-sm text-foreground">{s.name}</span>
          <span className="text-[11px] text-[var(--toss-gray-4)] font-medium mt-0.5">
            {s.department} · {s.position}
          </span>
        </div>
      ),
    },
    {
      key: 'status',
      label: '상태',
      render: (s) => {
        const att = attendanceMap.get(buildAttendanceKey(s.id, selectedDate));
        // 버그 B 수정: 승인 연차 반영
        const leaveStatus = resolveLeaveStatusForDate(s.id, selectedDate, approvedLeaves);
        const status = resolveAttendanceStatusWithLeave(att, leaveStatus, isWeekendDate(selectedDate));
        const meta = getAttendanceStatusMeta(status || 'missing');
        return (
          <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold ring-1 ring-inset ${meta.color} ${meta.bg} ${meta.ring}`}>
            <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${meta.dot}`}></span>
            {meta.label}
          </span>
        );
      },
    },
    {
      key: 'time',
      label: '출퇴근 시간',
      render: (s) => {
        const att = attendanceMap.get(buildAttendanceKey(s.id, selectedDate));
        const checkIn = att?.check_in_time ? new Date(att.check_in_time).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '-';
        const checkOut = att?.check_out_time ? new Date(att.check_out_time).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '-';
        return <span className="font-mono text-sm font-bold text-foreground">{checkIn} / {checkOut}</span>;
      },
    },
    {
      key: 'work_minutes',
      label: '근무 시간',
      render: (s) => {
        const att = attendanceMap.get(buildAttendanceKey(s.id, selectedDate));
        return (
          <span className="font-mono text-sm font-bold text-blue-600 dark:text-blue-500">
            {formatAttendanceMinutes(att?.work_hours_minutes)}
          </span>
        );
      },
    },
  ], [attendanceMap, selectedDate, approvedLeaves]);

  // 일별 출퇴근 현황 정렬 상태: 기본 부서→직급→이름, 토글로 이름·상태·출근시각 정렬 가능
  type DayPanelSortKey = 'default' | 'name' | 'status' | 'checkIn';
  type DayPanelSortDir = 'asc' | 'desc';
  const [dayPanelSort, setDayPanelSort] = useState<{ key: DayPanelSortKey; dir: DayPanelSortDir }>({
    key: 'default',
    dir: 'asc',
  });

  const nameCollator = useMemo(
    () => new Intl.Collator('ko-KR', { numeric: true, sensitivity: 'base' }),
    [],
  );

  // 상태 정렬 우선순위: 출근→지각→조퇴→결근→휴가→휴일→기록없음
  const STATUS_ORDER: Record<string, number> = useMemo(
    () => ({
      present: 0,
      late: 1,
      early_leave: 2,
      absent: 3,
      annual_leave: 4,
      sick_leave: 4,
      half_leave: 4,
      holiday: 5,
      missing: 6,
    }),
    [],
  );

  // 일별 패널용 정렬된 직원 목록 (JM2: useMemo로 매 렌더 sort 회피)
  const sortedDayPanelStaffs = useMemo(() => {
    const next = [...filtered];
    const byDeptThenPosThenName = (a: StaffMember, b: StaffMember) => {
      let cmp = nameCollator.compare(a.department || '', b.department || '');
      if (cmp !== 0) return cmp;
      cmp = nameCollator.compare(a.position || '', b.position || '');
      if (cmp !== 0) return cmp;
      return nameCollator.compare(a.name || '', b.name || '');
    };
    if (dayPanelSort.key === 'default') {
      next.sort(byDeptThenPosThenName);
      return next;
    }
    next.sort((a, b) => {
      let compared = 0;
      if (dayPanelSort.key === 'name') {
        compared = nameCollator.compare(a.name || '', b.name || '');
      } else if (dayPanelSort.key === 'status') {
        const attA = attendanceMap.get(buildAttendanceKey(a.id, selectedDate));
        const attB = attendanceMap.get(buildAttendanceKey(b.id, selectedDate));
        // 버그 B 수정: 정렬에도 승인 연차 반영
        const leaveA = resolveLeaveStatusForDate(a.id, selectedDate, approvedLeaves);
        const leaveB = resolveLeaveStatusForDate(b.id, selectedDate, approvedLeaves);
        const sA = resolveAttendanceStatusWithLeave(attA, leaveA, isWeekendDate(selectedDate)) || 'missing';
        const sB = resolveAttendanceStatusWithLeave(attB, leaveB, isWeekendDate(selectedDate)) || 'missing';
        compared = (STATUS_ORDER[sA] ?? 99) - (STATUS_ORDER[sB] ?? 99);
      } else if (dayPanelSort.key === 'checkIn') {
        const attA = attendanceMap.get(buildAttendanceKey(a.id, selectedDate));
        const attB = attendanceMap.get(buildAttendanceKey(b.id, selectedDate));
        const tA = attA?.check_in_time ? new Date(attA.check_in_time).getTime() : Number.POSITIVE_INFINITY;
        const tB = attB?.check_in_time ? new Date(attB.check_in_time).getTime() : Number.POSITIVE_INFINITY;
        compared = tA - tB;
      }
      if (compared === 0) compared = byDeptThenPosThenName(a, b);
      return dayPanelSort.dir === 'asc' ? compared : -compared;
    });
    return next;
  }, [filtered, dayPanelSort, attendanceMap, selectedDate, nameCollator, STATUS_ORDER, approvedLeaves]);

  const toggleDayPanelSort = (key: Exclude<DayPanelSortKey, 'default'>) => {
    setDayPanelSort((cur) =>
      cur.key === key
        ? { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' },
    );
  };

  const dayPanelSortIndicator = (key: Exclude<DayPanelSortKey, 'default'>): string => {
    if (dayPanelSort.key !== key) return '↕';
    return dayPanelSort.dir === 'asc' ? '↑' : '↓';
  };

  const renderIntegratedDayPanel = () => (
    <div className="bg-[var(--card)] dark:bg-zinc-900 border border-[var(--border)] dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm" data-testid="attendance-calendar-day-panel">
      <div className="p-4 border-b border-[var(--border)] dark:border-zinc-800 bg-[var(--tab-bg)]/40 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <h3 className="text-lg font-bold text-foreground">일별 출퇴근 현황 <span className="text-[var(--toss-gray-4)] text-sm font-medium ml-2">{selectedDate}</span></h3>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">정렬</span>
          {([
            { id: 'name', label: '이름' },
            { id: 'status', label: '상태' },
            { id: 'checkIn', label: '출근시각' },
          ] as const).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => toggleDayPanelSort(opt.id)}
              aria-pressed={dayPanelSort.key === opt.id}
              aria-label={`${opt.label}으로 정렬`}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[var(--radius-md)] text-[11px] font-bold transition-colors ${
                dayPanelSort.key === opt.id
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--tab-bg)] text-[var(--toss-gray-4)] hover:text-foreground'
              }`}
            >
              <span>{opt.label}</span>
              <span aria-hidden="true" className="text-[10px] font-black">
                {dayPanelSortIndicator(opt.id)}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <ResponsiveTable<StaffMember>
          columns={dayPanelColumns}
          rows={sortedDayPanelStaffs}
          keyField="id"
          emptyMessage="표시할 직원이 없습니다."
        />
      </div>
    </div>
  );

  const renderIntegratedRangePanel = (mode: 'week' | 'month') => (
    <div className="bg-[var(--card)] dark:bg-zinc-900 border border-[var(--border)] dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm" data-testid={`attendance-calendar-${mode}-panel`}>
      <div className="p-4 border-b border-[var(--border)] dark:border-zinc-800 bg-[var(--tab-bg)]/40">
        <h3 className="text-lg font-bold text-foreground">
          {mode === 'week' ? '주별 근태 현황' : '월별 근태 대장'}
          <span className="text-[var(--toss-gray-4)] text-sm font-medium ml-2">{mode === 'week' ? `${weekDates[0]} ~ ${weekDates[6]}` : selectedMonth}</span>
        </h3>
      </div>
      <div className="overflow-x-auto custom-scrollbar">
        <table className={`w-full text-left border-collapse ${mode === 'week' ? 'min-w-[980px]' : 'min-w-[1800px]'}`}>
          <thead className="bg-[var(--tab-bg)] dark:bg-zinc-900/80 border-b border-[var(--border)] dark:border-zinc-800 text-[11px] font-bold text-[var(--toss-gray-4)] uppercase tracking-wider">
            <tr>
              <th className="px-4 py-4 sticky left-0 bg-[var(--tab-bg)] dark:bg-zinc-900/90 z-10 border-r border-[var(--border)] dark:border-zinc-800">직원명</th>
              {calendarDetailColumns.map((column) => (
                <th key={`${mode}-${column.key}`} className={`px-2 py-4 text-center border-r border-[var(--border)] dark:border-zinc-800 min-w-[78px] ${column.isWeekend ? 'text-red-400 dark:text-red-500' : ''}`}>
                  <div className="flex flex-col items-center">
                    <span>{column.day}</span>
                    <span className="text-[9px] font-medium opacity-60 mt-0.5">{['일', '월', '화', '수', '목', '금', '토'][column.weekday]}</span>
                  </div>
                </th>
              ))}
              <th className="px-4 py-4 text-center text-blue-600 dark:text-blue-400 bg-blue-500/10/50 dark:bg-blue-900/10">출근일</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {filtered.map((s: StaffMember) => {
              let workDays = 0;
              return (
                <tr key={`${mode}-${s.id}`} className="hover:bg-[var(--tab-bg)]/50 dark:hover:bg-zinc-800/30 transition-colors">
                  <td className="px-4 py-3 sticky left-0 bg-[var(--card)] dark:bg-zinc-900 z-10 border-r border-[var(--border)] dark:border-zinc-800">
                    <div className="flex flex-col">
                      <span className="font-bold text-sm text-foreground whitespace-nowrap">{s.name}</span>
                      <span className="text-[10px] text-[var(--toss-gray-4)] font-medium">{s.department}</span>
                    </div>
                  </td>
                  {calendarDetailColumns.map((column) => {
                    const att = attendanceMap.get(buildAttendanceKey(s.id, column.dateStr));
                    // 버그 B 수정: 승인 연차 반영
                    const leaveStatus = resolveLeaveStatusForDate(s.id, column.dateStr, approvedLeaves);
                    const status = resolveAttendanceStatusWithLeave(att, leaveStatus, column.isWeekend);
                    const meta = getAttendanceStatusMeta(status || 'missing');
                    if (isWorkedAttendanceStatus(status)) workDays += 1;
                    return (
                      <td key={`${mode}-${s.id}-${column.key}`} className="p-1.5 border-r border-[var(--border)] dark:border-zinc-800 text-center align-middle">
                        {status ? (
                          <div className={`min-h-[38px] px-2 py-2 mx-auto flex items-center justify-center rounded-xl text-[10px] leading-tight font-bold ring-1 ring-inset ${meta.color} ${meta.bg} ${meta.ring}`}>
                            {meta.label}
                          </div>
                        ) : (
                          <div className="min-h-[38px] px-2 py-2 mx-auto flex items-center justify-center rounded-xl text-[10px] font-bold text-[var(--toss-gray-3)] bg-[var(--page-bg)] dark:bg-zinc-800/60 ring-1 ring-inset ring-zinc-200 dark:ring-zinc-700">-</div>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-4 py-3 text-center bg-blue-500/10/30 dark:bg-blue-900/10 font-bold text-blue-600 dark:text-blue-400 text-sm">{workDays}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  const calendarDetailLabel =
    calendarDetailView === 'day'
      ? selectedDate
      : calendarDetailView === 'week'
        ? `${weekDates[0]} ~ ${weekDates[weekDates.length - 1]}`
        : selectedMonth;

  return (
    <>
    {dialog}
    <div className="flex flex-col h-full bg-[var(--page-bg)] animate-in fade-in duration-500">
      <header className="px-4 pt-4 pb-3 border-b border-[var(--border)] bg-[var(--card)] shrink-0 shadow-sm z-10 sticky top-0">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div className="flex-1 w-full">
            <div className="flex items-center gap-1 bg-[var(--tab-bg)]/80 dark:bg-zinc-800/80 p-1 rounded-[var(--radius-lg)] w-fit border border-[var(--border)]/50 dark:border-zinc-700/50 overflow-x-auto custom-scrollbar">
              {([
                { id: 'dashboard', label: '대시보드', icon: 'analytics' },
                ...((canCreateRoster || canApproveRoster) ? [{ id: 'schedule', label: '근무표 생성', icon: 'edit' }] : []),
                { id: 'calendar', label: '근태 달력', icon: 'calendar' },
                { id: 'leave', label: '연차/휴가', icon: 'calendar' },
                { id: 'issues', label: '근태 이상/차감', icon: 'alert' },
              ] as Array<{ id: AttendanceMainView; label: string; icon: string }>).map(mode => (
                <button
                  key={mode.id}
                  onClick={() => handleAttendanceViewChange(mode.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-[var(--radius-md)] text-[12px] font-bold transition-all whitespace-nowrap ${mainViewButtonKey === mode.id
                    ? 'bg-[var(--accent)] text-white shadow-sm'
                    : 'text-[var(--toss-gray-4)] hover:text-foreground hover:bg-[var(--card)]/50 dark:hover:bg-zinc-700/50'
                    }`}
                >
                  <MenuIcon name={mode.icon} className="h-4 w-4 shrink-0" />
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          {viewMode !== 'leave' && viewMode !== 'issues' && (
          <div className="flex items-center gap-3 w-full md:w-auto overflow-x-auto pb-2 md:pb-0 hide-scrollbar">
            <button
              type="button"
              onClick={() => setBulkEditOpen(true)}
              className="flex items-center gap-2 px-3 py-2.5 rounded-[var(--radius-md)] text-[11px] font-bold bg-[var(--card)] dark:bg-zinc-800 text-[var(--toss-gray-4)] dark:text-[var(--toss-gray-3)] border border-[var(--border)] dark:border-zinc-700 shadow-sm hover:border-blue-400 hover:text-blue-600 transition-colors whitespace-nowrap focus:outline-none"
            >
              <MenuIcon name="alert" className="h-4 w-4 shrink-0" /> 상태 일괄 수정
            </button>

            <div className="flex items-center bg-[var(--card)] dark:bg-zinc-800 border border-[var(--border)] dark:border-zinc-700 rounded-[var(--radius-md)] p-1 shadow-sm shrink-0 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent transition-all">
              <div className="px-3 bg-[var(--tab-bg)] dark:bg-zinc-900/50 rounded-lg py-1.5 border border-[var(--border-subtle)] dark:border-zinc-800 text-[10px] font-bold text-[var(--toss-gray-3)]">MONTH</div>
              <SmartMonthPicker
                value={selectedMonth}
                onChange={(val) => setSelectedMonth(val)}
                className="bg-transparent px-3 py-1.5 text-xs font-bold text-foreground outline-none w-full sm:w-32 cursor-pointer"
              />
            </div>
          </div>
          )}
        </div>
      </header>

      <main className="flex-1 p-4 overflow-auto custom-scrollbar bg-[var(--muted)]/20">

        {viewMode === 'leave' && (
          <div className="max-w-7xl mx-auto">
            <LeaveManagement
              staffs={staffs}
              selectedCo={selectedCo}
              onRefresh={onRefresh}
              user={user}
              initialTab={initialLeaveTab || '연차/휴가 신청내역'}
              allowLeaveTabs={true}
              allowHolidayTab={true}
              tabMode="operational"
            />
          </div>
        )}

        {viewMode === 'issues' && (
          <div className="space-y-4 max-w-7xl mx-auto">
            <AttendanceIssueAnalysisSuite staffs={staffs} selectedCo={selectedCo} user={user} />
            <div className="grid gap-4 xl:grid-cols-2">
              <AttendanceDeductionSimulator staffs={staffs} selectedCo={selectedCo} />
              <AttendanceAnomalyPanel staffs={staffs} selectedCo={selectedCo} />
            </div>
          </div>
        )}

        {viewMode === 'schedule' && (
          <div className="bg-[var(--card)] dark:bg-zinc-900 border border-[var(--border)] dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm flex flex-col min-h-[calc(100dvh-200px)]">
            <div className="p-4 border-b border-[var(--border)] dark:border-zinc-800 bg-[var(--tab-bg)]/50 dark:bg-zinc-900/50 flex flex-col gap-3 shrink-0">
              <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                <div>
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <span className="text-xl">📋</span> 근무표 생성
                    {approvalStatus === 'pending' && <span className="px-2 py-0.5 rounded-[var(--radius-md)] bg-amber-100 text-amber-700 text-[10px] font-bold animate-pulse">승인 대기중</span>}
                  </h3>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    value={rosterTeam}
                    onChange={(e) => setRosterTeam(e.target.value)}
                    className="px-3 py-2 rounded-[var(--radius-md)] border border-[var(--border)] text-[11px] font-bold text-foreground bg-[var(--card)]"
                  >
                    {teamList.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              {/* Approval panel for approvers */}
              {canApproveRoster && pendingApprovals.length > 0 && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-xl p-3 space-y-2">
                  <p className="text-[11px] font-bold text-amber-800 dark:text-amber-300 flex items-center gap-2">
                    <span className="text-base">📨</span> 승인 대기 근무표 {pendingApprovals.length}건
                  </p>
                  {pendingApprovals.map((req: any) => (
                    <div key={req.id} className="bg-[var(--card)] dark:bg-zinc-800 border border-amber-200/50 dark:border-zinc-700 rounded-lg p-3 flex flex-col md:flex-row md:items-center gap-3">
                      <div className="flex-1 text-[11px]">
                        <p className="font-bold text-foreground">{req.team_name || '전체'} · {req.year_month}</p>
                        <p className="text-[var(--toss-gray-4)] mt-0.5">요청: {req.requested_by_name} · {new Date(req.created_at).toLocaleDateString('ko-KR')}</p>
                        <p className="text-[var(--toss-gray-3)] mt-0.5">{(req.assignments || []).length}건 배정</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => handleApprove(req)} className="px-3 py-1.5 bg-emerald-500 text-white text-[11px] font-bold rounded-lg hover:bg-emerald-600 transition-colors">✅ 승인</button>
                        <button onClick={() => {
                          void (async () => {
                            const reason = await openPrompt({
                              title: '근무표를 반려할까요?',
                              description: `${req.team_name || '전체'} · ${req.year_month} 근무표를 반려합니다. 사유는 요청자에게 전달됩니다.`,
                              placeholder: '반려 사유를 입력하세요.',
                              inputType: 'textarea',
                              required: true,
                              confirmText: '반려',
                              tone: 'danger',
                            });
                            if (reason?.trim()) handleReject(req, reason.trim());
                          })();
                        }} className="px-3 py-1.5 bg-rose-500 text-white text-[11px] font-bold rounded-lg hover:bg-rose-600 transition-colors">❌ 반려</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Swap requests panel */}
              {(canApproveRoster || canCreateRoster) && pendingSwaps.length > 0 && (
                <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50 rounded-xl p-3 space-y-2">
                  <p className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                    <span className="text-base">🔄</span> 근무 교환(Swap) 요청 {pendingSwaps.length}건
                  </p>
                  {pendingSwaps.map((req: any) => (
                    <div key={req.id} className="bg-[var(--card)] dark:bg-zinc-800 border border-emerald-200/50 dark:border-zinc-700 rounded-lg p-3 flex flex-col md:flex-row md:items-center gap-3">
                      <div className="flex-1 text-[11px]">
                        <p className="font-bold text-foreground">{req.requested_by_name} ➔ {req.work_date} 근무 변경 희망</p>
                        <p className="text-[var(--toss-gray-4)] mt-0.5">사유: {req.reason || '사유 미입력'}</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => handleApproveSwap(req)} className="px-3 py-1.5 bg-emerald-500 text-white text-[10px] font-bold rounded-lg hover:bg-emerald-600">승인</button>
                        <button onClick={() => {
                          void (async () => {
                            const reason = await openPrompt({
                              title: '근무 교환 요청을 반려할까요?',
                              description: `${req.requested_by_name || '요청자'}님의 ${req.work_date || '선택일'} 근무 교환 요청을 반려합니다.`,
                              placeholder: '반려 사유를 입력하세요.',
                              inputType: 'textarea',
                              required: true,
                              confirmText: '반려',
                              tone: 'danger',
                            });
                            if (reason?.trim()) handleRejectSwap(req, reason.trim());
                          })();
                        }} className="px-3 py-1.5 bg-rose-500 text-white text-[10px] font-bold rounded-lg hover:bg-rose-600">반려</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Labor law warnings */}
              {validateSchedule.length > 0 && (
                <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/50 rounded-xl p-3">
                  <p className="text-[11px] font-bold text-rose-700 dark:text-rose-400 mb-1 flex items-center gap-1"><span>🚨</span> 근로기준법 위반 경고</p>
                  {validateSchedule.slice(0, 10).map((w, i) => (
                    <p key={i} className="text-[10px] text-rose-600 dark:text-rose-400 font-medium">{w}</p>
                  ))}
                  {validateSchedule.length > 10 && <p className="text-[10px] text-rose-400">... 외 {validateSchedule.length - 10}건</p>}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 bg-[var(--card)] dark:bg-zinc-800 p-2 rounded-2xl border border-[var(--border)] dark:border-zinc-700 shadow-sm w-fit">
                <span className="text-[10px] font-bold text-[var(--toss-gray-3)] uppercase tracking-wider mx-3">Toolbox</span>
                <div className="w-px h-6 bg-[var(--tab-bg)] dark:bg-zinc-700 mr-2"></div>
                {toolboxShifts.map((sh: any) => {
                  const isActive = activeTool === sh.id;
                  const colorClass = getShiftBandColorClass(resolveRosterShiftBand(sh), 'tool');

                  return (
                    <button
                      key={sh.id}
                      onClick={() => setActiveTool(isActive ? null : sh.id)}
                      className={`px-4 py-2 rounded-[var(--radius-md)] text-[11px] font-bold transition-all border ${isActive ? 'ring-2 ring-offset-2 ring-blue-500 scale-105 shadow-md ' + colorClass : colorClass}`}
                    >
                      {sh.name}
                    </button>
                  );
                })}
                <div className="w-px h-6 bg-[var(--tab-bg)] dark:bg-zinc-700 mx-1"></div>
                <button
                  type="button"
                  onClick={() => setActiveTool(activeTool === 'eraser' ? null : 'eraser')}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-[var(--radius-md)] text-[11px] font-bold transition-all border ${activeTool === 'eraser' ? 'bg-red-500/100 border-red-500 text-white ring-2 ring-offset-2 ring-red-500 scale-105 shadow-md' : 'bg-[var(--card)] dark:bg-zinc-800 text-red-500 border-red-500/20 dark:border-red-900/50 hover:bg-red-500/10 dark:hover:bg-red-900/20'}`}
                >
                  <span className="text-sm">🧹</span> 지우개
                </button>
              </div>
            </div>

            <div className="overflow-x-auto flex-1 custom-scrollbar pb-4 relative">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead className="bg-[var(--tab-bg)] dark:bg-zinc-900/80 text-[11px] font-bold text-[var(--toss-gray-4)] uppercase tracking-wider sticky top-0 z-20 shadow-sm border-b border-[var(--border)] dark:border-zinc-800">
                  <tr>
                    <th className="px-4 py-4 sticky left-0 bg-[var(--tab-bg)] dark:bg-zinc-900 z-30 border-r border-[var(--border)] dark:border-zinc-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">직원명</th>
                    {daysArray.map((d) => {
                      const dStr = `${selectedMonth}-${String(d).padStart(2, '0')}`;
                      const dayOfWeek = new Date(dStr).getDay();
                      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                      return (
                        <th key={d} className={`px-2 py-4 text-center border-r border-[var(--border)] dark:border-zinc-800 min-w-[44px] ${isWeekend ? 'text-red-400 dark:text-red-500' : ''}`}>
                          <div className="flex flex-col items-center">
                            <span>{d}</span>
                            <span className="text-[9px] font-medium opacity-60 mt-0.5">{['일', '월', '화', '수', '목', '금', '토'][dayOfWeek]}</span>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {rosterFiltered.map((s: StaffMember) => (
                    <tr key={s.id} className="hover:bg-[var(--tab-bg)]/50 dark:hover:bg-zinc-800/30 group">
                      <td className="px-4 py-3 sticky left-0 bg-[var(--card)] dark:bg-zinc-900 group-hover:bg-[var(--tab-bg)] dark:group-hover:bg-zinc-800/80 z-10 border-r border-[var(--border)] dark:border-zinc-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] transition-colors">
                        <div className="flex flex-col">
                          <span className="font-bold text-sm text-foreground whitespace-nowrap">{s.name}</span>
                          <span className="text-[10px] text-[var(--toss-gray-4)] font-medium">{s.department}</span>
                        </div>
                      </td>
                      {daysArray.map((d) => {
                        const dStr = `${selectedMonth}-${String(d).padStart(2, '0')}`;
                        const key = `${s.id}_${dStr}`;
                        const value = shiftAssignments[key] ?? '';
                        const shiftObj = shiftLookup.get(String(value));
                        const isWeekend = new Date(dStr).getDay() === 0 || new Date(dStr).getDay() === 6;
                        const cellBand = shiftObj ? resolveRosterShiftBand(shiftObj) : null;
                        const cellColor = shiftObj
                          ? getShiftBandColorClass(cellBand || 'day', 'cell')
                          : isWeekend
                            ? 'bg-red-500/10/30 dark:bg-red-900/5 hover:bg-[var(--tab-bg)] dark:hover:bg-zinc-800/50'
                            : 'hover:bg-[var(--tab-bg)] dark:hover:bg-zinc-800/50';
                        return (
                          <td
                            key={d}
                            title={shiftObj?.name || ''}
                            className={`p-1 border-r border-[var(--border)] dark:border-zinc-800 min-w-[44px] cursor-pointer select-none transition-colors border-b-0 border-t-0 active:bg-blue-500/10 dark:active:bg-blue-900/20 active:ring-inset active:ring-2 active:ring-blue-400 ${cellColor}`}
                            onMouseDown={() => {
                              if (canCreateRoster) {
                                if (activeTool === 'eraser') setAssignment(s.id, dStr, null);
                                else if (activeTool) setAssignment(s.id, dStr, activeTool);
                              } else {
                                // Regular nurse click -> request swap
                                setSwapData({ staffId: s.id, date: dStr, currentShiftId: value });
                                setShowSwapModal(true);
                              }
                            }}
                            onMouseEnter={(e) => {
                              if (e.buttons === 1 && canCreateRoster) { // 1 is left click drag
                                if (activeTool === 'eraser') setAssignment(s.id, dStr, null);
                                else if (activeTool) setAssignment(s.id, dStr, activeTool);
                              }
                            }}
                          >
                            <div className="w-full h-8 flex items-center justify-center text-center text-[10px] leading-tight font-bold rounded transition-all px-0.5">
                              {shiftObj ? getShiftCellLabel(shiftObj) : <span className="text-[var(--toss-gray-3)] font-semibold">휴무</span>}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Submit approval button */}
            {canCreateRoster && (
              <div className="p-4 border-t border-[var(--border)] dark:border-zinc-800 bg-[var(--tab-bg)]/50 flex items-center justify-between gap-3">
                <div className="text-[11px] text-[var(--toss-gray-4)] font-medium">
                  {Object.values(shiftAssignments).filter(Boolean).length}건 배정됨
                  {validateSchedule.length > 0 && <span className="text-rose-500 ml-2">⚠️ 경고 {validateSchedule.length}건</span>}
                </div>
                <button
                  type="button"
                  onClick={handleSubmitApproval}
                  disabled={approvalPending || approvalStatus === 'pending'}
                  className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold text-[12px] rounded-xl shadow-md hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {approvalPending ? '전송중...' : approvalStatus === 'pending' ? '⏳ 승인 대기중' : '💾 승인요청'}
                </button>
              </div>
            )}
            
            {/* Shift Swap Modal */}
            {showSwapModal && swapData && (
              <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200 backdrop-blur-sm">
                <div className="bg-[var(--background)] rounded-2xl w-full max-w-sm shadow-2xl relative border border-[var(--border)] dark:border-zinc-800 overflow-hidden">
                  <div className="p-4 border-b border-[var(--border)] dark:border-zinc-800 bg-emerald-50 dark:bg-emerald-900/20 flex justify-between items-center">
                    <h3 className="font-bold text-sm flex items-center gap-2 text-emerald-800 dark:text-emerald-400"><span className="text-xl">🔄</span> 근무 교환 신청</h3>
                    <button onClick={() => setShowSwapModal(false)} className="text-emerald-800/50 hover:text-emerald-800">✕</button>
                  </div>
                  <div className="p-5 space-y-4">
                    <div className="bg-[var(--tab-bg)] dark:bg-zinc-800/50 p-3 rounded-xl border border-[var(--border)] dark:border-zinc-700">
                      <p className="text-[10px] font-bold text-[var(--toss-gray-4)] mb-1 uppercase">선택된 근무</p>
                      <p className="text-[13px] font-bold">{swapData.date} ({rosterFiltered.find(f => f.id === swapData.staffId)?.name || '본인'})</p>
                      <p className="text-[11px] text-emerald-600 font-bold mt-1">현재: {workShifts.find(w => w.id === swapData.currentShiftId)?.name || 'OFF'}</p>
                    </div>
                    
                    <div className="space-y-2">
                      <p className="text-[11px] font-bold text-[var(--toss-gray-4)] ml-1">교환 사유 (수간호사/관리자 확인용)</p>
                      <textarea id="swapReason" rows={3} placeholder="예: 개인 사정으로 인한 데이-나이트 교환 희망" className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--card)] text-sm outline-none focus:ring-2 ring-emerald-500/20" />
                    </div>

                    <button 
                      onClick={() => {
                        const reason = (document.getElementById('swapReason') as HTMLTextAreaElement).value;
                        if (!reason) {
                          toast('사유를 입력해주세요.', 'warning');
                          return;
                        }
                        handleSwapRequest(swapData.date, reason);
                      }}
                      className="w-full py-3 bg-emerald-500 text-white font-bold text-sm rounded-xl hover:bg-emerald-600 shadow-md transition-all"
                    >
                      교환 요청 보내기
                    </button>
                    <p className="text-[10px] text-center text-[var(--toss-gray-3)]">관리자 승인 후 최종 반영됩니다.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {viewMode === 'dashboard' && (
          <div className="space-y-4 max-w-6xl mx-auto">
            {/* AI Attendance Alert Widget */}
            {stats.atRiskStaff && stats.atRiskStaff.length > 0 && (
              <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 shadow-sm flex items-start gap-4">
                <div className="text-4xl">🚨</div>
                <div className="flex-1">
                  <h4 className="text-sm font-black text-rose-800 flex items-center gap-2">
                    AI 근태 경고 알림 (Attendance Alert)
                    <span className="px-2 py-0.5 bg-rose-200 text-rose-700 rounded-[var(--radius-md)] text-[10px] animate-pulse">주의 요망</span>
                  </h4>
                  <p className="text-xs text-rose-600 mt-1 font-medium pb-4 border-b border-rose-200/50 mb-4">
                    누적 지각(3회 이상) 또는 결근(2회 이상)이 발생하여 즉시 면담이 필요한 직원이 발견되었습니다.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {stats.atRiskStaff.map((risk: any, idx: number) => (
                      <div key={idx} className="bg-[var(--card)] border border-rose-200 px-3 py-2 rounded-xl text-xs flex items-center gap-3">
                        <span className="font-bold text-[var(--foreground)]">{risk.name} <span className="text-[10px] text-[var(--toss-gray-3)] font-medium">({risk.dept})</span></span>
                        <div className="flex gap-2">
                          {risk.lates > 0 && <span className="text-orange-600 font-bold">지각 {risk.lates}회</span>}
                          {risk.absents > 0 && <span className="text-rose-600 font-bold">결근 {risk.absents}회</span>}
                        </div>
                        <button className="ml-2 px-2 py-1 bg-rose-500 text-white text-[10px] rounded hover:bg-rose-600 font-bold">
                          면담 요청
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <h3 className="text-lg font-bold text-foreground mb-4 mt-5">근태 요약 <span className="text-[var(--toss-gray-4)] text-sm font-medium ml-2">{selectedMonth} 기준</span></h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-4">
              <div className="bg-[var(--card)] dark:bg-zinc-900 border border-[var(--border)] dark:border-zinc-800 rounded-2xl p-4 md:p-4 shadow-sm relative overflow-hidden group hover:border-blue-300 dark:hover:border-blue-700 transition-colors">
                <div className="absolute top-0 right-0 p-4 text-4xl opacity-10 group-hover:scale-110 transition-transform">🎯</div>
                <p className="text-[11px] font-bold text-[var(--toss-gray-4)] uppercase tracking-widest mb-2">출근율</p>
                <div className="flex items-end gap-2">
                  <p className="text-4xl md:text-5xl font-black text-blue-600 dark:text-blue-500">{stats.rate}</p>
                  <span className="text-xl font-bold text-blue-600/50 mb-1">%</span>
                </div>
              </div>

              <div className="bg-[var(--card)] dark:bg-zinc-900 border border-[var(--border)] dark:border-zinc-800 rounded-2xl p-4 md:p-4 shadow-sm relative overflow-hidden group hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors">
                <div className="absolute top-0 right-0 p-4 text-4xl opacity-10 group-hover:scale-110 transition-transform">✅</div>
                <p className="text-[11px] font-bold text-[var(--toss-gray-4)] uppercase tracking-widest mb-2">정상 출근</p>
                <div className="flex items-end gap-2">
                  <p className="text-4xl md:text-5xl font-black text-emerald-600 dark:text-emerald-500">{stats.present}</p>
                  <span className="text-xl font-bold text-emerald-600/50 mb-1">건</span>
                </div>
              </div>

              <div className="bg-[var(--card)] dark:bg-zinc-900 border border-[var(--border)] dark:border-zinc-800 rounded-2xl p-4 md:p-4 shadow-sm relative overflow-hidden group hover:border-orange-300 dark:hover:border-orange-700 transition-colors">
                <div className="absolute top-0 right-0 p-4 text-4xl opacity-10 group-hover:scale-110 transition-transform">⏰</div>
                <p className="text-[11px] font-bold text-[var(--toss-gray-4)] uppercase tracking-widest mb-2">지각</p>
                <div className="flex items-end gap-2">
                  <p className="text-4xl md:text-5xl font-black text-orange-500">{stats.late}</p>
                  <span className="text-xl font-bold text-orange-500/50 mb-1">건</span>
                </div>
              </div>

              <div className="bg-[var(--card)] dark:bg-zinc-900 border border-[var(--border)] dark:border-zinc-800 rounded-2xl p-4 md:p-4 shadow-sm relative overflow-hidden group hover:border-rose-300 dark:hover:border-rose-700 transition-colors">
                <div className="absolute top-0 right-0 p-4 text-4xl opacity-10 group-hover:scale-110 transition-transform">🏃‍♂️</div>
                <p className="text-[11px] font-bold text-[var(--toss-gray-4)] uppercase tracking-widest mb-2">조퇴 / 결근</p>
                <div className="flex items-end gap-2">
                  <p className="text-4xl md:text-5xl font-black text-rose-500">{stats.earlyLeave + stats.absent}</p>
                  <span className="text-xl font-bold text-rose-500/50 mb-1">건</span>
                </div>
              </div>
            </div>

            <div className="bg-[var(--card)] dark:bg-zinc-900 border border-[var(--border)] dark:border-zinc-800 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-foreground">근무 상태 지표</h3>
                <span className="text-xs font-bold text-[var(--toss-gray-3)] bg-[var(--tab-bg)] dark:bg-zinc-800 px-3 py-1 rounded-[var(--radius-md)]">총 {stats.total}건</span>
              </div>
              <div className="space-y-4">
                {[
                  { label: '정상 출근', count: stats.present, color: 'bg-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
                  { label: '지각', count: stats.late, color: 'bg-orange-500/100', bg: 'bg-orange-500/10 dark:bg-orange-900/20' },
                  { label: '조퇴', count: stats.earlyLeave, color: 'bg-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20' },
                  { label: '결근', count: stats.absent, color: 'bg-rose-500', bg: 'bg-rose-50 dark:bg-rose-900/20' }
                ].map(stat => {
                  const percent = stats.total ? Math.round((stat.count / stats.total) * 100) : 0;
                  return (
                    <div key={stat.label} className="group cursor-default">
                      <div className="flex justify-between items-end mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${stat.color}`}></span>
                          <span className="text-sm font-bold text-[var(--toss-gray-4)] dark:text-[var(--toss-gray-3)]">{stat.label}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-bold text-[var(--toss-gray-3)]">{stat.count}건</span>
                          <span className="text-lg font-black text-foreground w-12 text-right">{percent}%</span>
                        </div>
                      </div>
                      <div className="h-4 bg-[var(--tab-bg)] dark:bg-zinc-800 rounded-full overflow-hidden relative">
                        <div
                          className={`h-full ${stat.color} transition-all duration-1000 ease-out`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* 출퇴근 상태 일괄 수정 모달 — 직원 선택 후 일괄수정 적용 */}
        <AttendanceBulkEditModal
          open={bulkEditOpen}
          onClose={() => setBulkEditOpen(false)}
          staffs={filtered.map((s: StaffMember) => ({
            id: s.id,
            name: s.name,
            position: s.position,
            department: s.department,
            company: s.company,
          }))}
          initialDate={selectedDate}
          attendances={attendanceData}
          approvedLeaves={approvedLeaves}
          onApplied={() => {
            fetchAttendance();
          }}
        />

        {viewMode === 'calendar' && (
          <div className="space-y-4">
          <div className="bg-[var(--card)] dark:bg-zinc-900 border border-[var(--border)] dark:border-zinc-800 rounded-2xl p-4 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
              <div>
                <h3 className="text-base font-bold text-foreground">근태 달력</h3>
                <p className="text-[11px] font-medium text-[var(--toss-gray-4)] mt-1">날짜를 누르면 팝업으로 일별 · 주별 · 월별 근태를 확인합니다.</p>
              </div>
              <div className="flex items-center gap-2 bg-[var(--tab-bg)] dark:bg-zinc-800/80 p-1 rounded-[var(--radius-lg)] border border-[var(--border)] dark:border-zinc-700 w-fit">
                {[
                  { id: 'day', label: '일별' },
                  { id: 'week', label: '주별' },
                  { id: 'month', label: '월별' },
                ].map((mode) => (
                  <button
                    key={`calendar-open-${mode.id}`}
                    type="button"
                    data-testid={`attendance-calendar-open-${mode.id}`}
                    onClick={() => {
                      setCalendarDetailView(mode.id as 'day' | 'week' | 'month');
                      setIsCalendarDetailOpen(true);
                    }}
                    className={`px-3 py-2 rounded-[var(--radius-md)] text-[12px] font-bold transition-all ${
                      calendarDetailView === mode.id
                        ? 'bg-[var(--card)] dark:bg-zinc-700 text-foreground shadow-sm ring-1 ring-zinc-900/5 dark:ring-white/10'
                        : 'text-[var(--toss-gray-4)] hover:text-foreground hover:bg-[var(--card)]/60 dark:hover:bg-zinc-700/60'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto custom-scrollbar -mx-1 px-1">
            <div className="grid min-w-[560px] grid-cols-7 gap-2 md:gap-4">
              {['일', '월', '화', '수', '목', '금', '토'].map((day, idx) => (
                <div key={day} className={`text-center text-[12px] font-bold uppercase pb-3 mb-2 border-b border-[var(--border-subtle)] dark:border-zinc-800 ${idx === 0 ? 'text-rose-500' : idx === 6 ? 'text-blue-500' : 'text-[var(--toss-gray-4)]'}`}>{day}</div>
              ))}
              {calendarCells.map((cell) => {
                const summary = cell.dateStr ? calendarAttendanceSummary.get(cell.dateStr) : null;
                const isSelected = cell.dateStr === selectedDate;
                const workedCount = summary?.worked || 0;
                const issueCount =
                  (summary?.late || 0) +
                  (summary?.earlyLeave || 0) +
                  (summary?.absent || 0) +
                  (summary?.annualLeave || 0) +
                  (summary?.sickLeave || 0) +
                  (summary?.halfLeave || 0);

                return (
                  <button
                    key={cell.key}
                    type="button"
                    data-testid={cell.dateStr ? `attendance-calendar-cell-${cell.dateStr}` : undefined}
                    onClick={() => {
                      if (!cell.dateStr) return;
                      syncSelectedDate(cell.dateStr);
                      setCalendarDetailView('day');
                      setIsCalendarDetailOpen(true);
                    }}
                    className={`min-h-[130px] p-3 border rounded-2xl transition-all text-left ${
                      cell.isCurrentMonth
                        ? isSelected
                          ? 'bg-blue-500/10 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 shadow-sm'
                          : 'bg-[var(--card)] dark:bg-zinc-800/50 border-[var(--border)] dark:border-zinc-700 hover:shadow-md hover:border-blue-300 dark:hover:border-blue-600 cursor-pointer'
                        : 'bg-[var(--tab-bg)]/50 dark:bg-zinc-900/30 border-transparent opacity-40'
                    }`}
                    disabled={!cell.isCurrentMonth}
                  >
                    {cell.isCurrentMonth && cell.day != null && (
                      <div className="flex flex-col h-full">
                        <span className={`text-sm font-bold flex justify-between items-center ${cell.isWeekend ? 'text-rose-500' : 'text-foreground'}`}>
                          {cell.day}
                          {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>}
                        </span>

                        <div className="mt-auto space-y-1.5">
                          {workedCount > 0 ? (
                            <div className="px-2 py-1.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-[9px] font-bold rounded-lg flex justify-between items-center group">
                              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> 출근</span>
                              <span className="bg-emerald-200 dark:bg-emerald-800 px-1.5 rounded-md text-emerald-800 dark:text-emerald-200">{workedCount}</span>
                            </div>
                          ) : (
                            <div className="px-2 py-1.5 bg-[var(--tab-bg)] dark:bg-zinc-800 text-[9px] font-bold rounded-lg flex justify-between items-center text-[var(--toss-gray-4)]">
                              <span>기록 없음</span>
                              <span>-</span>
                            </div>
                          )}
                          {issueCount > 0 && (
                            <div className="px-2 py-1.5 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 text-[9px] font-bold rounded-lg flex justify-between items-center">
                              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span> 지각/결근/휴가</span>
                              <span className="bg-rose-200 dark:bg-rose-800 px-1.5 rounded-md text-rose-800 dark:text-rose-200">{issueCount}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            </div>
          </div>

          {isCalendarDetailOpen && (
            <div
              className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
              data-testid="attendance-calendar-detail-modal"
              onClick={() => setIsCalendarDetailOpen(false)}
            >
              <div
                className="w-full max-w-6xl max-h-[88vh] overflow-hidden rounded-3xl bg-[var(--card)] dark:bg-zinc-900 border border-[var(--border)] dark:border-zinc-800 shadow-2xl flex flex-col"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 px-5 py-4 border-b border-[var(--border)] dark:border-zinc-800 bg-[var(--tab-bg)]/50 dark:bg-zinc-900/60">
                  <div>
                    <h3 className="text-lg font-bold text-foreground">근태 상세 보기</h3>
                    <p className="text-[12px] font-medium text-[var(--toss-gray-4)] mt-1">{calendarDetailLabel}</p>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 bg-[var(--card)] dark:bg-zinc-800/80 p-1 rounded-[var(--radius-lg)] border border-[var(--border)] dark:border-zinc-700">
                      {[
                        { id: 'day', label: '일별' },
                        { id: 'week', label: '주별' },
                        { id: 'month', label: '월별' },
                      ].map((mode) => (
                        <button
                          key={mode.id}
                          type="button"
                          data-testid={`attendance-calendar-detail-${mode.id}`}
                          onClick={() => setCalendarDetailView(mode.id as 'day' | 'week' | 'month')}
                          className={`px-3 py-2 rounded-[var(--radius-md)] text-[12px] font-bold transition-all ${
                            calendarDetailView === mode.id
                              ? 'bg-[var(--card)] dark:bg-zinc-700 text-foreground shadow-sm ring-1 ring-zinc-900/5 dark:ring-white/10'
                              : 'text-[var(--toss-gray-4)] hover:text-foreground hover:bg-[var(--card)]/60 dark:hover:bg-zinc-700/60'
                          }`}
                        >
                          {mode.label}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      data-testid="attendance-calendar-detail-close"
                      onClick={() => setIsCalendarDetailOpen(false)}
                      className="w-10 h-10 rounded-full border border-[var(--border)] dark:border-zinc-700 bg-[var(--card)] dark:bg-zinc-800 text-[var(--toss-gray-4)] hover:text-foreground hover:border-blue-400 transition-colors flex items-center justify-center text-lg font-bold"
                      aria-label="근태 상세 닫기"
                    >
                      ×
                    </button>
                  </div>
                </div>

                <div className="p-5 overflow-auto custom-scrollbar bg-[var(--muted)]/20 space-y-4">
                  {calendarDetailView === 'day' && renderIntegratedDayPanel()}
                  {calendarDetailView === 'week' && renderIntegratedRangePanel('week')}
                  {calendarDetailView === 'month' && renderIntegratedRangePanel('month')}
                </div>
              </div>
            </div>
          )}
          </div>
        )}
      </main>
    </div>
    </>
  );
}
