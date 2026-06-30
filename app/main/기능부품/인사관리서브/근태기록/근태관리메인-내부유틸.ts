// 근태관리메인.tsx 전용 내부 유틸/상수.
// 주의: 같은 폴더의 근태유틸.ts와 일부 동명 함수가 있으나 의미가 다르다.
//  - LEGACY_ROSTER_APPROVAL_TYPE: 이 파일은 '근무표'(레거시 approvals.type) 사용
//  - mapLegacyApprovalRequest: meta_data가 문자열(JSON)일 때도 파싱
//  - resolveLeaveStatusForDate / resolveAttendanceStatusWithLeave: 호출부 동작 보존을 위해
//    근태관리메인.tsx에 있던 원본 구현을 그대로 옮긴 것
// 따라서 근태유틸.ts로 통합하지 않고 별도 모듈로 분리한다(동작 보존 최우선).

import { formatKoreanDateKey } from '@/lib/seoul-time';

export const ROSTER_CREATOR_POSITIONS = ['간호과장', '간호부장', '실장'];
export const ROSTER_APPROVER_POSITIONS = ['총무부장', '이사'];
export const ROSTER_APPROVER_COMPANIES = ['SY INC.'];
export const LEGACY_ROSTER_APPROVAL_TYPE = '근무표';
export const LEGACY_APPROVAL_PENDING_STATUS = '대기';
export const LEGACY_APPROVAL_APPROVED_STATUS = '승인';
export const LEGACY_APPROVAL_REJECTED_STATUS = '반려';

export type AttendanceMainView = 'calendar' | 'dashboard' | 'schedule' | 'leave' | 'issues';

export type ApprovedLeaveRow = {
  staff_id: string;
  start_date: string;
  end_date: string;
  leave_type: string;
  status: string;
};

export function padDay(day: number) {
  return String(day).padStart(2, '0');
}

export function buildAttendanceKey(staffId: string, workDate: string) {
  return `${staffId}_${workDate}`;
}

export function isMissingRosterWorkflowTableError(error: unknown, tableName: string) {
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

export function mapLegacyApprovalRequest(row: any) {
  let metaData = row?.meta_data;
  if (typeof metaData === 'string') {
    try {
      metaData = JSON.parse(metaData);
    } catch {
      metaData = {};
    }
  }
  if (!metaData || typeof metaData !== 'object' || Array.isArray(metaData)) {
    metaData = {};
  }
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
    _source: 'approvals' };
}

export function isLegacyApprovalRequest(request: any) {
  return String(request?._source || '').trim() === 'approvals';
}

export function resolveAttendanceStatus(attendance: any, isWeekend = false) {
  const rawStatus = String(attendance?.status || '').trim();
  if (rawStatus === 'present' || rawStatus === 'late' || rawStatus === 'early_leave') {
    if (attendance?.check_in_time || attendance?.check_out_time) return rawStatus;
    return '';
  }
  if (rawStatus) return rawStatus;
  if (attendance?.check_in_time || attendance?.check_out_time) return 'present';
  return isWeekend ? 'holiday' : '';
}

/** 버그 B 수정: 특정 직원·날짜에 승인된 연차/휴가가 있으면 대응 status 문자열을 반환 */
export function resolveLeaveStatusForDate(
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
export function resolveAttendanceStatusWithLeave(
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

export function isWorkedAttendanceStatus(status: string) {
  return status === 'present' || status === 'late' || status === 'early_leave';
}

export const ATTENDANCE_STATUS_META = {
  present: { label: '정상 출근', color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30', ring: 'ring-emerald-200 dark:ring-emerald-800/50', dot: 'bg-emerald-500' },
  late: { label: '지각', color: 'text-orange-700 dark:text-orange-400', bg: 'bg-orange-500/10 dark:bg-orange-900/30', ring: 'ring-orange-200 dark:ring-orange-800/50', dot: 'bg-orange-500' },
  early_leave: { label: '조퇴', color: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30', ring: 'ring-amber-200 dark:ring-amber-800/50', dot: 'bg-amber-500' },
  absent: { label: '결근', color: 'text-rose-700 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-900/30', ring: 'ring-rose-200 dark:ring-rose-800/50', dot: 'bg-rose-500' },
  annual_leave: { label: '연차', color: 'text-blue-700 dark:text-blue-400', bg: 'bg-blue-500/10 dark:bg-blue-900/30', ring: 'ring-blue-200 dark:ring-blue-800/50', dot: 'bg-blue-500' },
  sick_leave: { label: '병가', color: 'text-purple-700 dark:text-purple-400', bg: 'bg-purple-500/10 dark:bg-purple-900/30', ring: 'ring-purple-200 dark:ring-purple-800/50', dot: 'bg-purple-500' },
  half_leave: { label: '반차', color: 'text-cyan-700 dark:text-cyan-400', bg: 'bg-cyan-50 dark:bg-cyan-900/30', ring: 'ring-cyan-200 dark:ring-cyan-800/50', dot: 'bg-cyan-500' },
  holiday: { label: '휴일', color: 'text-[var(--toss-gray-4)] dark:text-[var(--toss-gray-3)]', bg: 'bg-[var(--tab-bg)] dark:bg-zinc-800', ring: 'ring-zinc-200 dark:ring-zinc-700', dot: 'bg-zinc-400' },
  off: { label: 'OFF', color: 'text-slate-600 dark:text-slate-400', bg: 'bg-slate-100 dark:bg-slate-800/40', ring: 'ring-slate-300 dark:ring-slate-700', dot: 'bg-slate-500' },
  missing: { label: '기록 없음', color: 'text-[var(--toss-gray-4)] dark:text-[var(--toss-gray-3)]', bg: 'bg-[var(--page-bg)] dark:bg-zinc-800/80', ring: 'ring-zinc-200 dark:ring-zinc-700', dot: 'bg-zinc-400' } } as const;

export function getAttendanceStatusMeta(status: string) {
  return ATTENDANCE_STATUS_META[(status || 'missing') as keyof typeof ATTENDANCE_STATUS_META] || ATTENDANCE_STATUS_META.missing;
}

export function isWeekendDate(dateStr: string) {
  const dayOfWeek = new Date(dateStr).getDay();
  return dayOfWeek === 0 || dayOfWeek === 6;
}

export type ShiftBand = 'day' | 'evening' | 'night' | 'off';

export function normalizeShiftSearchText(...values: Array<unknown>) {
  return values
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ');
}

export function hasBandPrefix(rawText: string, compactText: string, prefix: 'd' | 'e' | 'n' | 'o') {
  if (compactText === prefix) return true;
  if (compactText.startsWith(`${prefix}/`) || compactText.startsWith(`${prefix}-`) || compactText.startsWith(`${prefix}_`)) {
    return true;
  }
  if (compactText.startsWith(`${prefix}병동`) || compactText.startsWith(`${prefix}ward`) || compactText.startsWith(`${prefix}shift`)) {
    return true;
  }
  return rawText.split(/[\s/_()[\]-]+/).some((token) => token === prefix);
}

export function resolveRosterShiftBand(
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

export function isWorkedShiftAssignment(
  shiftId: string | null | undefined,
  shiftLookup: Map<string, { id?: string | null; name?: string | null; start_time?: string | null; end_time?: string | null; shift_type?: string | null; description?: string | null }>
) {
  if (!shiftId) return false;
  return resolveRosterShiftBand(shiftLookup.get(String(shiftId)) || null) !== 'off';
}

/** 특정 직원·날짜의 스케줄이 OFF(휴무/비번)로 배정되어 있는지 확인 */
export function isOffShiftForDate(
  staffId: string,
  dateStr: string,
  shiftAssignments: Record<string, string | null | undefined>,
  shiftLookup: Map<string, { id?: string | null; name?: string | null; start_time?: string | null; end_time?: string | null; shift_type?: string | null; description?: string | null }>
): boolean {
  const key = `${staffId}_${dateStr}`;
  const shiftId = shiftAssignments[key];
  if (!shiftId) return false;
  return resolveRosterShiftBand(shiftLookup.get(String(shiftId)) || null) === 'off';
}

export function getShiftBandColorClass(band: ShiftBand, variant: 'tool' | 'cell') {
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

export function getShiftCellLabel(shift: { name?: string | null } | null | undefined) {
  return String(shift?.name || '').trim();
}

export function buildWeekDates(anchorDate: string) {
  const baseDate = anchorDate ? new Date(anchorDate) : new Date();
  const start = new Date(baseDate);
  start.setDate(baseDate.getDate() - baseDate.getDay());

  return Array.from({ length: 7 }, (_, index) => {
    const current = new Date(start);
    current.setDate(start.getDate() + index);
    // KST 기준 날짜 키 — RosterGrid(formatIsoDate, KST)와 정합 맞춤(UTC 하루 밀림 제거)
    return formatKoreanDateKey(current);
  });
}

export function formatAttendanceMinutes(minutes: unknown) {
  const resolvedMinutes = Number(minutes) || 0;
  if (!resolvedMinutes) return '-';
  return `${Math.floor(resolvedMinutes / 60)}h ${resolvedMinutes % 60}m`;
}

export function buildMonthCalendarCells(selectedMonth: string) {
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
      isWeekend: index === 0 });
  }

  for (let day = 1; day <= lastDay; day += 1) {
    const dateStr = `${selectedMonth}-${padDay(day)}`;
    const weekday = new Date(dateStr).getDay();
    cells.push({
      key: dateStr,
      dateStr,
      day,
      isCurrentMonth: true,
      isWeekend: weekday === 0 || weekday === 6 });
  }

  while (cells.length % 7 !== 0) {
    const index = cells.length;
    cells.push({
      key: `empty-trailing-${index}`,
      dateStr: null,
      day: null,
      isCurrentMonth: false,
      isWeekend: index % 7 === 0 });
  }

  return cells;
}

// 근무형태에 "교대근무 전용 스케줄 여부"(is_shift)가 체크된 경우에만
// 근무표 생성 도구상자에 노출한다.
// D1/SQLite에서 BOOLEAN은 INTEGER(0/1)로 반환되므로 Boolean() 변환 사용.
export function isShiftBasedShift(shift: Record<string, unknown>): boolean {
  return Boolean(shift?.is_shift);
}

export type StaffMember = {
  id: string;
  name: string;
  position: string;
  department: string;
  company: string;
  shift_type?: string;
  status?: string | null;
  [key: string]: unknown;
};
