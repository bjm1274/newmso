/**
 * lib/data/v2-attendance.ts — v2 근태 데이터 어댑터
 *
 * 현재는 attendance-dummy.ts 의 더미 데이터를 fetcher 캐시·dedup으로 감쌉니다.
 * 추후 supabase 쿼리 치환 시 이 파일만 수정하면 됩니다.
 *
 * JM : 단일 책임 — 데이터 접근 레이어만
 * JM3: 에러는 throw — 호출자가 처리
 * JM4: any 금지, 타입은 attendance-dummy.ts에서 re-export
 */

import { fetcher } from '@/lib/fetcher';
import {
  EMPLOYEES,
  TODAY_RECORDS,
  MONTHLY_RECORDS,
  LEAVE_REQUESTS,
  LEAVE_BALANCES,
  ANOMALY_ALERTS,
  ROSTER_CELLS,
  DEPT_SUMMARIES,
} from '@/app/main-v2/hr/_shared/attendance-dummy';

// ── 타입 re-export (화면에서 이 모듈만 import할 수 있도록) ────────────────────

export type {
  AttendanceStatus,
  ShiftType,
  LeaveStatus,
  LeaveType,
  AnomalyType,
  Employee,
  TodayRecord,
  DailyRecord,
  LeaveRequest,
  LeaveBalance,
  AnomalyAlert,
  RosterCell,
  DeptSummary,
} from '@/app/main-v2/hr/_shared/attendance-dummy';

// ── TTL 상수 ─────────────────────────────────────────────────────────────────

/** 더미 데이터는 불변이므로 60초 TTL로 충분. 실 데이터 전환 시 적절히 조정. */
const DUMMY_TTL = 60_000;

// ── 동기 접근자 (클라이언트 컴포넌트용) ──────────────────────────────────────
//
// 클라이언트 컴포넌트(use client)는 async fetcher를 직접 호출할 수 없으므로
// 동기 접근자를 제공합니다. 실 데이터 전환 시 SWR / React Query / use()로 교체.
//
// TODO(T-014-실데이터): 실 쿼리 전환 시 아래 동기 접근자를 삭제하고
//   Server Component에서 fetch → props로 내려주거나 useSWR hook으로 교체.

export const getV2Employees    = () => EMPLOYEES;
export const getV2TodayRecords = () => TODAY_RECORDS;
export const getV2MonthlyRecords = () => MONTHLY_RECORDS;
export const getV2LeaveRequests  = () => LEAVE_REQUESTS;
export const getV2LeaveBalances  = () => LEAVE_BALANCES;
export const getV2AnomalyAlerts  = () => ANOMALY_ALERTS;
export const getV2RosterCells    = () => ROSTER_CELLS;
export const getV2DeptSummaries  = () => DEPT_SUMMARIES;

// ── 직원 목록 ─────────────────────────────────────────────────────────────────

/* TODO(T-014-실데이터): supabase.from('staff_members').select('id, name, department')
   로 치환. dept → department 매핑 필요. */
export async function fetchV2Employees() {
  return fetcher(
    'v2-attendance:employees',
    async () => EMPLOYEES,
    { ttl: DUMMY_TTL },
  );
}

// ── 오늘 출퇴근 현황 ──────────────────────────────────────────────────────────

/* TODO(T-014-실데이터): supabase.from('attendances')
   .select('employee_id, check_in, check_out, status')
   .eq('date', today)로 치환. */
export async function fetchV2TodayRecords() {
  return fetcher(
    'v2-attendance:today',
    async () => TODAY_RECORDS,
    { ttl: DUMMY_TTL },
  );
}

// ── 30일 출퇴근 기록 ──────────────────────────────────────────────────────────

/* TODO(T-014-실데이터): supabase.from('attendances')
   .select('date, employee_id, check_in, check_out, status')
   .gte('date', startDate).lte('date', endDate)로 치환. */
export async function fetchV2MonthlyRecords() {
  return fetcher(
    'v2-attendance:monthly',
    async () => MONTHLY_RECORDS,
    { ttl: DUMMY_TTL },
  );
}

// ── 연차 신청 ─────────────────────────────────────────────────────────────────

/* TODO(T-014-실데이터): supabase.from('leave_requests')
   .select('id, employee_id, start_date, end_date, type, status, used_days, total_days')로 치환. */
export async function fetchV2LeaveRequests() {
  return fetcher(
    'v2-attendance:leave-requests',
    async () => LEAVE_REQUESTS,
    { ttl: DUMMY_TTL },
  );
}

// ── 연차 소진 현황 ────────────────────────────────────────────────────────────

/* TODO(T-014-실데이터): supabase.from('leave_balances')
   .select('employee_id, used, total')로 치환. */
export async function fetchV2LeaveBalances() {
  return fetcher(
    'v2-attendance:leave-balances',
    async () => LEAVE_BALANCES,
    { ttl: DUMMY_TTL },
  );
}

// ── 이상 감지 ─────────────────────────────────────────────────────────────────

/* TODO(T-014-실데이터): supabase.from('attendance_anomalies')
   .select('id, employee_id, type, description, detected_at')
   .eq('date', today)로 치환. */
export async function fetchV2AnomalyAlerts() {
  return fetcher(
    'v2-attendance:anomalies',
    async () => ANOMALY_ALERTS,
    { ttl: DUMMY_TTL },
  );
}

// ── 근무표 셀 ─────────────────────────────────────────────────────────────────

/* TODO(T-014-실데이터): supabase.from('roster_cells')
   .select('employee_id, date, shift')
   .gte('date', startDate).lte('date', endDate)로 치환. */
export async function fetchV2RosterCells() {
  return fetcher(
    'v2-attendance:roster',
    async () => ROSTER_CELLS,
    { ttl: DUMMY_TTL },
  );
}

// ── 부서별 통계 ───────────────────────────────────────────────────────────────

/* TODO(T-014-실데이터): supabase.rpc('get_dept_attendance_summary', { date: today })
   또는 집계 쿼리로 치환. */
export async function fetchV2DeptSummaries() {
  return fetcher(
    'v2-attendance:dept-summaries',
    async () => DEPT_SUMMARIES,
    { ttl: DUMMY_TTL },
  );
}
