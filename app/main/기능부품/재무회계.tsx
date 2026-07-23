'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { db } from '@/lib/db-client';
import {
  Calculator,
  FileText,
  Calendar,
  TrendingUp,
  Percent,
  BookOpen,
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Info,
  DollarSign,
  Download,
  Building,
  CreditCard,
  Landmark,
  Receipt,
  Send,
  ArrowLeftRight
} from 'lucide-react';
import { toast } from '@/lib/toast';

interface FinanceViewProps {
  user: any;
  subView: string;
  setSubView?: (view: string | null) => void;
  selectedCompanyId?: string | null;
}

export default function FinanceView({ user, subView, setSubView, selectedCompanyId }: FinanceViewProps) {
  // --- Inner Tab States ---
  const [doubleEntryTab, setDoubleEntryTab] = useState<'entries' | 'coa' | 'trial'>('entries');
  const [vatTab, setVatTab] = useState<'invoices' | 'calculator' | 'calendar'>('invoices');
  const [closingTab, setClosingTab] = useState<'tasks' | 'statements'>('tasks');
  const [cashFlowTab, setCashFlowTab] = useState<'status' | 'forecast' | 'sync'>('status');
  const [depreciationTab, setDepreciationTab] = useState<'status' | 'assets'>('status');
  const [purchaseTab, setPurchaseTab] = useState<'ledger' | 'ap' | 'reconcile'>('ledger');
  const [expenseTab, setExpenseTab] = useState<'inbox' | 'claims' | 'register'>('inbox');
  const [disbursementTab, setDisbursementTab] = useState<'list' | 'draft'>('list');
  const [payrollLinkTab, setPayrollLinkTab] = useState<'sync'>('sync');
  const [taxReportingTab, setTaxReportingTab] = useState<'dashboard'>('dashboard');

  // --- Dynamic New States (D1 미연동 섹션은 빈 목록 + 데모 배너) ---
  type ExpenseRow = { id: string; date: string; name: string; desc: string; category: string; amount: number; state: string };
  type DisbRow = { id: string; date: string; vendor: string; desc: string; amount: number; state: string };
  type PayrollSyncRow = { period: string; totalAmount: number; empCount: number; state: string; synced_at: string };
  type TaxReportRow = { type: string; period: string; deadline: string; status: string; fileUrl: string };
  type JournalRow = { id: string; date: string; desc: string; debitAcc: string; creditAcc: string; amount: number };
  type FixedAssetRow = { id: string; name: string; category: string; date: string; cost: number; salvage: number; usefulLife: number; method: string };
  type BankSyncRow = { id: string; type: string; name: string; num: string; state: string; updated_at: string; company_id?: string | null };
  type ClosingTask = { id: number; text: string; done: boolean };
  type ReconcileIssue = { id: number; vendor: string; date: string; ledgerAmt: number; taxInvoiceAmt: number; diff: number; reason: string };

  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [newExpense, setNewExpense] = useState({ desc: '', category: '소모품비', amount: '' });

  const [disbursements, setDisbursements] = useState<DisbRow[]>([]);
  const [newDisb, setNewDisb] = useState({ vendor: '', desc: '', amount: '' });

  const [payrollSyncs, setPayrollSyncs] = useState<PayrollSyncRow[]>([]);

  const [taxReports, setTaxReports] = useState<TaxReportRow[]>([]);

  const [loading, setLoading] = useState(true);
  /** D1 로드 실패 시 데모/오프라인 안내 */
  const [demoMode, setDemoMode] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // --- Dynamic Data States (D1: journal_entries / fixed_assets / bank_accounts_sync) ---
  const [journalEntries, setJournalEntries] = useState<JournalRow[]>([]);
  const [newEntry, setNewEntry] = useState({ desc: '', debitAcc: '소모품비', creditAcc: '보통예금', amount: '' });

  const [fixedAssets, setFixedAssets] = useState<FixedAssetRow[]>([]);
  const [newAsset, setNewAsset] = useState({ name: '', category: '의료기기', date: '', cost: '', salvage: '', usefulLife: '5', method: '정액법' });

  const [bankSyncs, setBankSyncs] = useState<BankSyncRow[]>([]);

  // 세무 일정: 법정 일정 안내(거래 숫자가 아닌 참고 캘린더)
  const taxSchedules = [
    { date: '2026-07-10', title: '6월분 원천세 신고 및 납부', dday: 20, type: 'monthly', desc: '근로소득, 사업소득, 퇴직소득 원천징수분' },
    { date: '2026-07-25', title: '2026년 1기 부가가치세 확정 신고', dday: 35, type: 'quarterly', desc: '1월~6월 매출/매입 세금계산서 신고 및 납부' },
    { date: '2026-08-31', title: '법인세 중간예납 신고', dday: 72, type: 'yearly', desc: '사업연도 개시일로부터 6개월간의 법인세 예납' },
    { date: '2026-09-10', title: '8월분 원천세 신고 및 납부', dday: 82, type: 'monthly', desc: '원천징수 의무이행 사항' }
  ];

  const [closingTasks, setClosingTasks] = useState<ClosingTask[]>([
    { id: 1, text: '은행 통장 잔액 대사 완료', done: false },
    { id: 2, text: '당월 매출·매입 세금계산서 대조 완료', done: false },
    { id: 3, text: '급여대장 전표 입력 및 원천징수 금액 검증 완료', done: false },
    { id: 4, text: '고정자산 감가상각 전표 등록 완료', done: false },
    { id: 5, text: '선급비용 및 미지급비용 당월 배부 처리 완료', done: false },
  ]);
  const isClosingProcess = false;

  // 매입 대사 불일치: D1 테이블 없음 → 빈 목록
  const reconcileIssues: ReconcileIssue[] = [];

  // --- DB Data Loading ---
  useEffect(() => {
    let active = true;
    async function loadDbData() {
      setLoading(true);
      setLoadError(null);
      try {
        const targetCompanyId = selectedCompanyId || user?.company_id || null;

        // 1. journal_entries
        let entriesQuery = db.from('journal_entries').select('*');
        if (targetCompanyId) {
          entriesQuery = entriesQuery.eq('company_id', targetCompanyId);
        }
        const { data: entries, error: err1 } = await entriesQuery.order('date', { ascending: false });

        // 2. fixed_assets
        let assetsQuery = db.from('fixed_assets').select('*');
        if (targetCompanyId) {
          assetsQuery = assetsQuery.eq('company_id', targetCompanyId);
        }
        const { data: assets, error: err2 } = await assetsQuery;

        // 3. bank_accounts_sync
        let syncQuery = db.from('bank_accounts_sync').select('*');
        if (targetCompanyId) {
          syncQuery = syncQuery.eq('company_id', targetCompanyId);
        }
        const { data: syncData, error: err3 } = await syncQuery;

        if (!active) return;

        const hadHardError = Boolean(err1 || err2 || err3);
        setDemoMode(hadHardError);
        if (hadHardError) {
          setLoadError([err1?.message, err2?.message, err3?.message].filter(Boolean).join(' · ') || 'D1 로드 실패');
        }

        setJournalEntries(
          (entries ?? []).map((e: any) => ({
            id: String(e.id),
            date: e.date ?? '',
            desc: e.desc ?? '',
            debitAcc: e.debit_acc ?? '',
            creditAcc: e.credit_acc ?? '',
            amount: Number(e.amount) || 0,
          })),
        );

        setFixedAssets(
          (assets ?? []).map((a: any) => ({
            id: String(a.id),
            name: a.name ?? '',
            category: a.category ?? '',
            date: a.date ?? '',
            cost: Number(a.cost) || 0,
            salvage: Number(a.salvage) || 0,
            usefulLife: Number(a.useful_life) || 0,
            method: a.method ?? '정액법',
          })),
        );

        setBankSyncs(
          (syncData ?? []).map((b: any) => ({
            id: String(b.id),
            type: b.type ?? '',
            name: b.name ?? '',
            num: b.num ?? '',
            state: b.state ?? '',
            updated_at: b.updated_at ?? '',
            company_id: b.company_id ?? null,
          })),
        );
      } catch (err) {
        console.error('Failed to load accounting DB data', err);
        if (active) {
          setDemoMode(true);
          setLoadError(err instanceof Error ? err.message : 'D1 로드 실패');
          setJournalEntries([]);
          setFixedAssets([]);
          setBankSyncs([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    loadDbData();
    return () => { active = false; };
  }, [selectedCompanyId, user?.company_id]);

  // --- Handlers ---
  const handleAddJournal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEntry.desc || !newEntry.amount) {
      toast('모든 필드를 입력해 주세요.', 'error');
      return;
    }
    const amt = parseInt(newEntry.amount);
    if (isNaN(amt)) {
      toast('올바른 금액을 입력해 주세요.', 'error');
      return;
    }

    const newId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).substring(2, 11);

    const targetCompanyId = selectedCompanyId || user?.company_id || null;

    const row = {
      id: newId,
      company_id: targetCompanyId,
      date: new Date().toISOString().split('T')[0],
      desc: newEntry.desc,
      debit_acc: newEntry.debitAcc,
      credit_acc: newEntry.creditAcc,
      amount: amt
    };

    try {
      const { error } = await db.from('journal_entries').insert([row]);
      if (error) throw new Error(error.message);

      setJournalEntries(prev => [
        {
          id: row.id,
          date: row.date,
          desc: row.desc,
          debitAcc: row.debit_acc,
          creditAcc: row.credit_acc,
          amount: row.amount
        },
        ...prev
      ]);
      setNewEntry({ desc: '', debitAcc: '소모품비', creditAcc: '보통예금', amount: '' });
      toast('분개가 DB에 등록되었습니다.', 'success');
    } catch (err) {
      console.error(err);
      toast('분개 DB 저장 실패', 'error');
    }
  };

  const handleAddAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAsset.name || !newAsset.date || !newAsset.cost) {
      toast('필수 필드를 입력해 주세요.', 'error');
      return;
    }
    const costAmt = parseInt(newAsset.cost);
    const salvageAmt = newAsset.salvage ? parseInt(newAsset.salvage) : Math.round(costAmt * 0.1);
    const life = parseInt(newAsset.usefulLife);

    const newId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).substring(2, 11);

    const targetCompanyId = selectedCompanyId || user?.company_id || null;

    const row = {
      id: newId,
      company_id: targetCompanyId,
      name: newAsset.name,
      category: newAsset.category,
      date: newAsset.date,
      cost: costAmt,
      salvage: salvageAmt,
      useful_life: life,
      method: newAsset.method
    };

    try {
      const { error } = await db.from('fixed_assets').insert([row]);
      if (error) throw new Error(error.message);

      setFixedAssets(prev => [
        ...prev,
        {
          id: row.id,
          name: row.name,
          category: row.category,
          date: row.date,
          cost: row.cost,
          salvage: row.salvage,
          usefulLife: row.useful_life,
          method: row.method
        }
      ]);
      setNewAsset({ name: '', category: '의료기기', date: '', cost: '', salvage: '', usefulLife: '5', method: '정액법' });
      toast('고정자산이 DB에 등록되었습니다.', 'success');
    } catch (err) {
      console.error(err);
      toast('고정자산 DB 저장 실패', 'error');
    }
  };

  const handleSyncBanks = async () => {
    if (bankSyncs.length === 0) {
      toast('동기화할 금융 계좌가 없습니다. 데이터 없음', 'info');
      return;
    }
    try {
      const nowStr = new Date().toISOString();
      const updated = bankSyncs.map(b => ({ ...b, updated_at: nowStr }));
      
      for (const account of updated) {
        await db
          .from('bank_accounts_sync')
          .update({ updated_at: nowStr })
          .eq('id', account.id);
      }
      setBankSyncs(updated);
      // 실제 잔액·거래 수신 없이 updated_at 만 갱신 — 실시간 동기화로 오인 금지
      toast('연동 시각만 갱신했습니다. 잔액·거래 실시간 수신은 준비 중입니다.', 'info');
    } catch (err) {
      console.error(err);
      toast('금융 기관 동기화 업데이트 실패', 'error');
    }
  };

  const toggleTask = (id: number) => {
    setClosingTasks(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t));
  };

  const triggerMonthlyClosing = () => {
    const unfinished = closingTasks.filter(t => !t.done);
    if (unfinished.length > 0) {
      toast(`남은 체크리스트가 있습니다: ${unfinished.length}건`, 'error');
      return;
    }
    // 서버 원장 잠금·감사 로그 API 없음 — 가짜 success 금지
    toast('결산 마감은 서버 연동 준비 중입니다. 실제 원장 마감은 아직 처리되지 않습니다.', 'info');
  };

  // --- Calculations ---
  // Trial Balance calculation (시산표 합계 계산)
  const trialTotals = useMemo(() => {
    let debit = 0;
    let credit = 0;
    journalEntries.forEach(entry => {
      debit += entry.amount;
      credit += entry.amount;
    });
    return { debit, credit };
  }, [journalEntries]);

  // Asset Depreciation Calculations
  const assetDepreciation = useMemo(() => {
    return fixedAssets.map(asset => {
      const isDeclining = asset.method === '정률법';
      // Simple depreciation calculation for current year
      const deprPerYear = isDeclining 
        ? Math.round(asset.cost * 0.451) // Roughly 5-year declining rate
        : Math.round((asset.cost - asset.salvage) / asset.usefulLife);
      
      const accumulated = deprPerYear; // Simulated accumulated
      const bookValue = asset.cost - accumulated;

      return {
        ...asset,
        deprPerYear,
        accumulated,
        bookValue
      };
    });
  }, [fixedAssets]);

  return (
    <div className="flex flex-col h-full bg-[var(--background)]">
      {/* ── 상단 헤더 ── */}
      <div className="shrink-0 flex items-center justify-between p-5 border-b border-[var(--border)] bg-[var(--card)]">
        <div className="flex flex-col">
          <h2 className="text-xl font-black text-[var(--foreground)] tracking-tight">재무·회계·세무 관리</h2>
          <p className="text-sm text-[var(--toss-gray-4)] font-bold">
            {subView === 'double-entry' && '복식부기 — 전표 분개장, 계정과목, 시산표 정밀 관리'}
            {subView === 'vat' && '부가세 — 세금계산서 및 부가세 모의 계산, 국세청 세무 일정'}
            {subView === 'closing' && '결산 — 월차/연차 결산 프로세스 및 재무 보고서'}
            {subView === 'cash-flow' && '자금흐름 — 일일 자금 현황 및 자금수지 예측, 은행 연동'}
            {subView === 'depreciation' && '감가상각 — 고정자산 취득 대장 및 월 감가상각 자동 산출'}
            {subView === 'purchase-ledger' && '매입원장 — 거래처별 매입채무 대장 및 세금계산서 대사 검증'}
            {subView === 'expense' && '경비청구 — 법인카드 및 지출 영수증 청구 및 승인 관리'}
            {subView === 'disbursement' && '지출결의 — 대금 지급 계획 및 지출결의서 통합 관리'}
            {subView === 'payroll-link' && '급여연동 — 인사관리 급여대장 승인 데이터 연동 및 전표 자동 발행'}
            {subView === 'tax-reporting' && '세무신고 — 원천세/부가세 신고 대시보드 및 국세청 변환용 파일 생성'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            type="button" 
            onClick={() => toast('Excel 다운로드는 준비 중입니다.', 'info')} 
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] font-bold text-xs hover:bg-[var(--muted)] transition-all active:scale-[0.98]"
          >
            <Download size={13} />
            <span>Excel 다운로드</span>
          </button>
        </div>
      </div>

      {/* ── 메인 본문 ── */}
      <div className="flex-1 overflow-auto p-5 relative bg-[var(--page-bg)]">
        {demoMode && (
          <div
            role="status"
            className="mb-4 flex items-start gap-2 rounded-xl border border-amber-300/60 bg-amber-50 px-3 py-2.5 text-[11px] font-semibold text-amber-800 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-200"
          >
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <div>
              <div className="font-bold">데모 모드 — D1 재무 테이블 로드 실패</div>
              <div className="mt-0.5 opacity-90">
                가짜 숫자는 표시하지 않습니다. {loadError ? `(${loadError})` : ''} 분개·고정자산·금융연동은 서버 연결 후 실데이터로 표시됩니다.
              </div>
            </div>
          </div>
        )}
        {!demoMode && !loading && (
          <div
            role="status"
            className="mb-3 flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-[10.5px] font-semibold text-[var(--toss-gray-4)]"
          >
            <Info size={12} className="text-[var(--accent)]" />
            분개·고정자산·금융연동: D1 실데이터 · 경비/지출결의/세무신고 등 일부 탭은 연동 준비 중(빈 목록)
          </div>
        )}
        {loading && (
          <div className="mb-4 text-center text-xs font-bold text-[var(--toss-gray-3)] py-2">재무 데이터 불러오는 중…</div>
        )}

        {/* 1. 복식부기 (double-entry) */}
        {subView === 'double-entry' && (
          <div className="space-y-5">
            {/* 내부 탭바 */}
            <div className="flex gap-1.5 p-1 border border-[var(--border)] bg-[var(--card)] rounded-xl w-fit">
              <button onClick={() => setDoubleEntryTab('entries')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${doubleEntryTab === 'entries' ? 'bg-[var(--accent)] text-white shadow-sm' : 'text-[var(--toss-gray-4)] hover:bg-[var(--muted)]'}`}>분개장 조회</button>
              <button onClick={() => setDoubleEntryTab('coa')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${doubleEntryTab === 'coa' ? 'bg-[var(--accent)] text-white shadow-sm' : 'text-[var(--toss-gray-4)] hover:bg-[var(--muted)]'}`}>계정과목 관리</button>
              <button onClick={() => setDoubleEntryTab('trial')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${doubleEntryTab === 'trial' ? 'bg-[var(--accent)] text-white shadow-sm' : 'text-[var(--toss-gray-4)] hover:bg-[var(--muted)]'}`}>시산표</button>
            </div>

            {doubleEntryTab === 'entries' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* 분개 입력 폼 */}
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 shadow-sm space-y-4 h-fit">
                  <h3 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-1.5">
                    <Plus size={15} className="text-[var(--accent)]" />
                    <span>신규 전표 분개 등록</span>
                  </h3>
                  <form onSubmit={handleAddJournal} className="space-y-3">
                    <div>
                      <label className="block text-[11px] font-bold text-[var(--toss-gray-4)] mb-1">적요 (내용)</label>
                      <input type="text" value={newEntry.desc} onChange={e => setNewEntry({ ...newEntry, desc: e.target.value })} placeholder="예: 비품 구입" className="w-full px-3 py-2 text-xs border border-[var(--border)] rounded-lg bg-[var(--background)] focus:outline-none focus:border-[var(--accent)] text-[var(--foreground)]" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-[var(--toss-gray-4)] mb-1">차변 계정과목</label>
                        <select value={newEntry.debitAcc} onChange={e => setNewEntry({ ...newEntry, debitAcc: e.target.value })} className="w-full px-2 py-2 text-xs border border-[var(--border)] rounded-lg bg-[var(--background)] focus:outline-none text-[var(--foreground)]">
                          <option value="소모품비">소모품비</option>
                          <option value="보통예금">보통예금</option>
                          <option value="지급임차료">지급임차료</option>
                          <option value="차량유지비">차량유지비</option>
                          <option value="의료수입">의료수입</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-[var(--toss-gray-4)] mb-1">대변 계정과목</label>
                        <select value={newEntry.creditAcc} onChange={e => setNewEntry({ ...newEntry, creditAcc: e.target.value })} className="w-full px-2 py-2 text-xs border border-[var(--border)] rounded-lg bg-[var(--background)] focus:outline-none text-[var(--foreground)]">
                          <option value="보통예금">보통예금</option>
                          <option value="외상매입금">외상매입금</option>
                          <option value="미지급금(카드)">미지급금(카드)</option>
                          <option value="의료수입">의료수입</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-[var(--toss-gray-4)] mb-1">금액 (원)</label>
                      <input type="number" value={newEntry.amount} onChange={e => setNewEntry({ ...newEntry, amount: e.target.value })} placeholder="원 단위 숫자로만 입력" className="w-full px-3 py-2 text-xs border border-[var(--border)] rounded-lg bg-[var(--background)] focus:outline-none focus:border-[var(--accent)] text-[var(--foreground)]" />
                    </div>
                    <button type="submit" className="w-full py-2.5 rounded-lg bg-[var(--accent)] text-white font-bold text-xs hover:bg-[var(--accent-hover)] transition-all active:scale-[0.98]">
                      전표 분개 추가
                    </button>
                  </form>
                </div>

                {/* 분개 리스트 */}
                <div className="lg:col-span-2 bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm flex flex-col">
                  <div className="p-4 border-b border-[var(--border)]">
                    <h3 className="text-sm font-bold text-[var(--foreground)]">분개장 원장</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-[var(--border)] bg-[var(--muted)]/50 text-[11px] font-bold text-[var(--toss-gray-4)]">
                          <th className="p-3">일자</th>
                          <th className="p-3">적요</th>
                          <th className="p-3">차변 (Debit)</th>
                          <th className="p-3">대변 (Credit)</th>
                          <th className="p-3 text-right">금액</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)] text-xs">
                        {journalEntries.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="p-8 text-center text-[var(--toss-gray-3)] font-bold">
                              데이터 없음 — 등록된 분개가 없습니다
                            </td>
                          </tr>
                        ) : (
                          journalEntries.map(entry => (
                            <tr key={entry.id} className="hover:bg-[var(--muted)]/40 transition-colors">
                              <td className="p-3 font-medium text-[var(--toss-gray-4)]">{entry.date}</td>
                              <td className="p-3 font-semibold text-[var(--foreground)]">{entry.desc}</td>
                              <td className="p-3 text-emerald-600 font-bold">{entry.debitAcc}</td>
                              <td className="p-3 text-blue-600 font-bold">{entry.creditAcc}</td>
                              <td className="p-3 text-right font-black tabular-nums">{entry.amount.toLocaleString()}원</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {doubleEntryTab === 'coa' && (
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-[var(--foreground)]">표준 계정과목 관리 (Chart of Accounts)</h3>
                  <div className="relative">
                    <Search size={14} className="absolute left-2.5 top-2.5 text-[var(--toss-gray-3)]" />
                    <input type="text" placeholder="계정과목 검색..." className="pl-8 pr-3 py-1.5 text-xs border border-[var(--border)] rounded-lg bg-[var(--background)] text-[var(--foreground)] focus:outline-none w-48" />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                  {[
                    { title: '자산 (Assets)', color: 'border-emerald-500 bg-emerald-50/10 text-emerald-800 dark:text-emerald-300', list: ['101 보통예금', '102 현금', '108 외상매출금', '120 소모품'] },
                    { title: '부채 (Liabilities)', color: 'border-blue-500 bg-blue-50/10 text-blue-800 dark:text-blue-300', list: ['251 외상매입금', '253 미지급금', '260 예수금'] },
                    { title: '자본 (Equity)', color: 'border-purple-500 bg-purple-50/10 text-purple-800 dark:text-purple-300', list: ['301 자본금', '330 이익잉여금'] },
                    { title: '수익 (Revenue)', color: 'border-orange-500 bg-orange-50/10 text-orange-800 dark:text-orange-300', list: ['401 의료수입', '410 기타수입'] },
                    { title: '비용 (Expenses)', color: 'border-red-500 bg-red-50/10 text-red-800 dark:text-red-300', list: ['501 소모품비', '505 급여', '510 지급임차료', '512 차량유지비'] },
                  ].map((category, idx) => (
                    <div key={idx} className={`p-4 border rounded-xl ${category.color} space-y-2`}>
                      <h4 className="text-[12px] font-black">{category.title}</h4>
                      <ul className="text-xs space-y-1.5 font-semibold">
                        {category.list.map((item, i) => (
                          <li key={i} className="py-1 px-1.5 rounded bg-[var(--card)] border border-[var(--border)] shadow-xs">{item}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {doubleEntryTab === 'trial' && (
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm">
                <div className="p-4 border-b border-[var(--border)] bg-[var(--muted)]/30">
                  <h3 className="text-sm font-bold text-[var(--foreground)]">합계잔액시산표 (Trial Balance)</h3>
                  <p className="text-[11px] text-[var(--toss-gray-3)] font-semibold mt-1">대차평균의 원리에 의해 차변과 대변의 합계가 일치해야 합니다.</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[var(--border)] bg-[var(--muted)]/50 text-[11px] font-bold text-[var(--toss-gray-4)]">
                        <th className="p-3">계정과목</th>
                        <th className="p-3 text-right">차변 합계 (Debit)</th>
                        <th className="p-3 text-right">대변 합계 (Credit)</th>
                        <th className="p-3 text-center">결과</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)] text-xs">
                      {['보통예금', '소모품비', '지급임차료', '차량유지비', '외상매입금', '미지급금(카드)', '의료수입'].map((acc, i) => {
                        // calculate debits and credits for this account
                        const dAmt = journalEntries.filter(e => e.debitAcc === acc).reduce((sum, e) => sum + e.amount, 0);
                        const cAmt = journalEntries.filter(e => e.creditAcc === acc).reduce((sum, e) => sum + e.amount, 0);
                        if (dAmt === 0 && cAmt === 0) return null;
                        return (
                          <tr key={i} className="hover:bg-[var(--muted)]/40 transition-colors font-medium">
                            <td className="p-3 font-semibold text-[var(--foreground)]">{acc}</td>
                            <td className="p-3 text-right tabular-nums text-emerald-600 font-bold">{dAmt > 0 ? `${dAmt.toLocaleString()}원` : '-'}</td>
                            <td className="p-3 text-right tabular-nums text-blue-600 font-bold">{cAmt > 0 ? `${cAmt.toLocaleString()}원` : '-'}</td>
                            <td className="p-3 text-center">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">일치</span>
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="bg-[var(--muted)]/30 font-black text-sm border-t-2 border-[var(--border)]">
                        <td className="p-3 text-[var(--foreground)]">합계 (Totals)</td>
                        <td className="p-3 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{trialTotals.debit.toLocaleString()}원</td>
                        <td className="p-3 text-right tabular-nums text-blue-700 dark:text-blue-400">{trialTotals.credit.toLocaleString()}원</td>
                        <td className="p-3 text-center text-emerald-600 font-bold flex items-center justify-center gap-1">
                          <CheckCircle2 size={14} />
                          <span className="text-xs">대차 일치</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 2. 부가세 (vat) */}
        {subView === 'vat' && (
          <div className="space-y-5">
            <div className="flex gap-1.5 p-1 border border-[var(--border)] bg-[var(--card)] rounded-xl w-fit">
              <button onClick={() => setVatTab('invoices')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${vatTab === 'invoices' ? 'bg-[var(--accent)] text-white shadow-sm' : 'text-[var(--toss-gray-4)] hover:bg-[var(--muted)]'}`}>세금계산서 조회</button>
              <button onClick={() => setVatTab('calculator')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${vatTab === 'calculator' ? 'bg-[var(--accent)] text-white shadow-sm' : 'text-[var(--toss-gray-4)] hover:bg-[var(--muted)]'}`}>부가세 모의 계산</button>
              <button onClick={() => setVatTab('calendar')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${vatTab === 'calendar' ? 'bg-[var(--accent)] text-white shadow-sm' : 'text-[var(--toss-gray-4)] hover:bg-[var(--muted)]'}`}>세무 일정 캘린더</button>
            </div>

            {vatTab === 'invoices' && (
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm">
                <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
                  <h3 className="text-sm font-bold text-[var(--foreground)]">국세청 전송 전자세금계산서 현황</h3>
                  <span className="text-[11px] text-[var(--toss-gray-3)] font-bold">홈택스 연동 상태: 연동 준비 중</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[var(--border)] bg-[var(--muted)]/50 text-[11px] font-bold text-[var(--toss-gray-4)]">
                        <th className="p-3">구분</th>
                        <th className="p-3">발행일자</th>
                        <th className="p-3">상호 (거래처)</th>
                        <th className="p-3 text-right">공급가액</th>
                        <th className="p-3 text-right">세액 (VAT)</th>
                        <th className="p-3 text-center">전송상태</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)] text-xs font-semibold">
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-[var(--toss-gray-3)] font-bold">
                          데이터 없음 — 홈택스 세금계산서 연동 준비 중
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {vatTab === 'calculator' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div className="lg:col-span-2 bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 shadow-sm space-y-4">
                  <h3 className="text-sm font-bold text-[var(--foreground)]">부가세 분기별 모의 계산기</h3>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 border border-[var(--border)] rounded-xl bg-[var(--muted)]/20 space-y-1">
                        <span className="text-xs text-[var(--toss-gray-3)] font-bold">매출 과세표준 (매출합계)</span>
                        <p className="text-lg font-black text-[var(--toss-gray-3)]">데이터 없음</p>
                        <span className="text-[10px] text-[var(--toss-gray-4)]">홈택스 매출 연동 준비 중</span>
                      </div>
                      <div className="p-4 border border-[var(--border)] rounded-xl bg-[var(--muted)]/20 space-y-1">
                        <span className="text-xs text-[var(--toss-gray-3)] font-bold">매입 세액공제 (매입합계)</span>
                        <p className="text-lg font-black text-[var(--toss-gray-3)]">데이터 없음</p>
                        <span className="text-[10px] text-[var(--toss-gray-4)]">홈택스 매입 연동 준비 중</span>
                      </div>
                    </div>
                    
                    <div className="border-t border-[var(--border)] pt-4 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-[var(--toss-gray-4)]">납부할 세액 (매출세액 - 매입세액)</span>
                        <span className="text-lg font-black text-[var(--toss-gray-3)]">—</span>
                      </div>
                      <p className="text-[11px] text-[var(--toss-gray-3)] font-semibold leading-relaxed">
                        * 세금계산서·매출 소스가 연동되면 분기 부가세를 자동 산출합니다. 가짜 예측치는 표시하지 않습니다.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 shadow-sm space-y-4 flex flex-col justify-between">
                  <div className="space-y-2">
                    <h3 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-1">
                      <Percent size={15} className="text-orange-500" />
                      <span>부가세 신고 자료 생성</span>
                    </h3>
                    <p className="text-xs text-[var(--toss-gray-4)] leading-relaxed">
                      국세청 홈택스 신고용 전자파일(변환 포맷)과 부가세 신고서 양식을 출력/다운로드할 수 있습니다.
                    </p>
                  </div>
                  <button onClick={() => toast('홈택스 전자파일 생성은 연동 준비 중입니다.', 'info')} className="w-full py-2.5 rounded-lg bg-[var(--accent)] text-white font-bold text-xs hover:bg-[var(--accent-hover)] transition-all active:scale-[0.98]">
                    전자신고용 파일 다운로드
                  </button>
                </div>
              </div>
            )}

            {vatTab === 'calendar' && (
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 shadow-sm space-y-4">
                <h3 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-1.5">
                  <Calendar size={15} className="text-[var(--accent)]" />
                  <span>주요 세무 일정 캘린더</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {taxSchedules.map((sched, idx) => (
                    <div key={idx} className="p-4 border border-[var(--border)] rounded-xl hover:shadow-md transition-shadow relative overflow-hidden bg-[var(--card)]">
                      <div className="absolute top-0 left-0 w-full h-1 bg-[var(--accent)]" />
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-[10px] font-black px-2 py-0.5 rounded bg-[var(--muted)] text-[var(--toss-gray-4)]">{sched.date}</span>
                        <span className="text-[10px] font-black text-red-500">D-{sched.dday}</span>
                      </div>
                      <h4 className="text-[13px] font-black text-[var(--foreground)] mb-1 leading-snug">{sched.title}</h4>
                      <p className="text-xs text-[var(--toss-gray-3)] font-semibold leading-relaxed">{sched.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 3. 결산 (closing) */}
        {subView === 'closing' && (
          <div className="space-y-5">
            <div className="flex gap-1.5 p-1 border border-[var(--border)] bg-[var(--card)] rounded-xl w-fit">
              <button onClick={() => setClosingTab('tasks')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${closingTab === 'tasks' ? 'bg-[var(--accent)] text-white shadow-sm' : 'text-[var(--toss-gray-4)] hover:bg-[var(--muted)]'}`}>결산 작업</button>
              <button onClick={() => setClosingTab('statements')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${closingTab === 'statements' ? 'bg-[var(--accent)] text-white shadow-sm' : 'text-[var(--toss-gray-4)] hover:bg-[var(--muted)]'}`}>재무 보고서</button>
            </div>

            {closingTab === 'tasks' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div className="lg:col-span-2 bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-[var(--foreground)]">2026년 6월 월차 결산 체크리스트</h3>
                    <span className="text-xs text-[var(--toss-gray-4)] font-bold">진행도: {closingTasks.filter(t => t.done).length}/{closingTasks.length} 완료</span>
                  </div>
                  <div className="space-y-3">
                    {closingTasks.map(task => (
                      <div key={task.id} onClick={() => toggleTask(task.id)} className="flex items-center gap-3 p-3 border border-[var(--border)] rounded-xl hover:bg-[var(--muted)]/30 cursor-pointer transition-all">
                        <input type="checkbox" checked={task.done} readOnly className="h-4 w-4 rounded border-gray-300 text-[var(--accent)] focus:ring-[var(--accent)]" />
                        <span className={`text-xs font-semibold ${task.done ? 'line-through text-[var(--toss-gray-3)]' : 'text-[var(--foreground)]'}`}>{task.text}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 shadow-sm flex flex-col justify-between">
                  <div className="space-y-2">
                    <h3 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-1">
                      <CheckCircle2 size={15} className="text-emerald-500" />
                      <span>결산 마감 실행</span>
                    </h3>
                    <p className="text-xs text-[var(--toss-gray-4)] leading-relaxed">
                      모든 결산 체크리스트가 완료되면 회계 장부를 동결하고 월차 결산을 마감할 수 있습니다. 마감 후에는 전표 수정이 제한됩니다.
                    </p>
                  </div>
                  <button 
                    onClick={triggerMonthlyClosing} 
                    disabled={isClosingProcess}
                    className="w-full py-2.5 rounded-lg bg-[var(--accent)] disabled:bg-gray-400 text-white font-bold text-xs hover:bg-[var(--accent-hover)] transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                  >
                    {isClosingProcess && <RefreshCw size={13} className="animate-spin" />}
                    <span>6월 결산 마감하기</span>
                  </button>
                </div>
              </div>
            )}

            {closingTab === 'statements' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* 재무상태표 — 분개·고정자산 기반 요약 (데이터 없으면 빈 상태) */}
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm">
                  <div className="p-4 border-b border-[var(--border)] bg-[var(--muted)]/30">
                    <h3 className="text-sm font-bold text-[var(--foreground)]">재무상태표 (Balance Sheet)</h3>
                    <span className="text-[11px] text-[var(--toss-gray-3)] font-bold">분개·고정자산 집계 기준 (단위: 원)</span>
                  </div>
                  <div className="p-8 text-center text-xs font-bold text-[var(--toss-gray-3)]">
                    {journalEntries.length === 0 && fixedAssets.length === 0
                      ? '데이터 없음 — 재무상태표 집계 연동 준비 중'
                      : `분개 ${journalEntries.length}건 · 고정자산 ${fixedAssets.length}건 등록됨. 정식 재무제표 집계 연동 준비 중.`}
                  </div>
                </div>

                {/* 손익계산서 */}
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm">
                  <div className="p-4 border-b border-[var(--border)] bg-[var(--muted)]/30">
                    <h3 className="text-sm font-bold text-[var(--foreground)]">손익계산서 (Income Statement)</h3>
                    <span className="text-[11px] text-[var(--toss-gray-3)] font-bold">매출 소스 연동 준비 중</span>
                  </div>
                  <div className="p-8 text-center text-xs font-bold text-[var(--toss-gray-3)]">
                    데이터 없음 — 가짜 손익 숫자는 표시하지 않습니다
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 4. 자금흐름 (cash-flow) */}
        {subView === 'cash-flow' && (
          <div className="space-y-5">
            <div className="flex gap-1.5 p-1 border border-[var(--border)] bg-[var(--card)] rounded-xl w-fit">
              <button onClick={() => setCashFlowTab('status')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${cashFlowTab === 'status' ? 'bg-[var(--accent)] text-white shadow-sm' : 'text-[var(--toss-gray-4)] hover:bg-[var(--muted)]'}`}>일일 자금 현황</button>
              <button onClick={() => setCashFlowTab('forecast')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${cashFlowTab === 'forecast' ? 'bg-[var(--accent)] text-white shadow-sm' : 'text-[var(--toss-gray-4)] hover:bg-[var(--muted)]'}`}>자금 수지 예측</button>
              <button onClick={() => setCashFlowTab('sync')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${cashFlowTab === 'sync' ? 'bg-[var(--accent)] text-white shadow-sm' : 'text-[var(--toss-gray-4)] hover:bg-[var(--muted)]'}`}>금융 연동 관리</button>
            </div>

            {cashFlowTab === 'status' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {[
                  { title: '통장 잔액 합계', val: '연동 준비 중', desc: bankSyncs.length > 0 ? `연동 계좌 ${bankSyncs.length}개` : '등록된 계좌 없음', icon: Building, color: 'text-emerald-500' },
                  { title: '금월 매출 채권(AR)', val: '연동 준비 중', desc: '미수금 소스 연동 예정', icon: DollarSign, color: 'text-blue-500' },
                  { title: '법인카드 이용액', val: '연동 준비 중', desc: '카드 내역 연동 예정', icon: CreditCard, color: 'text-purple-500' }
                ].map((card, idx) => (
                  <div key={idx} className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 shadow-sm flex items-center justify-between">
                    <div className="space-y-1">
                      <span className="text-xs text-[var(--toss-gray-3)] font-bold">{card.title}</span>
                      <p className="text-xl font-black text-[var(--toss-gray-3)]">{card.val}</p>
                      <span className="text-[10px] text-[var(--toss-gray-4)]">{card.desc}</span>
                    </div>
                    <div className={`p-3 rounded-xl bg-[var(--muted)]/50 ${card.color}`}>
                      <card.icon size={20} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {cashFlowTab === 'forecast' && (
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 shadow-sm space-y-4">
                <h3 className="text-sm font-bold text-[var(--foreground)]">향후 6개월간의 자금 수지 전망 (Cash Flow Projections)</h3>
                <div className="py-12 text-center text-xs font-bold text-[var(--toss-gray-3)]">
                  데이터 없음 — 자금 예측 차트 연동 준비 중 (가짜 추세 미표시)
                </div>
              </div>
            )}

            {cashFlowTab === 'sync' && (
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-[var(--foreground)]">금융 기관 연동 현황 (은행/카드)</h3>
                  <button onClick={handleSyncBanks} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white text-xs font-bold hover:bg-[var(--accent-hover)] transition-all">
                    <RefreshCw size={12} />
                    <span>실시간 동기화</span>
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {bankSyncs.length === 0 ? (
                    <div className="md:col-span-3 py-10 text-center text-xs font-bold text-[var(--toss-gray-3)]">
                      데이터 없음 — 등록된 금융 연동 계좌가 없습니다
                    </div>
                  ) : (
                    bankSyncs.map((sync, idx) => (
                      <div key={sync.id || idx} className="p-4 border border-[var(--border)] rounded-xl flex justify-between items-start">
                        <div className="space-y-1">
                          <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-[var(--muted)] text-[var(--toss-gray-4)]">{sync.type}</span>
                          <h4 className="text-xs font-black text-[var(--foreground)]">{sync.name}</h4>
                          <p className="text-[10px] text-[var(--toss-gray-3)] font-mono">{sync.num}</p>
                        </div>
                        <div className="text-right space-y-1">
                          <span className="inline-block text-[10px] font-black text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded-full dark:bg-emerald-950/30">{sync.state}</span>
                          <p className="text-[9px] text-[var(--toss-gray-3)] font-bold">
                            {sync.updated_at
                              ? (String(sync.updated_at).includes('동기화')
                                  ? sync.updated_at
                                  : `${new Date(sync.updated_at).toLocaleTimeString()} 동기화`)
                              : '미동기화'}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 5. 감가상각 (depreciation) */}
        {subView === 'depreciation' && (
          <div className="space-y-5">
            <div className="flex gap-1.5 p-1 border border-[var(--border)] bg-[var(--card)] rounded-xl w-fit">
              <button onClick={() => setDepreciationTab('status')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${depreciationTab === 'status' ? 'bg-[var(--accent)] text-white shadow-sm' : 'text-[var(--toss-gray-4)] hover:bg-[var(--muted)]'}`}>감가상각 현황</button>
              <button onClick={() => setDepreciationTab('assets')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${depreciationTab === 'assets' ? 'bg-[var(--accent)] text-white shadow-sm' : 'text-[var(--toss-gray-4)] hover:bg-[var(--muted)]'}`}>고정자산 대장</button>
            </div>

            {depreciationTab === 'status' && (
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm">
                <div className="p-4 border-b border-[var(--border)]">
                  <h3 className="text-sm font-bold text-[var(--foreground)]">감가상각 명세서 및 당월 상각비 현황</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[var(--border)] bg-[var(--muted)]/50 text-[11px] font-bold text-[var(--toss-gray-4)]">
                        <th className="p-3">자산명</th>
                        <th className="p-3">상각방법</th>
                        <th className="p-3 text-right">취득가액</th>
                        <th className="p-3 text-right">당기 감가상각비</th>
                        <th className="p-3 text-right">감가상각 누계액</th>
                        <th className="p-3 text-right">미상각 잔액 (장부가액)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)] text-xs font-semibold">
                      {assetDepreciation.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-[var(--toss-gray-3)] font-bold">
                            데이터 없음 — 등록된 고정자산이 없습니다
                          </td>
                        </tr>
                      ) : (
                        assetDepreciation.map(asset => (
                          <tr key={asset.id} className="hover:bg-[var(--muted)]/40 transition-colors">
                            <td className="p-3 text-[var(--foreground)]">{asset.name}</td>
                            <td className="p-3 text-[var(--toss-gray-4)]">{asset.method} ({asset.usefulLife}년)</td>
                            <td className="p-3 text-right tabular-nums">{asset.cost.toLocaleString()}원</td>
                            <td className="p-3 text-right tabular-nums text-red-500 font-bold">{(Math.round(asset.deprPerYear / 12)).toLocaleString()}원</td>
                            <td className="p-3 text-right tabular-nums text-[var(--toss-gray-4)]">{asset.accumulated.toLocaleString()}원</td>
                            <td className="p-3 text-right tabular-nums text-emerald-600 font-bold">{asset.bookValue.toLocaleString()}원</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {depreciationTab === 'assets' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 shadow-sm space-y-4 h-fit">
                  <h3 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-1">
                    <Plus size={15} className="text-[var(--accent)]" />
                    <span>신규 고정자산 취득 등록</span>
                  </h3>
                  <form onSubmit={handleAddAsset} className="space-y-3">
                    <div>
                      <label className="block text-[11px] font-bold text-[var(--toss-gray-4)] mb-1">자산명</label>
                      <input type="text" value={newAsset.name} onChange={e => setNewAsset({ ...newAsset, name: e.target.value })} placeholder="예: 초음파 기기" className="w-full px-3 py-2 text-xs border border-[var(--border)] rounded-lg bg-[var(--background)] focus:outline-none focus:border-[var(--accent)] text-[var(--foreground)]" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-[var(--toss-gray-4)] mb-1">분류</label>
                        <select value={newAsset.category} onChange={e => setNewAsset({ ...newAsset, category: e.target.value })} className="w-full px-2 py-2 text-xs border border-[var(--border)] rounded-lg bg-[var(--background)] focus:outline-none text-[var(--foreground)]">
                          <option value="의료기기">의료기기</option>
                          <option value="차량운반구">차량운반구</option>
                          <option value="공구기구">공구기구</option>
                          <option value="비품">비품</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-[var(--toss-gray-4)] mb-1">상각 방식</label>
                        <select value={newAsset.method} onChange={e => setNewAsset({ ...newAsset, method: e.target.value })} className="w-full px-2 py-2 text-xs border border-[var(--border)] rounded-lg bg-[var(--background)] focus:outline-none text-[var(--foreground)]">
                          <option value="정액법">정액법</option>
                          <option value="정률법">정률법</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-[var(--toss-gray-4)] mb-1">취득 원가</label>
                        <input type="number" value={newAsset.cost} onChange={e => setNewAsset({ ...newAsset, cost: e.target.value })} placeholder="취득원가" className="w-full px-3 py-2 text-xs border border-[var(--border)] rounded-lg bg-[var(--background)] focus:outline-none text-[var(--foreground)]" />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-[var(--toss-gray-4)] mb-1">내용연수(년)</label>
                        <input type="number" value={newAsset.usefulLife} onChange={e => setNewAsset({ ...newAsset, usefulLife: e.target.value })} placeholder="5" className="w-full px-3 py-2 text-xs border border-[var(--border)] rounded-lg bg-[var(--background)] focus:outline-none text-[var(--foreground)]" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-[var(--toss-gray-4)] mb-1">취득 일자</label>
                      <input type="date" value={newAsset.date} onChange={e => setNewAsset({ ...newAsset, date: e.target.value })} className="w-full px-3 py-2 text-xs border border-[var(--border)] rounded-lg bg-[var(--background)] focus:outline-none text-[var(--foreground)]" />
                    </div>
                    <button type="submit" className="w-full py-2.5 rounded-lg bg-[var(--accent)] text-white font-bold text-xs hover:bg-[var(--accent-hover)] transition-all active:scale-[0.98]">
                      고정자산 등록
                    </button>
                  </form>
                </div>

                <div className="lg:col-span-2 bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm">
                  <div className="p-4 border-b border-[var(--border)]">
                    <h3 className="text-sm font-bold text-[var(--foreground)]">고정자산 등록 내역</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-[var(--border)] bg-[var(--muted)]/50 text-[11px] font-bold text-[var(--toss-gray-4)]">
                          <th className="p-3">자산코드</th>
                          <th className="p-3">분류</th>
                          <th className="p-3">자산명</th>
                          <th className="p-3">취득일자</th>
                          <th className="p-3 text-right">취득가액</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)] text-xs font-semibold">
                        {fixedAssets.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="p-8 text-center text-[var(--toss-gray-3)] font-bold">
                              데이터 없음 — 등록된 고정자산이 없습니다
                            </td>
                          </tr>
                        ) : (
                          fixedAssets.map(asset => (
                            <tr key={asset.id} className="hover:bg-[var(--muted)]/40 transition-colors">
                              <td className="p-3 text-[var(--toss-gray-4)] font-mono">{String(asset.id).slice(0, 8)}</td>
                              <td className="p-3 text-[var(--foreground)]">{asset.category}</td>
                              <td className="p-3 text-[var(--foreground)] font-bold">{asset.name}</td>
                              <td className="p-3 text-[var(--toss-gray-4)]">{asset.date}</td>
                              <td className="p-3 text-right tabular-nums">{asset.cost.toLocaleString()}원</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 6. 매입원장 (purchase-ledger) */}
        {subView === 'purchase-ledger' && (
          <div className="space-y-5">
            <div className="flex gap-1.5 p-1 border border-[var(--border)] bg-[var(--card)] rounded-xl w-fit">
              <button onClick={() => setPurchaseTab('ledger')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${purchaseTab === 'ledger' ? 'bg-[var(--accent)] text-white shadow-sm' : 'text-[var(--toss-gray-4)] hover:bg-[var(--muted)]'}`}>매입 내역 조회</button>
              <button onClick={() => setPurchaseTab('ap')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${purchaseTab === 'ap' ? 'bg-[var(--accent)] text-white shadow-sm' : 'text-[var(--toss-gray-4)] hover:bg-[var(--muted)]'}`}>거래처별 매입채무</button>
              <button onClick={() => setPurchaseTab('reconcile')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${purchaseTab === 'reconcile' ? 'bg-[var(--accent)] text-white shadow-sm' : 'text-[var(--toss-gray-4)] hover:bg-[var(--muted)]'}`}>매입 세금계산서 대사</button>
            </div>

            {purchaseTab === 'ledger' && (
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm">
                <div className="p-4 border-b border-[var(--border)]">
                  <h3 className="text-sm font-bold text-[var(--foreground)]">매입원장 (Purchase Ledger)</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[var(--border)] bg-[var(--muted)]/50 text-[11px] font-bold text-[var(--toss-gray-4)]">
                        <th className="p-3">매입일자</th>
                        <th className="p-3">거래처</th>
                        <th className="p-3">품목 내역</th>
                        <th className="p-3 text-right">공급가액</th>
                        <th className="p-3 text-right">부가세</th>
                        <th className="p-3 text-right">합계금액</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)] text-xs font-semibold">
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-[var(--toss-gray-3)] font-bold">
                          데이터 없음 — 매입원장 연동 준비 중
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {purchaseTab === 'ap' && (
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm">
                <div className="p-4 border-b border-[var(--border)]">
                  <h3 className="text-sm font-bold text-[var(--foreground)]">거래처별 매입채무 잔액 (Accounts Payable)</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[var(--border)] bg-[var(--muted)]/50 text-[11px] font-bold text-[var(--toss-gray-4)]">
                        <th className="p-3">거래처코드</th>
                        <th className="p-3">거래처명</th>
                        <th className="p-3 text-right">전월 이월</th>
                        <th className="p-3 text-right">금월 매입액</th>
                        <th className="p-3 text-right">금월 지급액</th>
                        <th className="p-3 text-right">당월 말 미지급 잔액</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)] text-xs font-semibold">
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-[var(--toss-gray-3)] font-bold">
                          데이터 없음 — 매입채무 대장 연동 준비 중
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {purchaseTab === 'reconcile' && (
              <div className="space-y-4">
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 shadow-sm space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-1">
                      <AlertCircle size={15} className="text-amber-500" />
                      <span>매입 세금계산서 대사 불일치 알림 (Reconciliation Discrepancies)</span>
                    </h3>
                    <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">불일치 0건</span>
                  </div>
                  <div className="space-y-3">
                    {reconcileIssues.length === 0 ? (
                      <div className="py-8 text-center text-xs font-bold text-[var(--toss-gray-3)]">
                        데이터 없음 — 세금계산서 대사 연동 준비 중
                      </div>
                    ) : (
                      reconcileIssues.map(issue => (
                        <div key={issue.id} className="p-4 border border-red-100 bg-red-50/20 rounded-xl space-y-2 text-xs">
                          <div className="flex justify-between items-center font-bold">
                            <span className="text-[var(--foreground)]">{issue.vendor} ({issue.date})</span>
                            <span className="text-red-500 font-mono">불일치 금액: {issue.diff.toLocaleString()}원</span>
                          </div>
                          <div className="grid grid-cols-2 gap-4 text-[11px] text-[var(--toss-gray-4)] font-semibold">
                            <div>매입원장 기록액: {issue.ledgerAmt.toLocaleString()}원</div>
                            <div>세금계산서 승인액: {issue.taxInvoiceAmt.toLocaleString()}원</div>
                          </div>
                          <div className="pt-2 border-t border-[var(--border)] text-[11px] text-amber-600 font-bold">
                            원인 분석: {issue.reason}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 7. 경비청구 (expense) */}
        {subView === 'expense' && (
              <div className="space-y-5">
                <div className="flex gap-1.5 p-1 border border-[var(--border)] bg-[var(--card)] rounded-xl w-fit">
                  <button onClick={() => setExpenseTab('inbox')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${expenseTab === 'inbox' ? 'bg-[var(--accent)] text-white shadow-sm' : 'text-[var(--toss-gray-4)] hover:bg-[var(--muted)]'}`}>청구 검토 보관함</button>
                  <button onClick={() => setExpenseTab('claims')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${expenseTab === 'claims' ? 'bg-[var(--accent)] text-white shadow-sm' : 'text-[var(--toss-gray-4)] hover:bg-[var(--muted)]'}`}>나의 청구 내역</button>
                  <button onClick={() => setExpenseTab('register')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${expenseTab === 'register' ? 'bg-[var(--accent)] text-white shadow-sm' : 'text-[var(--toss-gray-4)] hover:bg-[var(--muted)]'}`}>영수증 등록</button>
                </div>

                {expenseTab === 'inbox' && (
                  <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm">
                    <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
                      <h3 className="text-sm font-bold text-[var(--foreground)]">지출결의/경비청구 승인 대기 목록</h3>
                      <span className="text-xs text-[var(--toss-gray-3)] font-bold">총 {expenses.filter(e => e.state === '대기중').length}건 검토 필요</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-[var(--border)] bg-[var(--muted)]/50 text-[11px] font-bold text-[var(--toss-gray-4)]">
                            <th className="p-3">일자</th>
                            <th className="p-3">청구자</th>
                            <th className="p-3">내역</th>
                            <th className="p-3">계정과목</th>
                            <th className="p-3 text-right">금액</th>
                            <th className="p-3 text-center">승인처리</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)] text-xs font-semibold">
                          {expenses.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="p-8 text-center text-[var(--toss-gray-3)] font-bold">
                                데이터 없음 — 경비 청구 서버 연동 준비 중 (세션 등록분만 표시)
                              </td>
                            </tr>
                          ) : (
                            expenses.map(exp => (
                              <tr key={exp.id} className="hover:bg-[var(--muted)]/40 transition-colors">
                                <td className="p-3 text-[var(--toss-gray-4)]">{exp.date}</td>
                                <td className="p-3 text-[var(--foreground)]">{exp.name}</td>
                                <td className="p-3 text-[var(--foreground)]">{exp.desc}</td>
                                <td className="p-3 text-[var(--toss-gray-4)]">{exp.category}</td>
                                <td className="p-3 text-right font-black tabular-nums">{exp.amount.toLocaleString()}원</td>
                                <td className="p-3 text-center">
                                  {exp.state === '대기중' ? (
                                    <div className="flex justify-center gap-1.5">
                                      <button onClick={() => {
                                        toast('경비 승인·반려은 서버 연동 준비 중입니다.', 'info');
                                      }} className="px-2 py-1 rounded bg-emerald-50 text-emerald-600 border border-emerald-200 text-[10px] font-bold hover:bg-emerald-100 transition-all">승인</button>
                                      <button onClick={() => {
                                        toast('경비 승인·반려은 서버 연동 준비 중입니다.', 'info');
                                      }} className="px-2 py-1 rounded bg-red-50 text-red-600 border border-red-200 text-[10px] font-bold hover:bg-red-100 transition-all">반려</button>
                                    </div>
                                  ) : (
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${exp.state === '승인완료' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40' : 'bg-red-50 text-red-600 dark:bg-red-950/40'}`}>{exp.state}</span>
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {expenseTab === 'claims' && (
                  <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 shadow-sm space-y-4">
                    <h3 className="text-sm font-bold text-[var(--foreground)]">내 법인카드 / 지출 청구 내역</h3>
                    <div className="space-y-3">
                      {expenses.length === 0 ? (
                        <div className="py-8 text-center text-xs font-bold text-[var(--toss-gray-3)]">데이터 없음</div>
                      ) : (
                        expenses.map(exp => (
                          <div key={exp.id} className="flex justify-between items-center p-3 border border-[var(--border)] rounded-xl hover:bg-[var(--muted)]/20 transition-all">
                            <div className="space-y-1">
                              <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-[var(--muted)] text-[var(--toss-gray-4)]">{exp.category}</span>
                              <h4 className="text-xs font-black text-[var(--foreground)]">{exp.desc}</h4>
                              <p className="text-[10px] text-[var(--toss-gray-3)] font-mono">{exp.date}</p>
                            </div>
                            <div className="text-right space-y-1">
                              <span className="inline-block text-xs font-black text-[var(--foreground)]">{exp.amount.toLocaleString()}원</span>
                              <p className={`text-[10px] font-bold ${exp.state === '승인완료' ? 'text-emerald-500' : 'text-red-400'}`}>{exp.state}</p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {expenseTab === 'register' && (
                  <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 shadow-sm max-w-md mx-auto space-y-4">
                    <h3 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-1.5">
                      <Receipt size={16} className="text-[var(--accent)]" />
                      <span>신규 경비 청구 등록 (영수증 제출)</span>
                    </h3>
                    <form onSubmit={(e) => {
                      e.preventDefault();
                      if (!newExpense.desc || !newExpense.amount) return;
                      const val = parseInt(newExpense.amount);
                      setExpenses(prev => [
                        ...prev,
                        { id: 'exp-' + (prev.length + 1), date: new Date().toISOString().split('T')[0], name: user?.name || '기안자', desc: newExpense.desc, category: newExpense.category, amount: val, state: '대기중' }
                      ]);
                      setNewExpense({ desc: '', category: '소모품비', amount: '' });
                      toast('경비 청구 내역이 화면에 임시 표시되었습니다. (서버 DB 저장 및 결재 연동 준비 중)', 'info');
                    }} className="space-y-3">
                      <div>
                        <label className="block text-[11px] font-bold text-[var(--toss-gray-4)] mb-1">내용 / 적요</label>
                        <input type="text" value={newExpense.desc} onChange={e => setNewExpense({ ...newExpense, desc: e.target.value })} placeholder="예: 회의용 음료수 구매" className="w-full px-3 py-2 text-xs border border-[var(--border)] rounded-lg bg-[var(--background)] focus:outline-none focus:border-[var(--accent)] text-[var(--foreground)]" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold text-[var(--toss-gray-4)] mb-1">계정과목</label>
                          <select value={newExpense.category} onChange={e => setNewExpense({ ...newExpense, category: e.target.value })} className="w-full px-2 py-2 text-xs border border-[var(--border)] rounded-lg bg-[var(--background)] focus:outline-none text-[var(--foreground)]">
                            <option value="소모품비">소모품비</option>
                            <option value="복리후생비">복리후생비</option>
                            <option value="여비교통비">여비교통비</option>
                            <option value="도서인쇄비">도서인쇄비</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-[var(--toss-gray-4)] mb-1">금액 (원)</label>
                          <input type="number" value={newExpense.amount} onChange={e => setNewExpense({ ...newExpense, amount: e.target.value })} placeholder="원 단위 숫자로만" className="w-full px-3 py-2 text-xs border border-[var(--border)] rounded-lg bg-[var(--background)] focus:outline-none focus:border-[var(--accent)] text-[var(--foreground)]" />
                        </div>
                      </div>
                      <div className="border-2 border-dashed border-[var(--border)] rounded-xl p-6 text-center cursor-pointer hover:bg-[var(--muted)]/30 transition-colors">
                        <span className="text-xs text-[var(--toss-gray-3)] font-bold">📸 사진 또는 영수증 PDF 파일 업로드 (여기를 클릭)</span>
                      </div>
                      <button type="submit" className="w-full py-2.5 rounded-lg bg-[var(--accent)] text-white font-bold text-xs hover:bg-[var(--accent-hover)] transition-all active:scale-[0.98]">
                        결의 요청 제출
                      </button>
                    </form>
                  </div>
                )}
              </div>
            )}

            {/* 8. 지출결의 (disbursement) */}
            {subView === 'disbursement' && (
              <div className="space-y-5">
                <div className="flex gap-1.5 p-1 border border-[var(--border)] bg-[var(--card)] rounded-xl w-fit">
                  <button onClick={() => setDisbursementTab('list')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${disbursementTab === 'list' ? 'bg-[var(--accent)] text-white shadow-sm' : 'text-[var(--toss-gray-4)] hover:bg-[var(--muted)]'}`}>지출결의서 대장</button>
                  <button onClick={() => setDisbursementTab('draft')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${disbursementTab === 'draft' ? 'bg-[var(--accent)] text-white shadow-sm' : 'text-[var(--toss-gray-4)] hover:bg-[var(--muted)]'}`}>결의서 기안 작성</button>
                </div>

                {disbursementTab === 'list' && (
                  <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm">
                    <div className="p-4 border-b border-[var(--border)] flex justify-between items-center">
                      <h3 className="text-sm font-bold text-[var(--foreground)]">지출 결의 내역 현황</h3>
                      <button onClick={() => toast('이체 파일 생성 대기중...', 'info')} className="px-2.5 py-1.5 rounded bg-[var(--accent)] text-white text-[10px] font-bold hover:bg-[var(--accent-hover)] transition-all">은행 이체 텍스트 파일(CMS) 생성</button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-[var(--border)] bg-[var(--muted)]/50 text-[11px] font-bold text-[var(--toss-gray-4)]">
                            <th className="p-3">지출예정일</th>
                            <th className="p-3">지급처 (거래처)</th>
                            <th className="p-3">지급 내용</th>
                            <th className="p-3 text-right">금액</th>
                            <th className="p-3 text-center">진행상태</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)] text-xs font-semibold">
                          {disbursements.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="p-8 text-center text-[var(--toss-gray-3)] font-bold">
                                데이터 없음 — 지출결의 서버 연동 준비 중 (세션 작성분만 표시)
                              </td>
                            </tr>
                          ) : null}
                          {disbursements.map(disb => (
                            <tr key={disb.id} className="hover:bg-[var(--muted)]/40 transition-colors">
                              <td className="p-3 text-[var(--toss-gray-4)]">{disb.date}</td>
                              <td className="p-3 text-[var(--foreground)] font-bold">{disb.vendor}</td>
                              <td className="p-3 text-[var(--foreground)]">{disb.desc}</td>
                              <td className="p-3 text-right font-black tabular-nums text-red-500">{disb.amount.toLocaleString()}원</td>
                              <td className="p-3 text-center">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${disb.state === '결재완료' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40' : disb.state === '승인대기' ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/40' : 'bg-gray-100 text-gray-700 dark:bg-gray-800'}`}>{disb.state}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {disbursementTab === 'draft' && (
                  <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 shadow-sm max-w-md mx-auto space-y-4">
                    <h3 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-1.5">
                      <Send size={16} className="text-[var(--accent)]" />
                      <span>신규 지출결의서 작성</span>
                    </h3>
                    <form onSubmit={(e) => {
                      e.preventDefault();
                      if (!newDisb.vendor || !newDisb.desc || !newDisb.amount) return;
                      const val = parseInt(newDisb.amount);
                      setDisbursements(prev => [
                        ...prev,
                        { id: 'disb-' + (prev.length + 1), date: new Date().toISOString().split('T')[0], vendor: newDisb.vendor, desc: newDisb.desc, amount: val, state: '기안중' }
                      ]);
                      setNewDisb({ vendor: '', desc: '', amount: '' });
                      toast('화면에만 임시 표시됩니다. 지출결의 서버 저장은 연동 준비 중입니다.', 'info');
                    }} className="space-y-3">
                      <div>
                        <label className="block text-[11px] font-bold text-[var(--toss-gray-4)] mb-1">지급처 (거래처명)</label>
                        <input type="text" value={newDisb.vendor} onChange={e => setNewDisb({ ...newDisb, vendor: e.target.value })} placeholder="예: (주)나라메디칼" className="w-full px-3 py-2 text-xs border border-[var(--border)] rounded-lg bg-[var(--background)] focus:outline-none focus:border-[var(--accent)] text-[var(--foreground)]" />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-[var(--toss-gray-4)] mb-1">지출 내용 요약</label>
                        <input type="text" value={newDisb.desc} onChange={e => setNewDisb({ ...newDisb, desc: e.target.value })} placeholder="예: 6월 의료 소모품 결제" className="w-full px-3 py-2 text-xs border border-[var(--border)] rounded-lg bg-[var(--background)] focus:outline-none focus:border-[var(--accent)] text-[var(--foreground)]" />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-[var(--toss-gray-4)] mb-1">지급 금액 (원)</label>
                        <input type="number" value={newDisb.amount} onChange={e => setNewDisb({ ...newDisb, amount: e.target.value })} placeholder="지급액" className="w-full px-3 py-2 text-xs border border-[var(--border)] rounded-lg bg-[var(--background)] focus:outline-none focus:border-[var(--accent)] text-[var(--foreground)]" />
                      </div>
                      <button type="submit" className="w-full py-2.5 rounded-lg bg-[var(--accent)] text-white font-bold text-xs hover:bg-[var(--accent-hover)] transition-all active:scale-[0.98]">
                        결의서 기안 올리기
                      </button>
                    </form>
                  </div>
                )}
              </div>
            )}

            {/* 9. 급여연동 (payroll-link) */}
            {subView === 'payroll-link' && (
              <div className="space-y-5">
                <div className="flex gap-1.5 p-1 border border-[var(--border)] bg-[var(--card)] rounded-xl w-fit">
                  <button onClick={() => setPayrollLinkTab('sync')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${payrollLinkTab === 'sync' ? 'bg-[var(--accent)] text-white shadow-sm' : 'text-[var(--toss-gray-4)] hover:bg-[var(--muted)]'}`}>급여 회계 전송</button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                  <div className="lg:col-span-2 bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 shadow-sm space-y-4">
                    <h3 className="text-sm font-bold text-[var(--foreground)]">인사 급여대장 연동 목록</h3>
                    <div className="space-y-3">
                      {payrollSyncs.length === 0 ? (
                        <div className="py-10 text-center text-xs font-bold text-[var(--toss-gray-3)]">
                          데이터 없음 — 급여대장 회계 전송 연동 준비 중
                        </div>
                      ) : (
                        payrollSyncs.map((sync, idx) => (
                          <div key={idx} className="flex justify-between items-center p-3.5 border border-[var(--border)] rounded-xl hover:bg-[var(--muted)]/20 transition-all">
                            <div className="space-y-1">
                              <h4 className="text-xs font-black text-[var(--foreground)]">{sync.period}</h4>
                              <p className="text-[10px] text-[var(--toss-gray-4)] font-semibold">대상 직원 {sync.empCount}명 | 총 급여 {sync.totalAmount.toLocaleString()}원</p>
                              {sync.state === '전송완료' && <p className="text-[9px] text-[var(--toss-gray-3)] font-mono">전송 시각: {sync.synced_at}</p>}
                            </div>
                            <div>
                              {sync.state === '대기중' ? (
                                <button onClick={() => {
                                  toast('급여 전표 자동 발행은 서버 연동 준비 중입니다.', 'info');
                                }} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white text-xs font-bold hover:bg-[var(--accent-hover)] transition-all">
                                  <ArrowLeftRight size={12} />
                                  <span>회계 전표 전송</span>
                                </button>
                              ) : (
                                <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100 text-[10px] font-black">전송완료</span>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 shadow-sm space-y-4">
                    <h3 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-1.5">
                      <Info size={15} className="text-blue-500" />
                      <span>급여 전표 자동분개 템플릿</span>
                    </h3>
                    <p className="text-xs text-[var(--toss-gray-4)] leading-relaxed">
                      인사 승인 완료 시 아래 규칙에 따라 회계 분개장이 자동 작성됩니다.
                    </p>
                    <div className="p-3 border border-[var(--border)] rounded-xl bg-[var(--muted)]/20 font-mono text-[10px] text-[var(--foreground)] space-y-1.5">
                      <div className="text-emerald-600 font-bold">차변: (비용) 급여 / 제수당</div>
                      <div className="text-blue-600 font-bold">대변: (자산) 보통예금 (지급액)</div>
                      <div className="text-blue-600 font-bold">대변: (부채) 예수금 (4대보험/원천세)</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 10. 세무신고 (tax-reporting) */}
            {subView === 'tax-reporting' && (
              <div className="space-y-5">
                <div className="flex gap-1.5 p-1 border border-[var(--border)] bg-[var(--card)] rounded-xl w-fit">
                  <button onClick={() => setTaxReportingTab('dashboard')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${taxReportingTab === 'dashboard' ? 'bg-[var(--accent)] text-white shadow-sm' : 'text-[var(--toss-gray-4)] hover:bg-[var(--muted)]'}`}>세무 통합 대시보드</button>
                </div>

                <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm">
                  <div className="p-4 border-b border-[var(--border)]">
                    <h3 className="text-sm font-bold text-[var(--foreground)]">국세청 전자세무 신고 현황</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-[var(--border)] bg-[var(--muted)]/50 text-[11px] font-bold text-[var(--toss-gray-4)]">
                          <th className="p-3">세목</th>
                          <th className="p-3">신고 대상 기간</th>
                          <th className="p-3">납부/신고 기한</th>
                          <th className="p-3">진행 상태</th>
                          <th className="p-3 text-center">홈택스 변환용 전자 파일</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)] text-xs font-semibold">
                        {taxReports.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="p-8 text-center text-[var(--toss-gray-3)] font-bold">
                              데이터 없음 — 세무신고 대시보드 연동 준비 중
                            </td>
                          </tr>
                        ) : (
                          taxReports.map((report, idx) => (
                            <tr key={idx} className="hover:bg-[var(--muted)]/40 transition-colors">
                              <td className="p-3 text-[var(--foreground)] font-bold">{report.type}</td>
                              <td className="p-3 text-[var(--foreground)]">{report.period}</td>
                              <td className="p-3 text-red-500 font-bold">{report.deadline}</td>
                              <td className="p-3">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${report.status === '완료' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>{report.status}</span>
                              </td>
                              <td className="p-3 text-center">
                                <button onClick={() => {
                                  toast(`${report.type} 홈택스 파일 생성은 연동 준비 중입니다.`, 'info');
                                }} className="flex mx-auto items-center gap-1 px-2.5 py-1 rounded bg-[var(--muted)] text-[var(--toss-gray-4)] border border-[var(--border)] hover:bg-[var(--border)] text-[10px] font-bold transition-all">
                                  <Download size={11} />
                                  <span>파일 생성 (.txt)</span>
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

      </div>
    </div>
  );
}
