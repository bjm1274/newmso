'use client';

import { useEffect, useMemo, useState } from 'react';

import { supabase } from '@/lib/supabase';
import {
  calculateApprovedAnnualLeaveUsage,
  calculateLeaveDays,
  isAnnualLeaveType,
  isApprovedLeaveStatus,
  isHalfLeaveType,
} from '@/lib/annual-leave-ledger';
import { getStaffLikeId, resolveStaffLike } from '@/lib/staff-identity';
import { LucideIcon } from '../조직도서브/조직도측면창';

type Props = {
  user?: Record<string, unknown> | null;
  onBack?: () => void;
};

type StaffLeaveBalance = {
  id?: string | null;
  annual_leave_total?: number | null;
  annual_leave_used?: number | null;
};

type LeaveHistoryRow = {
  id: string;
  leave_type?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  status?: string | null;
  reason?: string | null;
  approved_at?: string | null;
  created_at?: string | null;
};

function formatDate(value: unknown) {
  if (!value) return '-';
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return String(value).slice(0, 10);
  return parsed.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatRange(row: LeaveHistoryRow) {
  const startDate = String(row.start_date || '');
  const endDate = String(row.end_date || row.start_date || '');
  if (!startDate) return '-';
  if (!endDate || startDate === endDate) return formatDate(startDate);
  return `${formatDate(startDate)} ~ ${formatDate(endDate)}`;
}

function getLeaveDays(row: LeaveHistoryRow) {
  if (isHalfLeaveType(row.leave_type)) return 0.5;
  return calculateLeaveDays(row.start_date, row.end_date);
}

export default function AnnualLeaveUsagePanel({ user, onBack }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [staff, setStaff] = useState<StaffLeaveBalance | null>(null);
  const [rows, setRows] = useState<LeaveHistoryRow[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError('');

      try {
        const resolvedUser = await resolveStaffLike(user || {});
        const staffId = getStaffLikeId(resolvedUser);

        if (!staffId) {
          if (!cancelled) {
            setStaff(null);
            setRows([]);
            setError('직원 계정을 확인할 수 없습니다.');
          }
          return;
        }

        const [{ data: staffData, error: staffError }, { data: leaveData, error: leaveError }] = await Promise.all([
          supabase
            .from('staff_members')
            .select('id, annual_leave_total, annual_leave_used')
            .eq('id', staffId)
            .maybeSingle(),
          supabase
            .from('leave_requests')
            .select('id, leave_type, start_date, end_date, status, reason, approved_at, created_at')
            .eq('staff_id', staffId)
            .order('start_date', { ascending: false })
            .order('created_at', { ascending: false }),
        ]);

        if (staffError) throw staffError;
        if (leaveError) throw leaveError;

        const approvedRows = ((leaveData || []) as LeaveHistoryRow[]).filter(
          (row) =>
            isApprovedLeaveStatus(row.status) &&
            (isAnnualLeaveType(row.leave_type) || isHalfLeaveType(row.leave_type))
        );

        if (!cancelled) {
          setStaff((staffData as StaffLeaveBalance | null) || null);
          setRows(approvedRows);
        }
      } catch (loadError) {
        console.error('내 연차휴가 사용내역 조회 실패:', loadError);
        if (!cancelled) {
          setStaff(null);
          setRows([]);
          setError('연차휴가 사용내역을 불러오지 못했습니다.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const currentYear = new Date().getFullYear();
  const yearRows = useMemo(
    () =>
      rows.filter((row) => {
        const startYear = new Date(String(row.start_date || '')).getFullYear();
        const endYear = new Date(String(row.end_date || row.start_date || '')).getFullYear();
        return startYear === currentYear || endYear === currentYear;
      }),
    [currentYear, rows]
  );

  const total = Number(staff?.annual_leave_total ?? user?.annual_leave_total ?? 0);
  const used = Math.max(
    Number(staff?.annual_leave_used ?? user?.annual_leave_used ?? 0),
    calculateApprovedAnnualLeaveUsage(yearRows as Record<string, unknown>[], currentYear)
  );
  const remaining = Math.max(0, total - used);

  return (
    <div className="space-y-4">
      <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--toss-gray-3)]">연차휴가</p>
            <h2 className="mt-1 text-[18px] font-black text-[var(--foreground)]">사용내역</h2>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 text-[12px] font-bold text-[var(--toss-gray-4)] shadow-sm transition-all hover:bg-[var(--muted)]"
          >
            <LucideIcon name="ArrowLeft" size={15} />
            개요로 돌아가기
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-[var(--radius-md)] bg-[var(--muted)] p-3">
            <p className="text-[11px] font-bold text-[var(--toss-gray-3)]">총 연차</p>
            <p className="mt-1 text-[20px] font-black text-[var(--foreground)]">{total.toFixed(1)}일</p>
          </div>
          <div className="rounded-[var(--radius-md)] bg-[var(--muted)] p-3">
            <p className="text-[11px] font-bold text-[var(--toss-gray-3)]">올해 사용</p>
            <p className="mt-1 text-[20px] font-black text-[var(--foreground)]">{used.toFixed(1)}일</p>
          </div>
          <div className="rounded-[var(--radius-md)] bg-[var(--toss-blue-light)] p-3">
            <p className="text-[11px] font-bold text-[var(--accent)]">잔여 연차</p>
            <p className="mt-1 text-[20px] font-black text-[var(--accent)]">{remaining.toFixed(1)}일</p>
          </div>
        </div>
      </section>

      <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-[14px] font-bold text-[var(--foreground)]">언제 사용했는지</h3>
          </div>
          <span className="rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-1 text-[12px] font-black text-[var(--accent)]">
            {rows.length}건
          </span>
        </div>

        {loading ? (
          <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] p-4 text-[12px] font-semibold text-[var(--toss-gray-3)]">
            연차휴가 사용내역을 불러오는 중입니다...
          </div>
        ) : error ? (
          <div className="rounded-[var(--radius-md)] border border-red-100 bg-red-50 p-4 text-[12px] font-bold text-red-600">
            {error}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] p-4 text-[12px] font-semibold text-[var(--toss-gray-4)]">
            승인된 연차휴가 사용내역이 없습니다.
          </div>
        ) : (
          <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)]">
            <div className="hidden grid-cols-[1.4fr_0.7fr_0.6fr_1fr] gap-3 bg-[var(--muted)] px-4 py-3 text-[11px] font-bold text-[var(--toss-gray-3)] md:grid">
              <span>사용일</span>
              <span>유형</span>
              <span>일수</span>
              <span>승인일</span>
            </div>
            <div className="divide-y divide-[var(--border)]">
              {rows.map((row) => (
                <article
                  key={row.id}
                  className="grid gap-2 px-4 py-3 text-[12px] md:grid-cols-[1.4fr_0.7fr_0.6fr_1fr] md:items-center md:gap-3"
                >
                  <div>
                    <p className="font-bold text-[var(--foreground)]">{formatRange(row)}</p>
                    {row.reason ? (
                      <p className="mt-1 line-clamp-1 text-[11px] font-medium text-[var(--toss-gray-3)]">{row.reason}</p>
                    ) : null}
                  </div>
                  <span className="font-semibold text-[var(--toss-gray-4)]">{row.leave_type || '연차'}</span>
                  <span className="font-black text-[var(--accent)]">{getLeaveDays(row).toFixed(1)}일</span>
                  <span className="text-[11px] font-medium text-[var(--toss-gray-3)]">
                    {formatDate(row.approved_at || row.created_at)}
                  </span>
                </article>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
