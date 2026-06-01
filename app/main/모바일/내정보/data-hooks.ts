'use client';

/**
 * 내정보 화면 공용 데이터 훅 모음.
 * - useMonthlyAttendance: 이번 달 본인 근태 집계 (PC index.tsx와 동일 쿼리)
 * - useTodayCounts: 미결재·안 읽은 메시지·새 공지 카운트
 * JM2: deps 안정화·의존 최소화 / JM3: try/catch + silent fallback / JM4: any 금지
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  calculateMonthlyAttendance,
  type MonthlyAttendance,
} from '@/app/main/기능부품/마이페이지/출퇴근기록/attendance-utils';

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
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString('en-CA');
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toLocaleDateString('en-CA');
    try {
      const { data: rows, error } = await supabase
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
};

export function useTodayCounts(staffId: string | null | undefined): TodayCounts {
  const [counts, setCounts] = useState<TodayCounts>({
    pendingApproval: 0,
    unreadChat: 0,
    newBoard: 0,
    unreadAlert: 0,
  });

  useEffect(() => {
    if (!staffId) return;
    let cancelled = false;
    const fetchCounts = async () => {
      try {
        const [approvalRes, alertRes] = await Promise.all([
          supabase
            .from('approvals')
            .select('id', { count: 'exact', head: true })
            .eq('current_approver_id', staffId)
            .eq('status', '대기'),
          supabase
            .from('notifications')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', staffId)
            .is('read_at', null),
        ]);
        if (cancelled) return;
        setCounts({
          pendingApproval: approvalRes.count ?? 0,
          unreadChat: 0,
          newBoard: 0,
          unreadAlert: alertRes.count ?? 0,
        });
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
  isAnnualLeaveType,
} from '@/lib/annual-leave-ledger';

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
    total: 0, used: 0, remaining: 0, usageRate: 0, history: [], loading: true,
  });

  useEffect(() => {
    if (!staffId) { setState((p) => ({ ...p, loading: false })); return; }
    let cancelled = false;
    (async () => {
      try {
        const currentYear = new Date().getFullYear();
        const [staffRes, leaveRes] = await Promise.all([
          supabase
            .from('staff_members')
            .select('annual_leave_total, annual_leave_used')
            .eq('id', staffId)
            .maybeSingle(),
          supabase
            .from('leave_requests')
            .select('id, leave_type, start_date, end_date, status')
            .eq('staff_id', staffId)
            .order('start_date', { ascending: false })
            .limit(50),
        ]);
        if (cancelled) return;

        const staff = (staffRes.data ?? {}) as { annual_leave_total?: number | null; annual_leave_used?: number | null };
        const rows = Array.isArray(leaveRes.data) ? (leaveRes.data as LeaveRequestRow[]) : [];

        const total = Number(staff.annual_leave_total ?? 0);
        const used = Math.max(
          Number(staff.annual_leave_used ?? 0),
          calculateApprovedAnnualLeaveUsage(rows as Record<string, unknown>[], currentYear),
        );
        const remaining = Math.max(0, total - used);
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
              status: normalizeLeaveStatus(r.status),
            };
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

// ─── 급여명세: 최신 payroll_records 1건 ───
export type PaySlipLine = { label: string; amount: number };
export type MyPayslip = {
  yearMonth: string;
  netPay: number;
  payItems: PaySlipLine[];
  deductItems: PaySlipLine[];
  payTotal: number;
  deductTotal: number;
  loading: boolean;
  found: boolean;
};

type PayrollRow = Record<string, unknown>;

function num(row: PayrollRow, key: string): number {
  const v = row[key];
  return typeof v === 'number' ? v : Number(v ?? 0) || 0;
}

export function useMyLatestPayroll(staffId: string | null | undefined): MyPayslip {
  const [state, setState] = useState<MyPayslip>({
    yearMonth: '', netPay: 0, payItems: [], deductItems: [], payTotal: 0, deductTotal: 0, loading: true, found: false,
  });

  useEffect(() => {
    if (!staffId) { setState((p) => ({ ...p, loading: false })); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('payroll_records')
          .select('*')
          .eq('staff_id', staffId)
          .order('year_month', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (cancelled) return;
        if (!data) { setState((p) => ({ ...p, loading: false, found: false })); return; }
        const r = data as PayrollRow;

        const payItems: PaySlipLine[] = [
          { label: '기본급', amount: num(r, 'base_salary') },
          { label: '식대', amount: num(r, 'meal_allowance') },
          { label: '차량유지', amount: num(r, 'vehicle_allowance') },
          { label: '보육수당', amount: num(r, 'childcare_allowance') },
          { label: '연구수당', amount: num(r, 'research_allowance') },
          { label: '야간수당', amount: num(r, 'night_duty_allowance') },
          { label: '연장근로', amount: num(r, 'overtime_pay') },
          { label: '기타수당', amount: num(r, 'extra_allowance') },
          { label: '상여금', amount: num(r, 'bonus') },
        ].filter((it) => it.amount > 0);

        const deductItems: PaySlipLine[] = [
          { label: '국민연금', amount: num(r, 'national_pension') },
          { label: '건강보험', amount: num(r, 'health_insurance') },
          { label: '장기요양', amount: num(r, 'long_term_care') },
          { label: '고용보험', amount: num(r, 'employment_insurance') },
          { label: '소득세', amount: num(r, 'income_tax') },
          { label: '지방소득세', amount: num(r, 'local_tax') },
          { label: '근태공제', amount: num(r, 'attendance_deduction') },
        ].filter((it) => it.amount > 0);

        const payTotal = payItems.reduce((s, it) => s + it.amount, 0);
        const deductTotal = deductItems.reduce((s, it) => s + it.amount, 0);

        setState({
          yearMonth: String(r['year_month'] ?? ''),
          netPay: num(r, 'net_pay'),
          payItems,
          deductItems,
          payTotal,
          deductTotal,
          loading: false,
          found: true,
        });
      } catch {
        if (!cancelled) setState((p) => ({ ...p, loading: false }));
      }
    })();
    return () => { cancelled = true; };
  }, [staffId]);

  return state;
}
