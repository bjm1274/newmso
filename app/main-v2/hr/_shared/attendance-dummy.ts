/**
 * attendance-dummy.ts — 근태 공통 더미 데이터
 *
 * JM : 단일 책임 — 더미 데이터만
 * JM4: union 타입 사용, any 금지
 * JM5: 가상 직원명 사용 (실제 개인정보 금지)
 */

// ── 상태 유니온 ────────────────────────────────────────────────────────────────

export type AttendanceStatus = '정상' | '지각' | '결근' | '휴가';
export type ShiftType = 'D' | 'E' | 'N' | 'OFF' | '연차';
export type LeaveStatus = '대기' | '승인' | '반려';
export type LeaveType = '연차' | '반차' | '병가' | '공가';
export type AnomalyType = '지각반복' | '무단결근' | '초과근무';

// ── 직원 ────────────────────────────────────────────────────────────────────

export interface Employee {
  id: string;
  name: string;
  dept: string;
}

export const EMPLOYEES: readonly Employee[] = [
  { id: 'e01', name: '김민준', dept: '간호1팀' },
  { id: 'e02', name: '이서연', dept: '원무팀' },
  { id: 'e03', name: '박지호', dept: '간호2팀' },
  { id: 'e04', name: '최수아', dept: '원무팀' },
  { id: 'e05', name: '정태양', dept: '의사' },
  { id: 'e06', name: '한은지', dept: '간호3팀' },
  { id: 'e07', name: '오다은', dept: '간호1팀' },
  { id: 'e08', name: '윤성민', dept: '간호2팀' },
  { id: 'e09', name: '장지수', dept: '간호3팀' },
  { id: 'e10', name: '임현아', dept: '의사' },
] as const;

// ── 오늘 출퇴근 현황 ─────────────────────────────────────────────────────────

export interface TodayRecord {
  employeeId: string;
  checkIn: string | null;  // 'HH:MM' or null
  checkOut: string | null;
  status: AttendanceStatus;
}

export const TODAY_RECORDS: readonly TodayRecord[] = [
  { employeeId: 'e01', checkIn: '08:45', checkOut: null, status: '정상' },
  { employeeId: 'e02', checkIn: '09:03', checkOut: null, status: '지각' },
  { employeeId: 'e03', checkIn: '08:52', checkOut: null, status: '정상' },
  { employeeId: 'e04', checkIn: null,    checkOut: null, status: '휴가' },
  { employeeId: 'e05', checkIn: null,    checkOut: null, status: '결근' },
  { employeeId: 'e06', checkIn: '08:59', checkOut: null, status: '정상' },
  { employeeId: 'e07', checkIn: '08:50', checkOut: null, status: '정상' },
  { employeeId: 'e08', checkIn: '08:48', checkOut: null, status: '정상' },
  { employeeId: 'e09', checkIn: '09:10', checkOut: null, status: '지각' },
  { employeeId: 'e10', checkIn: '08:40', checkOut: null, status: '정상' },
] as const;

// ── 30일 출퇴근 기록 ─────────────────────────────────────────────────────────

export interface DailyRecord {
  date: string;        // 'YYYY-MM-DD'
  employeeId: string;
  checkIn: string | null;
  checkOut: string | null;
  status: AttendanceStatus;
}

/** 2026-05-01 ~ 2026-05-30, 직원 10명 */
function buildMonthlyRecords(): readonly DailyRecord[] {
  const base: Array<{ emp: string; pattern: AttendanceStatus[] }> = [
    { emp: 'e01', pattern: ['정상','정상','정상','정상','정상','지각','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상'] },
    { emp: 'e02', pattern: ['정상','지각','정상','정상','지각','정상','정상','정상','정상','정상','지각','정상','휴가','휴가','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','휴가','휴가','휴가','휴가','휴가'] },
    { emp: 'e03', pattern: ['정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','휴가','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상'] },
    { emp: 'e04', pattern: ['정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','휴가','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상'] },
    { emp: 'e05', pattern: ['정상','정상','정상','결근','정상','정상','정상','정상','정상','정상','결근','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상'] },
    { emp: 'e06', pattern: ['정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상'] },
    { emp: 'e07', pattern: ['정상','정상','지각','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상'] },
    { emp: 'e08', pattern: ['정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상'] },
    { emp: 'e09', pattern: ['정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','지각','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상'] },
    { emp: 'e10', pattern: ['정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상','정상'] },
  ];

  const CHECK_IN: Record<AttendanceStatus, string | null> = {
    정상: '08:50', 지각: '09:15', 결근: null, 휴가: null,
  };
  const CHECK_OUT: Record<AttendanceStatus, string | null> = {
    정상: '17:50', 지각: '18:10', 결근: null, 휴가: null,
  };

  const records: DailyRecord[] = [];
  for (const { emp, pattern } of base) {
    for (let d = 0; d < 30; d++) {
      const day = String(d + 1).padStart(2, '0');
      const status = pattern[d] ?? '정상';
      records.push({
        date: `2026-05-${day}`,
        employeeId: emp,
        checkIn: CHECK_IN[status],
        checkOut: CHECK_OUT[status],
        status,
      });
    }
  }
  return records;
}

export const MONTHLY_RECORDS: readonly DailyRecord[] = buildMonthlyRecords();

// ── 연차 신청 ────────────────────────────────────────────────────────────────

export interface LeaveRequest {
  id: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  type: LeaveType;
  status: LeaveStatus;
  usedDays: number;
  totalDays: number;
}

export const LEAVE_REQUESTS: readonly LeaveRequest[] = [
  { id: 'l01', employeeId: 'e02', startDate: '2026-05-13', endDate: '2026-05-14', type: '연차', status: '대기', usedDays: 3, totalDays: 15 },
  { id: 'l02', employeeId: 'e03', startDate: '2026-05-20', endDate: '2026-05-20', type: '반차', status: '대기', usedDays: 12, totalDays: 15 },
  { id: 'l03', employeeId: 'e04', startDate: '2026-05-26', endDate: '2026-05-30', type: '연차', status: '대기', usedDays: 15, totalDays: 15 },
  { id: 'l04', employeeId: 'e06', startDate: '2026-06-02', endDate: '2026-06-02', type: '병가', status: '대기', usedDays: 0, totalDays: 15 },
  { id: 'l05', employeeId: 'e01', startDate: '2026-04-10', endDate: '2026-04-17', type: '연차', status: '승인', usedDays: 8, totalDays: 15 },
] as const;

// ── 연차 소진 현황 ────────────────────────────────────────────────────────────

export interface LeaveBalance {
  employeeId: string;
  used: number;
  total: number;
}

export const LEAVE_BALANCES: readonly LeaveBalance[] = [
  { employeeId: 'e01', used: 8,  total: 15 },
  { employeeId: 'e02', used: 3,  total: 15 },
  { employeeId: 'e03', used: 12, total: 15 },
  { employeeId: 'e04', used: 15, total: 15 },
  { employeeId: 'e05', used: 5,  total: 15 },
  { employeeId: 'e06', used: 0,  total: 15 },
  { employeeId: 'e07', used: 6,  total: 15 },
  { employeeId: 'e08', used: 9,  total: 15 },
  { employeeId: 'e09', used: 2,  total: 15 },
  { employeeId: 'e10', used: 11, total: 15 },
] as const;

// ── 이상 감지 ────────────────────────────────────────────────────────────────

export interface AnomalyAlert {
  id: string;
  employeeId: string;
  type: AnomalyType;
  description: string;
  detectedAt: string;  // 'HH:MM' or '어제' etc.
}

export const ANOMALY_ALERTS: readonly AnomalyAlert[] = [
  { id: 'a01', employeeId: 'e05', type: '무단결근',  description: '출근 미확인 · 연락 없음 · 2회 연속',  detectedAt: '09:30' },
  { id: 'a02', employeeId: 'e02', type: '지각반복',  description: '이번 달 누적 지각 3회 초과',          detectedAt: '09:05' },
  { id: 'a03', employeeId: 'e03', type: '초과근무',  description: '주 52시간 초과 예상 · 이번주 48h',    detectedAt: '어제' },
] as const;

// ── 근무표 ────────────────────────────────────────────────────────────────────

export interface RosterCell {
  employeeId: string;
  date: string;   // 'YYYY-MM-DD'
  shift: ShiftType;
}

const SHIFT_PATTERNS: Record<string, readonly ShiftType[]> = {
  e01: ['D','OFF','OFF','D','D','E','E','N','N','OFF','D','D','D','E','E','N','N','OFF','D','D','D','E','E','N','OFF','OFF','D','D','E','N'],
  e02: ['E','E','OFF','N','N','OFF','D','D','연차','연차','D','E','E','OFF','N','N','OFF','D','D','E','E','연차','연차','연차','연차','연차','D','D','E','N'],
  e03: ['N','OFF','OFF','D','D','D','E','E','OFF','N','N','D','D','D','E','E','OFF','N','연차','D','D','D','E','E','OFF','N','N','D','E','D'],
  e04: ['OFF','OFF','D','E','E','N','N','OFF','D','D','연차','E','E','N','N','OFF','D','D','E','E','N','N','OFF','D','D','E','E','N','OFF','D'],
  e05: ['D','D','E','OFF','D','D','E','E','N','N','OFF','D','D','E','E','N','N','OFF','D','D','E','E','N','N','OFF','D','D','E','E','D'],
  e06: ['D','D','E','OFF','OFF','D','D','D','OFF','OFF','E','D','D','E','OFF','OFF','D','D','E','D','OFF','OFF','D','D','E','D','D','OFF','OFF','D'],
  e07: ['E','N','N','OFF','D','D','E','N','N','OFF','D','D','E','N','N','OFF','D','D','E','N','N','OFF','D','D','E','N','N','OFF','D','D'],
  e08: ['N','OFF','D','D','E','N','OFF','D','D','E','N','OFF','D','D','E','N','OFF','D','D','E','N','OFF','D','D','E','N','OFF','D','D','E'],
  e09: ['D','E','E','N','N','OFF','D','D','E','E','N','N','OFF','D','D','E','E','N','N','OFF','D','D','E','E','N','N','OFF','D','D','E'],
  e10: ['E','D','D','E','N','N','OFF','D','D','E','N','N','OFF','D','D','E','N','N','OFF','D','D','E','N','N','OFF','D','D','E','N','OFF'],
};

export const ROSTER_CELLS: readonly RosterCell[] = (() => {
  const cells: RosterCell[] = [];
  for (const [empId, pattern] of Object.entries(SHIFT_PATTERNS)) {
    for (let d = 0; d < 30; d++) {
      const day = String(d + 1).padStart(2, '0');
      cells.push({ employeeId: empId, date: `2026-05-${day}`, shift: pattern[d] ?? 'OFF' });
    }
  }
  return cells;
})();

// ── 부서별 통계 ──────────────────────────────────────────────────────────────

export interface DeptSummary {
  dept: string;
  normal: number;
  late: number;
  absent: number;
  leave: number;
}

export const DEPT_SUMMARIES: readonly DeptSummary[] = [
  { dept: '간호1팀', normal: 18, late: 1, absent: 0, leave: 2 },
  { dept: '간호2팀', normal: 16, late: 2, absent: 1, leave: 1 },
  { dept: '간호3팀', normal: 14, late: 0, absent: 0, leave: 3 },
  { dept: '원무팀',  normal: 12, late: 1, absent: 0, leave: 0 },
  { dept: '의사',    normal:  8, late: 1, absent: 1, leave: 1 },
] as const;
