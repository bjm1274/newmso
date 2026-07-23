/**
 * 연차 잔여/사용 내역 — 클라이언트 UI SSOT.
 *
 * 모든 화면(모바일 홈·내정보 연차·인사 연차·연차계획·PC 홈 KPI·PC 연차패널)은
 * 이 모듈의 계산 또는 useAnnualLeaveSummary 훅만 사용한다.
 *
 * 공식 (당해 연도 스코프):
 *   total     = leave_balances.total_days ?? staff.annual_leave_total ?? 0  (15일 폴백 금지)
 *   used      = leave_balances 있으면 max(balance.used, ledger 당해 재집계)
 *             없으면 ledger 당해 재집계 (staff.annual_leave_used 는 다년도 누적이라 제외)
 *   expired   = leave_balances.expired_days ?? 0
 *   compensated = leave_balances.compensated_days ?? 0
 *   remaining = remaining_days 가 있고 used 가 ledger 로 상향되지 않았으면 remaining_days
 *             아니면 max(0, total − used − expired − compensated)
 *
 * staff.annual_leave_used 를 max()에 넣지 않음 — 레거시 다년도 합이 잔여를 0으로 만드는 버그 방지.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  calculateApprovedAnnualLeaveUsage,
  calculateLeaveDays,
  isAnnualLeaveType,
  isApprovedLeaveStatus,
  isHalfLeaveType,
} from '@/lib/annual-leave-ledger';
import { getKoreanTodayString } from '@/lib/seoul-time';

export type LeaveHistoryStatus = '승인' | '대기' | '반려';

export type LeaveHistoryItem = {
  id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  days: number;
  /** 표시용 "N일" / "0.5일" */
  daysLabel: string;
  dateLabel: string;
  status: LeaveHistoryStatus;
  reason?: string | null;
  approved_at?: string | null;
  created_at?: string | null;
};

export type AnnualLeaveSummary = {
  total: number;
  used: number;
  remaining: number;
  expired: number;
  compensated: number;
  usageRate: number;
  /** 연차·반차 전부 (대기/승인/반려) — 신청 내역 UI */
  history: LeaveHistoryItem[];
  /** 승인분만 — 사용 내역/ledger와 동일 */
  approvedHistory: LeaveHistoryItem[];
  year: number;
  loading: boolean;
  error: string | null;
  /** leave_balances 행 존재 여부 */
  hasBalanceRow: boolean;
};

export type AnnualLeaveSummaryInput = {
  staffTotal?: number | null;
  staffUsed?: number | null;
  balanceTotal?: number | null;
  balanceUsed?: number | null;
  /** leave_balances.remaining_days — 있으면 used 미상향 시 우선 */
  balanceRemaining?: number | null;
  expired?: number | null;
  compensated?: number | null;
  leaveRows?: Array<Record<string, unknown>> | null;
  year?: number;
};

function currentLeaveYear(): number {
  // KST 기준 연도 (디바이스 로컬 연도와 분리)
  return Number(getKoreanTodayString().slice(0, 4));
}

export function normalizeLeaveStatus(raw: unknown): LeaveHistoryStatus {
  const s = String(raw ?? '').trim().toLowerCase();
  if (s === '승인' || s === 'approved') return '승인';
  if (s === '반려' || s === 'rejected') return '반려';
  return '대기';
}

export function getLeaveDaysForRow(row: {
  leave_type?: unknown;
  start_date?: unknown;
  end_date?: unknown;
  days?: unknown;
}): number {
  if (isHalfLeaveType(row.leave_type)) return 0.5;
  const dbDays = row.days != null ? Number(row.days) : null;
  if (dbDays != null && !Number.isNaN(dbDays) && dbDays > 0) return dbDays;
  const start = String(row.start_date ?? '').slice(0, 10);
  const end = String(row.end_date ?? start).slice(0, 10);
  return calculateLeaveDays(start, end);
}

function formatDateDot(iso: string): string {
  return iso.replace(/-/g, '.');
}

function formatRangeLabel(start: string, end: string): string {
  if (!start) return '-';
  if (!end || start === end) return formatDateDot(start);
  return `${formatDateDot(start)} ~ ${formatDateDot(end.slice(0, 10))}`;
}

export function isCountableLeaveType(leaveType: unknown): boolean {
  return isAnnualLeaveType(leaveType) || isHalfLeaveType(leaveType);
}

export function mapLeaveHistoryItem(row: Record<string, unknown>): LeaveHistoryItem {
  const start = String(row.start_date ?? '').slice(0, 10);
  const end = String(row.end_date ?? start).slice(0, 10);
  const days = getLeaveDaysForRow({
    leave_type: row.leave_type,
    start_date: start,
    end_date: end,
  });
  return {
    id: String(row.id ?? `${start}-${end}`),
    leave_type: String(row.leave_type ?? '연차'),
    start_date: start,
    end_date: end,
    days,
    daysLabel: `${days}일`,
    dateLabel: formatRangeLabel(start, end),
    status: normalizeLeaveStatus(row.status),
    reason: typeof row.reason === 'string' ? row.reason : null,
    approved_at: typeof row.approved_at === 'string' ? row.approved_at : null,
    created_at: typeof row.created_at === 'string' ? row.created_at : null,
  };
}

/**
 * 순수 계산 — 훅/서버 결과 없이 동일 공식 적용.
 * 15일 폴백 없음.
 */
export function computeAnnualLeaveSummary(input: AnnualLeaveSummaryInput): Omit<
  AnnualLeaveSummary,
  'loading' | 'error' | 'hasBalanceRow'
> & { hasBalanceRow: boolean } {
  const year = input.year ?? currentLeaveYear();
  const rows = Array.isArray(input.leaveRows) ? input.leaveRows : [];

  const hasBalanceTotal = input.balanceTotal != null && !Number.isNaN(Number(input.balanceTotal));
  const hasBalanceUsed = input.balanceUsed != null && !Number.isNaN(Number(input.balanceUsed));
  const hasBalanceRemaining =
    input.balanceRemaining != null && !Number.isNaN(Number(input.balanceRemaining));
  const hasBalanceRow = hasBalanceTotal || hasBalanceUsed || hasBalanceRemaining
    || input.expired != null || input.compensated != null;

  const total = Number(
    hasBalanceTotal ? input.balanceTotal : (input.staffTotal ?? 0),
  ) || 0;

  // 당해 연도 원장 재집계 (leave_requests 승인분). staff.used 는 다년도 누적이라 쓰지 않음.
  const ledgerUsed = calculateApprovedAnnualLeaveUsage(rows, year);
  const balanceUsed = hasBalanceUsed ? Number(input.balanceUsed) || 0 : 0;
  // balance 행이 있으면 원장과 큰 쪽(미동기화 보완), 없으면 원장만. staff fallback 금지.
  const usedBoostedByLedger = hasBalanceUsed && ledgerUsed > balanceUsed + 1e-9;
  const used = hasBalanceUsed
    ? Math.max(balanceUsed, ledgerUsed)
    : ledgerUsed;

  const expired = Number(input.expired ?? 0) || 0;
  const compensated = Number(input.compensated ?? 0) || 0;
  // 잔여 공식 SSOT: total − used − expired − compensated
  // DB leave_balances.remaining_days 가 수동수정/미동기화 등으로 어긋날 수 있으므로 항상 정밀 계산 공식 적용
  const remaining = Math.max(
    0,
    Math.round((total - used - expired - compensated) * 100) / 100,
  );
  const usageRate = total > 0 ? Math.round((used / total) * 100) : 0;

  // 당해 연도 내역만 (KPI used 와 목록 합 일치). 시작·종료 중 하나라도 당해면 포함.
  const inYear = (start: string, end: string) => {
    const sy = Number(String(start).slice(0, 4));
    const ey = Number(String(end || start).slice(0, 4));
    return sy === year || ey === year;
  };

  const history = rows
    .filter((r) => isCountableLeaveType(r.leave_type))
    .map(mapLeaveHistoryItem)
    .filter((h) => inYear(h.start_date, h.end_date));

  const approvedHistory = history.filter(
    (h) => h.status === '승인' && (isAnnualLeaveType(h.leave_type) || isHalfLeaveType(h.leave_type)),
  );

  return {
    total,
    used,
    remaining,
    expired,
    compensated,
    usageRate,
    history,
    approvedHistory,
    year,
    hasBalanceRow,
  };
}

const EMPTY: AnnualLeaveSummary = {
  total: 0,
  used: 0,
  remaining: 0,
  expired: 0,
  compensated: 0,
  usageRate: 0,
  history: [],
  approvedHistory: [],
  year: currentLeaveYear(),
  loading: true,
  error: null,
  hasBalanceRow: false,
};

const LEAVE_SUMMARY_STALE_TIME_MS = 60 * 1000;
const leaveSummaryCache = new Map<string, { data: AnnualLeaveSummary; timestamp: number }>();

export function invalidateAnnualLeaveCache(staffId?: string) {
  if (staffId) {
    leaveSummaryCache.delete(staffId);
  } else {
    leaveSummaryCache.clear();
  }
}

/**
 * staffId 기준 연차 요약 훅. staffId 없으면 로딩 종료 + 0.
 */
export function useAnnualLeaveSummary(staffId: string | null | undefined): AnnualLeaveSummary & {
  reload: (force?: boolean) => Promise<void>;
} {
  const [state, setState] = useState<AnnualLeaveSummary>(() => {
    if (staffId && leaveSummaryCache.has(staffId)) {
      const cached = leaveSummaryCache.get(staffId);
      if (cached && Date.now() - cached.timestamp < LEAVE_SUMMARY_STALE_TIME_MS) {
        return cached.data;
      }
    }
    return EMPTY;
  });

  const reload = useCallback(async (force = false) => {
    if (!staffId) {
      setState({ ...EMPTY, loading: false, year: currentLeaveYear() });
      return;
    }

    const now = Date.now();
    const cached = leaveSummaryCache.get(staffId);
    if (!force && cached && now - cached.timestamp < LEAVE_SUMMARY_STALE_TIME_MS) {
      setState(cached.data);
      return;
    }

    setState((prev) => (prev.loading ? prev : { ...prev, loading: true, error: null }));
    const year = currentLeaveYear();
    try {
      const response = await fetch(`/api/annual-leave/summary?staffId=${encodeURIComponent(staffId)}`, {
        credentials: 'same-origin',
      });
      const payload = await response.json() as {
        error?: string;
        summary?: {
          total: number;
          used: number;
          expired: number;
          compensated: number;
          remaining: number;
          cycle: { start: string; end: string };
          entries: Array<{
            id: string;
            entryType: string;
            days: number;
            occurredOn: string;
            note?: string | null;
          }>;
        };
      };
      if (!response.ok || !payload.summary) throw new Error(payload.error || 'Could not load annual leave.');

      const summary = payload.summary;
      const history = summary.entries
        .filter((entry) => entry.entryType === 'use')
        .map((entry) => ({
          id: entry.id,
          leave_type: '연차',
          start_date: entry.occurredOn,
          end_date: entry.occurredOn,
          days: Math.abs(Number(entry.days) || 0),
          daysLabel: `${Math.abs(Number(entry.days) || 0)}일`,
          dateLabel: formatDateDot(entry.occurredOn),
          status: '승인' as LeaveHistoryStatus,
          reason: entry.note ?? null,
          approved_at: null,
          created_at: null,
        }));
      const total = Number(summary.total) || 0;
      const used = Number(summary.used) || 0;
      const nextState: AnnualLeaveSummary = {
        total,
        used,
        remaining: Number(summary.remaining) || 0,
        expired: Number(summary.expired) || 0,
        compensated: Number(summary.compensated) || 0,
        usageRate: total > 0 ? Math.round((used / total) * 100) : 0,
        history,
        approvedHistory: history,
        year: Number(summary.cycle.start.slice(0, 4)) || year,
        hasBalanceRow: true,
        loading: false,
        error: null,
      };

      leaveSummaryCache.set(staffId, { data: nextState, timestamp: Date.now() });
      setState(nextState);    } catch (err) {
      console.error('[useAnnualLeaveSummary]', err);
      setState({
        ...EMPTY,
        loading: false,
        year,
        error: null,
      });
    }
  }, [staffId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleUpdate = () => {
      if (staffId) invalidateAnnualLeaveCache(staffId);
      void reload(true);
    };
    window.addEventListener('erp-leave-updated', handleUpdate as EventListener);
    window.addEventListener('erp-annual-leave-updated', handleUpdate as EventListener);
    return () => {
      window.removeEventListener('erp-leave-updated', handleUpdate as EventListener);
      window.removeEventListener('erp-annual-leave-updated', handleUpdate as EventListener);
    };
  }, [staffId, reload]);

  return { ...state, reload };
}
