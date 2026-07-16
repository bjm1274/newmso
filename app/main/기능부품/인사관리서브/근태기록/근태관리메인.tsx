'use client';
// LEGACY — unused; AttendWorkcenter is SSOT. Safe to delete after smoke.
import { toast } from '@/lib/toast';
import type { StaffMember as AppStaffMember } from '@/types';
import { useState, useEffect, useMemo } from 'react';
import { db, d1 } from '@/lib/db-client';
import { getKoreanMonthString, getKoreanTodayString } from '@/lib/seoul-time';
import { useActionDialog } from '@/app/components/useActionDialog';
import { withMissingColumnsFallback } from '@/lib/db-compat';
import { filterRosterShiftsForDepartment } from '@/lib/roster-shift-team-filter';
import { isActiveStaff } from '@/lib/active-staff';
import SmartMonthPicker from '../../공통/SmartMonthPicker';
import AttendanceIssueAnalysisSuite from '../근태이상통합분석';
import LeaveManagement from '../휴가신청/휴가관리메인';
import AttendanceDeductionSimulator from '../휴가신청/근태차감시뮬레이터';
import AttendanceAnomalyPanel from '../휴가신청/근태이상탐지';
import { MenuIcon } from '../../조직도서브/조직도측면창';
import AttendanceBulkEditModal from './근태일괄수정모달';
import RosterWorkspace from '../../인사관리워크센터/AttendWorkcenter/RosterWorkspace';
import AttendanceDashboardView from './근태대시보드뷰';
import AttendanceCalendarView from './근태달력뷰';
// AttendanceScheduleView — 레거시 월간 칩 UI, schedule 탭은 RosterWorkspace 로 통합
import {
  ROSTER_CREATOR_POSITIONS,
  ROSTER_APPROVER_POSITIONS,
  ROSTER_APPROVER_COMPANIES,
  LEGACY_ROSTER_APPROVAL_TYPE,
  LEGACY_APPROVAL_PENDING_STATUS,
  LEGACY_APPROVAL_APPROVED_STATUS,
  LEGACY_APPROVAL_REJECTED_STATUS,
  type AttendanceMainView,
  type StaffMember,
  buildAttendanceKey,
  isMissingRosterWorkflowTableError,
  mapLegacyApprovalRequest,
  isLegacyApprovalRequest,
  resolveLeaveStatusForDate,
  resolveAttendanceStatusWithLeave,
  isWeekendDate,
  resolveRosterShiftBand,
  isWorkedShiftAssignment,
  buildWeekDates,
  buildMonthCalendarCells,
  isShiftBasedShift } from './근태관리메인-내부유틸';

type AttendanceMainProps = {
  staffs: StaffMember[];
  selectedCo: string;
  user?: AppStaffMember | Record<string, unknown> | null;
  onRefresh?: () => void;
  initialView?: AttendanceMainView;
  initialLeaveTab?: string;
};

export default function AttendanceMain({ staffs, selectedCo, user, onRefresh, initialView = 'calendar', initialLeaveTab }: AttendanceMainProps) {
  const { dialog, openConfirm, openPrompt } = useActionDialog();
  const [viewMode, setViewMode] = useState<AttendanceMainView>(initialView);
  const [calendarDetailView, setCalendarDetailView] = useState<'day' | 'week' | 'month'>('month');
  const [isCalendarDetailOpen, setIsCalendarDetailOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(getKoreanMonthString());
  const [selectedDate, setSelectedDate] = useState(getKoreanTodayString());
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
  const [showShiftWizard, setShowShiftWizard] = useState(false);

  // Roster planner
  const [rosterTeam, setRosterTeam] = useState<string>('전체');
  const [approvalPending, setApprovalPending] = useState(false);
  const [approvalStatus, setApprovalStatus] = useState<'idle'|'pending'|'approved'|'rejected'>('idle');
  const [approvalRejectReason, setApprovalRejectReason] = useState('');
  const [pendingApprovals, setPendingApprovals] = useState<any[]>([]);
  const [rosterWarnings, setRosterWarnings] = useState<string[]>([]);
  const [orgTeams, setOrgTeams] = useState<any[]>([]);

  useEffect(() => {
    if (viewMode !== 'schedule') return;
    let query = db.from('org_teams').select('*');
    if (selectedCo !== '전체') {
      query = query.eq('company_name', selectedCo);
    }
    query.then(({ data }) => {
      setOrgTeams(data || []);
    });
  }, [selectedCo, viewMode]);

  // Shift Swap State
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [swapData, setSwapData] = useState<{ staffId: string; date: string; currentShiftId: string | null } | null>(null);
  const [pendingSwaps, setPendingSwaps] = useState<any[]>([]);
  
  // 일괄 수정 모달 내부 상태는 AttendanceBulkEditModal에서 자체 관리한다.

  const filtered = useMemo(
    () => {
      const byCompany = selectedCo === '전체' ? staffs : staffs.filter((s: StaffMember) => s.company === selectedCo);
      return byCompany.filter((s: StaffMember) => isActiveStaff(s));
    },
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
          totalRecords: 0 });
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
        db
          .from('attendances')
          .select('*')
          .in('staff_id', staffIds)
          .gte('work_date', startDate)
          .lte('work_date', endDate),
        db
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

        let query = db
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
    const { data } = await db
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
    db
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

    if (scopedDepartment) {
      const activeTeam = orgTeams.find((t) => t.team_name === scopedDepartment);
      if (activeTeam?.applicable_shifts) {
        try {
          const shiftIds = JSON.parse(activeTeam.applicable_shifts) as string[];
          if (Array.isArray(shiftIds) && shiftIds.length > 0) {
            const matched = workShifts.filter((shift: any) => shiftIds.includes(String(shift.id)));
            if (matched.length > 0) {
              return matched;
            }
          }
        } catch (e) {
          console.error('[visibleWorkShifts] applicable_shifts 파싱 오류:', e);
        }
      }
    }

    const scopedShifts = filterRosterShiftsForDepartment(scopedDepartment, workShifts as any[]);
    return scopedShifts.length > 0 ? scopedShifts : workShifts;
  }, [rosterTeam, workShifts, orgTeams]);
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
      const { error } = await db.from('roster_swap_requests').insert({
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
      const { error } = await db.from('roster_swap_requests').update({
        status: 'approved',
        approved_by: user?.id,
        approved_at: new Date().toISOString() }).eq('id', req.id);
      if (error) throw error;
      setPendingSwaps(p => p.filter(x => x.id !== req.id));
      toast('교환 요청을 승인했습니다.');
    } catch (e) {
      toast('승인 중 오류 발생');
    }
  };

  const handleRejectSwap = async (req: any, reason: string) => {
    await db.from('roster_swap_requests').update({
      status: 'rejected',
      reject_reason: reason,
      rejected_by: user?.id,
      rejected_at: new Date().toISOString() }).eq('id', req.id);
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
        let query = db
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

      db.from('roster_approval_requests').select('*').eq('status', 'pending').order('created_at', { ascending: false }).then(async ({ data, error }) => {
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
      db.from('roster_swap_requests').select('*').eq('status', 'pending').order('created_at', { ascending: false }).then(({ data, error }) => {
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
    
    // rosterFiltered에 속한 직원들의 ID만 필터링하도록 Set 구성
    const allowedStaffIds = new Set(rosterFiltered.map(s => String(s.id)));
    
    const assignments = Object.entries(shiftAssignments)
      .filter(([, v]) => v)
      .map(([k, v]) => {
        const [staff_id, work_date] = k.split('_');
        const staffObj = staffs.find(s => String(s.id) === staff_id);
        const shiftObj = workShifts.find(w => String(w.id) === v);
        return {
          staff_id,
          staff_name: staffObj?.name || staff_id,
          work_date,
          shift_id: v,
          shift_name: shiftObj?.name || v };
      })
      .filter(a => allowedStaffIds.has(String(a.staff_id)));
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
          assignments }) });

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
        const { error: approvalError } = await db.from('approvals').update({
          status: LEGACY_APPROVAL_APPROVED_STATUS,
          current_approver_id: null,
          meta_data: {
            ...metaData,
            roster_approval_status: 'approved',
            roster_approved_by: user?.id || null,
            roster_approved_at: nowIso } }).eq('id', request.id);
        if (approvalError) throw approvalError;
      } else {
        const { error: approvalError } = await db.from('roster_approval_requests').update({
          status: 'approved',
          approved_by: user?.id,
          approved_at: nowIso,
          updated_at: nowIso }).eq('id', request.id);
        if (approvalError) throw approvalError;
      }

      // 2. Apply to shift_assignments
      const companyName = request.company_name;
      for (const a of (request.assignments || [])) {
        await db.from('shift_assignments').upsert(
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

      await db.from('document_repository').insert({
        title: `[근무표] ${request.team_name || '전체'} ${request.year_month} 승인`,
        category: '규정',
        content: `승인일: ${new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}\n승인자: ${user?.name || ''}\n요청자: ${request.requested_by_name || ''}\n\n직원명\t근무일\t근무형태\n${docContent}`,
        company_name: companyName || '전체',
        created_by: user?.id,
        version: 1 });

      if (request.requested_by) {
        await d1.from('notifications').insert({
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
            year_month: request.year_month || selectedMonth } });
      }

      if (false && request.requested_by) {
        await d1.from('notifications').insert({
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
            year_month: request.year_month || selectedMonth } });
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
        const { error } = await db.from('approvals').update({
          status: LEGACY_APPROVAL_REJECTED_STATUS,
          current_approver_id: null,
          meta_data: {
            ...metaData,
            roster_approval_status: 'rejected',
            roster_rejected_by: user?.id || null,
            roster_rejected_at: nowIso,
            roster_reject_reason: reason } }).eq('id', request.id);
        if (error) throw error;
      } else {
        const { error } = await db.from('roster_approval_requests').update({
          status: 'rejected',
          rejected_by: user?.id,
          rejected_at: nowIso,
          reject_reason: reason,
          updated_at: nowIso }).eq('id', request.id);
        if (error) throw error;
      }

      if (request.requested_by) {
        await d1.from('notifications').insert({
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
            year_month: request.year_month || selectedMonth } });
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


  // 근무표 생성 / 3교대 마법사 → 통합 RosterWorkspace (이중 메뉴 제거)
  if (showShiftWizard || viewMode === 'schedule') {
    return (
      <div className="h-full flex flex-col bg-[var(--page-bg)] animate-in fade-in duration-300">
        <header className="px-4 py-3 border-b border-[var(--border)] bg-[var(--card)] flex items-center justify-between shrink-0 shadow-sm z-10 sticky top-0">
          <div>
            <h3 className="text-sm font-bold text-foreground">근무표 편성</h3>
            <p className="text-[11px] text-[var(--toss-gray-4)]">
              통합 편집기 · 자동편성 · AI 추천 (근무유형 칩 포함)
            </p>
          </div>
          {showShiftWizard && (
            <button
              type="button"
              title="돌아가기"
              onClick={() => setShowShiftWizard(false)}
              className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)] transition-colors focus:outline-none"
            >
              ← 돌아가기
            </button>
          )}
        </header>
        <div className="flex-1 min-h-0 overflow-auto p-3">
          <RosterWorkspace staffs={staffs as never} selectedCo={selectedCo} />
        </div>
      </div>
    );
  }

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

        {/* schedule 탭은 상단 early-return 으로 RosterWorkspace 렌더 */}

        {viewMode === 'dashboard' && (
          <AttendanceDashboardView stats={stats} selectedMonth={selectedMonth} />
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
            company: s.company }))}
          initialDate={selectedDate}
          attendances={attendanceData}
          approvedLeaves={approvedLeaves}
          onApplied={() => {
            fetchAttendance();
          }}
        />

        {viewMode === 'calendar' && (
          <AttendanceCalendarView
            filtered={filtered}
            attendanceMap={attendanceMap}
            approvedLeaves={approvedLeaves}
            selectedMonth={selectedMonth}
            selectedDate={selectedDate}
            calendarCells={calendarCells}
            calendarAttendanceSummary={calendarAttendanceSummary}
            calendarDetailView={calendarDetailView}
            setCalendarDetailView={setCalendarDetailView}
            isCalendarDetailOpen={isCalendarDetailOpen}
            setIsCalendarDetailOpen={setIsCalendarDetailOpen}
            syncSelectedDate={syncSelectedDate}
            daysArray={daysArray}
            weekDates={weekDates}
            shiftAssignments={shiftAssignments}
            shiftLookup={shiftLookup}
          />
        )}
      </main>
    </div>
    </>
  );
}
