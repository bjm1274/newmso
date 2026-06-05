'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useActionDialog } from '@/app/components/useActionDialog';
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
      return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300';
    case 'issued':
      return 'bg-blue-500/20 text-blue-700';
    case 'cancelled':
      return 'bg-rose-500/15 text-rose-700 dark:text-rose-300';
    default:
      return 'bg-[var(--muted)] text-[var(--toss-gray-4)]';
  }
}

function getMatchStatusClass(status: string | null | undefined) {
  return status === 'matched'
    ? 'bg-violet-500/15 text-violet-700 dark:text-violet-300'
    : 'bg-amber-500/15 text-amber-700 dark:text-amber-300';
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

const TOSS_BANK_ACCOUNT = '1002-4939-3286';

export default function RealtimeDepositView({ user }: { user?: any }) {
  const { dialog, openConfirm } = useActionDialog();
  const [activeTab, setActiveTab] = useState<'list' | 'manual' | 'guide'>('list');
  const [rows, setRows] = useState<VirtualAccountDepositRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DepositDraft>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [depositStatus, setDepositStatus] = useState('all');

  // 수동 입금 등록 상태
  const [manualForm, setManualForm] = useState({
    depositor_name: '',
    amount: '',
    patient_name: '',
    transaction_label: '',
    matched_note: '',
    deposited_at: new Date().toISOString().slice(0, 16),
  });
  const [manualSaving, setManualSaving] = useState(false);
  const [manualError, setManualError] = useState('');

  // 웹훅 테스트 상태
  const [webhookTesting, setWebhookTesting] = useState(false);
  const [webhookTestResult, setWebhookTestResult] = useState<{ok: boolean; msg: string} | null>(null);

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

  // 수동 입금 등록
  const handleManualSubmit = async () => {
    setManualError('');
    if (!manualForm.depositor_name.trim()) { setManualError('입금자명을 입력해주세요.'); return; }
    if (!manualForm.amount || Number(manualForm.amount.replace(/,/g, '')) <= 0) { setManualError('금액을 올바르게 입력해주세요.'); return; }

    setManualSaving(true);
    try {
      const res = await fetch('/api/payments/virtual-account-deposits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...manualForm,
          deposited_at: manualForm.deposited_at ? new Date(manualForm.deposited_at).toISOString() : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '등록 실패');
      setManualForm({ depositor_name: '', amount: '', patient_name: '', transaction_label: '', matched_note: '', deposited_at: new Date().toISOString().slice(0, 16) });
      await loadDeposits({ silent: true });
      setActiveTab('list');
    } catch (e: any) {
      setManualError(e.message);
    } finally {
      setManualSaving(false);
    }
  };

  // 수동 등록건 삭제
  const handleDeleteDeposit = async (id: string) => {
    const target = rows.find((row) => String(row.id) === id);
    const confirmed = await openConfirm({
      title: '입금 내역 삭제',
      description: `${target?.patient_name || '선택한 입금 내역'}을 삭제합니다.\n수동 등록 내역에서 제거됩니다.`,
      confirmText: '삭제',
      tone: 'danger',
    });
    if (!confirmed) return;
    const res = await fetch(`/api/payments/virtual-account-deposits?id=${id}`, { method: 'DELETE' });
    if (res.ok) await loadDeposits({ silent: true });
  };

  // 웹훅 테스트 발송
  const handleTestWebhook = async () => {
    setWebhookTesting(true);
    setWebhookTestResult(null);
    try {
      const testPayload = {
        eventType: 'DEPOSIT_CALLBACK',
        eventId: `test_${Date.now()}`,
        createdAt: new Date().toISOString(),
        data: {
          paymentKey: `test_paymentKey_${Date.now()}`,
          orderId: `test_order_${Date.now()}`,
          orderName: '테스트 입금',
          status: 'DONE',
          totalAmount: 10000,
          currency: 'KRW',
          method: '가상계좌',
          virtualAccount: {
            accountType: 'NORMAL',
            accountNumber: TOSS_BANK_ACCOUNT.replace(/-/g, ''),
            bankCode: 'TOSS',
            bank: '토스뱅크',
            customerName: '테스트입금자',
            dueDate: new Date(Date.now() + 86400000).toISOString(),
          },
          approvedAt: new Date().toISOString(),
        },
      };

      const res = await fetch(`/api/payments/virtual-account-webhook?provider=toss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testPayload),
      });
      const data = await res.json();
      if (res.ok) {
        setWebhookTestResult({ ok: true, msg: `✅ 테스트 성공! 입금 ID: ${data.depositId ?? '-'}` });
        await loadDeposits({ silent: true });
      } else {
        setWebhookTestResult({ ok: false, msg: `❌ ${data.error || '테스트 실패'}` });
      }
    } catch (e: any) {
      setWebhookTestResult({ ok: false, msg: `❌ ${e.message}` });
    } finally {
      setWebhookTesting(false);
    }
  };

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

  // 렌더 단계 파생 KPI (새 state/API 없이)
  const kpi = (() => {
    const todayKey = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
    let todayTotal = 0;
    let completedCount = 0;
    let pendingCount = 0;
    let cancelCount = 0;
    rows.forEach((row) => {
      const dateVal = row.deposited_at ? new Date(row.deposited_at) : null;
      const depositedDay = (dateVal && !isNaN(dateVal.getTime()))
        ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(dateVal)
        : '';
      if (row.deposit_status === 'deposited') {
        completedCount += 1;
        if (depositedDay === todayKey) todayTotal += toAmountNumber(row.amount);
      } else if (row.deposit_status === 'issued') {
        pendingCount += 1;
      } else if (row.deposit_status === 'cancelled') {
        cancelCount += 1;
      }
    });
    return { todayTotal, completedCount, pendingCount, cancelCount };
  })();

  return (
    <div data-testid="realtime-deposit-view" className="space-y-4">
      {dialog}
      {/* §4-11, §13.13 입금실시간조회: Chart 이관 예정 안내 + PageHeader 제목/서브 삭제, 계좌 칩만 우상단 액션과 함께 유지 */}
      <div className="rounded-[var(--radius-lg)] border border-amber-200 bg-amber-50/70 px-3 py-2 text-[11px] font-bold text-amber-800">
        Chart 프로그램으로 이관 예정인 모듈입니다.
      </div>
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="px-2 py-0.5 bg-blue-500/10 text-blue-700 text-xs font-black rounded-[var(--radius-md)] border border-blue-500/20">
            🏦 토스뱅크 {TOSS_BANK_ACCOUNT}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="realtime-deposit-refresh"
              onClick={() => loadDeposits({ silent: true })}
              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--accent)]/40 hover:bg-[var(--muted)]"
            >
              {refreshing ? '동기화 중...' : '새로고침'}
            </button>
          </div>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 bg-[var(--muted)] rounded-xl p-1 w-fit">
        {[
          { id: 'list' as const, icon: '📋', label: `입금 내역${rows.length > 0 ? ` (${rows.length})` : ''}` },
          { id: 'manual' as const, icon: '✏️', label: '수동 등록' },
          { id: 'guide' as const, icon: '🔧', label: '연동 설정' },
        ].map((t) => (
          <button key={t.id} type="button" onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-bold transition-all ${
              activeTab === t.id ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm' : 'text-[var(--toss-gray-3)] hover:text-[var(--foreground)]'
            }`}>
            <span>{t.icon}</span><span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* ── 수동 입금 등록 탭 ─────────────────────────────────────────── */}
      {activeTab === 'manual' && (
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm space-y-4 animate-in fade-in duration-300">
          <div>
            <h3 className="text-base font-bold text-[var(--foreground)]">수동 입금 등록</h3>
            <p className="text-xs text-[var(--toss-gray-3)] mt-1">토스뱅크 앱에서 확인한 입금 내역을 직접 등록합니다. 등록 후 입금 내역 탭에서 확인할 수 있습니다.</p>
          </div>
          {manualError && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-700">{manualError}</div>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="font-semibold text-[var(--foreground)]">입금자명 <span className="text-red-500">*</span></span>
              <input value={manualForm.depositor_name} onChange={e => setManualForm(p => ({...p, depositor_name: e.target.value}))}
                placeholder="홍길동" className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-semibold text-[var(--foreground)]">금액 (원) <span className="text-red-500">*</span></span>
              <input value={manualForm.amount} onChange={e => setManualForm(p => ({...p, amount: e.target.value}))}
                placeholder="50000" type="number" className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-semibold text-[var(--foreground)]">환자명</span>
              <input value={manualForm.patient_name} onChange={e => setManualForm(p => ({...p, patient_name: e.target.value}))}
                placeholder="홍길동" className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-semibold text-[var(--foreground)]">거래 내용</span>
              <input value={manualForm.transaction_label} onChange={e => setManualForm(p => ({...p, transaction_label: e.target.value}))}
                placeholder="무릎 수술 수납금" className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]" />
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="font-semibold text-[var(--foreground)]">입금 일시</span>
              <input value={manualForm.deposited_at} onChange={e => setManualForm(p => ({...p, deposited_at: e.target.value}))}
                type="datetime-local" className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]" />
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="font-semibold text-[var(--foreground)]">메모</span>
              <textarea value={manualForm.matched_note} onChange={e => setManualForm(p => ({...p, matched_note: e.target.value}))}
                rows={2} placeholder="추가 메모" className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]" />
            </label>
          </div>
          <button type="button" onClick={handleManualSubmit} disabled={manualSaving}
            className="w-full py-3 bg-[var(--accent)] text-white font-bold text-sm rounded-xl hover:opacity-90 disabled:opacity-60 transition">
            {manualSaving ? '등록 중...' : '✅ 입금 내역 등록'}
          </button>
        </div>
      )}

      {/* ── 연동 설정 탭 ──────────────────────────────────────────────── */}
      {activeTab === 'guide' && (
        <div className="space-y-4 animate-in fade-in duration-300">
          {/* 웹훅 URL */}
          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
            <p className="text-sm font-bold text-[var(--foreground)] mb-1">📡 웹훅 URL (토스페이먼츠 등록용)</p>
            <p className="break-all text-xs text-[var(--toss-gray-3)] mb-3 bg-[var(--muted)] p-2 rounded-lg font-mono">
              {webhookUrl || '브라우저 주소 불러오는 중...'}
            </p>
            <div className="flex gap-2 flex-wrap">
              <button type="button" onClick={handleCopyWebhookUrl}
                className="px-3 py-2 bg-[var(--accent)] text-white text-sm font-semibold rounded-lg hover:opacity-90 transition">
                {copied ? '✅ 복사됨' : '📋 URL 복사'}
              </button>
              <button type="button" onClick={handleTestWebhook} disabled={webhookTesting}
                className="px-3 py-2 bg-emerald-500 text-white text-sm font-semibold rounded-lg hover:opacity-90 disabled:opacity-60 transition">
                {webhookTesting ? '테스트 중...' : '🧪 웹훅 테스트'}
              </button>
            </div>
            {webhookTestResult && (
              <p className={`mt-2 text-sm font-semibold ${webhookTestResult.ok ? 'text-emerald-600' : 'text-red-600'}`}>
                {webhookTestResult.msg}
              </p>
            )}
            <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 leading-5">
              ⚠️ <strong>DEPOSIT_CALLBACK</strong> 이벤트만 등록을 권장합니다. PAYMENT_STATUS_CHANGED를 함께 등록하면 중복 수신될 수 있습니다.
            </div>
          </div>

          {/* 단계별 가이드 */}
          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-[var(--foreground)]">🔧 토스페이먼츠 웹훅 연동 단계별 가이드</h3>

            {[
              {
                step: 1,
                title: '토스페이먼츠 가맹점 가입',
                color: 'blue',
                content: (
                  <div className="space-y-1 text-xs">
                    <p>👉 <a href="https://developers.tosspayments.com" target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] underline">developers.tosspayments.com</a> 접속 → 가맹점 신청</p>
                    <p>• 사업자등록증 / 통장사본 (토스뱅크 {TOSS_BANK_ACCOUNT}) 필요</p>
                    <p>• 심사 후 <strong>시크릿 키(Secret Key)</strong>와 <strong>클라이언트 키</strong> 발급</p>
                  </div>
                ),
              },
              {
                step: 2,
                title: '웹훅 URL 등록',
                color: 'violet',
                content: (
                  <div className="space-y-1 text-xs">
                    <p>개발자센터 → 내 상점 → 웹훅 → URL 추가</p>
                    <p className="font-mono bg-[var(--muted)] p-1.5 rounded text-[11px] break-all">{webhookUrl}</p>
                    <p>• 이벤트: <strong>DEPOSIT_CALLBACK</strong> 선택</p>
                    <p>• 웹훅 시크릿 발급 시 환경변수와 동일한 값으로 설정</p>
                    <p className="font-mono bg-yellow-500/10 border border-yellow-500/20 p-1.5 rounded text-[11px] break-all">
                      발급받은 웹훅 시크릿을 환경변수 VIRTUAL_ACCOUNT_WEBHOOK_TOKEN에 설정하세요
                    </p>
                  </div>
                ),
              },
              {
                step: 3,
                title: 'Cloudflare 환경변수 등록',
                color: 'teal',
                content: (
                  <div className="space-y-1 text-xs">
                    <p>Cloudflare Workers → Settings → Variables</p>
                    <div className="bg-[var(--muted)] p-2 rounded space-y-1 font-mono text-[11px]">
                      <p><strong>VIRTUAL_ACCOUNT_WEBHOOK_TOKEN</strong></p>
                      <p className="text-[var(--toss-gray-3)]">= 발급받은 웹훅 시크릿 값</p>
                      <p className="mt-1"><strong>TOSS_PAYMENTS_SECRET_KEY</strong></p>
                      <p className="text-[var(--toss-gray-3)]">= 가맹점 가입 후 발급받은 시크릿 키</p>
                    </div>
                  </div>
                ),
              },
              {
                step: 4,
                title: '가상계좌 발급 → 입금 자동 수신',
                color: 'emerald',
                content: (
                  <div className="space-y-1 text-xs">
                    <p>환자에게 결제 요청 시 <strong>가상계좌번호</strong>를 발급</p>
                    <p>환자가 해당 가상계좌에 입금하면 → 토스페이먼츠 → 웹훅 발송 → 이 화면에 자동 표시</p>
                    <p>정산금은 지정한 <strong>토스뱅크 {TOSS_BANK_ACCOUNT}</strong> 계좌로 입금</p>
                    <p className="text-emerald-700 font-semibold">✅ 웹훅 테스트 버튼으로 미리 동작 확인 가능</p>
                  </div>
                ),
              },
            ].map(({ step, title, color, content }) => (
              <div key={step} className={`rounded-xl border p-3.5 ${
                color === 'blue' ? 'bg-blue-500/10 border-blue-500/20' :
                color === 'violet' ? 'bg-violet-50 border-violet-200' :
                color === 'teal' ? 'bg-teal-50 border-teal-200' :
                'bg-emerald-50 border-emerald-200'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`w-5 h-5 rounded-full text-white text-[10px] font-black flex items-center justify-center ${
                    color === 'blue' ? 'bg-blue-500/100' :
                    color === 'violet' ? 'bg-violet-500' :
                    color === 'teal' ? 'bg-teal-500' : 'bg-emerald-500'
                  }`}>{step}</span>
                  <span className="text-sm font-bold text-[var(--foreground)]">{title}</span>
                </div>
                {content}
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'list' && <>
      {/* KPI 4종 */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
          <p className="text-xs font-semibold text-[var(--toss-gray-3)]">오늘 총 입금</p>
          <p className="mt-2 text-2xl font-bold text-[var(--foreground)]">{formatCurrency(kpi.todayTotal)}원</p>
        </div>
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
          <p className="text-xs font-semibold text-[var(--toss-gray-3)]">완료</p>
          <p className="mt-2 text-2xl font-bold text-[var(--foreground)]">{kpi.completedCount}건</p>
        </div>
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm border-l-4 border-l-[var(--warning)]">
          <p className="text-xs font-semibold" style={{ color: 'var(--warning)' }}>처리 대기</p>
          <p className="mt-2 text-2xl font-bold" style={{ color: 'var(--warning)' }}>{kpi.pendingCount}건</p>
        </div>
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm border-l-4 border-l-[var(--danger)]">
          <p className="text-xs font-semibold" style={{ color: 'var(--danger)' }}>환불·취소</p>
          <p className="mt-2 text-2xl font-bold" style={{ color: 'var(--danger)' }}>{kpi.cancelCount}건</p>
        </div>
      </div>

      {/* 필터 */}
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm space-y-3">
        <div className="grid gap-3 lg:grid-cols-[1.6fr_0.8fr_0.8fr]">
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
        {/* segmented: 입금 상태 빠른 선택 */}
        <div className="flex flex-wrap items-center gap-1">
          {[
            { value: 'all', label: '전체' },
            { value: 'deposited', label: '완료' },
            { value: 'issued', label: '대기' },
            { value: 'cancelled', label: '환불·취소' },
          ].map((seg) => (
            <button
              key={seg.value}
              type="button"
              onClick={() => setDepositStatus(seg.value)}
              className={`rounded-[var(--radius-md)] px-3 py-1.5 text-xs font-semibold transition ${
                depositStatus === seg.value
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--muted)] text-[var(--toss-gray-4)] hover:bg-[var(--border)]'
              }`}
            >
              {seg.label}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between text-xs text-[var(--toss-gray-3)]">
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
        /* 7열 sticky 테이블 */
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--muted)]">
                  {['시각', '환자', '항목', '결제수단', '금액', '상태', '액션'].map((h) => (
                    <th
                      key={h}
                      className="sticky top-0 z-10 bg-[var(--muted)] px-3 py-2.5 text-left text-xs font-semibold text-[var(--toss-gray-4)] whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const draft = drafts[row.id] || createDraft(row);
                  return (
                    <tr
                      key={row.id}
                      data-testid={`realtime-deposit-row-${row.id}`}
                      className="group border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--muted)]/50 transition-colors"
                    >
                      {/* 시각 */}
                      <td className="px-3 py-3 text-xs text-[var(--toss-gray-3)] whitespace-nowrap align-top">
                        {formatDateTime(row.deposited_at || row.created_at)}
                      </td>

                      {/* 환자 */}
                      <td className="px-3 py-3 align-top">
                        <input
                          data-testid={`realtime-deposit-patient-name-${row.id}`}
                          value={draft.patient_name}
                          onChange={(event) => handleDraftChange(row.id, 'patient_name', event.target.value)}
                          placeholder={row.patient_name || row.depositor_name || row.customer_name || '-'}
                          className="w-full min-w-[96px] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-xs outline-none transition focus:border-[var(--accent)]"
                        />
                      </td>

                      {/* 항목 */}
                      <td className="px-3 py-3 align-top">
                        <input
                          data-testid={`realtime-deposit-transaction-label-${row.id}`}
                          value={draft.transaction_label}
                          onChange={(event) => handleDraftChange(row.id, 'transaction_label', event.target.value)}
                          placeholder={row.transaction_label || row.order_name || row.order_id || '-'}
                          className="w-full min-w-[120px] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-xs outline-none transition focus:border-[var(--accent)]"
                        />
                      </td>

                      {/* 결제수단 칩 */}
                      <td className="px-3 py-3 align-top whitespace-nowrap">
                        <span className="inline-flex items-center rounded-[var(--radius-md)] bg-blue-500/10 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                          {row.bank_name || row.bank_code || '가상계좌'}
                        </span>
                      </td>

                      {/* 금액 */}
                      <td className="px-3 py-3 text-right text-sm font-bold text-[var(--foreground)] whitespace-nowrap align-top">
                        {formatCurrency(row.amount)}원
                      </td>

                      {/* 상태 칩 */}
                      <td className="px-3 py-3 align-top whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          <span className={`inline-flex items-center rounded-[var(--radius-md)] px-2 py-0.5 text-[11px] font-semibold ${getDepositStatusClass(row.deposit_status)}`}>
                            {getDepositStatusLabel(row.deposit_status)}
                          </span>
                          <span className={`inline-flex items-center rounded-[var(--radius-md)] px-2 py-0.5 text-[11px] font-semibold ${getMatchStatusClass(row.match_status)}`}>
                            {getMatchStatusLabel(row.match_status)}
                          </span>
                        </div>
                      </td>

                      {/* 액션 */}
                      <td className="px-3 py-3 align-top">
                        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            data-testid={`realtime-deposit-save-${row.id}`}
                            onClick={() => handleSave(row)}
                            disabled={savingId === row.id}
                            className="rounded-[var(--radius-md)] bg-[var(--accent)] px-2.5 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 whitespace-nowrap"
                          >
                            {savingId === row.id ? '저장 중...' : '저장'}
                          </button>
                          {row.provider === 'manual' && (
                            <button
                              type="button"
                              onClick={() => handleDeleteDeposit(row.id)}
                              className="rounded-[var(--radius-md)] border border-[var(--danger)]/20 bg-[var(--danger)]/10 px-2.5 py-1.5 text-xs font-semibold text-[var(--danger)] transition hover:bg-[var(--danger)]/20 whitespace-nowrap"
                            >
                              삭제
                            </button>
                          )}
                        </div>
                        {/* 호버 전에도 메모 인풋 접근 가능하도록 항상 표시 */}
                        <textarea
                          value={draft.matched_note}
                          onChange={(event) => handleDraftChange(row.id, 'matched_note', event.target.value)}
                          rows={2}
                          placeholder="메모"
                          className="mt-1.5 w-full min-w-[120px] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-xs outline-none transition focus:border-[var(--accent)]"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </>}
    </div>
  );
}
