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

const ATTENDANCE_STALE_TIME_MS = 60 * 1000;
const attendanceCache = new Map<string, { data: MonthlyAttendance; timestamp: number }>();

export function invalidateAttendanceCache(staffId?: string) {
  if (staffId) attendanceCache.delete(staffId);
  else attendanceCache.clear();
}

const COUNTS_STALE_TIME_MS = 30 * 1000;
const todayCountsCache = new Map<string, { counts: TodayCounts; timestamp: number }>();

export function invalidateTodayCountsCache(staffId?: string) {
  if (staffId) todayCountsCache.delete(staffId);
  else todayCountsCache.clear();
}

export function useMonthlyAttendance(staffId: string | null | undefined) {
  const [data, setData] = useState<MonthlyAttendance | null>(() => {
    if (staffId && attendanceCache.has(staffId)) {
      const cached = attendanceCache.get(staffId);
      if (cached && Date.now() - cached.timestamp < ATTENDANCE_STALE_TIME_MS) {
        return cached.data;
      }
    }
    return null;
  });

  const fetcher = useCallback(async (force = false) => {
    if (!staffId) return;
    const nowTime = Date.now();
    const cached = attendanceCache.get(staffId);
    if (!force && cached && nowTime - cached.timestamp < ATTENDANCE_STALE_TIME_MS) {
      setData(cached.data);
      return;
    }

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
      const computed = calculateMonthlyAttendance(rows as CommuteLogRow[]);
      attendanceCache.set(staffId, { data: computed, timestamp: Date.now() });
      setData(computed);
    } catch {
      // silent
    }
  }, [staffId]);

  useEffect(() => {
    void fetcher();
  }, [fetcher]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const refetch = () => {
      if (staffId) invalidateAttendanceCache(staffId);
      void fetcher(true);
    };
    window.addEventListener('erp-attendance-updated', refetch as EventListener);
    return () => window.removeEventListener('erp-attendance-updated', refetch as EventListener);
  }, [fetcher, staffId]);

  return { data, refetch: (force = true) => fetcher(force) };
}

export type TodayCounts = {
  pendingApproval: number;
  unreadChat: number;
  newBoard: number;
  unreadAlert: number;
  todoCount: number;
};

export function useTodayCounts(staffId: string | null | undefined): TodayCounts {
  const [counts, setCounts] = useState<TodayCounts>(() => {
    if (staffId && todayCountsCache.has(staffId)) {
      const cached = todayCountsCache.get(staffId);
      if (cached && Date.now() - cached.timestamp < COUNTS_STALE_TIME_MS) {
        return cached.counts;
      }
    }
    return {
      pendingApproval: 0,
      unreadChat: 0,
      newBoard: 0,
      unreadAlert: 0,
      todoCount: 0,
    };
  });

  useEffect(() => {
    if (!staffId) return;
    const cached = todayCountsCache.get(staffId);
    if (cached && Date.now() - cached.timestamp < COUNTS_STALE_TIME_MS) {
      setCounts(cached.counts);
      return;
    }

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
        const nextCounts = {
          pendingApproval: approvalRes.count ?? 0,
          unreadChat: 0,
          newBoard: 0,
          unreadAlert,
          todoCount: todoRes.count ?? 0,
        };
        todayCountsCache.set(staffId, { counts: nextCounts, timestamp: Date.now() });
        setCounts(nextCounts);
      } catch {
        // silent
      }
    };
    void fetchCounts();
    return () => { cancelled = true; };
  }, [staffId]);

  return counts;
}

// ─── 연차: 잔여/사용내역 — lib/annual-leave-summary SSOT ───
import { useAnnualLeaveSummary } from '@/lib/annual-leave-summary';

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

/** @deprecated use useAnnualLeaveSummary — 호환 래퍼 */
export function useMyLeave(staffId: string | null | undefined): MyLeave {
  const s = useAnnualLeaveSummary(staffId);
  return {
    total: s.total,
    used: s.used,
    remaining: s.remaining,
    usageRate: s.usageRate,
    history: s.history.map((h) => ({
      id: h.id,
      type: h.leave_type,
      days: h.daysLabel,
      date: h.dateLabel,
      status: h.status,
    })),
    loading: s.loading,
  };
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

/** @deprecated use useAnnualLeaveSummary — 호환 래퍼 (15일 폴백 없음) */
export function useLeaveBalance(staffId: string | null | undefined) {
  const s = useAnnualLeaveSummary(staffId);
  const data: LeaveBalance | null = s.loading
    ? null
    : {
        total_days: s.total,
        used_days: s.used,
        expired_days: s.expired,
        compensated_days: s.compensated,
        remaining_days: s.remaining,
      };
  return { data, refetch: s.reload };
}

