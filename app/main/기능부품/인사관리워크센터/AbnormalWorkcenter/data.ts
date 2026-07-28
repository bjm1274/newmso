'use client';

/**
 * AbnormalWorkcenter — 데이터 fetch & 타입 (JM4, JM3)
 *
 * attendances 테이블을 4주 기간으로 조회해 6가지 자동 감지 패턴을 집계한다.
 * 패턴: 지각 / 조퇴 / 조기퇴근 / 미기록 / 연속 결근 / 패턴 이상 (반복 지각)
 *
 * - DB row는 unknown 입력으로 가정 후 안전하게 좁힘
 * - any 금지 (JM4)
 */

import { db } from '@/lib/db-client';
import type { StaffMember } from '@/types';
import { isActiveStaff } from '@/lib/active-staff';
import { formatKoreanDateKey } from '@/lib/seoul-time';
import {
  ABNORMAL_LOOKBACK_DAYS,
  buildLookbackDays,
  getAbnormalLookbackSince,
} from '@/lib/attendance-abnormal';

// ─── 타입 ─────────────────────────────────────────────────────────
export type AbnormalKind =
  | 'late'        // 지각 (5분 이상)
  | 'leaveEarly'  // 조퇴 (정시 미만)
  | 'earlyLeave'  // 조기 퇴근 (정해진 시간 전)
  | 'missing'     // 미기록 (출근/퇴근 누락)
  | 'absent'      // 연속 결근 (3일 이상)
  | 'pattern';    // 패턴 이상 (반복 지각)

export type Severity = '관찰' | '주의' | '경고';

export interface AbnormalPattern {
  kind: AbnormalKind;
  staffId: string;
  staffName: string;
  department: string;
  count: number;
  severity: Severity;
  description: string;
  suggestion: string;
}

export interface DetectionGroup {
  kind: AbnormalKind;
  label: string;
  description: string;
  tone: 'warn' | 'danger' | 'muted' | 'accent';
  count: number;
  items: AbnormalPattern[];
}

export interface AbnormalActionEntry {
  id: string;
  date: string;
  severity: Severity;
  text: string;
}

export interface AbnormalDataResult {
  groups: DetectionGroup[];
  todayDetected: number;
  unresolved: number;
  resolved: number;
  ruleActiveCount: number;
  actionLog: AbnormalActionEntry[];
}

// ─── 감지 규칙 정의 ───────────────────────────────────────────────
export interface AbnormalRule {
  kind: AbnormalKind;
  label: string;
  threshold: string;
  severity: Severity;
  active: boolean;
}

export const DEFAULT_RULES: AbnormalRule[] = [
  { kind: 'late',       label: '지각 임계',      threshold: '4주 5회 이상', severity: '주의', active: true },
  { kind: 'leaveEarly', label: '조퇴 임계',      threshold: '4주 3회 이상', severity: '주의', active: true },
  { kind: 'earlyLeave', label: '조기퇴근 임계',  threshold: '2주 4회 이상', severity: '주의', active: true },
  { kind: 'missing',    label: '미기록 임계',    threshold: '주 1회 이상',  severity: '관찰', active: true },
  { kind: 'absent',     label: '연속 결근',      threshold: '3일 이상',     severity: '경고', active: true },
  { kind: 'pattern',    label: '반복 지각 패턴', threshold: '4주 7회 이상', severity: '경고', active: true },
];

// ─── 헬퍼 ─────────────────────────────────────────────────────────
function pickNumber(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function pickString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

interface AttendanceRecord {
  staffId: string;
  workDate: string;
  status: string;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  hasCheckIn: boolean;
  hasCheckOut: boolean;
}

function normalizeRecord(row: Record<string, unknown>): AttendanceRecord | null {
  const staffId = pickString(row.staff_id);
  const workDate = pickString(row.work_date);
  if (!staffId || !workDate) return null;
  const status = pickString(row.status).toLowerCase();
  const lateMinutes = pickNumber(row.late_minutes);
  const earlyLeaveMinutes = pickNumber(row.early_leave_minutes);
  const checkIn = pickString(row.check_in_time);
  const checkOut = pickString(row.check_out_time);
  return {
    staffId,
    workDate,
    status,
    lateMinutes: lateMinutes > 0 ? lateMinutes : status.includes('late') || status.includes('지각') ? 5 : 0,
    earlyLeaveMinutes,
    hasCheckIn: checkIn.length > 0,
    hasCheckOut: checkOut.length > 0 };
}

function severityForCount(count: number, low: number, mid: number, high: number): Severity {
  if (count >= high) return '경고';
  if (count >= mid) return '주의';
  if (count >= low) return '관찰';
  return '관찰';
}

function suggestionFor(kind: AbnormalKind): string {
  switch (kind) {
    case 'late': return '개인 면담 권고';
    case 'leaveEarly': return '사유 확인';
    case 'earlyLeave': return '업무량 점검';
    case 'missing': return '기록 확인 요청';
    case 'absent': return 'HR 면담 + 증빙자료 요청';
    case 'pattern': return '근무 패턴 재검토';
    default: return '확인';
  }
}

function describePattern(kind: AbnormalKind, count: number, name: string): string {
  switch (kind) {
    case 'late':
      return `${name} — 최근 4주 지각 ${count}회 (5분 이상)`;
    case 'leaveEarly':
      return `${name} — 정시 이전 조퇴 ${count}회`;
    case 'earlyLeave':
      return `${name} — 정해진 시간보다 일찍 퇴근 ${count}회`;
    case 'missing':
      return `${name} — 출근 또는 퇴근 기록 누락 ${count}건`;
    case 'absent':
      return `${name} — 연속 ${count}일 결근 감지`;
    case 'pattern':
      return `${name} — 반복 지각 패턴 ${count}회 (월요일 집중 등)`;
    default:
      return name;
  }
}

// ─── 패턴 추출 ────────────────────────────────────────────────────
function detectConsecutiveAbsence(records: AttendanceRecord[], allDays: string[]): number {
  const presentDates = new Set(records.filter((r) => r.hasCheckIn || r.status.includes('present') || r.status.includes('정상')).map((r) => r.workDate));
  let maxRun = 0;
  let run = 0;
  for (const day of allDays) {
    if (presentDates.has(day)) {
      run = 0;
    } else {
      run += 1;
      if (run > maxRun) maxRun = run;
    }
  }
  return maxRun;
}

function detectRepeatedLatePattern(records: AttendanceRecord[]): number {
  // 같은 요일 반복 지각 빈도 — 단순화: 지각 일자의 요일 분포 max
  const byDow = new Map<number, number>();
  for (const r of records) {
    if (r.lateMinutes > 0) {
      const d = new Date(r.workDate);
      if (!Number.isNaN(d.getTime())) {
        const dow = d.getDay();
        byDow.set(dow, (byDow.get(dow) ?? 0) + 1);
      }
    }
  }
  let max = 0;
  for (const v of byDow.values()) {
    if (v > max) max = v;
  }
  return max;
}

// ─── lookback 일자 배열 (YYYY-MM-DD) — lib/attendance-abnormal SSOT (28일) ──
function build4WeekDays(now: Date): string[] {
  return buildLookbackDays(ABNORMAL_LOOKBACK_DAYS, now);
}

// ─── fetch ────────────────────────────────────────────────────────
export interface FetchAbnormalOptions {
  staffs: StaffMember[];
  selectedCo: string;
  signal?: AbortSignal;
  rules?: AbnormalRule[];
}

const KIND_LABELS: Record<AbnormalKind, { label: string; description: string; tone: 'warn' | 'danger' | 'muted' | 'accent' }> = {
  late:       { label: '지각',        description: '5분 이상 지각 누적',          tone: 'warn'   },
  leaveEarly: { label: '조퇴',        description: '정시 이전 퇴근',              tone: 'warn'   },
  earlyLeave: { label: '조기 퇴근',   description: '정해진 시간보다 일찍 퇴근',   tone: 'warn'   },
  missing:    { label: '미기록',      description: '출근/퇴근 기록 누락',         tone: 'muted'  },
  absent:     { label: '연속 결근',   description: '3일 이상 연속 결근',          tone: 'danger' },
  pattern:    { label: '패턴 이상',   description: '같은 요일 반복 지각 등',      tone: 'accent' } };

export async function fetchAbnormalData({
  staffs,
  selectedCo,
  signal,
  rules = DEFAULT_RULES }: FetchAbnormalOptions): Promise<AbnormalDataResult> {
  const targetStaff = staffs.filter((staff) => {
    if (!isActiveStaff(staff)) return false;
    if (selectedCo && selectedCo !== '전체' && staff.company !== selectedCo) return false;
    return true;
  });
  const staffIds = targetStaff.map((staff) => staff.id);

  if (staffIds.length === 0) {
    return emptyResult(rules);
  }

  const now = new Date();
  const allDays = build4WeekDays(now);
  const sinceIso = getAbnormalLookbackSince(ABNORMAL_LOOKBACK_DAYS, now);

  // `late_minutes` / `early_leave_minutes` 는 attendances 스키마에 **실재하지 않는다**
  // (0000_lovely_alice.sql 의 DDL 확인). 이 두 컬럼을 select 에 넣으면 "no such column" 으로
  // 쿼리가 통째로 실패하는데, 아래에서 error 를 받지 않아 결과가 항상 빈 배열이 되고
  // **근태이상 감지가 영구히 "이상 없음"** 으로 표시됐다. 존재하는 컬럼만 조회한다.
  const { data, error } = await db
    .from('attendances')
    .select('staff_id, work_date, status, check_in_time, check_out_time')
    .in('staff_id', staffIds)
    .gte('work_date', sinceIso);

  if (error) {
    console.error('[AbnormalWorkcenter] attendances 조회 실패', error);
    throw error;
  }

  if (signal?.aborted) {
    throw new DOMException('aborted', 'AbortError');
  }

  const raw = Array.isArray(data) ? data : [];
  const records: AttendanceRecord[] = [];
  for (const row of raw) {
    if (row && typeof row === 'object') {
      const rec = normalizeRecord(row as Record<string, unknown>);
      if (rec) records.push(rec);
    }
  }
  const byStaff = new Map<string, AttendanceRecord[]>();
  for (const rec of records) {
    const arr = byStaff.get(rec.staffId) ?? [];
    arr.push(rec);
    byStaff.set(rec.staffId, arr);
  }

  const groupsMap: Record<AbnormalKind, AbnormalPattern[]> = {
    late: [], leaveEarly: [], earlyLeave: [], missing: [], absent: [], pattern: [] };

  for (const staff of targetStaff) {
    const list = byStaff.get(String(staff.id)) ?? [];
    const name = staff.name ?? '직원';
    const dept = staff.department ?? '미분류';

    const lateRecs = list.filter((r) => r.lateMinutes >= 5);
    const leaveEarlyRecs = list.filter((r) => r.earlyLeaveMinutes > 0);
    const missingRecs = list.filter((r) => r.hasCheckIn !== r.hasCheckOut);
    const consecAbsent = detectConsecutiveAbsence(list, allDays);
    const dowRepeat = detectRepeatedLatePattern(list);

    if (lateRecs.length >= 3) {
      groupsMap.late.push({
        kind: 'late',
        staffId: String(staff.id),
        staffName: name,
        department: dept,
        count: lateRecs.length,
        severity: severityForCount(lateRecs.length, 3, 5, 8),
        description: describePattern('late', lateRecs.length, name),
        suggestion: suggestionFor('late') });
    }
    if (leaveEarlyRecs.length >= 2) {
      groupsMap.leaveEarly.push({
        kind: 'leaveEarly',
        staffId: String(staff.id),
        staffName: name,
        department: dept,
        count: leaveEarlyRecs.length,
        severity: severityForCount(leaveEarlyRecs.length, 2, 4, 6),
        description: describePattern('leaveEarly', leaveEarlyRecs.length, name),
        suggestion: suggestionFor('leaveEarly') });
    }
    // 조기퇴근은 별도 컬럼이 없으므로 조퇴와 분리해 큰 분(>30) 케이스로 단순 사용
    const earlyLeaveStrong = leaveEarlyRecs.filter((r) => r.earlyLeaveMinutes >= 30);
    if (earlyLeaveStrong.length >= 2) {
      groupsMap.earlyLeave.push({
        kind: 'earlyLeave',
        staffId: String(staff.id),
        staffName: name,
        department: dept,
        count: earlyLeaveStrong.length,
        severity: severityForCount(earlyLeaveStrong.length, 2, 4, 6),
        description: describePattern('earlyLeave', earlyLeaveStrong.length, name),
        suggestion: suggestionFor('earlyLeave') });
    }
    if (missingRecs.length >= 1) {
      groupsMap.missing.push({
        kind: 'missing',
        staffId: String(staff.id),
        staffName: name,
        department: dept,
        count: missingRecs.length,
        severity: severityForCount(missingRecs.length, 1, 3, 5),
        description: describePattern('missing', missingRecs.length, name),
        suggestion: suggestionFor('missing') });
    }
    if (consecAbsent >= 3) {
      groupsMap.absent.push({
        kind: 'absent',
        staffId: String(staff.id),
        staffName: name,
        department: dept,
        count: consecAbsent,
        severity: '경고',
        description: describePattern('absent', consecAbsent, name),
        suggestion: suggestionFor('absent') });
    }
    if (dowRepeat >= 3) {
      groupsMap.pattern.push({
        kind: 'pattern',
        staffId: String(staff.id),
        staffName: name,
        department: dept,
        count: dowRepeat,
        severity: severityForCount(dowRepeat, 3, 4, 6),
        description: describePattern('pattern', dowRepeat, name),
        suggestion: suggestionFor('pattern') });
    }
  }

  const groups: DetectionGroup[] = (Object.keys(KIND_LABELS) as AbnormalKind[]).map((kind) => {
    const items = groupsMap[kind].sort((a, b) => b.count - a.count);
    return {
      kind,
      label: KIND_LABELS[kind].label,
      description: KIND_LABELS[kind].description,
      tone: KIND_LABELS[kind].tone,
      count: items.length,
      items };
  });

  const today = formatKoreanDateKey(now);
  const todayDetected = records.filter((r) => r.workDate === today && (r.lateMinutes > 0 || r.earlyLeaveMinutes > 0 || (r.hasCheckIn !== r.hasCheckOut))).length;
  const totalDetections = groups.reduce((sum, g) => sum + g.items.length, 0);

  return {
    groups,
    todayDetected,
    unresolved: totalDetections,
    resolved: 0,
    ruleActiveCount: rules.filter((r) => r.active).length,
    actionLog: [] };
}

// ─── 정상 처리: 실제 DB 보정 ─────────────────────────────────────
// "정상 처리"는 해당 staff의 최근 4주 abnormal row를 정상으로 update 한다.
// - attendances (복수): late_minutes=0, early_leave_minutes=0, status='present'
// - attendance  (단수): status='정상' (마이페이지 fetch 대상)
// 두 테이블을 한 번에 동기화해야 마이페이지 "이번달 근태"가 즉시 반영됨.

export interface ResolveAbnormalResult {
  /** 실제로 update 된 work_date 목록 (YYYY-MM-DD) */
  updatedDates: string[];
}

/** kind별로 어떤 row를 ABNORMAL로 볼지 판정 */
function isAbnormalRow(kind: AbnormalKind, rec: AttendanceRecord): boolean {
  switch (kind) {
    case 'late':
    case 'pattern':
      return rec.lateMinutes >= 5;
    case 'leaveEarly':
      return rec.earlyLeaveMinutes > 0;
    case 'earlyLeave':
      return rec.earlyLeaveMinutes >= 30;
    case 'missing':
      return rec.hasCheckIn !== rec.hasCheckOut;
    case 'absent':
      // 결근은 row 자체가 없거나 status='absent' 일 가능성 — 우선 status로만 판정
      return rec.status.includes('absent') || rec.status.includes('결근');
    default:
      return false;
  }
}

export async function resolveStaffAbnormalRecords(
  pattern: AbnormalPattern,
): Promise<ResolveAbnormalResult> {
  const staffId = pattern.staffId?.trim();
  if (!staffId) return { updatedDates: [] };

  const now = new Date();
  const sinceIso = getAbnormalLookbackSince(ABNORMAL_LOOKBACK_DAYS, now);

  // 1) attendances(복수) lookback(28일) row 조회 — 어떤 날짜가 abnormal인지 식별
  // 위와 동일 — late_minutes / early_leave_minutes 는 실재하지 않는 컬럼이라 select 에서 뺀다.
  const { data: rawAttendances, error: fetchErr } = await db
    .from('attendances')
    .select('staff_id, work_date, status, check_in_time, check_out_time')
    .eq('staff_id', staffId)
    .gte('work_date', sinceIso);

  if (fetchErr) throw fetchErr;

  const records: AttendanceRecord[] = [];
  if (Array.isArray(rawAttendances)) {
    for (const row of rawAttendances) {
      if (row && typeof row === 'object') {
        const rec = normalizeRecord(row as Record<string, unknown>);
        if (rec) records.push(rec);
      }
    }
  }

  const abnormalDates = Array.from(
    new Set(records.filter((r) => isAbnormalRow(pattern.kind, r)).map((r) => r.workDate)),
  ).sort();

  if (abnormalDates.length === 0) {
    return { updatedDates: [] };
  }

  // 2) attendances 보정.
  //    late_minutes / early_leave_minutes 는 현재 스키마에 없다. /api/d1/mutate 가 모르는 컬럼을
  //    걸러내므로 보통은 status 만 반영되고, 컬럼이 추가된 환경에서는 함께 반영된다.
  //    그래도 실패하면 아래 폴백이 status 만으로 재시도한다.
  const { error: updateAttendancesErr } = await db
    .from('attendances')
    .update({
      status: 'present',
      late_minutes: 0,
      early_leave_minutes: 0 })
    .eq('staff_id', staffId)
    .in('work_date', abnormalDates);

  if (updateAttendancesErr) {
    // late_minutes/early_leave_minutes 컬럼이 없는 환경 폴백
    const { error: fallbackErr } = await db
      .from('attendances')
      .update({ status: 'present' })
      .eq('staff_id', staffId)
      .in('work_date', abnormalDates);
    if (fallbackErr) throw fallbackErr;
  }

  // 3) attendance(단수) 동기화 — 마이페이지가 보는 테이블. 컬럼: date, status
  //    한국어 상태값 '정상' 사용 (COMMUTE_STATUS_LABELS 참조).
  const { error: updateAttendanceErr } = await db
    .from('attendance')
    .update({ status: '정상' })
    .eq('staff_id', staffId)
    .in('date', abnormalDates);

  if (updateAttendanceErr) {
    // attendance 테이블이 없거나 row가 없는 경우 무시 — attendances는 이미 보정됨
    // (마이페이지는 attendance 우선이라 가능하면 동기화 시도, 실패는 silent)
    // 단 외부에서 알 수 있도록 console.warn 만 남김
    console.warn('attendance(단수) 보정 실패 — attendances만 갱신됨:', updateAttendanceErr);
  }

  return { updatedDates: abnormalDates };
}

function emptyResult(rules: AbnormalRule[]): AbnormalDataResult {
  const groups: DetectionGroup[] = (Object.keys(KIND_LABELS) as AbnormalKind[]).map((kind) => ({
    kind,
    label: KIND_LABELS[kind].label,
    description: KIND_LABELS[kind].description,
    tone: KIND_LABELS[kind].tone,
    count: 0,
    items: [] }));
  return {
    groups,
    todayDetected: 0,
    unresolved: 0,
    resolved: 0,
    ruleActiveCount: rules.filter((r) => r.active).length,
    actionLog: [] };
}
