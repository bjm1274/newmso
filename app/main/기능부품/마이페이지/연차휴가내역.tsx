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
  expired_days?: number | null;
  compensated_days?: number | null;
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

// JM4: `start_date`/`end_date`가 'YYYY-MM-DD' 또는 ISO timestamp 둘 다 올 수 있음.
// `new Date('YYYY-MM-DD')`는 UTC 자정으로 해석되므로 KST 외 timezone에서 하루가 밀릴 수 있다.
// 날짜 부분만 직접 파싱해 KST/UTC 무관하게 동일한 결과를 보장.
function extractDateOnly(value: unknown): { y: number; m: number; d: number } | null {
  if (!value) return null;
  const raw = String(value).trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (!y || !m || !d) return null;
  return { y, m, d };
}

function formatDateOnly(value: unknown) {
  const parts = extractDateOnly(value);
  if (!parts) return '-';
  return `${parts.y}년 ${parts.m}월 ${parts.d}일`;
}

function formatDateTimeKst(value: unknown) {
  if (!value) return '-';
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return formatDateOnly(value);
  return parsed.toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatRange(row: LeaveHistoryRow) {
  const startParts = extractDateOnly(row.start_date);
  const endParts = extractDateOnly(row.end_date) || startParts;
  if (!startParts) return '-';
  const startLabel = `${startParts.y}년 ${startParts.m}월 ${startParts.d}일`;
  if (!endParts || (endParts.y === startParts.y && endParts.m === startParts.m && endParts.d === startParts.d)) {
    return startLabel;
  }
  const endLabel = `${endParts.y}년 ${endParts.m}월 ${endParts.d}일`;
  return `${startLabel} ~ ${endLabel}`;
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

  // JM2: 부모(MyPageMain)가 자체 setState로 리렌더될 때마다 user prop reference가
  // 동일하더라도 useEffect deps가 `[user]` 객체 전체이면 미세한 reference 변경이
  // 누적되어 fetch가 반복 실행되며 화면이 깜빡인다. 실제로 fetch에 필요한 staff
  // 식별 정보(id/employee_no/auth_user_id/name)만 추출해 primitive 비교로 좁힌다.
  const userIdKey = typeof user?.id === 'string' ? user.id : '';
  const userEmployeeNo = typeof user?.employee_no === 'string' ? user.employee_no : '';
  const userAuthUserId = typeof user?.auth_user_id === 'string' ? user.auth_user_id : '';
  const userName = typeof user?.name === 'string' ? user.name : '';

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError('');

      try {
        // JM2: deps 좁힘으로 인해 user 전체가 아닌 식별 필드만 재구성해서 전달.
        const lookupInput: Record<string, unknown> = {
          id: userIdKey,
          employee_no: userEmployeeNo,
          auth_user_id: userAuthUserId,
          name: userName,
        };
        const resolvedUser = await resolveStaffLike(lookupInput);
        const staffId = getStaffLikeId(resolvedUser);

        if (!staffId) {
          if (!cancelled) {
            setStaff(null);
            setRows([]);
            setError('직원 계정을 확인할 수 없습니다.');
          }
          return;
        }

        const [{ data: staffData, error: staffError }, { data: leaveData, error: leaveError }, { data: balanceData, error: balanceError }] = await Promise.all([
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
          supabase
            .from('leave_balances')
            .select('expired_days, compensated_days')
            .eq('staff_id', staffId)
            .eq('year', new Date().getFullYear())
            .maybeSingle(),
        ]);

        if (staffError) throw staffError;
        if (leaveError) throw leaveError;
        if (balanceError) throw balanceError;

        const approvedRows = ((leaveData || []) as LeaveHistoryRow[]).filter(
          (row) =>
            isApprovedLeaveStatus(row.status) &&
            (isAnnualLeaveType(row.leave_type) || isHalfLeaveType(row.leave_type))
        );

        if (!cancelled) {
          const mergedStaff = {
            ...(staffData as StaffLeaveBalance | null),
            expired_days: balanceData?.expired_days ?? 0,
            compensated_days: balanceData?.compensated_days ?? 0,
          };
          setStaff(mergedStaff);
          setRows(approvedRows);
        }
      } catch (loadError) {
        // JM3: 사용자 표시용 메시지 + 디버깅용 콘솔 분리
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
  }, [userIdKey, userEmployeeNo, userAuthUserId, userName]);

  // JM2: `new Date().getFullYear()`를 매 렌더마다 호출하면 number 값은 같지만
  // useMemo deps에 매 렌더 새 number(같은 값)는 영향 없음. useMemo 1회 계산으로 충분.
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const yearRows = useMemo(
    () =>
      rows.filter((row) => {
        const startParts = extractDateOnly(row.start_date);
        const endParts = extractDateOnly(row.end_date) || startParts;
        if (!startParts) return false;
        const startYear = startParts.y;
        const endYear = endParts ? endParts.y : startYear;
        return startYear === currentYear || endYear === currentYear;
      }),
    [currentYear, rows]
  );

  const total = Number(staff?.annual_leave_total ?? user?.annual_leave_total ?? 0);
  const used = Math.max(
    Number(staff?.annual_leave_used ?? user?.annual_leave_used ?? 0),
    calculateApprovedAnnualLeaveUsage(yearRows as Record<string, unknown>[], currentYear)
  );
  const expired = Number(staff?.expired_days ?? 0);
  const compensated = Number(staff?.compensated_days ?? 0);
  const remaining = Math.max(0, total - used - expired - compensated);

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
              {rows.map((row) => {
                const rangeLabel = formatRange(row);
                const approvedLabel = row.approved_at ? formatDateTimeKst(row.approved_at) : '-';
                return (
                  <article
                    key={row.id}
                    className="grid gap-2 px-4 py-3 text-[12px] md:grid-cols-[1.4fr_0.7fr_0.6fr_1fr] md:items-center md:gap-3"
                  >
                    <div>
                      <p
                        className="font-bold text-[var(--foreground)]"
                        aria-label={`사용일자 ${rangeLabel}`}
                      >
                        {rangeLabel}
                      </p>
                      {row.reason ? (
                        <p className="mt-1 line-clamp-1 text-[11px] font-medium text-[var(--toss-gray-3)]">{row.reason}</p>
                      ) : null}
                    </div>
                    <span className="font-semibold text-[var(--toss-gray-4)]">{row.leave_type || '연차'}</span>
                    <span className="font-black text-[var(--accent)]">{getLeaveDays(row).toFixed(1)}일</span>
                    <span
                      className="text-[11px] font-medium text-[var(--toss-gray-3)]"
                      aria-label={approvedLabel === '-' ? '승인일 미기록' : `승인일 ${approvedLabel}`}
                    >
                      {approvedLabel}
                    </span>
                  </article>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
