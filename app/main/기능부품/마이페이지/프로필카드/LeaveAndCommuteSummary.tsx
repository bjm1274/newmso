'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { calculateApprovedAnnualLeaveUsage } from '@/lib/annual-leave-ledger';
import { getStaffLikeId, resolveStaffLike } from '@/lib/staff-identity';
import { useLocalDateKey } from '@/lib/use-local-date-key';
import { sanitizeCommuteSummaryItems } from './format-utils';
import type { AnnualLeaveStaffRow, ApprovedLeaveRow, CommuteStatusRow, TodayAttendanceStatusRow } from './types';

export function LeaveAndCommuteSummary({ user: _rawUser, onOpenApproval }: Record<string, unknown>) {
  const user = (_rawUser ?? {}) as Record<string, unknown>;
  const currentDateKey = useLocalDateKey();
  const [summary, setSummary] = useState<{
    total: number;
    used: number;
    remaining: number;
    todayStatusLabel: string | null;
    lateDays: { date: string; status: string }[];
    overworkDays: { date: string; status: string }[];
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!user?.id && !user?.name && !user?.employee_no && !user?.auth_user_id) return;

      const resolvedUser = await resolveStaffLike(user as Record<string, unknown>);
      const resolvedStaffId = getStaffLikeId(resolvedUser);

      let staff: AnnualLeaveStaffRow | null = null;
      if (resolvedStaffId) {
        const res = await supabase
          .from('staff_members')
          .select('id, annual_leave_total, annual_leave_used')
          .eq('id', resolvedStaffId)
          .maybeSingle();
        staff = res.data;
      }

      if (!staff && resolvedUser?.name) {
        const res = await supabase
          .from('staff_members')
          .select('id, annual_leave_total, annual_leave_used')
          .eq('name', resolvedUser.name)
          .maybeSingle();
        staff = res.data as AnnualLeaveStaffRow | null;
      }

      const total = Number(staff?.annual_leave_total ?? resolvedUser?.annual_leave_total ?? user?.annual_leave_total ?? 0);
      const staffId = staff?.id ?? resolvedStaffId;
      const currentYear = new Date().getFullYear();
      const yearStart = `${currentYear}-01-01`;
      const yearEnd = `${currentYear}-12-31`;

      const approvedLeaves: ApprovedLeaveRow[] = staffId
        ? ((await supabase
            .from('leave_requests')
            .select('leave_type,start_date,end_date,status')
            .eq('staff_id', staffId)
            .lte('start_date', yearEnd)
            .gte('end_date', yearStart)).data as ApprovedLeaveRow[] | null) || []
        : [];

      const used = Math.max(
        Number(staff?.annual_leave_used ?? resolvedUser?.annual_leave_used ?? user?.annual_leave_used ?? 0),
        calculateApprovedAnnualLeaveUsage(approvedLeaves as Record<string, unknown>[], currentYear)
      );
      const remaining = Math.max(0, total - used);

      const commuteRows: CommuteStatusRow[] = staffId
        ? ((await supabase
            .from('attendance')
            .select('date,status')
            .eq('staff_id', staffId)
            .order('date', { ascending: false })
            .limit(60)).data as CommuteStatusRow[] | null) || []
        : [];

      const todayAttendance: TodayAttendanceStatusRow | null = staffId
        ? ((await supabase
            .from('attendances')
            .select('status')
            .eq('staff_id', staffId)
            .eq('work_date', currentDateKey)
            .maybeSingle()).data as TodayAttendanceStatusRow | null)
        : null;

      const normalizedTodayStatus = String(todayAttendance?.status ?? '').trim().toLowerCase();
      const todayStatusLabel =
        normalizedTodayStatus === 'annual_leave' || normalizedTodayStatus === '연차휴가'
          ? '오늘 연차 승인 반영'
          : normalizedTodayStatus === 'half_leave' || normalizedTodayStatus === '반차휴가'
            ? '오늘 반차 승인 반영'
            : normalizedTodayStatus === 'sick_leave' || normalizedTodayStatus === '병가'
              ? '오늘 병가 승인 반영'
              : null;

      const lateDays =
        commuteRows
          .filter((entry) => entry.status === '지각')
          .map((entry) => ({
            date: entry.date,
            status: entry.status,
          })) ?? [];

      const overworkDays =
        commuteRows
          .filter((entry) => ['추가근무', '연장근무', '특근'].includes(String(entry.status ?? '')))
          .map((entry) => ({
            date: entry.date,
            status: entry.status,
          })) ?? [];

      if (!cancelled) {
        setSummary({
          total,
          used,
          remaining,
          todayStatusLabel,
          lateDays: sanitizeCommuteSummaryItems(lateDays),
          overworkDays: sanitizeCommuteSummaryItems(overworkDays),
        });
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [currentDateKey, user?.id, user?.name, user?.employee_no, user?.auth_user_id]);

  if (!summary) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] p-3.5 text-[12px] font-semibold text-[var(--toss-gray-3)] sm:p-4">
        근태와 연차 요약 정보를 불러오는 중입니다...
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] p-3.5 text-[12px] sm:p-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-[var(--toss-gray-3)]">
            연차 현황
          </p>
          <p className="text-[14px] font-bold leading-snug text-[var(--foreground)]">
            잔여 연차 <span className="text-emerald-600">{summary.remaining.toFixed(1)}일</span>
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--toss-gray-4)]">
            총 {summary.total.toFixed(1)}일 중 {summary.used.toFixed(1)}일 사용
          </p>
          {summary.todayStatusLabel ? (
            <p className="mt-1.5 inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-600">
              {summary.todayStatusLabel}
            </p>
          ) : null}
        </div>
        <button
          onClick={() => (onOpenApproval as ((v: unknown) => void) | undefined)?.({ type: '연차/휴가' })}
          className="rounded-[var(--radius-md)] border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-emerald-600 transition-colors hover:bg-emerald-100"
        >
          휴가 결재 열기
        </button>
      </div>

      <div className="space-y-1.5 border-t border-[var(--border)] pt-3">
        <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--toss-gray-3)]">
          최근 지각
        </p>
        {summary.lateDays.length === 0 ? (
          <p className="text-[11px] text-[var(--toss-gray-4)]">최근 60일 내 지각 기록이 없습니다.</p>
        ) : (
          <ul className="space-y-1 text-[11px] text-[var(--toss-gray-4)]">
            {summary.lateDays.slice(0, 3).map((entry) => (
              <li key={`${entry.date}-${entry.status}`}>
                {new Date(entry.date).toLocaleDateString('ko-KR')} · {entry.status}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-1.5 border-t border-[var(--border)] pt-3">
        <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--toss-gray-3)]">
          최근 추가 근무
        </p>
        {summary.overworkDays.length === 0 ? (
          <p className="text-[11px] text-[var(--toss-gray-4)]">최근 60일 내 추가 근무 기록이 없습니다.</p>
        ) : (
          <ul className="space-y-1 text-[11px] text-[var(--toss-gray-4)]">
            {summary.overworkDays.slice(0, 3).map((entry) => (
              <li key={`${entry.date}-${entry.status}`}>
                {new Date(entry.date).toLocaleDateString('ko-KR')} · {entry.status}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
