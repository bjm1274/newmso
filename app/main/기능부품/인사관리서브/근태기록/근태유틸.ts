// 근태관리 순수 유틸 함수 및 상수 모음
import { formatKoreanDateKey } from '@/lib/seoul-time';
import { leaveTypeToAttendanceStatus } from '@/lib/leave-type';
// ⚠️ 주의: 같은 폴더의 근태관리메인-내부유틸.ts에 동명 심볼이 있으나 값/의미가 다르다.
//  - 이 파일의 LEGACY_ROSTER_APPROVAL_TYPE = 'roster_schedule_approval'
//  - 내부유틸의 LEGACY_ROSTER_APPROVAL_TYPE = '근무표'
//  두 파일은 서로 다른 approvals.type 을 조회하므로 통합/혼용 금지(동작 보존).
//  ATTENDANCE_STATUS_META / getAttendanceStatusMeta 는 @/lib/attendance-status-meta 재export.
//  이 모듈은 근태일괄수정모달.tsx 전용. 근태관리메인.tsx는 내부유틸을 쓴다.

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

/**
 * 버그 B 수정: leave_requests 승인 데이터를 반영하여 근태 상태를 최종 결정한다.
 *
 * 우선순위:
 * 1. attendances 기록이 있으면 해당 상태를 우선한다 (실제 출퇴근이 진실에 가깝다).
 * 2. 기록이 없거나 빈 문자열일 때 leave_requests에 승인된 연차/휴가가 있으면 해당
 *    상태(annual_leave / half_leave / sick_leave)로 대체한다.
 * 3. 그래도 없으면 기존 resolveAttendanceStatus 결과를 그대로 반환한다.
 *
 * @param attendance - attendances 테이블 행 (undefined 허용)
 * @param leaveStatus - 해당 직원·날짜에 대해 사전 집계한 leave 상태 문자열 (없으면 null)
 * @param isWeekend - 주말 여부
 */
export function resolveAttendanceStatusWithLeave(
  attendance: any,
  leaveStatus: string | null | undefined,
  isWeekend = false,
): string {
  const attStatus = resolveAttendanceStatus(attendance, isWeekend);

  // 실제 출퇴근 기록이 있으면 그것이 우선
  if (attStatus === 'present' || attStatus === 'late' || attStatus === 'early_leave') {
    return attStatus;
  }

  // 기록 없음 또는 빈 상태일 때만 leave 상태로 보완
  if (!attStatus && leaveStatus) {
    return leaveStatus;
  }

  // absent 상태인데 승인된 연차가 있으면 연차로 대체
  if (attStatus === 'absent' && leaveStatus) {
    return leaveStatus;
  }

  return attStatus;
}

/**
 * leave_requests 배열에서 특정 직원·날짜에 해당하는 승인된 휴가 상태를 반환한다.
 * - '연차' → 'annual_leave'
 * - '반차' → 'half_leave'
 * - '병가' → 'sick_leave'
 * - 그 외 승인 휴가 → 'annual_leave' (일반 휴가로 처리)
 *
 * @param staffId - 직원 ID
 * @param dateStr - 'YYYY-MM-DD' 형식 날짜
 * @param approvedLeaves - leave_requests 배열 (status='승인')
 */
export function resolveLeaveStatusForDate(
  staffId: string,
  dateStr: string,
  approvedLeaves: Array<{
    staff_id: string;
    start_date: string;
    end_date: string;
    leave_type: string;
    status: string;
  }>,
): string | null {
  const match = approvedLeaves.find((row) => {
    if (row.staff_id !== staffId) return false;
    const approved = String(row.status || '').trim();
    if (approved !== '승인' && approved !== 'approved') return false;
    const start = String(row.start_date || '').slice(0, 10);
    const end = String(row.end_date || row.start_date || '').slice(0, 10);
    return dateStr >= start && dateStr <= end;
  });

  if (!match) return null;

  return leaveTypeToAttendanceStatus(match.leave_type);
}

export function isWorkedAttendanceStatus(status: string) {
  return status === 'present' || status === 'late' || status === 'early_leave';
}

/**
 * 상태 일괄 수정 대상 판별 — 정상 출근(present)·휴일·승인 휴가가 아닌,
 * 관리자가 점검·보정해야 할 상태(결근·지각·조퇴·기록 없음)인지 여부.
 */
export function isProblemAttendanceStatus(status: string | null | undefined): boolean {
  const normalized = String(status || '').trim();
  return !['present', 'holiday', 'annual_leave', 'half_leave', 'sick_leave'].includes(normalized);
}

// 상태 표시 메타 — lib SSOT (off 키 포함). LEGACY_ROSTER_APPROVAL_TYPE 은 이 파일 전용 값 유지.
export {
  ATTENDANCE_STATUS_META,
  getAttendanceStatusMeta,
} from '@/lib/attendance-status-meta';

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
