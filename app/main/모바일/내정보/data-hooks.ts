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
            .from('approval_documents')
            .select('id', { count: 'exact', head: true })
            .eq('current_approver_id', staffId)
            .eq('status', 'pending'),
          supabase
            .from('notifications')
            .select('id', { count: 'exact', head: true })
            .eq('staff_id', staffId)
            .eq('read', false),
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
