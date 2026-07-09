'use client';
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { getKoreanTodayString } from '@/lib/seoul-time';
import { db } from '@/lib/db-client';
import { useIsMobile } from '@/app/components/useIsMobile';
import { DesktopOnlyNotice } from '@/app/components/DesktopOnlyNotice';
import { STORAGE_KEYS } from '@/lib/storage-keys';
import { readLocalStorage, writeLocalStorage } from '@/lib/storage-utils';

// recharts는 번들 사이즈가 크므로 동적 로드
const BudgetBarChart = dynamic(() => import('./charts/BudgetBarChart'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[260px] items-center justify-center text-xs text-[var(--toss-gray-3)]">
      차트를 불러오는 중...
    </div>
  ) });

const BUDGET_ITEMS = ['인건비', '운영비', '장비', '기타'] as const;
type BudgetItem = typeof BUDGET_ITEMS[number];

interface BudgetSetting {
  id: string;
  dept: string;
  year: number;
  month: number;
  item: BudgetItem;
  amount: number;
  createdAt: string;
}

interface BudgetExecution {
  id: string;
  dept: string;
  item: BudgetItem;
  amount: number;
  date: string;
  memo: string;
  createdAt: string;
}


export default function BudgetManagement(props: { staffs: any[] }) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return <DesktopOnlyNotice feature="예산 관리" />;
  }
  return <BudgetManagementDesktop {...props} />;
}

function BudgetManagementDesktop({ staffs = [] }: { staffs: any[] }) {
  const [activeTab, setActiveTab] = useState<'설정' | '집행현황'>('설정');
  /** d1 = 서버 실데이터, local = D1 실패 시 브라우저 임시 저장 */
  const [dataSource, setDataSource] = useState<'d1' | 'local' | 'loading'>('loading');

  // 예산 설정 상태
  const [settings, setSettings] = useState<BudgetSetting[]>([]);
  const [settingForm, setSettingForm] = useState({
    dept: '',
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    item: '인건비' as BudgetItem,
    amount: '' });

  // 집행 등록 상태
  const [executions, setExecutions] = useState<BudgetExecution[]>([]);
  const [execForm, setExecForm] = useState({
    dept: '',
    item: '인건비' as BudgetItem,
    amount: '',
    date: getKoreanTodayString(),
    memo: '' });

  const [showExecForm, setShowExecForm] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);

  // 부서 목록 추출
  const deptList = Array.from(new Set([
    ...staffs.map((s: any) => s.dept || s.department).filter(Boolean),
    ...settings.map(s => s.dept),
    ...executions.map(e => e.dept),
  ]));

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // MSO 설계상 회사 격리 불필요 — 전사 조회(필터 없음). migration 0015.
        const [settingRes, execRes] = await Promise.all([
          db.from('budget_settings').select('*'),
          db.from('budget_executions').select('*'),
        ]);
        if (!alive) return;

        const settingErr = settingRes.error;
        const execErr = execRes.error;
        if (settingErr || execErr) {
          // D1 실패 → 로컬 임시 폴백 (명시 라벨)
          const localSettings = readLocalStorage<BudgetSetting[]>(STORAGE_KEYS.BUDGET_SETTINGS, []);
          const localExecs = readLocalStorage<BudgetExecution[]>(STORAGE_KEYS.BUDGET_EXECUTIONS, []);
          setSettings(localSettings);
          setExecutions(localExecs);
          setDataSource('local');
          return;
        }

        setSettings(
          ((settingRes.data as any[]) ?? []).map(r => ({
            id: String(r.id),
            dept: r.dept ?? '',
            year: Number(r.year),
            month: Number(r.month),
            item: r.item as BudgetItem,
            amount: Number(r.amount) || 0,
            createdAt: r.created_at ?? '' })),
        );
        setExecutions(
          ((execRes.data as any[]) ?? []).map(r => ({
            id: String(r.id),
            dept: r.dept ?? '',
            item: r.item as BudgetItem,
            amount: Number(r.amount) || 0,
            date: r.exec_date ?? '',
            memo: r.memo ?? '',
            createdAt: r.created_at ?? '' })),
        );
        setDataSource('d1');
      } catch {
        if (!alive) return;
        const localSettings = readLocalStorage<BudgetSetting[]>(STORAGE_KEYS.BUDGET_SETTINGS, []);
        const localExecs = readLocalStorage<BudgetExecution[]>(STORAGE_KEYS.BUDGET_EXECUTIONS, []);
        setSettings(localSettings);
        setExecutions(localExecs);
        setDataSource('local');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const handleAddSetting = async () => {
    if (!settingForm.dept?.trim() || !settingForm.amount) return;
    if (Number(settingForm.amount) <= 0) return;
    const newItem: BudgetSetting = {
      id: Date.now().toString(),
      dept: settingForm.dept,
      year: settingForm.year,
      month: settingForm.month,
      item: settingForm.item,
      amount: Number(settingForm.amount),
      createdAt: new Date().toISOString() };
    setSettings(prev => {
      const next = [...prev, newItem];
      if (dataSource === 'local') writeLocalStorage(STORAGE_KEYS.BUDGET_SETTINGS, next);
      return next;
    });
    setSettingForm(f => ({ ...f, amount: '', dept: '' }));
    if (dataSource === 'd1') {
      const { error } = await db.from('budget_settings').insert({
        id: newItem.id,
        company: null,
        dept: newItem.dept,
        year: newItem.year,
        month: newItem.month,
        item: newItem.item,
        amount: newItem.amount });
      if (error) {
        // D1 쓰기 실패 시 로컬로 강등
        setDataSource('local');
        setSettings(prev => {
          writeLocalStorage(STORAGE_KEYS.BUDGET_SETTINGS, prev);
          return prev;
        });
      }
    }
  };

  const handleDeleteSetting = async (id: string) => {
    setSettings(prev => {
      const next = prev.filter(s => s.id !== id);
      if (dataSource === 'local') writeLocalStorage(STORAGE_KEYS.BUDGET_SETTINGS, next);
      return next;
    });
    if (dataSource === 'd1') {
      await db.from('budget_settings').delete().eq('id', id);
    }
  };

  const handleAddExecution = async () => {
    if (!execForm.dept?.trim() || !execForm.amount) return;
    if (Number(execForm.amount) <= 0) return;
    const newExec: BudgetExecution = {
      id: Date.now().toString(),
      dept: execForm.dept,
      item: execForm.item,
      amount: Number(execForm.amount),
      date: execForm.date,
      memo: execForm.memo,
      createdAt: new Date().toISOString() };
    setExecutions(prev => {
      const next = [...prev, newExec];
      if (dataSource === 'local') writeLocalStorage(STORAGE_KEYS.BUDGET_EXECUTIONS, next);
      return next;
    });
    setExecForm(f => ({ ...f, amount: '', memo: '' }));
    setShowExecForm(false);
    if (dataSource === 'd1') {
      const { error } = await db.from('budget_executions').insert({
        id: newExec.id,
        company: null,
        dept: newExec.dept,
        item: newExec.item,
        amount: newExec.amount,
        exec_date: newExec.date,
        memo: newExec.memo });
      if (error) {
        setDataSource('local');
        setExecutions(prev => {
          writeLocalStorage(STORAGE_KEYS.BUDGET_EXECUTIONS, prev);
          return prev;
        });
      }
    }
  };

  const handleDeleteExecution = async (id: string) => {
    setExecutions(prev => {
      const next = prev.filter(e => e.id !== id);
      if (dataSource === 'local') writeLocalStorage(STORAGE_KEYS.BUDGET_EXECUTIONS, next);
      return next;
    });
    if (dataSource === 'd1') {
      await db.from('budget_executions').delete().eq('id', id);
    }
  };

  // 집행 현황 차트 데이터 생성
  const chartData = deptList.map(dept => {
    const budget = settings
      .filter(s => s.dept === dept && s.year === selectedYear && s.month === selectedMonth)
      .reduce((acc, s) => acc + s.amount, 0);
    const executed = executions
      .filter(e => {
        if (e.dept !== dept) return false;
        const [y, m] = e.date.split('-').map(Number);
        return y === selectedYear && m === selectedMonth;
      })
      .reduce((acc, e) => acc + e.amount, 0);
    const remaining = Math.max(0, budget - executed);
    return { dept, budget, executed, remaining };
  }).filter(d => d.budget > 0 || d.executed > 0);

  const getStatusBadge = (budget: number, executed: number) => {
    if (budget === 0) return null;
    const ratio = executed / budget;
    if (ratio >= 1) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-[var(--radius-md)] text-xs font-bold bg-danger/20 text-danger">
          초과
        </span>
      );
    }
    if (ratio >= 0.9) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-[var(--radius-md)] text-xs font-bold bg-warning/20 text-warning">
          90% 초과
        </span>
      );
    }
    return null;
  };

  const tabs = [
    { id: '설정' as const, label: '예산 설정' },
    { id: '집행현황' as const, label: '집행 현황' },
  ];

  return (
    <div className="space-y-4 animate-in fade-in duration-300" data-testid="admin-analysis-budget">
      {dataSource === 'local' && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-[var(--radius-md)] border border-amber-300/60 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-800 dark:border-amber-700/40 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <span className="inline-flex items-center rounded px-1.5 py-0.5 bg-amber-200/80 text-amber-900 text-[10px] dark:bg-amber-800 dark:text-amber-100">
            로컬 임시
          </span>
          D1 예산 테이블 연결 실패 — 브라우저 임시 저장을 사용 중입니다. 서버 복구 후 데이터가 동기화되지 않을 수 있습니다.
        </div>
      )}
      {dataSource === 'd1' && (
        <div className="text-[10.5px] font-semibold text-[var(--toss-gray-4)] px-0.5">
          데이터 소스: D1 (budget_settings / budget_executions)
        </div>
      )}
      {/* 액션 */}
      {activeTab === '집행현황' && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--card)] p-3 rounded-[var(--radius-lg)] border border-[var(--border)] shadow-sm">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[var(--toss-gray-4)]">조회 기간:</span>
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(Number(e.target.value))}
              className="px-3 py-1.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] text-xs font-bold text-[var(--foreground)] focus:outline-none focus:border-[var(--accent)]"
            >
              {[2024, 2025, 2026, 2027].map(y => (
                <option key={y} value={y}>{y}년</option>
              ))}
            </select>
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(Number(e.target.value))}
              className="px-3 py-1.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] text-xs font-bold text-[var(--foreground)] focus:outline-none focus:border-[var(--accent)]"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                <option key={m} value={m}>{m}월</option>
              ))}
            </select>
          </div>
          <button
            onClick={() => setShowExecForm(true)}
            className="px-4 py-1.5 rounded-[var(--radius-md)] bg-[var(--accent)] text-white text-sm font-bold hover:opacity-90 transition-opacity"
          >
            + 집행 등록
          </button>
        </div>
      )}

      {/* 탭 */}
      <div className="flex gap-1 bg-[var(--muted)] p-1 rounded-[var(--radius-md)] w-fit">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-[var(--radius-md)] text-sm font-bold transition-all ${activeTab === tab.id
              ? 'bg-[var(--card)] text-[var(--accent)] shadow-sm'
              : 'text-[var(--toss-gray-3)] hover:text-[var(--foreground)]'
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 예산 설정 탭 */}
      {activeTab === '설정' && (
        <div className="space-y-4">
          {/* 등록 카드 */}
          <div className="bg-[var(--card)] rounded-[var(--radius-lg)] p-4 border border-[var(--border)] shadow-sm">
            <h3 className="text-sm font-bold text-[var(--foreground)] mb-3">예산 등록</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label htmlFor="budget-dept-input" className="block text-xs font-bold text-[var(--toss-gray-3)] mb-1.5">
                  부서명 <span className="text-red-500" aria-hidden>*</span>
                </label>
                <input
                  id="budget-dept-input"
                  aria-required="true"
                  list="dept-list-budget"
                  value={settingForm.dept}
                  onChange={e => setSettingForm(f => ({ ...f, dept: e.target.value }))}
                  placeholder="부서 선택 또는 입력"
                  className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                />
                <datalist id="dept-list-budget">
                  {deptList.map(d => <option key={d} value={d} />)}
                </datalist>
              </div>
              <div>
                <label htmlFor="budget-year-input" className="block text-xs font-bold text-[var(--toss-gray-3)] mb-1.5">연도</label>
                <input
                  id="budget-year-input"
                  type="number"
                  value={settingForm.year}
                  onChange={e => setSettingForm(f => ({ ...f, year: Number(e.target.value) }))}
                  className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                />
              </div>
              <div>
                <label htmlFor="budget-month-select" className="block text-xs font-bold text-[var(--toss-gray-3)] mb-1.5">월</label>
                <select
                  id="budget-month-select"
                  value={settingForm.month}
                  onChange={e => setSettingForm(f => ({ ...f, month: Number(e.target.value) }))}
                  className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                    <option key={m} value={m}>{m}월</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="budget-item-select" className="block text-xs font-bold text-[var(--toss-gray-3)] mb-1.5">예산 항목</label>
                <select
                  id="budget-item-select"
                  value={settingForm.item}
                  onChange={e => setSettingForm(f => ({ ...f, item: e.target.value as BudgetItem }))}
                  className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                >
                  {BUDGET_ITEMS.map(item => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="budget-amount-input" className="block text-xs font-bold text-[var(--toss-gray-3)] mb-1.5">
                  예산액 (원) <span className="text-red-500" aria-hidden>*</span>
                </label>
                <input
                  id="budget-amount-input"
                  aria-required="true"
                  type="number"
                  value={settingForm.amount}
                  onChange={e => setSettingForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder="0"
                  className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                />
              </div>
              <div className="flex items-end sm:col-span-2 md:col-span-1">
                <button
                  type="button"
                  onClick={handleAddSetting}
                  disabled={!settingForm.dept || !settingForm.amount}
                  className="w-full px-4 py-2 rounded-[var(--radius-md)] bg-[var(--accent)] text-white text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  등록
                </button>
              </div>
            </div>
          </div>

          {/* 등록된 예산 목록 */}
          <div className="bg-[var(--card)] rounded-[var(--radius-lg)] border border-[var(--border)] shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--border)]">
              <span className="text-sm font-bold text-[var(--foreground)]">등록된 예산 ({settings.length}건)</span>
            </div>
            {settings.length === 0 ? (
              <div className="py-8 text-center text-sm text-[var(--toss-gray-3)]">등록된 예산이 없습니다.</div>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {settings.map(s => (
                  <div key={s.id} className="flex items-center justify-between px-5 py-3 hover:bg-[var(--muted)]/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold px-2 py-0.5 rounded-[var(--radius-md)] bg-[var(--toss-blue-light)] text-[var(--accent)]">{s.item}</span>
                      <div>
                        <span className="text-sm font-bold text-[var(--foreground)]">{s.dept}</span>
                        <span className="text-xs text-[var(--toss-gray-3)] ml-2">{s.year}년 {s.month}월</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-[var(--foreground)]">{s.amount.toLocaleString()}원</span>
                      <button
                        onClick={() => handleDeleteSetting(s.id)}
                        className="text-xs text-[var(--toss-gray-3)] hover:text-red-500 transition-colors"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 집행 현황 탭 */}
      {activeTab === '집행현황' && (
        <div className="space-y-4">
          {/* 집행 등록 모달 */}
          {showExecForm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="budget-exec-modal-title"
                className="bg-[var(--card)] rounded-[var(--radius-xl)] p-4 w-full max-w-md shadow-sm border border-[var(--border)]"
              >
                <h3 id="budget-exec-modal-title" className="text-base font-bold text-[var(--foreground)] mb-3">집행 등록</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label htmlFor="budget-exec-dept" className="block text-xs font-bold text-[var(--toss-gray-3)] mb-1.5">
                      부서 <span className="text-red-500" aria-hidden>*</span>
                    </label>
                    <input
                      id="budget-exec-dept"
                      aria-required="true"
                      list="dept-list-exec"
                      value={execForm.dept}
                      onChange={e => setExecForm(f => ({ ...f, dept: e.target.value }))}
                      placeholder="부서 선택 또는 입력"
                      className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                    />
                    <datalist id="dept-list-exec">
                      {deptList.map(d => <option key={d} value={d} />)}
                    </datalist>
                  </div>
                  <div>
                    <label htmlFor="budget-exec-item" className="block text-xs font-bold text-[var(--toss-gray-3)] mb-1.5">항목</label>
                    <select
                      id="budget-exec-item"
                      value={execForm.item}
                      onChange={e => setExecForm(f => ({ ...f, item: e.target.value as BudgetItem }))}
                      className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                    >
                      {BUDGET_ITEMS.map(item => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="budget-exec-amount" className="block text-xs font-bold text-[var(--toss-gray-3)] mb-1.5">
                      금액 (원) <span className="text-red-500" aria-hidden>*</span>
                    </label>
                    <input
                      id="budget-exec-amount"
                      aria-required="true"
                      type="number"
                      value={execForm.amount}
                      onChange={e => setExecForm(f => ({ ...f, amount: e.target.value }))}
                      placeholder="0"
                      className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                    />
                  </div>
                  <div>
                    <label htmlFor="budget-exec-date" className="block text-xs font-bold text-[var(--toss-gray-3)] mb-1.5">날짜</label>
                    <input
                      id="budget-exec-date"
                      type="date"
                      value={execForm.date}
                      onChange={e => setExecForm(f => ({ ...f, date: e.target.value }))}
                      className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                    />
                  </div>
                  <div>
                    <label htmlFor="budget-exec-memo" className="block text-xs font-bold text-[var(--toss-gray-3)] mb-1.5">메모</label>
                    <input
                      id="budget-exec-memo"
                      type="text"
                      value={execForm.memo}
                      onChange={e => setExecForm(f => ({ ...f, memo: e.target.value }))}
                      placeholder="메모 (선택)"
                      className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                    />
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 mt-4">
                  <button
                    type="button"
                    onClick={() => setShowExecForm(false)}
                    className="flex-1 px-4 py-1.5 rounded-[var(--radius-md)] border border-[var(--border)] text-sm font-bold text-[var(--toss-gray-3)] hover:bg-[var(--muted)] transition-colors"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={handleAddExecution}
                    disabled={!execForm.dept || !execForm.amount}
                    className="flex-1 px-4 py-1.5 rounded-[var(--radius-md)] bg-[var(--accent)] text-white text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    등록
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 차트 */}
          {chartData.length > 0 ? (
            <div className="bg-[var(--card)] rounded-[var(--radius-lg)] p-4 border border-[var(--border)] shadow-sm">
              <h3 className="text-sm font-bold text-[var(--foreground)] mb-3">부서별 예산 vs 집행 현황</h3>
              <BudgetBarChart data={chartData} />
            </div>
          ) : (
            <div className="bg-[var(--card)] rounded-[var(--radius-lg)] p-4 border border-[var(--border)] shadow-sm text-center py-10 text-sm text-[var(--toss-gray-3)]">
              예산 데이터가 없습니다. 먼저 예산을 설정해주세요.
            </div>
          )}

          {/* 부서별 요약 카드 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {chartData.map(d => {
              const ratio = d.budget > 0 ? d.executed / d.budget : 0;
              return (
                <div key={d.dept} className="bg-[var(--card)] rounded-[var(--radius-lg)] p-4 border border-[var(--border)] shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-bold text-[var(--foreground)]">{d.dept}</span>
                    {getStatusBadge(d.budget, d.executed)}
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-[var(--toss-gray-3)]">예산</span>
                      <span className="font-bold text-[var(--foreground)]">{d.budget.toLocaleString()}원</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--toss-gray-3)]">집행</span>
                      <span className={`font-bold ${ratio >= 1 ? 'text-red-500' : ratio >= 0.9 ? 'text-orange-500' : 'text-[var(--foreground)]'}`}>
                        {d.executed.toLocaleString()}원
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--toss-gray-3)]">잔액</span>
                      <span className="font-bold text-[#34C759]">{(d.budget - d.executed).toLocaleString()}원</span>
                    </div>
                    {d.budget > 0 && (
                      <div className="mt-2">
                        <div className="w-full bg-[var(--muted)] rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full transition-all ${ratio >= 1 ? 'bg-red-500/100' : ratio >= 0.9 ? 'bg-orange-400' : 'bg-[var(--accent)]'}`}
                            style={{ width: `${Math.min(100, ratio * 100).toFixed(1)}%` }}
                          />
                        </div>
                        <div className="text-right text-[10px] text-[var(--toss-gray-3)] mt-0.5">{(ratio * 100).toFixed(1)}% 집행</div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 집행 내역 목록 */}
          <div className="bg-[var(--card)] rounded-[var(--radius-lg)] border border-[var(--border)] shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--border)]">
              <span className="text-sm font-bold text-[var(--foreground)]">집행 내역 ({executions.length}건)</span>
            </div>
            {executions.length === 0 ? (
              <div className="py-8 text-center text-sm text-[var(--toss-gray-3)]">등록된 집행 내역이 없습니다.</div>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {[...executions].reverse().map(e => (
                  <div key={e.id} className="flex items-center justify-between px-5 py-3 hover:bg-[var(--muted)]/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold px-2 py-0.5 rounded-[var(--radius-md)] bg-[var(--muted)] text-[var(--toss-gray-3)]">{e.item}</span>
                      <div>
                        <span className="text-sm font-bold text-[var(--foreground)]">{e.dept}</span>
                        <span className="text-xs text-[var(--toss-gray-3)] ml-2">{e.date}</span>
                        {e.memo && <span className="text-xs text-[var(--toss-gray-3)] ml-2">· {e.memo}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-[var(--foreground)]">{e.amount.toLocaleString()}원</span>
                      <button
                        onClick={() => handleDeleteExecution(e.id)}
                        className="text-xs text-[var(--toss-gray-3)] hover:text-red-500 transition-colors"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
