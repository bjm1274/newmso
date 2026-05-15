'use client';

/**
 * 모바일연차 — Phase3 §3 (근태 통합 3/3)
 *
 * 모바일 뷰포트(<768px)에서 사용하는 본인 연차 화면.
 * 데스크탑 마이페이지/연차휴가내역 패널이 가진 종합 대시보드를 단순화하고
 * "잔여 강조 + 사용 내역 + 신청 진입(FAB → BottomSheet)"에 집중한다.
 *
 * 데이터는 기존 staff_members.annual_leave_total/used 와 leave_requests를 그대로 사용한다.
 * (신규 라우트 없음, 클라이언트 직접 조회 — 기존 패턴 보존: JM3)
 *
 * JM:  ~280줄 단일 책임 — 본인 잔여/내역 조회 + 신청 진입
 * JM3: 조회 실패는 인라인 메시지, 부분 데이터(잔여만 / 내역만)도 표시
 * JM4: props 타입 명시, any 금지, leave_requests row는 좁은 타입으로 단정
 * JM5: 신청 폼에서 일자/사유 검증 (시트 컴포넌트에 위임)
 * JM6: FAB 64px(터치 44px+), 시트 키보드 trap, 시맨틱 button/section
 */

import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import {
  calculateApprovedAnnualLeaveUsage,
  calculateLeaveDays,
  isAnnualLeaveType,
  isApprovedLeaveStatus,
  isHalfLeaveType,
} from '@/lib/annual-leave-ledger';
import { ResponsiveTable, type Column } from '@/app/components/ResponsiveTable';
import 연차신청시트 from './연차신청시트';

export type 모바일연차Props = {
  /** 직원 ID (staff_members.id). 비어 있으면 안내 메시지 노출. */
  staffId: string;
  /** 표시용 직원명 (선택). */
  staffName?: string;
};

type StaffBalanceRow = {
  id: string | null;
  annual_leave_total: number | null;
  annual_leave_used: number | null;
};

type LeaveHistoryRow = {
  id: string;
  leave_type: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string | null;
  reason: string | null;
  approved_at: string | null;
  created_at: string | null;
};

type HistoryItem = LeaveHistoryRow & {
  days: number;
  rangeLabel: string;
  statusLabel: string;
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  대기: 'bg-amber-50 text-amber-700 border-amber-200',
  승인: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  반려: 'bg-red-50 text-red-700 border-red-200',
};

function formatDate(value: unknown): string {
  if (!value) return '-';
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return String(value).slice(0, 10);
  return parsed.toLocaleDateString('ko-KR', {
    month: 'short',
    day: 'numeric',
  });
}

function formatRange(start: string | null, end: string | null): string {
  const s = String(start || '');
  const e = String(end || start || '');
  if (!s) return '-';
  if (!e || s === e) return formatDate(s);
  return `${formatDate(s)} ~ ${formatDate(e)}`;
}

function computeDays(row: LeaveHistoryRow): number {
  if (isHalfLeaveType(row.leave_type)) return 0.5;
  return calculateLeaveDays(row.start_date, row.end_date);
}

export default function 모바일연차({ staffId, staffName }: 모바일연차Props) {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [balance, setBalance] = useState<StaffBalanceRow | null>(null);
  const [rows, setRows] = useState<LeaveHistoryRow[]>([]);
  const [showSheet, setShowSheet] = useState<boolean>(false);
  const [reloadKey, setReloadKey] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!staffId) {
        setLoading(false);
        setError('직원 계정 정보가 없습니다.');
        setBalance(null);
        setRows([]);
        return;
      }
      setLoading(true);
      setError('');
      try {
        const [balanceRes, leavesRes] = await Promise.all([
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
            .order('created_at', { ascending: false })
            .limit(50),
        ]);
        if (balanceRes.error) throw balanceRes.error;
        if (leavesRes.error) throw leavesRes.error;
        if (cancelled) return;
        setBalance((balanceRes.data as StaffBalanceRow | null) ?? null);
        setRows((leavesRes.data as LeaveHistoryRow[] | null) ?? []);
      } catch (err) {
        if (cancelled) return;
        const detail = err instanceof Error ? err.message : '알 수 없는 오류';
        setError(`연차 정보를 불러오지 못했습니다: ${detail}`);
        setBalance(null);
        setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [staffId, reloadKey]);

  const currentYear = new Date().getFullYear();

  // 잔여 계산: staff_members 의 값과 leave_requests 승인분 중 큰 쪽을 채택
  // (기존 연차휴가내역.tsx 동작과 동일)
  const totalDays = Number(balance?.annual_leave_total ?? 0);
  const usedFromRequests = useMemo(() => {
    const approved = rows.filter(
      (r) =>
        isApprovedLeaveStatus(r.status) &&
        (isAnnualLeaveType(r.leave_type) || isHalfLeaveType(r.leave_type)),
    );
    return calculateApprovedAnnualLeaveUsage(approved as Record<string, unknown>[], currentYear);
  }, [rows, currentYear]);
  const usedDays = Math.max(Number(balance?.annual_leave_used ?? 0), usedFromRequests);
  const remainingDays = Math.max(0, totalDays - usedDays);

  const historyItems: HistoryItem[] = useMemo(
    () =>
      rows.map((r) => ({
        ...r,
        days: computeDays(r),
        rangeLabel: formatRange(r.start_date, r.end_date),
        statusLabel: r.status ?? '대기',
      })),
    [rows],
  );

  const columns: Column<HistoryItem>[] = useMemo(
    () => [
      {
        key: 'rangeLabel',
        label: '기간',
        primary: true,
        showOnMobile: true,
        render: (row) => (
          <div className="flex flex-col">
            <span className="font-bold text-[var(--foreground)]">{row.rangeLabel}</span>
            {row.reason ? (
              <span className="mt-0.5 line-clamp-1 text-xs text-[var(--toss-gray-3)]">{row.reason}</span>
            ) : null}
          </div>
        ),
      },
      {
        key: 'leave_type',
        label: '유형',
        showOnMobile: true,
        render: (row) => row.leave_type ?? '-',
      },
      {
        key: 'days',
        label: '일수',
        align: 'right',
        showOnMobile: true,
        render: (row) => (
          <span className="font-bold text-[var(--accent)]">{row.days.toFixed(1)}일</span>
        ),
      },
      {
        key: 'statusLabel',
        label: '상태',
        showOnMobile: true,
        render: (row) => (
          <span
            className={`inline-flex items-center rounded-[var(--radius-md)] border px-2 py-0.5 text-[11px] font-bold ${
              STATUS_BADGE_CLASS[row.statusLabel] ?? 'bg-[var(--muted)] text-[var(--toss-gray-4)] border-[var(--border)]'
            }`}
          >
            {row.statusLabel}
          </span>
        ),
      },
    ],
    [],
  );

  const handleSubmitted = useCallback(() => {
    setReloadKey((k) => k + 1);
  }, []);

  return (
    <div className="relative flex flex-col gap-4 p-4 pb-[calc(var(--mobile-bottomtab-height,64px)+88px)]">
      {/* 잔여 강조 카드 */}
      <section
        aria-label="연차 잔여"
        className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--toss-blue-light)] p-5 shadow-sm"
      >
        <p className="text-xs font-bold text-[var(--accent)]">
          {staffName ? `${staffName} 님의 ` : ''}잔여 연차 ({currentYear}년)
        </p>
        <p className="mt-2 text-4xl font-black leading-none text-[var(--accent)] tabular-nums">
          {remainingDays.toFixed(1)}
          <span className="ml-1 text-lg font-bold">일</span>
        </p>
        <p className="mt-2 text-xs font-semibold text-[var(--toss-gray-4)]">
          총 {totalDays.toFixed(1)}일 · 사용 {usedDays.toFixed(1)}일
        </p>
      </section>

      {/* 사용 내역 */}
      <section
        aria-label="연차 사용 내역"
        className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-black text-[var(--foreground)]">신청 내역</h2>
          <span className="rounded-[var(--radius-md)] bg-[var(--muted)] px-2 py-0.5 text-xs font-bold text-[var(--accent)]">
            {historyItems.length}건
          </span>
        </div>

        {loading ? (
          <div className="rounded-[var(--radius-md)] bg-[var(--muted)] p-4 text-xs font-semibold text-[var(--toss-gray-3)]">
            연차 정보를 불러오는 중입니다...
          </div>
        ) : error ? (
          <div
            role="alert"
            className="rounded-[var(--radius-md)] border border-red-100 bg-red-50 p-3 text-xs font-bold text-red-600"
          >
            {error}
          </div>
        ) : (
          <ResponsiveTable
            columns={columns}
            rows={historyItems}
            keyField="id"
            emptyMessage="아직 신청한 연차가 없습니다."
          />
        )}
      </section>

      {/* 신청 FAB — 모바일 바텀탭 위에 고정 (JM6: 64px 터치 영역) */}
      <button
        type="button"
        onClick={() => setShowSheet(true)}
        disabled={!staffId}
        aria-label="연차 신청"
        className="fixed right-4 z-40 flex h-14 items-center gap-2 rounded-[var(--radius-xl)] bg-[var(--accent)] px-5 text-sm font-bold text-white shadow-lg disabled:opacity-50"
        style={{ bottom: 'calc(var(--mobile-bottomtab-height, 64px) + 16px)' }}
      >
        <span aria-hidden="true" className="text-lg leading-none">+</span>
        연차 신청
      </button>

      {/* 신청 시트 */}
      <연차신청시트
        open={showSheet}
        onClose={() => setShowSheet(false)}
        staffId={staffId}
        onSubmitted={handleSubmitted}
      />
    </div>
  );
}
