'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
      return 'bg-blue-500/20 text-blue-700';
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

const TOSS_BANK_ACCOUNT = '1002-4939-3286';

export default function RealtimeDepositView({ user }: { user?: any }) {
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

  // 엑셀 가져오기 상태
  type ParsedRow = { date: string; amount: number; depositor: string; note: string; raw: string[] };
  const [importRows, setImportRows] = useState<ParsedRow[]>([]);
  const [importPreviewing, setImportPreviewing] = useState(false);
  const [importSaving, setImportSaving] = useState(false);
  const [importDone, setImportDone] = useState(0);
  const [importError, setImportError] = useState('');
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const fileImportRef = useRef<HTMLInputElement>(null);
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
    if (!confirm('이 입금 내역을 삭제하시겠습니까?')) return;
    const res = await fetch(`/api/payments/virtual-account-deposits?id=${id}`, { method: 'DELETE' });
    if (res.ok) await loadDeposits({ silent: true });
  };

  // ── 엑셀/CSV 파싱 ────────────────────────────────────────────────
  const parseExcelFile = useCallback(async (file: File) => {
    setImportError('');
    setImportRows([]);
    setImportDone(0);
    setImportPreviewing(true);
    try {
      const xlsx = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const wb = xlsx.read(buffer, { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw: string[][] = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' }) as string[][];

      if (raw.length < 2) { setImportError('데이터가 없습니다.'); setImportPreviewing(false); return; }

      // 헤더 행 찾기 (거래일, 금액, 입금자 등의 컬럼이 있는 행)
      let headerIdx = 0;
      for (let i = 0; i < Math.min(raw.length, 10); i++) {
        const rowStr = raw[i].join('').toLowerCase();
        if (rowStr.includes('거래') || rowStr.includes('금액') || rowStr.includes('날짜') || rowStr.includes('일시')) {
          headerIdx = i;
          break;
        }
      }
      const headers = raw[headerIdx].map(h => String(h).trim().toLowerCase());

      // 컬럼 인덱스 추측
      const findCol = (...candidates: string[]) => {
        for (const c of candidates) {
          const idx = headers.findIndex(h => h.includes(c));
          if (idx >= 0) return idx;
        }
        return -1;
      };

      const colDate    = findCol('거래일', '날짜', '일시', 'date');
      const colAmount  = findCol('입금', '금액', '거래금액', 'amount');
      const colDepositor = findCol('내용', '적요', '거래내용', '입금자', 'remark', 'memo');
      const colNote    = findCol('메모', '비고', '특이', 'note');

      const parsed: ParsedRow[] = [];
      for (let i = headerIdx + 1; i < raw.length; i++) {
        const row = raw[i];
        if (!row || row.every(c => !String(c).trim())) continue;

        const rawDate = colDate >= 0 ? String(row[colDate] || '') : '';
        const rawAmount = colAmount >= 0 ? String(row[colAmount] || '').replace(/,/g, '') : '';
        const amount = Number(rawAmount);

        // 입금 건만 (양수 금액만)
        if (!amount || amount <= 0) continue;

        // 날짜 파싱 시도
        let dateStr = '';
        if (rawDate) {
          const d = new Date(rawDate);
          dateStr = isNaN(d.getTime())
            ? rawDate  // 파싱 실패 시 원문
            : d.toISOString();
        }

        const depositor = colDepositor >= 0 ? String(row[colDepositor] || '').trim() : '';
        const note = colNote >= 0 ? String(row[colNote] || '').trim() : '';

        parsed.push({
          date: dateStr || new Date().toISOString(),
          amount,
          depositor: depositor || '(내용없음)',
          note,
          raw: row.map(String),
        });
      }

      if (parsed.length === 0) {
        setImportError('입금 내역을 찾지 못했습니다. 토스뱅크 거래내역 엑셀 파일이 맞는지 확인해주세요.');
        setImportPreviewing(false);
        return;
      }

      setImportRows(parsed);
    } catch (e: any) {
      setImportError(e.message || '파일을 읽을 수 없습니다.');
      setImportPreviewing(false);
    }
  }, []);

  // 엑셀에서 파싱된 데이터 일괄 등록
  const handleImportSave = useCallback(async () => {
    if (importRows.length === 0) return;
    setImportSaving(true);
    setImportError('');
    let done = 0;
    for (const row of importRows) {
      try {
        const res = await fetch('/api/payments/virtual-account-deposits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            depositor_name: row.depositor,
            amount: row.amount,
            deposited_at: row.date,
            matched_note: row.note || undefined,
            transaction_label: row.depositor,
          }),
        });
        if (res.ok) done++;
      } catch { /* skip */ }
    }
    setImportDone(done);
    setImportRows([]);
    setImportPreviewing(false);
    await loadDeposits({ silent: true });
    setImportSaving(false);
    setActiveTab('list');
  }, [importRows, loadDeposits]);

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

  return (
    <div data-testid="realtime-deposit-view" className="space-y-4">
      {/* 헤더 */}
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-[var(--foreground)]">입금 실시간 조회</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-[var(--toss-gray-3)]">정산 계좌</span>
              <span className="px-2 py-0.5 bg-blue-500/10 text-blue-700 text-xs font-black rounded-md border border-blue-500/20">
                🏦 토스뱅크 {TOSS_BANK_ACCOUNT}
              </span>
            </div>
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
                    <p>• 웹훅 시크릿 발급 시 아래 토큰과 동일하게 설정</p>
                    <p className="font-mono bg-yellow-500/10 border border-yellow-500/20 p-1.5 rounded text-[11px] break-all">
                      a382ddced410e85277f311353a8eb8d930f8a78a28135b5000673320ae3e1b02
                    </p>
                  </div>
                ),
              },
              {
                step: 3,
                title: 'Vercel 환경변수 등록',
                color: 'teal',
                content: (
                  <div className="space-y-1 text-xs">
                    <p>Vercel 대시보드 → Settings → Environment Variables</p>
                    <div className="bg-[var(--muted)] p-2 rounded space-y-1 font-mono text-[11px]">
                      <p><strong>VIRTUAL_ACCOUNT_WEBHOOK_TOKEN</strong></p>
                      <p className="text-[var(--toss-gray-3)]">= a382ddced...b02 (위 토큰)</p>
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
                  {row.provider === 'manual' && (
                    <button type="button" onClick={() => handleDeleteDeposit(row.id)}
                      className="rounded-[var(--radius-md)] border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-500/20">
                      🗑️ 삭제
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
      </>}
    </div>
  );
}
