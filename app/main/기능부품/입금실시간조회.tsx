'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  buildCompanyWebhookUrl,
  getDepositStatusLabel,
  getMatchStatusLabel,
  toAmountNumber,
  type VirtualAccountDepositRow,
} from '@/lib/virtual-account-deposits';

type DepositDraft = {
  patient_name: string;
  patient_id: string;
  transaction_label: string;
  matched_target_type: string;
  matched_target_id: string;
  matched_note: string;
  match_status: string;
};

const POLLING_INTERVAL_MS = 15000;

function formatCurrency(value: number | string | null | undefined) {
  return new Intl.NumberFormat('ko-KR').format(toAmountNumber(value));
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

function getDepositStatusClass(status: string | null | undefined) {
  switch (status) {
    case 'deposited':
      return 'bg-emerald-100 text-emerald-700';
    case 'issued':
      return 'bg-blue-100 text-blue-700';
    case 'cancelled':
      return 'bg-rose-100 text-rose-700';
    default:
      return 'bg-slate-100 text-slate-600';
  }
}

function getMatchStatusClass(status: string | null | undefined) {
  return status === 'matched'
    ? 'bg-violet-100 text-violet-700'
    : 'bg-amber-100 text-amber-700';
}

function createDraft(row: VirtualAccountDepositRow): DepositDraft {
  return {
    patient_name: row.patient_name || '',
    patient_id: row.patient_id || '',
    transaction_label: row.transaction_label || '',
    matched_target_type: row.matched_target_type || '',
    matched_target_id: row.matched_target_id || '',
    matched_note: row.matched_note || '',
    match_status: row.match_status || 'unmatched',
  };
}

export default function RealtimeDepositView({ user }: { user?: any }) {
  const [rows, setRows] = useState<VirtualAccountDepositRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DepositDraft>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [depositStatus, setDepositStatus] = useState('all');
  const [matchStatus, setMatchStatus] = useState('all');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }
  }, []);

  const loadDeposits = useCallback(async (options?: { silent?: boolean }) => {
    if (options?.silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('q', search.trim());
      if (depositStatus !== 'all') params.set('depositStatus', depositStatus);
      if (matchStatus !== 'all') params.set('matchStatus', matchStatus);

      const response = await fetch(`/api/payments/virtual-account-deposits?${params.toString()}`, {
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(String(payload?.error || '입금 내역을 불러오지 못했습니다.'));
      }

      const nextRows = Array.isArray(payload?.deposits) ? payload.deposits : [];
      setRows(nextRows);
      setDrafts((prev) => {
        const next = { ...prev };
        nextRows.forEach((row: VirtualAccountDepositRow) => {
          next[row.id] = prev[row.id] ? { ...prev[row.id] } : createDraft(row);
        });
        return next;
      });
      setLastSyncedAt(new Date().toISOString());
      setError('');
    } catch (fetchError) {
      const message =
        fetchError instanceof Error ? fetchError.message : '입금 내역을 불러오지 못했습니다.';
      console.error('입금 실시간 조회 로드 실패:', fetchError);
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [depositStatus, matchStatus, search]);

  useEffect(() => {
    loadDeposits();
  }, [loadDeposits]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      loadDeposits({ silent: true });
    }, POLLING_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [loadDeposits]);

  const webhookUrl = useMemo(
    () => (origin ? buildCompanyWebhookUrl(origin, user?.company_id || null) : ''),
    [origin, user?.company_id],
  );

  const stats = useMemo(() => {
    const todayKey = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Seoul',
    }).format(new Date());

    let todayAmount = 0;
    let unmatchedCount = 0;
    let issuedCount = 0;

    rows.forEach((row) => {
      const depositedDay = row.deposited_at ? row.deposited_at.slice(0, 10) : '';
      if (depositedDay === todayKey && row.deposit_status === 'deposited') {
        todayAmount += toAmountNumber(row.amount);
      }
      if (row.match_status !== 'matched') {
        unmatchedCount += 1;
      }
      if (row.deposit_status === 'issued') {
        issuedCount += 1;
      }
    });

    return {
      totalCount: rows.length,
      unmatchedCount,
      todayAmount,
      issuedCount,
    };
  }, [rows]);

  const handleCopyWebhookUrl = async () => {
    if (!webhookUrl) return;
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (copyError) {
      console.error('웹훅 URL 복사 실패:', copyError);
      setError('웹훅 URL을 복사하지 못했습니다.');
    }
  };

  const handleDraftChange = (id: string, field: keyof DepositDraft, value: string) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || {
          patient_name: '',
          patient_id: '',
          transaction_label: '',
          matched_target_type: '',
          matched_target_id: '',
          matched_note: '',
          match_status: 'unmatched',
        }),
        [field]: value,
      },
    }));
  };

  const handleSave = async (row: VirtualAccountDepositRow) => {
    const draft = drafts[row.id] || createDraft(row);
    setSavingId(row.id);
    setError('');

    try {
      const response = await fetch('/api/payments/virtual-account-deposits', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: row.id,
          ...draft,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(String(payload?.error || '입금 매칭 저장에 실패했습니다.'));
      }

      const saved = payload?.deposit as VirtualAccountDepositRow;
      setRows((prev) => prev.map((item) => (item.id === row.id ? saved : item)));
      setDrafts((prev) => ({
        ...prev,
        [row.id]: createDraft(saved),
      }));
    } catch (saveError) {
      const message =
        saveError instanceof Error ? saveError.message : '입금 매칭 저장에 실패했습니다.';
      console.error('입금 매칭 저장 실패:', saveError);
      setError(message);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div data-testid="realtime-deposit-view" className="space-y-4">
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-[var(--foreground)]">가상계좌 입금 실시간 조회</h2>
            <p className="text-sm text-[var(--toss-gray-3)]">
              환자 또는 거래건 기준으로 입금 내역을 확인하고 수기로 매칭할 수 있습니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="realtime-deposit-refresh"
              onClick={() => loadDeposits({ silent: true })}
              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--accent)]/40 hover:bg-[var(--toss-blue-light)]/60"
            >
              {refreshing ? '동기화 중...' : '새로고침'}
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
          <p className="text-xs font-semibold text-[var(--toss-gray-3)]">전체 입금건</p>
          <p className="mt-2 text-2xl font-bold text-[var(--foreground)]">{stats.totalCount}건</p>
        </div>
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
          <p className="text-xs font-semibold text-[var(--toss-gray-3)]">오늘 입금액</p>
          <p className="mt-2 text-2xl font-bold text-[var(--foreground)]">{formatCurrency(stats.todayAmount)}원</p>
        </div>
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
          <p className="text-xs font-semibold text-[var(--toss-gray-3)]">미매칭 건수</p>
          <p className="mt-2 text-2xl font-bold text-[var(--foreground)]">{stats.unmatchedCount}건</p>
        </div>
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
          <p className="text-xs font-semibold text-[var(--toss-gray-3)]">입금대기 계좌</p>
          <p className="mt-2 text-2xl font-bold text-[var(--foreground)]">{stats.issuedCount}건</p>
        </div>
      </div>

      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-[var(--foreground)]">현재 회사 웹훅 URL</p>
            <p className="break-all text-xs text-[var(--toss-gray-3)]">
              {webhookUrl || '브라우저 주소를 불러오는 중입니다.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="realtime-deposit-copy-webhook"
              onClick={handleCopyWebhookUrl}
              className="rounded-[var(--radius-md)] bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90"
            >
              URL 복사
            </button>
            {copied ? (
              <span className="text-xs font-semibold text-emerald-600">복사됨</span>
            ) : null}
          </div>
        </div>
        <div className="mt-3 rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-3 text-xs leading-5 text-[var(--toss-gray-2)]">
          토스 개발자센터에서는 가상계좌 웹훅으로 <span className="font-semibold text-[var(--foreground)]">DEPOSIT_CALLBACK</span>만
          등록하는 것을 권장합니다. <span className="font-semibold text-[var(--foreground)]">PAYMENT_STATUS_CHANGED</span>까지
          함께 등록하면 같은 결제건이 중복으로 들어올 수 있습니다.
        </div>
      </div>

      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1.4fr_0.8fr_0.8fr]">
          <label className="space-y-1 text-sm">
            <span className="font-semibold text-[var(--foreground)]">검색</span>
            <input
              data-testid="realtime-deposit-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="환자명, 거래건, 주문ID, 계좌번호"
              className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)]"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-semibold text-[var(--foreground)]">입금 상태</span>
            <select
              data-testid="realtime-deposit-filter-status"
              value={depositStatus}
              onChange={(event) => setDepositStatus(event.target.value)}
              className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)]"
            >
              <option value="all">전체</option>
              <option value="issued">발급/입금대기</option>
              <option value="deposited">입금완료</option>
              <option value="cancelled">취소</option>
              <option value="unknown">확인필요</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-semibold text-[var(--foreground)]">매칭 상태</span>
            <select
              data-testid="realtime-deposit-filter-match"
              value={matchStatus}
              onChange={(event) => setMatchStatus(event.target.value)}
              className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)]"
            >
              <option value="all">전체</option>
              <option value="unmatched">미매칭</option>
              <option value="matched">매칭완료</option>
            </select>
          </label>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-[var(--toss-gray-3)]">
          <span>마지막 동기화: {formatDateTime(lastSyncedAt)}</span>
          <span>{loading ? '불러오는 중...' : `${rows.length}건 표시`}</span>
        </div>
      </div>

      {error ? (
        <div className="rounded-[var(--radius-lg)] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 py-8 text-center text-sm text-[var(--toss-gray-3)] shadow-sm">
          입금 내역을 불러오는 중입니다.
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-8 text-center text-sm text-[var(--toss-gray-3)] shadow-sm">
          아직 수신된 가상계좌 입금 내역이 없습니다.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const draft = drafts[row.id] || createDraft(row);
            return (
              <article
                key={row.id}
                data-testid={`realtime-deposit-row-${row.id}`}
                className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-bold text-[var(--foreground)]">
                        {row.transaction_label || row.order_name || row.order_id || '미지정 거래건'}
                      </h3>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${getDepositStatusClass(row.deposit_status)}`}
                      >
                        {getDepositStatusLabel(row.deposit_status)}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${getMatchStatusClass(row.match_status)}`}
                      >
                        {getMatchStatusLabel(row.match_status)}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--toss-gray-3)]">
                      주문ID {row.order_id || '-'} · 결제키 {row.payment_key || '-'} · 거래키 {row.transaction_key || '-'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-[var(--foreground)]">{formatCurrency(row.amount)}원</p>
                    <p className="mt-1 text-xs text-[var(--toss-gray-3)]">
                      입금시각 {formatDateTime(row.deposited_at || row.created_at)}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-3">
                    <p className="text-[11px] font-semibold text-[var(--toss-gray-3)]">입금자</p>
                    <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">
                      {row.depositor_name || row.customer_name || '-'}
                    </p>
                  </div>
                  <div className="rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-3">
                    <p className="text-[11px] font-semibold text-[var(--toss-gray-3)]">계좌</p>
                    <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">
                      {[row.bank_name || row.bank_code || '-', row.account_number || '-'].join(' / ')}
                    </p>
                  </div>
                  <div className="rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-3">
                    <p className="text-[11px] font-semibold text-[var(--toss-gray-3)]">환자</p>
                    <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">
                      {row.patient_name || '-'}
                    </p>
                  </div>
                  <div className="rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-3">
                    <p className="text-[11px] font-semibold text-[var(--toss-gray-3)]">거래건</p>
                    <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">
                      {row.transaction_label || '-'}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                  <label className="space-y-1 text-sm">
                    <span className="font-semibold text-[var(--foreground)]">환자명</span>
                    <input
                      data-testid={`realtime-deposit-patient-name-${row.id}`}
                      value={draft.patient_name}
                      onChange={(event) => handleDraftChange(row.id, 'patient_name', event.target.value)}
                      className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 outline-none transition focus:border-[var(--accent)]"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="font-semibold text-[var(--foreground)]">환자 ID</span>
                    <input
                      value={draft.patient_id}
                      onChange={(event) => handleDraftChange(row.id, 'patient_id', event.target.value)}
                      className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 outline-none transition focus:border-[var(--accent)]"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="font-semibold text-[var(--foreground)]">거래건</span>
                    <input
                      data-testid={`realtime-deposit-transaction-label-${row.id}`}
                      value={draft.transaction_label}
                      onChange={(event) => handleDraftChange(row.id, 'transaction_label', event.target.value)}
                      className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 outline-none transition focus:border-[var(--accent)]"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="font-semibold text-[var(--foreground)]">매칭 구분</span>
                    <select
                      value={draft.matched_target_type}
                      onChange={(event) =>
                        handleDraftChange(row.id, 'matched_target_type', event.target.value)
                      }
                      className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 outline-none transition focus:border-[var(--accent)]"
                    >
                      <option value="">선택 안 함</option>
                      <option value="patient">환자</option>
                      <option value="transaction">거래건</option>
                      <option value="patient+transaction">환자+거래건</option>
                      <option value="manual">수기확인</option>
                    </select>
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="font-semibold text-[var(--foreground)]">매칭 대상 ID</span>
                    <input
                      value={draft.matched_target_id}
                      onChange={(event) => handleDraftChange(row.id, 'matched_target_id', event.target.value)}
                      className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 outline-none transition focus:border-[var(--accent)]"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="font-semibold text-[var(--foreground)]">매칭 상태</span>
                    <select
                      value={draft.match_status}
                      onChange={(event) => handleDraftChange(row.id, 'match_status', event.target.value)}
                      className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 outline-none transition focus:border-[var(--accent)]"
                    >
                      <option value="unmatched">미매칭</option>
                      <option value="matched">매칭완료</option>
                    </select>
                  </label>
                </div>

                <label className="mt-3 block space-y-1 text-sm">
                  <span className="font-semibold text-[var(--foreground)]">메모</span>
                  <textarea
                    value={draft.matched_note}
                    onChange={(event) => handleDraftChange(row.id, 'matched_note', event.target.value)}
                    rows={3}
                    className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 outline-none transition focus:border-[var(--accent)]"
                    placeholder="환자 상태, 입금 확인 메모, 거래건 설명 등을 남겨주세요."
                  />
                </label>

                <div className="mt-4 flex flex-col gap-2 text-xs text-[var(--toss-gray-3)] sm:flex-row sm:items-center sm:justify-between">
                  <span>최종 갱신 {formatDateTime(row.updated_at || row.created_at)}</span>
                  <button
                    type="button"
                    data-testid={`realtime-deposit-save-${row.id}`}
                    onClick={() => handleSave(row)}
                    disabled={savingId === row.id}
                    className="rounded-[var(--radius-md)] bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {savingId === row.id ? '저장 중...' : '매칭 저장'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
