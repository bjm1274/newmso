'use client';
import { toast } from '@/lib/toast';
import type { StaffMember as AppStaffMember } from '@/types';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import SmartDatePicker from '../../공통/SmartDatePicker';
import SmartMonthPicker from '../../공통/SmartMonthPicker';
import AutoRosterPlanner from '../../근무표자동편성';

type StaffMember = {
  id: string;
  name: string;
  position: string;
  department: string;
  company: string;
  shift_type?: string;
  [key: string]: unknown;
};

const ROSTER_CREATOR_POSITIONS = ['간호과장', '간호부장', '실장'];
const ROSTER_APPROVER_POSITIONS = ['총무부장', '이사'];
const ROSTER_APPROVER_COMPANIES = ['SY INC.'];
const OFF_SHIFT_TOKEN = '__OFF__';
const LEGACY_ROSTER_APPROVAL_TYPE = 'roster_schedule_approval';
const LEGACY_APPROVAL_PENDING_STATUS = '\uB300\uAE30';
const LEGACY_APPROVAL_APPROVED_STATUS = '\uC2B9\uC778';
const LEGACY_APPROVAL_REJECTED_STATUS = '\uBC18\uB824';

type AttendanceMainProps = {
  staffs: StaffMember[];
  selectedCo: string;
  user?: AppStaffMember | Record<string, unknown> | null;
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

function isWorkedAttendanceStatus(status: string) {
  return status === 'present';
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

export default function AttendanceMain({ staffs, selectedCo, user }: AttendanceMainProps) {
  const [viewMode, setViewMode] = useState<'daily' | 'monthly' | 'calendar' | 'dashboard' | 'schedule'>('monthly');
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [attendanceData, setAttendanceData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [workShifts, setWorkShifts] = useState<any[]>([]);
  const [shiftAssignments, setShiftAssignments] = useState<Record<string, string>>({}); // key: `${staff_id}_${work_date}` -> shift_id or ''
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);

  // Roster planner
  const [rosterTeam, setRosterTeam] = useState<string>('전체');
  const [aiLoading, setAiLoading] = useState(false);
  const [approvalPending, setApprovalPending] = useState(false);
  const [approvalStatus, setApprovalStatus] = useState<'idle'|'pending'|'approved'|'rejected'>('idle');
  const [approvalRejectReason, setApprovalRejectReason] = useState('');
  const [pendingApprovals, setPendingApprovals] = useState<any[]>([]);
  const [rosterWarnings, setRosterWarnings] = useState<string[]>([]);
  const [showShiftWizard, setShowShiftWizard] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  
  // AI Config State
  const [aiConfig, setAiConfig] = useState({
    targetOffDays: 8,
    targetNightDays: 6,
    minDayReq: 1,
    minEveReq: 1,
    minNightReq: 1,
    enableSkillMix: false,
  });

  // Shift Swap State
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [swapData, setSwapData] = useState<{ staffId: string; date: string; currentShiftId: string | null } | null>(null);
  const [pendingSwaps, setPendingSwaps] = useState<any[]>([]);
  
  const [bulkRangeType, setBulkRangeType] = useState<'day' | 'week' | 'month' | 'custom'>('day');
  const [bulkStartDate, setBulkStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [bulkEndDate, setBulkEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [bulkStatus, setBulkStatus] = useState<string>('absent');
  const [bulkSaving, setBulkSaving] = useState(false);

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
    const summary = new Map<string, { worked: number; lateOrEarly: number; absentOrLeave: number; totalRecords: number }>();

    attendanceData.forEach((attendance) => {
      const workDate = String(attendance?.work_date || '').trim();
      if (!workDate || !workDate.startsWith(`${selectedMonth}-`)) return;

      const dayOfWeek = new Date(workDate).getDay();
      const status = resolveAttendanceStatus(attendance, dayOfWeek === 0 || dayOfWeek === 6);
      if (!summary.has(workDate)) {
        summary.set(workDate, { worked: 0, lateOrEarly: 0, absentOrLeave: 0, totalRecords: 0 });
      }

      const current = summary.get(workDate)!;
      current.totalRecords += 1;

      if (status === 'late' || status === 'early_leave') {
        current.worked += 1;
        current.lateOrEarly += 1;
        return;
      }

      if (status === 'present') {
        current.worked += 1;
        return;
      }

      if (status === 'absent' || status === 'annual_leave' || status === 'sick_leave' || status === 'half_leave') {
        current.absentOrLeave += 1;
      }
    });

    return summary;
  }, [attendanceData, selectedMonth]);

  const fetchAttendance = async () => {
    setLoading(true);
    try {
      const staffIds = filtered.map((s: StaffMember) => s.id);
      if (staffIds.length === 0) {
        setAttendanceData([]);
        return;
      }
      const [startDate, endDate] = viewMode === 'daily'
        ? [selectedDate, selectedDate]
        : [`${selectedMonth}-01`, `${selectedMonth}-${String(daysInMonth).padStart(2, '0')}`];

      const { data, error } = await supabase
        .from('attendances')
        .select('*')
        .in('staff_id', staffIds)
        .gte('work_date', startDate)
        .lte('work_date', endDate);

      if (error) throw error;
      setAttendanceData(data || []);
    } catch (err) {
      console.error('근태 조회 실패:', err);
      setAttendanceData([]);
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
    supabase.from('work_shifts').select('id, name, start_time, end_time').eq('is_active', true).then(({ data }) => {
      setWorkShifts(data || []);
    });
  }, [viewMode]);

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
  const canCreateRoster = ROSTER_CREATOR_POSITIONS.includes(userPosition) || ['admin', 'master'].includes(userRole) || ['최고관리자', '시스템관리자', '대표', '관리자'].includes(userPosition);
  const canApproveRoster = ROSTER_APPROVER_POSITIONS.includes(userPosition) || (ROSTER_APPROVER_COMPANIES.includes(userCompany) && userPosition === '이사') || ['admin', 'master'].includes(userRole) || ['최고관리자', '시스템관리자'].includes(userPosition);

  // Team list
  const teamList = useMemo(() => {
    const teams = Array.from(new Set(filtered.map((s: StaffMember) => s.department).filter(Boolean)));
    return ['전체', ...teams.sort()];
  }, [filtered]);

  const rosterFiltered = useMemo(() => {
    if (rosterTeam === '전체') return filtered;
    return filtered.filter((s: StaffMember) => s.department === rosterTeam);
  }, [filtered, rosterTeam]);

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
          if (shiftId) {
            const shift = workShifts.find((s: any) => s.id === shiftId);
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
      for (let d = 1; d <= lastDay; d++) {
        const dStr = `${selectedMonth}-${String(d).padStart(2, '0')}`;
        const key = `${staff.id}_${dStr}`;
        if (shiftAssignments[key]) {
          if (consecutive === 0) startDay = d;
          consecutive++;
          if (consecutive >= 7) {
            warnings.push(`⚠️ 연속 7일 근무: ${staff.name} (${selectedMonth}-${String(startDay).padStart(2, '0')} ~ ${dStr})`);
          }
        } else {
          consecutive = 0;
        }
      }
    });
    return warnings;
  }, [viewMode, shiftAssignments, rosterFiltered, workShifts, selectedMonth]);

  // Fetch pending approvals & swaps
  useEffect(() => {
    if (viewMode !== 'schedule') return;
    if (canApproveRoster || canCreateRoster) {
      const userId = String(user?.id || '').trim();
      const loadLegacyPendingApprovals = async () => {
        let query = supabase
          .from('approvals')
          .select('id, sender_id, sender_name, sender_company, status, current_approver_id, rejection_comment, meta_data, created_at')
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

  const submitAiGenerate = async () => {
    setShowAiModal(false);
    setAiLoading(true);
    try {
      const monthDates = daysArray.map((day) => `${selectedMonth}-${String(day).padStart(2, '0')}`);
      const validShiftIds = new Set(workShifts.map((shift: any) => String(shift.id)));
      const offShift = workShifts.find((shift: any) => {
        const name = String(shift?.name || '').toLowerCase();
        return name.includes('off') || name.includes('오프') || name.includes('휴무') || name === 'o';
      });
      const teamStaffs = rosterFiltered.map((s: StaffMember) => ({
        id: s.id, name: s.name, department: s.department, position: s.position, shiftType: s.shift_type || '',
      }));
      const res = await fetch('/api/ai/roster-recommendation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          staffs: teamStaffs, 
          workShifts: workShifts, 
          selectedMonth: selectedMonth, 
          selectedDepartment: rosterTeam,
          selectedCompany: selectedCo || '본사',
          monthDates,
          constraints: aiConfig,
          preAssigned: shiftAssignments
        }),
      });
      if (!res.ok) throw new Error('AI 응답 오류');
      const result = await res.json();

      const newAssignments = { ...shiftAssignments };
      rosterFiltered.forEach((staff: StaffMember) => {
        monthDates.forEach((date) => {
          newAssignments[`${staff.id}_${date}`] = '';
        });
      });

      let appliedCount = 0;
      (result.staffPlans || result.assignments || []).forEach((plan: any) => {
        const staffId = String(plan?.staff_id || plan?.staffId || '').trim();
        if (!staffId) return;

        const legacyAssignments = Array.isArray(plan?.assignments) ? plan.assignments : [];
        if (legacyAssignments.length > 0 && typeof legacyAssignments[0] === 'string') {
          legacyAssignments.forEach((token: any, index: number) => {
            const workDate = monthDates[index];
            if (!workDate) return;

            const normalizedToken = String(token || '').trim();
            const nextShiftId =
              normalizedToken === OFF_SHIFT_TOKEN
                ? String(offShift?.id || '')
                : validShiftIds.has(normalizedToken)
                  ? normalizedToken
                  : '';

            if (!nextShiftId && normalizedToken && normalizedToken !== OFF_SHIFT_TOKEN) {
              return;
            }

            newAssignments[`${staffId}_${workDate}`] = nextShiftId;
            if (nextShiftId) {
              appliedCount += 1;
            }
          });
          return;
        }

        legacyAssignments.forEach((assignment: any) => {
          const workDate = String(assignment?.work_date || assignment?.date || '').trim().slice(0, 10);
          if (!workDate) return;
          const shift = workShifts.find((s: any) => s.name === assignment?.shift_name || s.id === assignment?.shift_id);
          if (shift) {
            newAssignments[`${staffId}_${workDate}`] = shift.id;
            appliedCount += 1;
          }
        });
      });

      if (appliedCount === 0) {
        throw new Error('AI 결과를 현재 근무표에 반영하지 못했습니다. 응답 형식 또는 근무유형 설정을 확인해주세요.');
      }

      setShiftAssignments(newAssignments);
      setApprovalStatus('idle');
      toast('AI 근무표 생성 완료! 수정 후 승인요청 해주세요.', 'success');
    } catch (e) {
      console.error(e);
      toast((e as Error)?.message || 'AI 근무표 생성 중 오류가 발생했습니다.', 'error');
    } finally {
      setAiLoading(false);
    }
  };

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
          rejection_comment: null,
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
          rejection_comment: reason,
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

  const stats = useMemo(() => {
    const resolvedStatuses = attendanceData.map((attendance: any) =>
      resolveAttendanceStatus(attendance, false),
    );
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
        .map((attendance: any) => resolveAttendanceStatus(attendance, false));
      const lates = myStatuses.filter((status) => status === 'late').length;
      const absents = myStatuses.filter((status) => status === 'absent').length;
      if (lates >= 3 || absents >= 2) {
        atRiskStaff.push({ name: s.name, dept: s.department, lates, absents });
      }
    });

    return { total, present, late, earlyLeave, absent, rate, atRiskStaff };
  }, [attendanceData, filtered]);

  return (
    <div className="flex flex-col h-full bg-[var(--page-bg)] animate-in fade-in duration-500">
      <header className="px-4 pt-4 pb-3 border-b border-[var(--border)] bg-[var(--card)] shrink-0 shadow-sm z-10 sticky top-0">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div className="flex-1 w-full">
            <div className="flex items-center gap-3 mb-4 block w-full">
              <div className="w-10 h-10 rounded-xl bg-[var(--accent)] flex items-center justify-center text-white font-bold text-lg shadow-sm shrink-0">
                🕒
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">
                  전문 근태 통합 관리 <span className="ml-1 px-2 py-0.5 rounded-[var(--radius-md)] bg-blue-500/10 text-blue-600 text-[10px] font-bold border border-blue-100">{selectedCo}</span>
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-1 bg-[var(--tab-bg)]/80 dark:bg-zinc-800/80 p-1 rounded-[var(--radius-lg)] w-fit border border-[var(--border)]/50 dark:border-zinc-700/50 overflow-x-auto custom-scrollbar">
              {[
                { id: 'dashboard', label: '대시보드', icon: '📊' },
                { id: 'daily', label: '일별 현황', icon: '📋' },
                { id: 'monthly', label: '월별 대장', icon: '📅' },
                ...((canCreateRoster || canApproveRoster) ? [{ id: 'schedule', label: '근무표 생성', icon: '📝' }] : []),
                { id: 'calendar', label: '근태 달력', icon: '🗓️' }
              ].map(mode => (
                <button
                  key={mode.id}
                  onClick={() => setViewMode(mode.id as any)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-[var(--radius-md)] text-[12px] font-bold transition-all whitespace-nowrap ${viewMode === mode.id
                    ? 'bg-[var(--card)] dark:bg-zinc-700 text-foreground shadow-sm ring-1 ring-zinc-900/5 dark:ring-white/10'
                    : 'text-[var(--toss-gray-4)] hover:text-foreground hover:bg-[var(--card)]/50 dark:hover:bg-zinc-700/50'
                    }`}
                >
                  <span className="text-sm">{mode.icon}</span>
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto overflow-x-auto pb-2 md:pb-0 hide-scrollbar">
            <button
              type="button"
              onClick={() => setBulkEditOpen(true)}
              className="flex items-center gap-2 px-3 py-2.5 rounded-[var(--radius-md)] text-[11px] font-bold bg-[var(--card)] dark:bg-zinc-800 text-[var(--toss-gray-4)] dark:text-[var(--toss-gray-3)] border border-[var(--border)] dark:border-zinc-700 shadow-sm hover:border-blue-400 hover:text-blue-600 transition-colors whitespace-nowrap focus:outline-none"
            >
              <span className="text-sm">⚡</span> 상태 일괄 수정
            </button>

            <div className="flex items-center bg-[var(--card)] dark:bg-zinc-800 border border-[var(--border)] dark:border-zinc-700 rounded-[var(--radius-md)] p-1 shadow-sm shrink-0 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent transition-all">
              {viewMode === 'daily' ? (
                <>
                  <div className="px-3 bg-[var(--tab-bg)] dark:bg-zinc-900/50 rounded-lg py-1.5 border border-[var(--border-subtle)] dark:border-zinc-800 text-[10px] font-bold text-[var(--toss-gray-3)]">DATE</div>
                  <SmartDatePicker
                    value={selectedDate}
                    onChange={(val) => setSelectedDate(val)}
                    className="bg-transparent px-3 py-1.5 text-xs font-bold text-foreground outline-none w-full sm:w-32 cursor-pointer"
                  />
                </>
              ) : (
                <>
                  <div className="px-3 bg-[var(--tab-bg)] dark:bg-zinc-900/50 rounded-lg py-1.5 border border-[var(--border-subtle)] dark:border-zinc-800 text-[10px] font-bold text-[var(--toss-gray-3)]">MONTH</div>
                  <SmartMonthPicker
                    value={selectedMonth}
                    onChange={(val) => setSelectedMonth(val)}
                    className="bg-transparent px-3 py-1.5 text-xs font-bold text-foreground outline-none w-full sm:w-32 cursor-pointer"
                  />
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 overflow-auto custom-scrollbar bg-[var(--muted)]/20">
        {viewMode === 'daily' && (
          <div className="max-w-6xl mx-auto space-y-4">
            <h3 className="text-lg font-bold text-foreground mb-4">일별 출퇴근 현황 <span className="text-[var(--toss-gray-4)] text-sm font-medium ml-2">{selectedDate}</span></h3>
            <div className="bg-[var(--card)] dark:bg-zinc-900 border border-[var(--border)] dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-[var(--tab-bg)] dark:bg-zinc-900/50 border-b border-[var(--border)] dark:border-zinc-800">
                    <tr>
                      <th className="px-4 py-4 text-[11px] font-bold text-[var(--toss-gray-4)] uppercase tracking-wider">직원 정보</th>
                      <th className="px-4 py-4 text-[11px] font-bold text-[var(--toss-gray-4)] uppercase tracking-wider">상태</th>
                      <th className="px-4 py-4 text-[11px] font-bold text-[var(--toss-gray-4)] uppercase tracking-wider">출퇴근 시간</th>
                      <th className="px-4 py-4 text-[11px] font-bold text-[var(--toss-gray-4)] uppercase tracking-wider">근무 시간</th>
                      <th className="px-4 py-4 text-[11px] font-bold text-[var(--toss-gray-4)] uppercase tracking-wider">비고</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {filtered.map((s: StaffMember) => {
                      const att = attendanceMap.get(buildAttendanceKey(s.id, selectedDate));
                      const checkIn = att?.check_in_time ? new Date(att.check_in_time).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '-';
                      const checkOut = att?.check_out_time ? new Date(att.check_out_time).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '-';
                      const mins = att?.work_hours_minutes ?? 0;
                      const workHrs = mins ? `${Math.floor(mins / 60)}h ${mins % 60}m` : '-';
                      const selectedDayOfWeek = new Date(selectedDate).getDay();
                      const resolvedStatus = resolveAttendanceStatus(att, selectedDayOfWeek === 0 || selectedDayOfWeek === 6);

                      const statusMap: Record<string, { label: string, color: string, bg: string }> = {
                        present: { label: '정상 출근', color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30 ring-emerald-200' },
                        absent: { label: '결근', color: 'text-rose-700 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-900/30 ring-rose-200' },
                        late: { label: '지각', color: 'text-orange-700 dark:text-orange-400', bg: 'bg-orange-500/10 dark:bg-orange-900/30 ring-orange-200' },
                        early_leave: { label: '조퇴', color: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30 ring-amber-200' },
                        sick_leave: { label: '병가', color: 'text-purple-700 dark:text-purple-400', bg: 'bg-purple-500/10 dark:bg-purple-900/30 ring-purple-200' },
                        annual_leave: { label: '연차', color: 'text-blue-700 dark:text-blue-400', bg: 'bg-blue-500/10 dark:bg-blue-900/30 ring-blue-200' },
                        holiday: { label: '휴일', color: 'text-[var(--toss-gray-4)] dark:text-[var(--toss-gray-3)]', bg: 'bg-[var(--tab-bg)] dark:bg-zinc-800 ring-zinc-200' },
                        half_leave: { label: '반차', color: 'text-cyan-700 dark:text-cyan-400', bg: 'bg-cyan-50 dark:bg-cyan-900/30 ring-cyan-200' },
                        missing: { label: '기록 없음', color: 'text-[var(--toss-gray-4)] dark:text-[var(--toss-gray-3)]', bg: 'bg-[var(--page-bg)] dark:bg-zinc-800/80 ring-zinc-200' },
                      };

                      const statusObj = statusMap[resolvedStatus || 'missing'] || statusMap.missing;

                      return (
                        <tr key={s.id} className="hover:bg-[var(--tab-bg)]/50 dark:hover:bg-zinc-800/30 transition-colors group cursor-default">
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-[var(--tab-bg)] dark:bg-zinc-800 flex items-center justify-center text-[var(--toss-gray-4)] font-bold text-xs ring-1 ring-zinc-200 dark:ring-zinc-700">
                                {s.name[0]}
                              </div>
                              <div className="flex flex-col">
                                <span className="font-bold text-sm text-foreground">{s.name}</span>
                                <span className="text-[11px] text-[var(--toss-gray-4)] font-medium mt-0.5">{s.department} · {s.position}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold ring-1 ring-inset ${statusObj.color} ${statusObj.bg}`}>
                              <span className={`w-1 h-1 rounded-full mr-1.5 ${statusObj.bg.replace('ring-', 'bg-').split(' ')[0]}`} style={{ filter: 'brightness(0.8)' }}></span>
                              {statusObj.label}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-[var(--toss-gray-3)] uppercase w-4">IN</span>
                                <span className="font-mono font-bold text-sm text-foreground">{checkIn}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-[var(--toss-gray-3)] uppercase w-4">OUT</span>
                                <span className="font-mono font-bold text-sm text-[var(--toss-gray-4)]">{checkOut}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 font-mono font-bold text-blue-600 dark:text-blue-500 text-sm">
                            {workHrs}
                          </td>
                          <td className="px-4 py-4 text-xs font-medium text-[var(--toss-gray-4)]">
                            {att?.notes || <span className="opacity-30">-</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
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
                  {canCreateRoster && (
                    <>
                      <button
                        type="button"
                        onClick={() => setShowAiModal(true)}
                        disabled={aiLoading}
                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-500 to-blue-500 text-white border-0 font-bold text-[11px] rounded-xl shadow-sm hover:shadow-md transition-all disabled:opacity-50 shrink-0"
                      >
                        {aiLoading ? (
                          <><svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg> AI 생성중...</>
                        ) : (
                          <><span className="text-sm">🤖</span> AI 자동 생성</>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowShiftWizard(true)}
                        className="px-4 py-2 bg-purple-500/10 text-purple-600 border border-purple-500/20 font-bold text-[11px] rounded-xl shadow-sm hover:bg-purple-500/20 transition-all shrink-0 flex items-center gap-2"
                      >
                        <span className="text-sm">🪄</span> 3교대 마법사
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const standardShift = workShifts.find(sh => sh.name.includes('통상') || sh.name.includes('일반') || sh.name.includes('주간') || sh.name.includes('9to6'));
                          if (!standardShift) {
                            toast('통상/일반/주간 이라는 이름이 포함된 근무형태가 부재합니다.');
                            return;
                          }
                          if (!confirm('현재 화면의 모든 직원에 대해 평일(월~금)을 모두 통상근무로 채우시겠습니까?')) return;
                          rosterFiltered.forEach((s: StaffMember) => {
                            daysArray.forEach((d) => {
                              const dStr = `${selectedMonth}-${String(d).padStart(2, '0')}`;
                              const dayOfWeek = new Date(dStr).getDay();
                              if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                                setAssignment(s.id, dStr, standardShift.id);
                              }
                            });
                          });
                        }}
                        className="px-4 py-2 bg-blue-500/10 text-blue-600 border border-blue-500/20 font-bold text-[11px] rounded-xl shadow-sm hover:bg-blue-500/20 transition-all shrink-0 flex items-center gap-2"
                      >
                        <span className="text-sm">🏢</span> 통상근무 일괄
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Approval panel for approvers */}
              {canApproveRoster && pendingApprovals.length > 0 && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-xl p-3 space-y-2">
                  <p className="text-[11px] font-bold text-amber-800 dark:text-amber-300 flex items-center gap-2">
                    <span className="text-base">📨</span> 승인 대기 근무표 {pendingApprovals.length}건
                  </p>
                  {pendingApprovals.map((req: any) => (
                    <div key={req.id} className="bg-white dark:bg-zinc-800 border border-amber-200/50 dark:border-zinc-700 rounded-lg p-3 flex flex-col md:flex-row md:items-center gap-3">
                      <div className="flex-1 text-[11px]">
                        <p className="font-bold text-foreground">{req.team_name || '전체'} · {req.year_month}</p>
                        <p className="text-[var(--toss-gray-4)] mt-0.5">요청: {req.requested_by_name} · {new Date(req.created_at).toLocaleDateString('ko-KR')}</p>
                        <p className="text-[var(--toss-gray-3)] mt-0.5">{(req.assignments || []).length}건 배정</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => handleApprove(req)} className="px-3 py-1.5 bg-emerald-500 text-white text-[11px] font-bold rounded-lg hover:bg-emerald-600 transition-colors">✅ 승인</button>
                        <button onClick={() => {
                          const reason = prompt('반려 사유를 입력하세요:');
                          if (reason) handleReject(req, reason);
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
                    <div key={req.id} className="bg-white dark:bg-zinc-800 border border-emerald-200/50 dark:border-zinc-700 rounded-lg p-3 flex flex-col md:flex-row md:items-center gap-3">
                      <div className="flex-1 text-[11px]">
                        <p className="font-bold text-foreground">{req.requested_by_name} ➔ {req.work_date} 근무 변경 희망</p>
                        <p className="text-[var(--toss-gray-4)] mt-0.5">사유: {req.reason || '사유 미입력'}</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => handleApproveSwap(req)} className="px-3 py-1.5 bg-emerald-500 text-white text-[10px] font-bold rounded-lg hover:bg-emerald-600">승인</button>
                        <button onClick={() => {
                          const r = prompt('반려 사유:');
                          if (r) handleRejectSwap(req, r);
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
                {workShifts.map((sh: any) => {
                  const isActive = activeTool === sh.id;
                  let colorClass = 'bg-[var(--tab-bg)] dark:bg-zinc-900 text-[var(--toss-gray-4)] dark:text-[var(--toss-gray-3)] border-[var(--border)] dark:border-zinc-700 hover:bg-[var(--tab-bg)] dark:hover:bg-zinc-800';
                  if (sh.name.includes('Day') || sh.name.includes('데이') || sh.name === 'D') colorClass = 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/40';
                  if (sh.name.includes('Evening') || sh.name.includes('이브') || sh.name === 'E') colorClass = 'bg-orange-500/10 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 border-orange-500/20 dark:border-orange-800/50 hover:bg-orange-500/20 dark:hover:bg-orange-900/40';
                  if (sh.name.includes('Night') || sh.name.includes('나이트') || sh.name === 'N') colorClass = 'bg-blue-500/10 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-500/20 dark:border-blue-800/50 hover:bg-blue-500/20 dark:hover:bg-blue-900/40';
                  if (sh.name.includes('Off') || sh.name.includes('오프') || sh.name === 'O') colorClass = 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800/50 hover:bg-rose-100 dark:hover:bg-rose-900/40';

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
                        const shiftObj = workShifts.find(w => w.id === value);
                        const isWeekend = new Date(dStr).getDay() === 0 || new Date(dStr).getDay() === 6;

                        let cellColor = isWeekend ? 'bg-red-500/10/30 dark:bg-red-900/5 hover:bg-[var(--tab-bg)] dark:hover:bg-zinc-800/50' : 'hover:bg-[var(--tab-bg)] dark:hover:bg-zinc-800/50';
                        if (shiftObj) {
                          if (shiftObj.name.includes('Day') || shiftObj.name.includes('데이') || shiftObj.name === 'D') cellColor = 'bg-emerald-100/50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-bold';
                          else if (shiftObj.name.includes('Evening') || shiftObj.name.includes('이브') || shiftObj.name === 'E') cellColor = 'bg-orange-500/20/50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 font-bold';
                          else if (shiftObj.name.includes('Night') || shiftObj.name.includes('나이트') || shiftObj.name === 'N') cellColor = 'bg-blue-500/20/50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-bold';
                          else if (shiftObj.name.includes('Off') || shiftObj.name.includes('오프') || shiftObj.name === 'O') cellColor = 'bg-rose-100/50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 font-bold';
                          else cellColor = 'bg-[var(--tab-bg)] dark:bg-zinc-800 text-[var(--toss-gray-4)] dark:text-[var(--toss-gray-3)] font-bold';
                        }
                        return (
                          <td
                            key={d}
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
                            <div className="w-full h-8 flex items-center justify-center text-[11px] rounded transition-all">
                              {shiftObj ? (shiftObj.name.replace('근무', '').slice(0, 3)) : <span className="opacity-0 group-hover:opacity-20 text-[9px] text-[var(--toss-gray-3)] font-black">+</span>}
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
            
            {/* Shift Wizard Modal */}
            {showShiftWizard && (
              <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-2 md:p-4 animate-in fade-in duration-200">
                <div className="bg-[var(--background)] rounded-2xl w-full max-w-[1400px] h-full max-h-[95vh] overflow-hidden flex flex-col shadow-2xl relative border border-[var(--border)] dark:border-zinc-800">
                  <div className="p-4 border-b border-[var(--border)] dark:border-zinc-800 flex justify-between items-center bg-[var(--card)] dark:bg-zinc-900 shrink-0">
                    <h3 className="font-bold text-lg flex items-center gap-2"><span className="text-2xl">🪄</span> 병동 3교대 패턴 관리 마법사</h3>
                    <button onClick={() => setShowShiftWizard(false)} className="w-8 h-8 flex items-center justify-center bg-[var(--muted)]/50 rounded-full hover:bg-[var(--muted)] transition-colors font-bold text-foreground">✕</button>
                  </div>
                  <div className="flex-1 overflow-auto custom-scrollbar relative">
                    <AutoRosterPlanner
                      staffs={staffs as AppStaffMember[]}
                      selectedCo={selectedCo}
                      user={(user as AppStaffMember) || undefined}
                      onAssignmentsSaved={() => {
                        void loadShiftAssignments();
                        setShowShiftWizard(false);
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
            
            {/* AI Generator Settings Modal */}
            {showAiModal && (
              <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
                <div className="bg-[var(--background)] rounded-2xl w-full max-w-lg shadow-2xl relative border border-[var(--border)] dark:border-zinc-800">
                  <div className="p-4 border-b border-[var(--border)] dark:border-zinc-800 flex justify-between items-center bg-[var(--card)] dark:bg-zinc-900 rounded-t-2xl">
                    <h3 className="font-bold text-lg flex items-center gap-2"><span className="text-2xl">🤖</span> AI 스마트 우선순위 설정</h3>
                    <button onClick={() => setShowAiModal(false)} className="w-8 h-8 flex items-center justify-center bg-[var(--muted)]/50 rounded-full hover:bg-[var(--muted)] transition-colors font-bold text-foreground">✕</button>
                  </div>
                  <div className="p-5 space-y-6">
                    <div className="space-y-3">
                      <h4 className="text-[12px] font-bold text-blue-600 flex items-center gap-1"><span className="text-sm">🎯</span> 월간 개인 목표 수치</h4>
                      <div className="grid grid-cols-2 gap-3">
                        <label className="flex flex-col gap-1">
                          <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">인당 기본 보장 OFF (일)</span>
                          <input type="number" min={0} max={15} value={aiConfig.targetOffDays} onChange={e => setAiConfig(p => ({ ...p, targetOffDays: Number(e.target.value) }))} className="px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--card)] text-sm font-bold" />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">인당 나이트 한도 (회)</span>
                          <input type="number" min={0} max={15} value={aiConfig.targetNightDays} onChange={e => setAiConfig(p => ({ ...p, targetNightDays: Number(e.target.value) }))} className="px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--card)] text-sm font-bold" />
                        </label>
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <h4 className="text-[12px] font-bold text-rose-600 flex items-center gap-1"><span className="text-sm">🛡️</span> 일일 필수 최소 인력 방어</h4>
                      <p className="text-[10px] text-[var(--toss-gray-4)] leading-relaxed">이 방어 조건을 맞추기 위해 AI가 고정 거울 패턴(예: D-D-E-E-N-N)을 깨고 유동적으로 인력을 배치하여 병원 실무와 가장 비슷한 근무를 계산합니다.</p>
                      <div className="grid grid-cols-3 gap-3">
                        <label className="flex flex-col gap-1">
                          <span className="text-[11px] font-bold text-[var(--toss-gray-4)] text-center">Day 최소</span>
                          <input type="number" min={0} max={10} value={aiConfig.minDayReq} onChange={e => setAiConfig(p => ({ ...p, minDayReq: Number(e.target.value) }))} className="px-3 py-2 rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-900/10 text-center text-blue-700 dark:text-blue-400 font-bold" />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-[11px] font-bold text-[var(--toss-gray-4)] text-center">Eve 최소</span>
                          <input type="number" min={0} max={10} value={aiConfig.minEveReq} onChange={e => setAiConfig(p => ({ ...p, minEveReq: Number(e.target.value) }))} className="px-3 py-2 rounded-xl border border-orange-200 dark:border-orange-900 bg-orange-50/50 dark:bg-orange-900/10 text-center text-orange-700 dark:text-orange-400 font-bold" />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-[11px] font-bold text-[var(--toss-gray-4)] text-center">Night 최소</span>
                          <input type="number" min={0} max={10} value={aiConfig.minNightReq} onChange={e => setAiConfig(p => ({ ...p, minNightReq: Number(e.target.value) }))} className="px-3 py-2 rounded-xl border border-purple-200 dark:border-purple-900 bg-purple-50/50 dark:bg-purple-900/10 text-center text-purple-700 dark:text-purple-400 font-bold" />
                        </label>
                      </div>
                    </div>
                    
                    <div className="space-y-3 pt-2">
                      <h4 className="text-[12px] font-bold text-emerald-600 flex items-center gap-1"><span className="text-sm">🌟</span> 연차/숙련도(Skill Mix) 분배</h4>
                      <label className="flex items-start gap-3 p-3 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-900/10 cursor-pointer hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors">
                        <input type="checkbox" checked={aiConfig.enableSkillMix} onChange={e => setAiConfig(p => ({ ...p, enableSkillMix: e.target.checked }))} className="mt-0.5 rounded border-emerald-500 text-emerald-600 focus:ring-emerald-500 w-4 h-4" />
                        <div className="flex flex-col gap-1">
                          <span className="text-[12px] font-bold text-emerald-800 dark:text-emerald-400">각 듀티(D/E/N)별 시니어(경력자/수간호사) 필수 배치 켜기</span>
                          <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-500">활성화 시, AI가 신규 간호사만으로 듀티가 채워지지 않도록 각 시간대에 숙련자를 프롬프트 규칙에 따라 1명 이상 강제 교차 배정합니다.</span>
                        </div>
                      </label>
                    </div>
                  </div>
                  <div className="p-4 border-t border-[var(--border)] dark:border-zinc-800 bg-[var(--card)] dark:bg-zinc-900 rounded-b-2xl flex md:flex-row flex-col gap-2">
                    <button onClick={() => setShowAiModal(false)} className="flex-1 px-4 py-3 rounded-xl bg-[var(--muted)] text-[var(--toss-gray-4)] text-[12px] font-bold">취소</button>
                    <button onClick={submitAiGenerate} className="flex-[2] px-4 py-3 rounded-xl bg-gradient-to-r from-violet-500 to-blue-500 text-white text-[12px] font-bold flex items-center justify-center gap-2 shadow-sm">
                      <span className="text-xl leading-none">✨</span> 위 조건으로 생성 시작
                    </button>
                  </div>
                </div>
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
                        if (!reason) return alert('사유를 입력해주세요.');
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

        {viewMode === 'monthly' && (
          <div className="bg-[var(--card)] dark:bg-zinc-900 border border-[var(--border)] dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead className="bg-[var(--tab-bg)] dark:bg-zinc-900/80 border-b border-[var(--border)] dark:border-zinc-800 text-[11px] font-bold text-[var(--toss-gray-4)] uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-4 sticky left-0 bg-[var(--tab-bg)] dark:bg-zinc-900/90 z-10 border-r border-[var(--border)] dark:border-zinc-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">직원명</th>
                    {daysArray.map((d) => {
                      const dStr = `${selectedMonth}-${String(d).padStart(2, '0')}`;
                      const dayOfWeek = new Date(dStr).getDay();
                      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                      return (
                        <th
                          key={d}
                          className={`px-2 py-4 text-center border-r border-[var(--border)] dark:border-zinc-800 min-w-[44px] ${isWeekend ? 'text-red-400 dark:text-red-500' : ''}`}
                        >
                          <div className="flex flex-col items-center">
                            <span>{d}</span>
                            <span className="text-[9px] font-medium opacity-60 mt-0.5">{['일', '월', '화', '수', '목', '금', '토'][dayOfWeek]}</span>
                          </div>
                        </th>
                      );
                    })}
                    <th className="px-4 py-4 text-center text-blue-600 dark:text-blue-400 bg-blue-500/10/50 dark:bg-blue-900/10">출근</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {filtered.map((s: StaffMember) => {
                    let workDays = 0;
                    return (
                      <tr key={s.id} className="hover:bg-[var(--tab-bg)]/50 dark:hover:bg-zinc-800/30 transition-colors group">
                        <td className="px-4 py-3 sticky left-0 bg-[var(--card)] dark:bg-zinc-900 group-hover:bg-[var(--tab-bg)] dark:group-hover:bg-zinc-800/80 z-10 border-r border-[var(--border)] dark:border-zinc-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] transition-colors">
                          <div className="flex flex-col">
                            <span className="font-bold text-sm text-foreground whitespace-nowrap">{s.name}</span>
                            <span className="text-[10px] text-[var(--toss-gray-4)] font-medium">{s.department}</span>
                          </div>
                        </td>
                        {daysArray.map((d) => {
                          const dStr = `${selectedMonth}-${String(d).padStart(2, '0')}`;
                          const att = attendanceMap.get(buildAttendanceKey(s.id, dStr));
                          const dayOfWeek = new Date(dStr).getDay();
                          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                          const status = resolveAttendanceStatus(att, isWeekend);

                          let label = '';
                          let cellClass = 'text-[var(--toss-gray-3)] dark:text-[var(--toss-gray-4)]';

                          if (status === 'annual_leave' || status === 'sick_leave') {
                            label = status === 'annual_leave' ? '연' : '병';
                            cellClass = 'text-blue-600 bg-blue-500/10 dark:bg-blue-900/20';
                          } else if (status === 'holiday' || isWeekend) {
                            label = '휴';
                            cellClass = 'text-red-400 bg-red-500/10/50 dark:bg-red-900/10';
                          } else if (isWorkedAttendanceStatus(status)) {
                            label = '출';
                            cellClass = 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20';
                            workDays++;
                          } else if (status === 'late' || status === 'early_leave') {
                            label = status === 'late' ? '지' : '조';
                            cellClass = 'text-orange-600 bg-orange-500/10 dark:bg-orange-900/20';
                            workDays++;
                          } else if (status === 'absent') {
                            label = '결';
                            cellClass = 'text-rose-600 bg-rose-50 dark:bg-rose-900/20';
                          } else {
                            label = '-';
                          }

                          return (
                            <td
                              key={d}
                              className="p-1 border-r border-[var(--border)] dark:border-zinc-800 text-center align-middle"
                            >
                              <div className={`w-8 h-8 mx-auto flex items-center justify-center rounded-lg text-[11px] font-bold ${cellClass}`}>
                                {label}
                              </div>
                            </td>
                          );
                        })}
                        <td className="px-4 py-3 text-center bg-blue-500/10/30 dark:bg-blue-900/10 font-bold text-blue-600 dark:text-blue-400 text-sm">
                          {workDays}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
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

        {/* 출퇴근 상태 일괄 수정 모달 */}
        {bulkEditOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-[var(--card)] dark:bg-zinc-900 border border-[var(--border)] dark:border-zinc-800 rounded-2xl shadow-sm max-w-md w-full p-4 space-y-4 transform transition-all">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
                  <span className="text-2xl">⚡</span> 상태 일괄 수정
                </h3>
                <button onClick={() => setBulkEditOpen(false)} className="text-[var(--toss-gray-3)] hover:text-[var(--toss-gray-4)] dark:hover:text-zinc-200 transition-colors">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="space-y-5">
                <div>
                  <p className="text-[11px] font-bold text-[var(--toss-gray-4)] uppercase flex items-center gap-1.5 mb-2"><span className="text-sm">🗓️</span> 적용 기간</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'day', label: '하루 단위' },
                      { id: 'week', label: '주 단위 (7일)' },
                      { id: 'month', label: '월 단위' },
                      { id: 'custom', label: '직접 선택' }
                    ].map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => setBulkRangeType(o.id as any)}
                        className={`px-3 py-2.5 rounded-xl text-xs font-bold transition-all border ${bulkRangeType === o.id ? 'bg-blue-500/10 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-500/20 dark:border-blue-800 ring-1 ring-blue-500' : 'bg-transparent text-[var(--toss-gray-4)] dark:text-[var(--toss-gray-3)] border-[var(--border)] dark:border-zinc-700 hover:bg-[var(--tab-bg)] dark:hover:bg-zinc-800'
                          }`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="flex-1">
                    <p className="text-[11px] font-bold text-[var(--toss-gray-4)] uppercase mb-1.5 ml-1">시작일</p>
                    <SmartDatePicker
                      value={bulkStartDate}
                      onChange={(val) => {
                        setBulkStartDate(val);
                        if (bulkRangeType === 'week') {
                          const d = new Date(val);
                          d.setDate(d.getDate() + 6);
                          setBulkEndDate(d.toISOString().slice(0, 10));
                        }
                      }}
                      className="w-full bg-[var(--tab-bg)] dark:bg-zinc-800/50 border border-[var(--border)] dark:border-zinc-700 px-4 py-3 rounded-xl text-sm font-bold text-foreground outline-none transition-shadow"
                    />
                  </div>
                  {(bulkRangeType === 'custom' || bulkRangeType === 'week') && (
                    <div className="flex-1">
                      <p className="text-[11px] font-bold text-[var(--toss-gray-4)] uppercase mb-1.5 ml-1">종료일</p>
                      <SmartDatePicker
                        value={bulkEndDate}
                        onChange={(val) => setBulkEndDate(val)}
                        className="w-full bg-[var(--tab-bg)] dark:bg-zinc-800/50 border border-[var(--border)] dark:border-zinc-700 px-4 py-3 rounded-xl text-sm font-bold text-foreground outline-none transition-shadow"
                      />
                    </div>
                  )}
                </div>

                <div className="pt-2">
                  <p className="text-[11px] font-bold text-[var(--toss-gray-4)] uppercase flex items-center gap-1.5 mb-2"><span className="text-sm">📌</span> 변경할 상태</p>
                  <select
                    value={bulkStatus}
                    onChange={(e) => setBulkStatus(e.target.value)}
                    className="w-full bg-[var(--tab-bg)] dark:bg-zinc-800/50 border border-[var(--border)] dark:border-zinc-700 rounded-xl px-4 py-3 text-sm font-bold text-foreground outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none cursor-pointer transition-shadow"
                  >
                    <option value="absent">🔴 결근</option>
                    <option value="half_leave">🔵 반차</option>
                    <option value="annual_leave">🟣 연차</option>
                    <option value="sick_leave">🩺 병가</option>
                    <option value="holiday">⚪ 휴일</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-[var(--border-subtle)] dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setBulkEditOpen(false)}
                  className="px-4 py-3 rounded-xl text-sm font-bold border border-[var(--border)] dark:border-zinc-700 text-[var(--toss-gray-4)] hover:bg-[var(--tab-bg)] dark:hover:bg-zinc-800 focus:outline-none transition-colors"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    let start = bulkStartDate;
                    let end = bulkStartDate;
                    if (bulkRangeType === 'week') {
                      const d = new Date(bulkStartDate);
                      d.setDate(d.getDate() + 6);
                      end = d.toISOString().slice(0, 10);
                    } else if (bulkRangeType === 'month') {
                      const [y, m] = bulkStartDate.split('-').map(Number);
                      end = `${y}-${String(m).padStart(2, '0')}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
                      start = `${y}-${String(m).padStart(2, '0')}-01`;
                    } else if (bulkRangeType === 'custom') {
                      start = bulkStartDate <= bulkEndDate ? bulkStartDate : bulkEndDate;
                      end = bulkStartDate <= bulkEndDate ? bulkEndDate : bulkStartDate;
                    }
                    setBulkSaving(true);
                    try {
                      const staffIds = filtered.map((s: StaffMember) => s.id);
                      const dates: string[] = [];
                      const cur = new Date(start);
                      const endD = new Date(end);
                      while (cur <= endD) {
                        dates.push(cur.toISOString().slice(0, 10));
                        cur.setDate(cur.getDate() + 1);
                      }
                      if (['present', 'late', 'early_leave'].includes(bulkStatus)) {
                        toast('정상 출근/지각/조퇴는 실제 출퇴근 기록 또는 개별 정정으로만 처리해주세요.', 'warning');
                        return;
                      }
                      const rows = staffIds.flatMap((staffId: string) =>
                        dates.map((work_date) => ({
                          staff_id: staffId,
                          work_date,
                          status: bulkStatus,
                        }))
                      );
                      for (const row of rows) {
                        await supabase.from('attendances').upsert(row, { onConflict: 'staff_id,work_date' });
                      }
                      toast(`적용 완료: ${dates.length}일 × ${staffIds.length}명 = ${rows.length}건을 "${bulkStatus === 'present' ? '정상' : bulkStatus}"으로 수정했습니다.`, 'success');
                      setBulkEditOpen(false);
                      fetchAttendance();
                    } catch (e) {
                      console.error(e);
                      toast('일괄 수정 중 오류가 발생했습니다.', 'error');
                    } finally {
                      setBulkSaving(false);
                    }
                  }}
                  disabled={bulkSaving}
                  className="px-4 py-3 rounded-xl text-sm font-bold bg-blue-600 text-white shadow-md shadow-blue-500/20 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 transition-all flex items-center justify-center min-w-[120px]"
                >
                  {bulkSaving ? (
                    <span className="flex items-center gap-2"><svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> 처리 중...</span>
                  ) : '적용하기'}
                </button>
              </div>
            </div>
          </div>
        )}

        {viewMode === 'calendar' && (
          <div className="bg-[var(--card)] dark:bg-zinc-900 border border-[var(--border)] dark:border-zinc-800 rounded-2xl p-4 shadow-sm">
            <div className="overflow-x-auto custom-scrollbar -mx-1 px-1">
            <div className="grid min-w-[560px] grid-cols-7 gap-2 md:gap-4">
              {['일', '월', '화', '수', '목', '금', '토'].map((day, idx) => (
                <div key={day} className={`text-center text-[12px] font-bold uppercase pb-3 mb-2 border-b border-[var(--border-subtle)] dark:border-zinc-800 ${idx === 0 ? 'text-rose-500' : idx === 6 ? 'text-blue-500' : 'text-[var(--toss-gray-4)]'}`}>{day}</div>
              ))}
              {calendarCells.map((cell) => {
                const summary = cell.dateStr ? calendarAttendanceSummary.get(cell.dateStr) : null;
                const isSelected = cell.dateStr === selectedDate;
                const workedCount = summary?.worked || 0;
                const issueCount = (summary?.absentOrLeave || 0) + (summary?.lateOrEarly || 0);

                return (
                  <button
                    key={cell.key}
                    type="button"
                    onClick={() => {
                      if (!cell.dateStr) return;
                      setSelectedDate(cell.dateStr);
                      setViewMode('daily');
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
        )}
      </main>
    </div>
  );
}
