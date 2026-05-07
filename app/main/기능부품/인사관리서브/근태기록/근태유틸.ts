// 근태관리 순수 유틸 함수 및 상수 모음

export function isWardDept(dept: string) {
  return /병동|ward|icu|중환자|응급|간호|nicu|picu/i.test(dept);
}

export const ROSTER_CREATOR_POSITIONS = ['간호과장', '간호부장', '실장'];
export const ROSTER_APPROVER_POSITIONS = ['총무부장', '이사'];
export const ROSTER_APPROVER_COMPANIES = ['SY INC.'];
export const OFF_SHIFT_TOKEN = '__OFF__';
export const LEGACY_ROSTER_APPROVAL_TYPE = 'roster_schedule_approval';
export const LEGACY_APPROVAL_PENDING_STATUS = '\uB300\uAE30';
export const LEGACY_APPROVAL_APPROVED_STATUS = '\uC2B9\uC778';
export const LEGACY_APPROVAL_REJECTED_STATUS = '\uBC18\uB824';

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
  missing: { label: '기록 없음', color: 'text-[var(--toss-gray-4)] dark:text-[var(--toss-gray-3)]', bg: 'bg-[var(--page-bg)] dark:bg-zinc-800/80', ring: 'ring-zinc-200 dark:ring-zinc-700', dot: 'bg-zinc-400' },
} as const;

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

export function getCompactShiftLabel(
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
) {
  const shiftName = String(shift?.name || '').trim();
  if (shiftName) {
    return shiftName.replace(/\s*\([^)]*\)\s*$/, '').trim();
  }

  const band = resolveRosterShiftBand(shift);
  if (band === 'off') return '휴무';
  return '-';
}

export function buildWeekDates(anchorDate: string) {
  const baseDate = anchorDate ? new Date(anchorDate) : new Date();
  const start = new Date(baseDate);
  start.setDate(baseDate.getDate() - baseDate.getDay());

  return Array.from({ length: 7 }, (_, index) => {
    const current = new Date(start);
    current.setDate(start.getDate() + index);
    return current.toISOString().slice(0, 10);
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
