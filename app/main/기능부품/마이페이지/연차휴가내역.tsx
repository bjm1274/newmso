'use client';

import { useEffect, useState } from 'react';

import {
  useAnnualLeaveSummary,
  type LeaveHistoryItem,
} from '@/lib/annual-leave-summary';
import { getStaffLikeId, resolveStaffLike } from '@/lib/staff-identity';
import { LucideIcon } from '../조직도서브/조직도측면창';

type Props = {
  user?: Record<string, unknown> | null;
  onBack?: () => void;
};

function formatDateOnlyFromIso(iso: string) {
  const raw = String(iso || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return '-';
  return `${Number(match[1])}년 ${Number(match[2])}월 ${Number(match[3])}일`;
}

function formatDateTimeKst(value: unknown) {
  if (!value) return '-';
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return formatDateOnlyFromIso(String(value));
  return parsed.toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'short',
    day: 'numeric' });
}

function formatRangeFromItem(row: LeaveHistoryItem) {
  const start = row.start_date;
  const end = row.end_date || start;
  if (!start) return '-';
  const startLabel = formatDateOnlyFromIso(start);
  if (!end || end === start) return startLabel;
  return `${startLabel} ~ ${formatDateOnlyFromIso(end)}`;
}

export default function AnnualLeaveUsagePanel({ user, onBack }: Props) {
  // JM2: user 객체 전체가 아닌 식별 primitive 만 deps — 리렌더 시 불필요 fetch 방지
  const userIdKey = typeof user?.id === 'string' ? user.id : '';
  const userEmployeeNo = typeof user?.employee_no === 'string' ? user.employee_no : '';
  const userAuthUserId = typeof user?.auth_user_id === 'string' ? user.auth_user_id : '';
  const userName = typeof user?.name === 'string' ? user.name : '';

  const seedId = getStaffLikeId(user) || null;
  const [staffId, setStaffId] = useState<string | null>(seedId);
  const [resolveError, setResolveError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const lookupInput: Record<string, unknown> = {
      id: userIdKey,
      employee_no: userEmployeeNo,
      auth_user_id: userAuthUserId,
      name: userName,
    };
    const direct = getStaffLikeId(lookupInput);
    if (direct) {
      setStaffId(direct);
      setResolveError('');
      return;
    }
    void (async () => {
      try {
        const resolved = await resolveStaffLike(lookupInput);
        if (cancelled) return;
        const id = getStaffLikeId(resolved) || null;
        setStaffId(id);
        setResolveError(id ? '' : '직원 계정을 확인할 수 없습니다.');
      } catch {
        if (!cancelled) {
          setStaffId(null);
          setResolveError('직원 계정을 확인할 수 없습니다.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userIdKey, userEmployeeNo, userAuthUserId, userName]);

  const summary = useAnnualLeaveSummary(staffId);
  const loading = summary.loading;
  const error = resolveError || summary.error || '';
  // 전체 내역(발생+사용) — 인사 연차 현황과 동일 원장(leave_ledger) 기준
  const rows = summary.history;
  const usageRows = summary.approvedHistory;
  const total = summary.total;
  const used = summary.used;
  const remaining = summary.remaining;

  const [syncing, setSyncing] = useState(false);

  const handleRecalculate = async () => {
    if (!staffId || syncing) return;
    setSyncing(true);
    try {
      await fetch('/api/admin/annual-leave/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId }),
      }).catch(() => null);
      await summary.reload(true);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--toss-gray-3)]">연차휴가</p>
            <h2 className="mt-1 text-[18px] font-black text-[var(--foreground)]">연차 · 휴가 내역</h2>
            <p className="mt-1 text-[11px] font-semibold text-[var(--toss-gray-3)]">
              인사관리 연차 현황과 동일한 원장 기준 (본인 내역만)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRecalculate}
              disabled={syncing || loading}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--accent)] bg-[var(--toss-blue-light)] px-3 text-[12px] font-bold text-[var(--accent)] shadow-sm transition-all hover:bg-[var(--accent)] hover:text-white disabled:opacity-50"
            >
              <LucideIcon name="RefreshCw" size={14} className={syncing ? 'animate-spin' : ''} />
              {syncing ? '재계산 중...' : '연차 재계산 / 새로고침'}
            </button>
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 text-[12px] font-bold text-[var(--toss-gray-4)] shadow-sm transition-all hover:bg-[var(--muted)]"
              >
                <LucideIcon name="ArrowLeft" size={15} />
                개요로 돌아가기
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-[var(--radius-md)] bg-[var(--muted)] p-3">
            <p className="text-[11px] font-bold text-[var(--toss-gray-3)]">총 연차</p>
            <p className="mt-1 text-[20px] font-black text-[var(--foreground)]">
              {loading ? '…' : `${total.toFixed(1)}일`}
            </p>
          </div>
          <div className="rounded-[var(--radius-md)] bg-[var(--muted)] p-3">
            <p className="text-[11px] font-bold text-[var(--toss-gray-3)]">올해 사용</p>
            <p className="mt-1 text-[20px] font-black text-[var(--foreground)]">
              {loading ? '…' : `${used.toFixed(1)}일`}
            </p>
          </div>
          <div className="rounded-[var(--radius-md)] bg-[var(--toss-blue-light)] p-3">
            <p className="text-[11px] font-bold text-[var(--accent)]">잔여 연차</p>
            <p className="mt-1 text-[20px] font-black text-[var(--accent)]">
              {loading ? '…' : `${remaining.toFixed(1)}일`}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-[14px] font-bold text-[var(--foreground)]">발생 · 사용 내역</h3>
            <p className="mt-0.5 text-[11px] text-[var(--toss-gray-3)]">
              사용 {usageRows.length}건 · 전체 {rows.length}건
            </p>
          </div>
          <span className="rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-1 text-[12px] font-black text-[var(--accent)]">
            {rows.length}건
          </span>
        </div>

        {loading ? (
          <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] p-4 text-[12px] font-semibold text-[var(--toss-gray-3)]">
            연차·휴가 내역을 불러오는 중입니다...
          </div>
        ) : error ? (
          <div className="rounded-[var(--radius-md)] border border-red-100 bg-red-50 p-4 text-[12px] font-bold text-red-600">
            {error}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] p-4 text-[12px] font-semibold text-[var(--toss-gray-4)]">
            표시할 연차·휴가 내역이 없습니다.
          </div>
        ) : (
          <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)]">
            <div className="hidden grid-cols-[1.2fr_1fr_0.6fr_1fr] gap-3 bg-[var(--muted)] px-4 py-3 text-[11px] font-bold text-[var(--toss-gray-3)] md:grid">
              <span>일자</span>
              <span>유형</span>
              <span>일수</span>
              <span>사유</span>
            </div>
            <div className="divide-y divide-[var(--border)]">
              {rows.map((row) => {
                const rangeLabel = formatRangeFromItem(row);
                const isUse = String(row.leave_type || '').includes('사용');
                const daysLabel =
                  row.daysLabel ||
                  `${isUse ? '-' : '+'}${Number(row.days || 0).toFixed(1)}일`;
                return (
                  <article
                    key={row.id}
                    className="grid gap-2 px-4 py-3 text-[12px] md:grid-cols-[1.2fr_1fr_0.6fr_1fr] md:items-center md:gap-3"
                  >
                    <div>
                      <p
                        className="font-bold text-[var(--foreground)]"
                        aria-label={`일자 ${rangeLabel}`}
                      >
                        {rangeLabel}
                      </p>
                    </div>
                    <span
                      className={`font-semibold ${
                        isUse ? 'text-rose-600' : 'text-emerald-700'
                      }`}
                    >
                      {row.leave_type || '연차'}
                    </span>
                    <span className={`font-black ${isUse ? 'text-rose-600' : 'text-[var(--accent)]'}`}>
                      {daysLabel}
                    </span>
                    <span
                      className="line-clamp-2 text-[11px] font-medium text-[var(--toss-gray-3)]"
                      title={row.reason || ''}
                    >
                      {row.reason || '-'}
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
