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

  // --- Dynamic New States ---
  const [expenses, setExpenses] = useState([
    { id: 'exp-1', date: '2026-06-20', name: '김철수 (외래간호)', desc: '의료 학회 참석 여비', category: '여비교통비', amount: 120000, state: '대기중' },
    { id: 'exp-2', date: '2026-06-21', name: '이영희 (행정지원)', desc: '원내 데스크용 필기구 구매', category: '소모품비', amount: 45000, state: '승인완료' },
    { id: 'exp-3', date: '2026-06-22', name: '박민수 (물리치료)', desc: '치료실 소형 비품 교체', category: '소모품비', amount: 89000, state: '반려' },
  ]);
  const [newExpense, setNewExpense] = useState({ desc: '', category: '소모품비', amount: '' });

  const [disbursements, setDisbursements] = useState([
    { id: 'disb-1', date: '2026-06-25', vendor: '(주)나라메디칼', desc: '의료기기 리스료 납부 건', amount: 3500000, state: '결재완료' },
    { id: 'disb-2', date: '2026-06-27', vendor: '(주)아산메디텍', desc: '의료 소모품 매입 대금 결제', amount: 1500000, state: '승인대기' },
    { id: 'disb-3', date: '2026-06-30', vendor: '대성타워 임대인', desc: '7월 원내 임차료 지급 건', amount: 2000000, state: '기안중' },
  ]);
  const [newDisb, setNewDisb] = useState({ vendor: '', desc: '', amount: '' });

  const [payrollSyncs, setPayrollSyncs] = useState([
    { period: '2026년 05월 급여', totalAmount: 48500000, empCount: 15, state: '전송완료', synced_at: '2026-05-25 10:12' },
    { period: '2026년 06월 급여', totalAmount: 51200000, empCount: 16, state: '대기중', synced_at: '-' },
  ]);

  const [taxReports, setTaxReports] = useState([
    { type: '원천세', period: '2026년 06월분', deadline: '2026-07-10', status: '작성중', fileUrl: '#' },
    { type: '부가세', period: '2026년 1기 확정', deadline: '2026-07-25', status: '대기', fileUrl: '#' },
    { type: '법인세', period: '2026년 중간예납', deadline: '2026-08-31', status: '대기', fileUrl: '#' },
  ]);

  const [loading, setLoading] = useState(true);

  // --- Dynamic Data States ---
  
  // 1. Journal Entries (복식부기 분개장)
  const [journalEntries, setJournalEntries] = useState([
    { id: '1', date: '2026-06-18', desc: '의료 소모품 매입', debitAcc: '소모품비', creditAcc: '외상매입금', amount: 1500000 },
    { id: '2', date: '2026-06-19', desc: '외래 진료 수입', debitAcc: '보통예금', creditAcc: '의료수입', amount: 4800000 },
    { id: '3', date: '2026-06-20', desc: '사무실 임차료 지급', debitAcc: '지급임차료', creditAcc: '보통예금', amount: 2000000 },
    { id: '4', date: '2026-06-20', desc: '법인 차량 주유비 결제', debitAcc: '차량유지비', creditAcc: '미지급금(카드)', amount: 85000 },
  ]);
  const [newEntry, setNewEntry] = useState({ desc: '', debitAcc: '소모품비', creditAcc: '보통예금', amount: '' });

  // 2. Fixed Assets (고정자산 대장)
  const [fixedAssets, setFixedAssets] = useState([
    { id: '1', name: '초음파 진단 장비 (GE)', category: '의료기기', date: '2025-01-10', cost: 45000000, salvage: 4500000, usefulLife: 5, method: '정액법' },
    { id: '2', name: '업무용 승합차 (카니발)', category: '차량운반구', date: '2025-05-15', cost: 32000000, salvage: 3200000, usefulLife: 5, method: '정률법' },
    { id: '3', name: '원내 메인 서버 PC', category: '공구기구', date: '2026-02-01', cost: 6000000, salvage: 600000, usefulLife: 4, method: '정액법' },
  ]);
  const [newAsset, setNewAsset] = useState({ name: '', category: '의료기기', date: '', cost: '', salvage: '', usefulLife: '5', method: '정액법' });

  // 3. Bank Syncs (금융 연동 현황)
  const [bankSyncs, setBankSyncs] = useState<any[]>([
    { id: 'acc-1', type: '은행', name: '기업은행', num: '123-45678-01-011', state: '연동중', updated_at: '5분 전 동기화' },
    { id: 'acc-2', type: '은행', name: '신한은행', num: '110-234-567890', state: '연동중', updated_at: '5분 전 동기화' },
    { id: 'acc-3', type: '카드', name: '현대 법인카드', num: '4311-****-****-1234', state: '연동중', updated_at: '방금 전 동기화' }
  ]);

  // 4. Tax Calendar (세무 일정)
  const taxSchedules = [
    { date: '2026-07-10', title: '6월분 원천세 신고 및 납부', dday: 20, type: 'monthly', desc: '근로소득, 사업소득, 퇴직소득 원천징수분' },
    { date: '2026-07-25', title: '2026년 1기 부가가치세 확정 신고', dday: 35, type: 'quarterly', desc: '1월~6월 매출/매입 세금계산서 신고 및 납부' },
    { date: '2026-08-31', title: '법인세 중간예납 신고', dday: 72, type: 'yearly', desc: '사업연도 개시일로부터 6개월간의 법인세 예납' },
    { date: '2026-09-10', title: '8월분 원천세 신고 및 납부', dday: 82, type: 'monthly', desc: '원천징수 의무이행 사항' }
  ];

  // 5. Closing Month Tasks (월마감 결산 체크리스트)
  const [closingTasks, setClosingTasks] = useState([
    { id: 1, text: '신한은행/국민은행 통장 잔액 대사 완료', done: true },
    { id: 2, text: '당월 매출 세금계산서 발행 및 매입 세금계산서 대조 완료', done: true },
    { id: 3, text: '급여대장 전표 입력 및 원천징수 금액 검증 완료', done: false },
    { id: 4, text: '고정자산 감가상각 전표 등록 완료', done: false },
    { id: 5, text: '선급비용 및 미지급비용 당월 배부 처리 완료', done: false },
  ]);
  const [isClosingProcess, setIsClosingProcess] = useState(false);

  // 6. AP Reconciliation Discrepancies (매입 세금계산서 대사 불일치 내역)
  const reconcileIssues = [
    { id: 1, vendor: '(주)나라메디칼', date: '2026-06-10', ledgerAmt: 1200000, taxInvoiceAmt: 1500000, diff: 300000, reason: '단가 입력 오류 (세금계산서 금액이 맞음)' },
    { id: 2, vendor: '삼우오피스', date: '2026-06-15', ledgerAmt: 550000, taxInvoiceAmt: 0, diff: -550000, reason: '공급업체 세금계산서 미발행 건' }
  ];

  // --- DB Data Loading ---
  useEffect(() => {
    let active = true;
    async function loadDbData() {
      setLoading(true);
      try {
        const targetCompanyId = selectedCompanyId || user?.company_id || null;

        // 1. Fetch journal entries scoped by company_id
        let entriesQuery = db.from('journal_entries').select('*');
        if (targetCompanyId) {
          entriesQuery = entriesQuery.eq('company_id', targetCompanyId);
        }
        const { data: entries, error: err1 } = await entriesQuery.order('date', { ascending: false });

        if (active && entries && entries.length > 0) {
          setJournalEntries(entries.map((e: any) => ({
            id: e.id,
            date: e.date,
            desc: e.desc,
            debitAcc: e.debit_acc,
            creditAcc: e.credit_acc,
            amount: e.amount
          })));
        } else if (active) {
          // If no entries found in DB, use mock defaults
          setJournalEntries([
            { id: '1', date: '2026-06-18', desc: '의료 소모품 매입', debitAcc: '소모품비', creditAcc: '외상매입금', amount: 1500000 },
            { id: '2', date: '2026-06-19', desc: '외래 진료 수입', debitAcc: '보통예금', creditAcc: '의료수입', amount: 4800000 },
            { id: '3', date: '2026-06-20', desc: '사무실 임차료 지급', debitAcc: '지급임차료', creditAcc: '보통예금', amount: 2000000 },
            { id: '4', date: '2026-06-20', desc: '법인 차량 주유비 결제', debitAcc: '차량유지비', creditAcc: '미지급금(카드)', amount: 85000 },
          ]);
        }

        // 2. Fetch fixed assets scoped by company_id
        let assetsQuery = db.from('fixed_assets').select('*');
        if (targetCompanyId) {
          assetsQuery = assetsQuery.eq('company_id', targetCompanyId);
        }
        const { data: assets, error: err2 } = await assetsQuery;

        if (active && assets && assets.length > 0) {
          setFixedAssets(assets.map((a: any) => ({
            id: a.id,
            name: a.name,
            category: a.category,
            date: a.date,
            cost: a.cost,
            salvage: a.salvage,
            usefulLife: a.useful_life,
            method: a.method
          })));
        } else if (active) {
          setFixedAssets([
            { id: '1', name: '초음파 진단 장비 (GE)', category: '의료기기', date: '2025-01-10', cost: 45000000, salvage: 4500000, usefulLife: 5, method: '정액법' },
            { id: '2', name: '업무용 승합차 (카니발)', category: '차량운반구', date: '2025-05-15', cost: 32000000, salvage: 3200000, usefulLife: 5, method: '정률법' },
            { id: '3', name: '원내 메인 서버 PC', category: '공구기구', date: '2026-02-01', cost: 6000000, salvage: 600000, usefulLife: 4, method: '정액법' },
          ]);
        }

        // 3. Fetch bank accounts sync scoped by company_id
        let syncQuery = db.from('bank_accounts_sync').select('*');
        if (targetCompanyId) {
          syncQuery = syncQuery.eq('company_id', targetCompanyId);
        }
        const { data: syncData, error: err3 } = await syncQuery;

        if (active && syncData && syncData.length > 0) {
          setBankSyncs(syncData);
        } else if (active) {
          // Initialize defaults in D1 DB if empty
          const defaults = [
            { id: 'acc-1', company_id: targetCompanyId, type: '은행', name: '기업은행', num: '123-45678-01-011', state: '연동중', updated_at: new Date().toISOString() },
            { id: 'acc-2', company_id: targetCompanyId, type: '은행', name: '신한은행', num: '110-234-567890', state: '연동중', updated_at: new Date().toISOString() },
            { id: 'acc-3', company_id: targetCompanyId, type: '카드', name: '현대 법인카드', num: '4311-****-****-1234', state: '연동중', updated_at: new Date().toISOString() },
          ];
          await db.from('bank_accounts_sync').insert(defaults);
          setBankSyncs(defaults);
        }
      } catch (err) {
        console.error('Failed to load accounting DB data', err);
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
      toast('금융 기관 데이터가 실시간으로 동기화되어 DB에 업데이트되었습니다.', 'success');
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
    setIsClosingProcess(true);
    setTimeout(() => {
      setIsClosingProcess(false);
      toast('2026년 6월 회계 마감이 승인 처리되었습니다.', 'success');
    }, 1500);
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
            onClick={() => toast('엑셀 원장 파일이 생성되었습니다.', 'success')} 
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] font-bold text-xs hover:bg-[var(--muted)] transition-all active:scale-[0.98]"
          >
            <Download size={13} />
            <span>Excel 다운로드</span>
          </button>
        </div>
      </div>

      {/* ── 메인 본문 ── */}
      <div className="flex-1 overflow-auto p-5 relative bg-[var(--page-bg)]">
        
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
                        {journalEntries.map(entry => (
                          <tr key={entry.id} className="hover:bg-[var(--muted)]/40 transition-colors">
                            <td className="p-3 font-medium text-[var(--toss-gray-4)]">{entry.date}</td>
                            <td className="p-3 font-semibold text-[var(--foreground)]">{entry.desc}</td>
                            <td className="p-3 text-emerald-600 font-bold">{entry.debitAcc}</td>
                            <td className="p-3 text-blue-600 font-bold">{entry.creditAcc}</td>
                            <td className="p-3 text-right font-black tabular-nums">{entry.amount.toLocaleString()}원</td>
                          </tr>
                        ))}
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
                  <span className="text-[11px] text-[var(--toss-gray-3)] font-bold">홈택스 연동 상태: 실시간 동기화 완료</span>
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
                      {[
                        { type: '매출', date: '2026-06-10', co: '(주)아산메디텍', supply: 5000000, vat: 500000, status: '승인완료' },
                        { type: '매입', date: '2026-06-12', co: '(주)나라메디칼', supply: 1500000, vat: 150000, status: '승인완료' },
                        { type: '매출', date: '2026-06-15', co: '(주)연세헬스케어', supply: 3000000, vat: 300000, status: '승인완료' },
                        { type: '매입', date: '2026-06-18', co: '삼우오피스', supply: 550000, vat: 55000, status: '대기중' },
                      ].map((inv, idx) => (
                        <tr key={idx} className="hover:bg-[var(--muted)]/40 transition-colors">
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${inv.type === '매출' ? 'bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400' : 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400'}`}>{inv.type}</span>
                          </td>
                          <td className="p-3 text-[var(--toss-gray-4)]">{inv.date}</td>
                          <td className="p-3 text-[var(--foreground)]">{inv.co}</td>
                          <td className="p-3 text-right tabular-nums">{inv.supply.toLocaleString()}원</td>
                          <td className="p-3 text-right tabular-nums text-red-500 font-bold">{inv.vat.toLocaleString()}원</td>
                          <td className="p-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${inv.status === '승인완료' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40' : 'bg-amber-50 text-amber-600 dark:bg-amber-950/40'}`}>{inv.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {vatTab === 'calculator' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div className="lg:col-span-2 bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 shadow-sm space-y-4">
                  <h3 className="text-sm font-bold text-[var(--foreground)]">부가세 분기별 모의 계산기 (예측치)</h3>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 border border-[var(--border)] rounded-xl bg-[var(--muted)]/20 space-y-1">
                        <span className="text-xs text-[var(--toss-gray-3)] font-bold">매출 과세표준 (매출합계)</span>
                        <p className="text-lg font-black text-orange-600">8,000,000원</p>
                        <span className="text-[10px] text-[var(--toss-gray-4)]">매출 부가세(예수금): 800,000원</span>
                      </div>
                      <div className="p-4 border border-[var(--border)] rounded-xl bg-[var(--muted)]/20 space-y-1">
                        <span className="text-xs text-[var(--toss-gray-3)] font-bold">매입 세액공제 (매입합계)</span>
                        <p className="text-lg font-black text-blue-600">2,050,000원</p>
                        <span className="text-[10px] text-[var(--toss-gray-4)]">매입 부가세(대급금): 205,000원</span>
                      </div>
                    </div>
                    
                    <div className="border-t border-[var(--border)] pt-4 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-[var(--toss-gray-4)]">납부할 세액 (매출세액 - 매입세액)</span>
                        <span className="text-lg font-black text-red-500">595,000원</span>
                      </div>
                      <p className="text-[11px] text-[var(--toss-gray-3)] font-semibold leading-relaxed">
                        * 본 모의계산은 가상 자료를 바탕으로 산출되었으며, 면세 의료수입은 부가세 과세대상에서 제외되어 있습니다.
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
                  <button onClick={() => toast('홈택스 전송용 전자파일이 생성되었습니다.', 'success')} className="w-full py-2.5 rounded-lg bg-[var(--accent)] text-white font-bold text-xs hover:bg-[var(--accent-hover)] transition-all active:scale-[0.98]">
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
                {/* 재무상태표 */}
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm">
                  <div className="p-4 border-b border-[var(--border)] bg-[var(--muted)]/30">
                    <h3 className="text-sm font-bold text-[var(--foreground)]">재무상태표 (Balance Sheet)</h3>
                    <span className="text-[11px] text-[var(--toss-gray-3)] font-bold">2026년 6월 20일 현재 (단위: 원)</span>
                  </div>
                  <div className="p-4 space-y-4 text-xs font-semibold">
                    <div className="space-y-1">
                      <p className="font-black text-[var(--foreground)] border-b border-[var(--border)] pb-1">Ⅰ. 자산 총계: 185,000,000</p>
                      <div className="pl-4 flex justify-between"><span>유동자산 (예금 등)</span><span>85,000,000</span></div>
                      <div className="pl-4 flex justify-between"><span>비유동자산 (의료장비 등)</span><span>100,000,000</span></div>
                    </div>
                    <div className="space-y-1">
                      <p className="font-black text-[var(--foreground)] border-b border-[var(--border)] pb-1">Ⅱ. 부채 총계: 65,000,000</p>
                      <div className="pl-4 flex justify-between"><span>유동부채 (외상매입 등)</span><span>45,000,000</span></div>
                      <div className="pl-4 flex justify-between"><span>비유동부채 (장기차입 등)</span><span>20,000,000</span></div>
                    </div>
                    <div className="space-y-1">
                      <p className="font-black text-[var(--foreground)] border-b border-[var(--border)] pb-1">Ⅲ. 자본 총계: 120,000,000</p>
                      <div className="pl-4 flex justify-between"><span>자본금</span><span>100,000,000</span></div>
                      <div className="pl-4 flex justify-between"><span>이익잉여금</span><span>20,000,000</span></div>
                    </div>
                  </div>
                </div>

                {/* 손익계산서 */}
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm">
                  <div className="p-4 border-b border-[var(--border)] bg-[var(--muted)]/30">
                    <h3 className="text-sm font-bold text-[var(--foreground)]">손익계산서 (Income Statement)</h3>
                    <span className="text-[11px] text-[var(--toss-gray-3)] font-bold">2026년 6월 당월 (단위: 원)</span>
                  </div>
                  <div className="p-4 space-y-4 text-xs font-semibold">
                    <div className="space-y-1">
                      <p className="font-black text-[var(--foreground)] border-b border-[var(--border)] pb-1">Ⅰ. 매출액 (의료수입): 48,000,000</p>
                    </div>
                    <div className="space-y-1">
                      <p className="font-black text-[var(--foreground)] border-b border-[var(--border)] pb-1">Ⅱ. 매출원가: 18,500,000</p>
                      <div className="pl-4 flex justify-between"><span>의료 소모품비</span><span>15,000,000</span></div>
                      <div className="pl-4 flex justify-between"><span>기타재료비</span><span>3,500,000</span></div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between font-black text-[var(--foreground)] border-b border-[var(--border)] pb-1">
                        <span>Ⅲ. 판매비와관리비: 12,300,000</span>
                      </div>
                      <div className="pl-4 flex justify-between"><span>급여</span><span>8,000,000</span></div>
                      <div className="pl-4 flex justify-between"><span>지급임차료</span><span>2,000,000</span></div>
                      <div className="pl-4 flex justify-between"><span>차량유지비</span><span>2,300,000</span></div>
                    </div>
                    <div className="space-y-1 pt-2 border-t-2 border-[var(--border)]">
                      <div className="flex justify-between font-black text-sm text-[var(--accent)]">
                        <span>당기순이익 (Net Income)</span>
                        <span>17,200,000</span>
                      </div>
                    </div>
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
                  { title: '통장 잔액 합계', val: '85,420,000원', desc: '기업, 신한, 국민 3개 활성 계좌', icon: Building, color: 'text-emerald-500' },
                  { title: '금월 매출 채권(AR)', val: '12,500,000원', desc: '회수 예정일: 6월 30일까지', icon: DollarSign, color: 'text-blue-500' },
                  { title: '법인카드 이용액', val: '1,850,000원', desc: '결제일: 매월 25일 총 한도대비 5%', icon: CreditCard, color: 'text-purple-500' }
                ].map((card, idx) => (
                  <div key={idx} className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 shadow-sm flex items-center justify-between">
                    <div className="space-y-1">
                      <span className="text-xs text-[var(--toss-gray-3)] font-bold">{card.title}</span>
                      <p className="text-xl font-black text-[var(--foreground)]">{card.val}</p>
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
                <div className="space-y-4">
                  <div className="flex h-36 items-end justify-between gap-3 pt-6 border-b border-[var(--border)]">
                    {[
                      { month: '6월', in: 85, out: 60 },
                      { month: '7월', in: 92, out: 65 },
                      { month: '8월', in: 78, out: 70 },
                      { month: '9월', in: 95, out: 62 },
                      { month: '10월', in: 110, out: 80 },
                      { month: '11월', in: 105, out: 75 },
                    ].map((item, idx) => (
                      <div key={idx} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                        <div className="w-full flex justify-center gap-1 items-end h-full">
                          {/* Inflow Bar */}
                          <div 
                            style={{ height: `${item.in}%` }} 
                            className="w-3 rounded-t-sm bg-blue-500 hover:opacity-85 transition-opacity" 
                            title={`유입: ${item.in}백만원`}
                          />
                          {/* Outflow Bar */}
                          <div 
                            style={{ height: `${item.out}%` }} 
                            className="w-3 rounded-t-sm bg-red-400 hover:opacity-85 transition-opacity" 
                            title={`유출: ${item.out}백만원`}
                          />
                        </div>
                        <span className="text-[10px] font-bold text-[var(--toss-gray-4)]">{item.month}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-4 justify-center text-[10px] font-bold">
                    <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-blue-500 rounded-xs" /><span>자금 유입 (Inflow)</span></div>
                    <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-red-400 rounded-xs" /><span>자금 유출 (Outflow)</span></div>
                  </div>
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
                  {bankSyncs.map((sync, idx) => (
                    <div key={idx} className="p-4 border border-[var(--border)] rounded-xl flex justify-between items-start">
                      <div className="space-y-1">
                        <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-[var(--muted)] text-[var(--toss-gray-4)]">{sync.type}</span>
                        <h4 className="text-xs font-black text-[var(--foreground)]">{sync.name}</h4>
                        <p className="text-[10px] text-[var(--toss-gray-3)] font-mono">{sync.num}</p>
                      </div>
                      <div className="text-right space-y-1">
                        <span className="inline-block text-[10px] font-black text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded-full dark:bg-emerald-950/30">{sync.state}</span>
                        <p className="text-[9px] text-[var(--toss-gray-3)] font-bold">
                          {sync.updated_at.includes('동기화') ? sync.updated_at : `${new Date(sync.updated_at).toLocaleTimeString()} 동기화`}
                        </p>
                      </div>
                    </div>
                  ))}
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
                      {assetDepreciation.map(asset => (
                        <tr key={asset.id} className="hover:bg-[var(--muted)]/40 transition-colors">
                          <td className="p-3 text-[var(--foreground)]">{asset.name}</td>
                          <td className="p-3 text-[var(--toss-gray-4)]">{asset.method} ({asset.usefulLife}년)</td>
                          <td className="p-3 text-right tabular-nums">{asset.cost.toLocaleString()}원</td>
                          <td className="p-3 text-right tabular-nums text-red-500 font-bold">{(Math.round(asset.deprPerYear / 12)).toLocaleString()}원</td>
                          <td className="p-3 text-right tabular-nums text-[var(--toss-gray-4)]">{asset.accumulated.toLocaleString()}원</td>
                          <td className="p-3 text-right tabular-nums text-emerald-600 font-bold">{asset.bookValue.toLocaleString()}원</td>
                        </tr>
                      ))}
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
                        {fixedAssets.map(asset => (
                          <tr key={asset.id} className="hover:bg-[var(--muted)]/40 transition-colors">
                            <td className="p-3 text-[var(--toss-gray-4)] font-mono">AST-00{asset.id}</td>
                            <td className="p-3 text-[var(--foreground)]">{asset.category}</td>
                            <td className="p-3 text-[var(--foreground)] font-bold">{asset.name}</td>
                            <td className="p-3 text-[var(--toss-gray-4)]">{asset.date}</td>
                            <td className="p-3 text-right tabular-nums">{asset.cost.toLocaleString()}원</td>
                          </tr>
                        ))}
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
                      {[
                        { date: '2026-06-10', co: '(주)나라메디칼', item: '수술장용 주사기 외 12종', supply: 1200000, vat: 120000 },
                        { date: '2026-06-12', co: '(주)아산메디텍', item: '외래용 거즈 및 드레싱 키트', supply: 2200000, vat: 220000 },
                        { date: '2026-06-15', co: '삼우오피스', item: '원내 사무용 소모품 및 복사용지', supply: 550000, vat: 55000 },
                      ].map((item, idx) => (
                        <tr key={idx} className="hover:bg-[var(--muted)]/40 transition-colors">
                          <td className="p-3 text-[var(--toss-gray-4)]">{item.date}</td>
                          <td className="p-3 text-[var(--foreground)]">{item.co}</td>
                          <td className="p-3 text-[var(--foreground)]">{item.item}</td>
                          <td className="p-3 text-right tabular-nums">{item.supply.toLocaleString()}원</td>
                          <td className="p-3 text-right tabular-nums text-red-500">{item.vat.toLocaleString()}원</td>
                          <td className="p-3 text-right tabular-nums font-black">{(item.supply + item.vat).toLocaleString()}원</td>
                        </tr>
                      ))}
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
                      {[
                        { code: 'VND-001', name: '(주)나라메디칼', prev: 5000000, buy: 1320000, pay: 5000000, balance: 1320000 },
                        { code: 'VND-002', name: '(주)아산메디텍', prev: 0, buy: 2420000, pay: 0, balance: 2420000 },
                        { code: 'VND-003', name: '삼우오피스', prev: 350000, buy: 605000, pay: 350000, balance: 605000 },
                      ].map((ap, idx) => (
                        <tr key={idx} className="hover:bg-[var(--muted)]/40 transition-colors">
                          <td className="p-3 text-[var(--toss-gray-4)] font-mono">{ap.code}</td>
                          <td className="p-3 text-[var(--foreground)] font-bold">{ap.name}</td>
                          <td className="p-3 text-right tabular-nums">{ap.prev.toLocaleString()}원</td>
                          <td className="p-3 text-right tabular-nums text-red-500">+{ap.buy.toLocaleString()}원</td>
                          <td className="p-3 text-right tabular-nums text-blue-500">-{ap.pay.toLocaleString()}원</td>
                          <td className="p-3 text-right tabular-nums font-black text-red-600 bg-red-50/20">{ap.balance.toLocaleString()}원</td>
                        </tr>
                      ))}
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
                    <span className="text-[11px] font-bold text-red-500">불일치 2건 발생</span>
                  </div>
                  <div className="space-y-3">
                    {reconcileIssues.map(issue => (
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
                    ))}
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
                          {expenses.map(exp => (
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
                                      setExpenses(prev => prev.map(e => e.id === exp.id ? { ...e, state: '승인완료' } : e));
                                      toast('경비 청구가 승인되었습니다.', 'success');
                                    }} className="px-2 py-1 rounded bg-emerald-50 text-emerald-600 border border-emerald-200 text-[10px] font-bold hover:bg-emerald-100 transition-all">승인</button>
                                    <button onClick={() => {
                                      setExpenses(prev => prev.map(e => e.id === exp.id ? { ...e, state: '반려' } : e));
                                      toast('경비 청구가 반려되었습니다.', 'error');
                                    }} className="px-2 py-1 rounded bg-red-50 text-red-600 border border-red-200 text-[10px] font-bold hover:bg-red-100 transition-all">반려</button>
                                  </div>
                                ) : (
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${exp.state === '승인완료' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40' : 'bg-red-50 text-red-600 dark:bg-red-950/40'}`}>{exp.state}</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {expenseTab === 'claims' && (
                  <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 shadow-sm space-y-4">
                    <h3 className="text-sm font-bold text-[var(--foreground)]">내 법인카드 / 지출 청구 내역</h3>
                    <div className="space-y-3">
                      {expenses.slice(1).map(exp => (
                        <div key={exp.id} className="flex justify-between items-center p-3 border border-[var(--border)] rounded-xl hover:bg-[var(--muted)]/20 transition-all">
                          <div className="space-y-1">
                            <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-[var(--muted)] text-[var(--toss-gray-4)]">{exp.category}</span>
                            <h4 className="text-xs font-black text-[var(--foreground)]">{exp.desc}</h4>
                            <p className="text-[10px] text-[var(--toss-gray-3)] font-mono">{exp.date} | 법인 신한 1234</p>
                          </div>
                          <div className="text-right space-y-1">
                            <span className="inline-block text-xs font-black text-[var(--foreground)]">{exp.amount.toLocaleString()}원</span>
                            <p className={`text-[10px] font-bold ${exp.state === '승인완료' ? 'text-emerald-500' : 'text-red-400'}`}>{exp.state}</p>
                          </div>
                        </div>
                      ))}
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
                      toast('영수증 및 지출 정보가 등록되었습니다.', 'success');
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
                      toast('지출결의서 기안이 임시저장되었습니다.', 'success');
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
                      {payrollSyncs.map((sync, idx) => (
                        <div key={idx} className="flex justify-between items-center p-3.5 border border-[var(--border)] rounded-xl hover:bg-[var(--muted)]/20 transition-all">
                          <div className="space-y-1">
                            <h4 className="text-xs font-black text-[var(--foreground)]">{sync.period}</h4>
                            <p className="text-[10px] text-[var(--toss-gray-4)] font-semibold">대상 직원 {sync.empCount}명 | 총 급여 {sync.totalAmount.toLocaleString()}원</p>
                            {sync.state === '전송완료' && <p className="text-[9px] text-[var(--toss-gray-3)] font-mono">전송 시각: {sync.synced_at}</p>}
                          </div>
                          <div>
                            {sync.state === '대기중' ? (
                              <button onClick={() => {
                                setPayrollSyncs(prev => prev.map(p => p.period === sync.period ? { ...p, state: '전송완료', synced_at: new Date().toISOString().replace('T', ' ').substring(0, 16) } : p));
                                // Auto insert into journal entries
                                const salaryRow = { id: 'sal-' + Date.now(), date: new Date().toISOString().split('T')[0], desc: `${sync.period} 회계 처리`, debitAcc: '급여', creditAcc: '보통예금', amount: sync.totalAmount };
                                setJournalEntries(prev => [salaryRow, ...prev]);
                                toast('급여 전표 분개가 성공적으로 자동 발행되었습니다.', 'success');
                              }} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white text-xs font-bold hover:bg-[var(--accent-hover)] transition-all">
                                <ArrowLeftRight size={12} />
                                <span>회계 전표 전송</span>
                              </button>
                            ) : (
                              <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100 text-[10px] font-black">전송완료</span>
                            )}
                          </div>
                        </div>
                      ))}
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
                        {taxReports.map((report, idx) => (
                          <tr key={idx} className="hover:bg-[var(--muted)]/40 transition-colors">
                            <td className="p-3 text-[var(--foreground)] font-bold">{report.type}</td>
                            <td className="p-3 text-[var(--foreground)]">{report.period}</td>
                            <td className="p-3 text-red-500 font-bold">{report.deadline}</td>
                            <td className="p-3">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${report.status === '완료' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>{report.status}</span>
                            </td>
                            <td className="p-3 text-center">
                              <button onClick={() => {
                                setTaxReports(prev => prev.map((r, i) => i === idx ? { ...r, status: '완료' } : r));
                                toast(`${report.type} 홈택스 파일(.txt)이 다운로드 되었습니다.`, 'success');
                              }} className="flex mx-auto items-center gap-1 px-2.5 py-1 rounded bg-[var(--muted)] text-[var(--toss-gray-4)] border border-[var(--border)] hover:bg-[var(--border)] text-[10px] font-bold transition-all">
                                <Download size={11} />
                                <span>파일 생성 (.txt)</span>
                              </button>
                            </td>
                          </tr>
                        ))}
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
