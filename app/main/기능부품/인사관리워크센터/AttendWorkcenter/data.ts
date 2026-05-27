/**
 * AttendWorkcenter — 데이터 헬퍼 / 타입 / KPI 집계
 *
 * 단일 책임: 근태·근무표 도메인 로직만. UI 없음.
 *
 * JM4: any 금지. Supabase row는 Record<string, unknown>으로 받고 명시 캐스팅.
 */

import type { StaffMember } from '@/types';
import type { WorkcenterKpi } from '../workcenter-common';
import { isActive } from '../MemberWorkcenter/data';

// ─── 근태 상태 ─────────────────────────────────────────────────
export type AttendanceStatus =
  | 'present'
  | 'late'
  | 'early_leave'
  | 'absent'
  | 'annual_leave'
  | 'sick_leave'
  | 'half_leave'
  | 'holiday'
  | 'missing';

export interface AttendanceRow {
  staff_id: string;
  work_date: string;
  status?: string | null;
  check_in_time?: string | null;
  check_out_time?: string | null;
}

/** 출근/퇴근 시간을 보강해 상태를 정규화 */
export function resolveAttendanceStatus(
  attendance: AttendanceRow,
  isWeekend = false,
): AttendanceStatus {
  const raw = String(attendance?.status ?? '').trim();
  if (raw === 'present' || raw === 'late' || raw === 'early_leave') {
    if (attendance?.check_in_time || attendance?.check_out_time) return raw as AttendanceStatus;
    return 'missing';
  }
  if (raw) {
    if (
      raw === 'absent' ||
      raw === 'annual_leave' ||
      raw === 'sick_leave' ||
      raw === 'half_leave' ||
      raw === 'holiday' ||
      raw === 'missing'
    ) {
      return raw;
    }
    return 'missing';
  }
  if (attendance?.check_in_time || attendance?.check_out_time) return 'present';
  return isWeekend ? 'holiday' : 'missing';
}

export function isWeekendDate(dateStr: string): boolean {
  const dayOfWeek = new Date(dateStr).getDay();
  return dayOfWeek === 0 || dayOfWeek === 6;
}

// ─── 오늘자 KPI 집계 ────────────────────────────────────────────
export interface AttendKpiInput {
  staffs: StaffMember[];
  rows: AttendanceRow[];
  today: string;
}

export interface AttendDailyCounts {
  present: number;
  late: number;
  absent: number;
  onLeave: number; // 연차·반차·병가 합산
  /** 지각자 상위 (이름 sub 표기용, KPI 부문구) — staff_id + check_in_time */
  lateDetails: Array<{ staffId: string; checkInTime: string | null }>;
}

export function aggregateDailyCounts({ staffs, rows, today }: AttendKpiInput): AttendDailyCounts {
  const active = staffs.filter(isActive);
  const todayRows = rows.filter((row) => String(row.work_date ?? '').startsWith(today));
  const weekend = isWeekendDate(today);

  let present = 0;
  let late = 0;
  let absent = 0;
  let onLeave = 0;
  const lateDetails: Array<{ staffId: string; checkInTime: string | null }> = [];

  const accountedIds = new Set<string>();
  for (const row of todayRows) {
    const status = resolveAttendanceStatus(row, weekend);
    accountedIds.add(String(row.staff_id));
    if (status === 'present' || status === 'early_leave') present += 1;
    else if (status === 'late') {
      present += 1;
      late += 1;
      lateDetails.push({ staffId: String(row.staff_id), checkInTime: row.check_in_time ?? null });
    } else if (status === 'absent') absent += 1;
    else if (status === 'annual_leave' || status === 'sick_leave' || status === 'half_leave') {
      onLeave += 1;
    }
  }

  // 출근 기록이 없는 재직자 중 평일이면 미신고 = absent로 간주
  if (!weekend) {
    for (const staff of active) {
      if (!accountedIds.has(String(staff.id))) {
        absent += 1;
      }
    }
  }

  return { present, late, absent, onLeave, lateDetails };
}

/** check_in_time(예: '2026-05-26T09:18:42+09:00' 또는 'HH:MM:SS')에서 'HH:MM'만 추출 */
function formatLateTime(value: string | null): string {
  if (!value) return '';
  const isoMatch = /T(\d{2}:\d{2})/.exec(value);
  if (isoMatch) return isoMatch[1];
  const hmsMatch = /^(\d{2}:\d{2})/.exec(value);
  return hmsMatch ? hmsMatch[1] : '';
}

/** check_in/out 시각 → 시간(0~23). 파싱 실패 시 null. */
function pickHour(value: string | null | undefined): number | null {
  if (!value) return null;
  const isoMatch = /T(\d{2}):/.exec(value);
  if (isoMatch) {
    const h = parseInt(isoMatch[1], 10);
    return Number.isFinite(h) ? h : null;
  }
  const hmsMatch = /^(\d{2}):/.exec(value);
  if (hmsMatch) {
    const h = parseInt(hmsMatch[1], 10);
    return Number.isFinite(h) ? h : null;
  }
  return null;
}

/** 07~20시 범위 시간대별 입·퇴근 인원 집계 — reference §868~899 시간대 차트용 */
export interface HourlyInOutSlot {
  /** "07" ~ "20" */
  hour: string;
  /** 입실(check_in) 인원 */
  in: number;
  /** 퇴실(check_out) 인원 */
  out: number;
}

export function aggregateHourlyInOut({ rows, today }: Pick<AttendKpiInput, 'rows' | 'today'>): HourlyInOutSlot[] {
  const todayRows = rows.filter((row) => String(row.work_date ?? '').startsWith(today));
  const slots: HourlyInOutSlot[] = [];
  for (let h = 7; h <= 20; h += 1) {
    slots.push({ hour: String(h).padStart(2, '0'), in: 0, out: 0 });
  }
  const idxOf = (h: number) => (h < 7 || h > 20 ? -1 : h - 7);
  for (const row of todayRows) {
    const hIn = pickHour(row.check_in_time);
    if (hIn !== null) {
      const idx = idxOf(hIn);
      if (idx >= 0) slots[idx].in += 1;
    }
    const hOut = pickHour(row.check_out_time);
    if (hOut !== null) {
      const idx = idxOf(hOut);
      if (idx >= 0) slots[idx].out += 1;
    }
  }
  return slots;
}

export function computeAttendKpis(input: AttendKpiInput): WorkcenterKpi[] {
  const total = input.staffs.filter(isActive).length;
  const counts = aggregateDailyCounts(input);
  const ratio = total > 0 ? Math.round((counts.present / total) * 100) : 0;

  // 지각자 상위 2~3명 이름·시간 부문구 (reference §859-861 명세)
  const staffNameMap = new Map<string, string>();
  for (const staff of input.staffs) {
    if (staff.id) staffNameMap.set(String(staff.id), staff.name || '');
  }
  const lateNamesSub = counts.lateDetails.length === 0
    ? '오늘 기준'
    : counts.lateDetails
        .slice(0, 3)
        .map(({ staffId, checkInTime }) => {
          const name = staffNameMap.get(staffId) || '직원';
          const time = formatLateTime(checkInTime);
          return time ? `${name} ${time}` : name;
        })
        .join(' · ') + (counts.lateDetails.length > 3 ? ` 외 ${counts.lateDetails.length - 3}명` : '');

  return [
    {
      key: 'present',
      label: '정상 출근',
      value: String(counts.present),
      unit: '명',
      sub: total > 0 ? `전체 ${total}명 중 ${ratio}%` : '데이터 없음',
      tone: 'success',
    },
    {
      key: 'late',
      label: '지각',
      value: String(counts.late),
      unit: '명',
      sub: lateNamesSub,
      tone: counts.late > 0 ? 'warn' : 'neutral',
    },
    {
      key: 'absent',
      label: '결근',
      value: String(counts.absent),
      unit: '명',
      sub: counts.absent > 0 ? '미신고 확인 필요' : '결근 없음',
      tone: counts.absent > 0 ? 'danger' : 'neutral',
    },
    {
      key: 'onLeave',
      label: '휴가 중',
      value: String(counts.onLeave),
      unit: '명',
      sub: '연차·반차·병가 합산',
    },
  ];
}

// ─── 근무표 (Roster) ────────────────────────────────────────────
export type ShiftBand = 'day' | 'evening' | 'night' | 'off';

export interface WorkShiftRow {
  id: string;
  name?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  shift_type?: string | null;
  description?: string | null;
}

export interface ShiftAssignmentRow {
  staff_id: string;
  work_date: string;
  shift_id: string | null;
}

function normalizeText(...values: Array<string | null | undefined>): string {
  return values
    .map((v) => String(v ?? '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ');
}

/** WorkShift → 밴드 (D/E/N/OFF) 로 분류 */
export function resolveShiftBand(shift: WorkShiftRow | null | undefined): ShiftBand {
  if (!shift) return 'off';
  const raw = normalizeText(shift.name, shift.shift_type, shift.description);
  const compact = raw.replace(/\s+/g, '');
  const startHour = Number(String(shift.start_time ?? '').slice(0, 2) || '0');
  const endHour = Number(String(shift.end_time ?? '').slice(0, 2) || '0');
  const overnight = startHour > endHour && Number.isFinite(startHour) && Number.isFinite(endHour);

  if (raw.includes('off') || raw.includes('휴무') || raw.includes('비번') || raw.includes('오프') || compact.startsWith('o/')) {
    return 'off';
  }
  if (raw.includes('night') || raw.includes('야간') || raw.includes('나이트') || startHour >= 20 || overnight) {
    return 'night';
  }
  if (raw.includes('evening') || raw.includes('이브닝') || raw.includes('오후') || (startHour >= 12 && startHour < 20)) {
    return 'evening';
  }
  return 'day';
}

// ─── 부서별 출근 현황 집계 ─────────────────────────────────────
export interface DeptAttendBreakdown {
  dept: string;
  ok: number;
  late: number;
  absent: number;
  onLeave: number;
  total: number;
}

export function aggregateDeptBreakdown({ staffs, rows, today }: AttendKpiInput): DeptAttendBreakdown[] {
  const active = staffs.filter(isActive);
  const todayRows = rows.filter((row) => String(row.work_date ?? '').startsWith(today));
  const rowByStaff = new Map(todayRows.map((row) => [String(row.staff_id), row] as const));
  const weekend = isWeekendDate(today);

  const map = new Map<string, DeptAttendBreakdown>();
  for (const staff of active) {
    const dept = (staff.department ?? '').trim() || '미지정';
    if (!map.has(dept)) {
      map.set(dept, { dept, ok: 0, late: 0, absent: 0, onLeave: 0, total: 0 });
    }
    const entry = map.get(dept)!;
    entry.total += 1;

    const row = rowByStaff.get(String(staff.id));
    if (!row) {
      if (!weekend) entry.absent += 1;
      continue;
    }
    const status = resolveAttendanceStatus(row, weekend);
    if (status === 'present' || status === 'early_leave') entry.ok += 1;
    else if (status === 'late') {
      entry.ok += 1;
      entry.late += 1;
    } else if (status === 'absent') entry.absent += 1;
    else if (status === 'annual_leave' || status === 'sick_leave' || status === 'half_leave') {
      entry.onLeave += 1;
    }
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

// ─── 14일 그리드 날짜 빌더 ──────────────────────────────────────
export interface RosterDate {
  iso: string;
  day: number;
  monthLabel: string;
  weekdayLabel: string;
  weekendLike: boolean;
  isToday: boolean;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function buildRosterDates(start: Date, count: number): RosterDate[] {
  const result: RosterDate[] = [];
  const todayIso = formatIsoDate(new Date());
  for (let i = 0; i < count; i += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const iso = formatIsoDate(date);
    const dow = date.getDay();
    result.push({
      iso,
      day: date.getDate(),
      monthLabel: `${date.getMonth() + 1}/${date.getDate()}`,
      weekdayLabel: WEEKDAYS[dow] ?? '',
      weekendLike: dow === 0 || dow === 6,
      isToday: iso === todayIso,
    });
  }
  return result;
}

export function formatIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getTodayIso(): string {
  return formatIsoDate(new Date());
}
