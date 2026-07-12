'use client';

/**
 * 내정보 화면 공용 데이터 훅 모음.
 * - useMonthlyAttendance: 이번 달 본인 근태 집계 (PC index.tsx와 동일 쿼리)
 * - useTodayCounts: 미결재·안 읽은 메시지·새 공지 카운트
 * JM2: deps 안정화·의존 최소화 / JM3: try/catch + silent fallback / JM4: any 금지
 */

import { useCallback, useEffect, useState } from 'react';
import { db } from '@/lib/db-client';
import { getKoreanMonthString } from '@/lib/seoul-time';
import { getMonthBoundaries } from '@/lib/date-utils';
import { fetchUnreadNotificationCount } from '@/app/main/기능부품/알림시스템/notification-api';
import {
  calculateMonthlyAttendance,
  type MonthlyAttendance } from '@/app/main/기능부품/마이페이지/출퇴근기록/attendance-utils';

type CommuteLogRow = {
  check_in?: string | null;
  check_out?: string | null;
  status?: string | null;
  date?: string | null;
};

export function useMonthlyAttendance(staffId: string | null | undefined) {
  const [data, setData] = useState<MonthlyAttendance | null>(null);

  const fetcher = useCallback(async () => {
    if (!staffId) return;
    const now = new Date();
    // 이번 달 범위는 KST 기준 (디바이스 타임존과 무관하게 서버 KST 날짜키와 일치)
    const { startDate: firstDay, endDate: lastDay } = getMonthBoundaries(getKoreanMonthString(now));
    try {
      const { data: rows, error } = await db
        .from('attendance')
        .select('check_in, check_out, status, date')
        .eq('staff_id', staffId)
        .gte('date', firstDay)
        .lte('date', lastDay);
      if (error || !rows) return;
      setData(calculateMonthlyAttendance(rows as CommuteLogRow[]));
    } catch {
      // silent
    }
  }, [staffId]);

  useEffect(() => {
    void fetcher();
  }, [fetcher]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const refetch = () => { void fetcher(); };
    window.addEventListener('erp-attendance-updated', refetch as EventListener);
    return () => window.removeEventListener('erp-attendance-updated', refetch as EventListener);
  }, [fetcher]);

  return { data, refetch: fetcher };
}

export type TodayCounts = {
  pendingApproval: number;
  unreadChat: number;
  newBoard: number;
  unreadAlert: number;
  todoCount: number;
};

export function useTodayCounts(staffId: string | null | undefined): TodayCounts {
  const [counts, setCounts] = useState<TodayCounts>({
    pendingApproval: 0,
    unreadChat: 0,
    newBoard: 0,
    unreadAlert: 0,
    todoCount: 0 });

  useEffect(() => {
    if (!staffId) return;
    let cancelled = false;
    const fetchCounts = async () => {
      try {
        const [approvalRes, unreadAlert, todoRes] = await Promise.all([
          db
            .from('approvals')
            .select('id', { count: 'exact', head: true })
            .eq('current_approver_id', staffId)
            .eq('status', '대기'),
          fetchUnreadNotificationCount(),
          db
            .from('todos')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', staffId)
            .eq('is_complete', 0),
        ]);
        if (cancelled) return;
        setCounts({
          pendingApproval: approvalRes.count ?? 0,
          unreadChat: 0,
          newBoard: 0,
          unreadAlert,
          todoCount: todoRes.count ?? 0 });
      } catch {
        // silent
      }
    };
    void fetchCounts();
    return () => { cancelled = true; };
  }, [staffId]);

  return counts;
}

// ─── 연차: 잔여/사용내역 (PC 연차휴가내역과 동일 소스) ───
import {
  calculateApprovedAnnualLeaveUsage,
  calculateLeaveDays,
  isAnnualLeaveType } from '@/lib/annual-leave-ledger';

export type MyLeaveHistory = {
  id: string;
  type: string;
  days: string;
  date: string;
  status: '승인' | '대기' | '반려';
};

export type MyLeave = {
  total: number;
  used: number;
  remaining: number;
  usageRate: number;
  history: MyLeaveHistory[];
  loading: boolean;
};

type LeaveRequestRow = {
  id?: unknown;
  leave_type?: unknown;
  start_date?: unknown;
  end_date?: unknown;
  status?: unknown;
};

function normalizeLeaveStatus(raw: unknown): MyLeaveHistory['status'] {
  const s = String(raw ?? '').trim();
  if (s === '승인' || s === 'approved') return '승인';
  if (s === '반려' || s === 'rejected') return '반려';
  return '대기';
}

export function useMyLeave(staffId: string | null | undefined): MyLeave {
  const [state, setState] = useState<MyLeave>({
    total: 0, used: 0, remaining: 0, usageRate: 0, history: [], loading: true });

  useEffect(() => {
    if (!staffId) { setState((p) => ({ ...p, loading: false })); return; }
    let cancelled = false;
    (async () => {
      try {
        const currentYear = new Date().getFullYear();
        const [staffRes, leaveRes, balanceRes] = await Promise.all([
          db
            .from('staff_members')
            .select('annual_leave_total, annual_leave_used')
            .eq('id', staffId)
            .maybeSingle(),
          db
            .from('leave_requests')
            .select('id, leave_type, start_date, end_date, status')
            .eq('staff_id', staffId)
            .order('start_date', { ascending: false })
            .limit(50),
          db
            .from('leave_balances')
            .select('expired_days, compensated_days')
            .eq('staff_id', staffId)
            .eq('year', currentYear)
            .maybeSingle(),
        ]);
        if (cancelled) return;

        const staff = (staffRes.data ?? {}) as { annual_leave_total?: number | null; annual_leave_used?: number | null };
        const balance = (balanceRes.data ?? {}) as { expired_days?: number | null; compensated_days?: number | null };
        const rows = Array.isArray(leaveRes.data) ? (leaveRes.data as LeaveRequestRow[]) : [];

        const total = Number(staff.annual_leave_total ?? 0);
        const used = Math.max(
          Number(staff.annual_leave_used ?? 0),
          calculateApprovedAnnualLeaveUsage(rows as Record<string, unknown>[], currentYear),
        );
        const expired = Number(balance?.expired_days ?? 0);
        const compensated = Number(balance?.compensated_days ?? 0);
        const remaining = Math.max(0, total - used - expired - compensated);
        const usageRate = total > 0 ? Math.round((used / total) * 100) : 0;

        const history: MyLeaveHistory[] = rows
          .filter((r) => isAnnualLeaveType(String(r.leave_type ?? '')))
          .map((r) => {
            const start = String(r.start_date ?? '').slice(0, 10);
            const end = String(r.end_date ?? '').slice(0, 10);
            const d = calculateLeaveDays(start, end);
            return {
              id: String(r.id ?? `${start}-${end}`),
              type: String(r.leave_type ?? '연차'),
              days: `${d}일`,
              date: start === end ? start.replace(/-/g, '.') : `${start.replace(/-/g, '.')} ~ ${end.slice(5).replace(/-/g, '.')}`,
              status: normalizeLeaveStatus(r.status) };
          });

        setState({ total, used, remaining, usageRate, history, loading: false });
      } catch {
        if (!cancelled) setState((p) => ({ ...p, loading: false }));
      }
    })();
    return () => { cancelled = true; };
  }, [staffId]);

  return state;
}

// ─── 증명서: 최근 발급 내역 (certificate_issuances) ───
export type MyRecentCert = { id: string; title: string; date: string };

export function useMyRecentCerts(
  staffId: string | null | undefined,
  /** 값이 바뀌면 재조회한다(발급 직후 목록 갱신용). */
  reloadToken?: number,
): { rows: MyRecentCert[]; loading: boolean } {
  const [rows, setRows] = useState<MyRecentCert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!staffId) { setRows([]); setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await db
          .from('certificate_issuances')
          .select('id, cert_type, issued_at')
          .eq('staff_id', staffId)
          .order('issued_at', { ascending: false })
          .limit(20);
        if (cancelled) return;
        const list = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
        setRows(list.map((r) => ({
          id: String(r['id'] ?? ''),
          title: String(r['cert_type'] ?? '증명서'),
          date: String(r['issued_at'] ?? '').slice(0, 10).replace(/-/g, '.') })).filter((r) => r.id));
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [staffId, reloadToken]);

  return { rows, loading };
}

export type LeaveBalance = {
  total_days: number;
  used_days: number;
  expired_days: number;
  compensated_days: number;
  remaining_days: number;
};

export function useLeaveBalance(staffId: string | null | undefined) {
  const [data, setData] = useState<LeaveBalance | null>(null);

  const fetcher = useCallback(async () => {
    if (!staffId) return;
    const currentYear = new Date().getFullYear();
    try {
      const { data: row, error } = await db
        .from('leave_balances')
        .select('total_days, used_days, expired_days, compensated_days, remaining_days')
        .eq('staff_id', staffId)
        .eq('year', currentYear)
        .maybeSingle();
      if (error) return;
      setData(row as LeaveBalance | null);
    } catch {
      // silent
    }
  }, [staffId]);

  useEffect(() => {
    void fetcher();
  }, [fetcher]);

  return { data, refetch: fetcher };
}

