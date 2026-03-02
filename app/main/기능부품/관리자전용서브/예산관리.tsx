'use client';
import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const BUDGET_SETTINGS_KEY = 'erp_budget_settings';
const BUDGET_EXECUTIONS_KEY = 'erp_budget_executions';

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

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage(key: string, value: any) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* ignore */ }
}

export default function BudgetManagement({ staffs = [] }: { staffs: any[] }) {
  const [activeTab, setActiveTab] = useState<'설정' | '집행현황'>('설정');

  // 예산 설정 상태
  const [settings, setSettings] = useState<BudgetSetting[]>([]);
  const [settingForm, setSettingForm] = useState({
    dept: '',
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    item: '인건비' as BudgetItem,
    amount: '',
  });

  // 집행 등록 상태
  const [executions, setExecutions] = useState<BudgetExecution[]>([]);
  const [execForm, setExecForm] = useState({
    dept: '',
    item: '인건비' as BudgetItem,
    amount: '',
    date: new Date().toISOString().slice(0, 10),
    memo: '',
  });

  const [showExecForm, setShowExecForm] = useState(false);

  // 부서 목록 추출
  const deptList = Array.from(new Set([
    ...staffs.map((s: any) => s.dept || s.department).filter(Boolean),
    ...settings.map(s => s.dept),
    ...executions.map(e => e.dept),
  ]));

  useEffect(() => {
    setSettings(loadFromStorage<BudgetSetting[]>(BUDGET_SETTINGS_KEY, []));
    setExecutions(loadFromStorage<BudgetExecution[]>(BUDGET_EXECUTIONS_KEY, []));
  }, []);

  const handleAddSetting = () => {
    if (!settingForm.dept || !settingForm.amount) return;
    const newItem: BudgetSetting = {
      id: Date.now().toString(),
      dept: settingForm.dept,
      year: settingForm.year,
      month: settingForm.month,
      item: settingForm.item,
      amount: Number(settingForm.amount),
      createdAt: new Date().toISOString(),
    };
    const updated = [...settings, newItem];
    setSettings(updated);
    saveToStorage(BUDGET_SETTINGS_KEY, updated);
    setSettingForm(f => ({ ...f, amount: '', dept: '' }));
  };

  const handleDeleteSetting = (id: string) => {
    const updated = settings.filter(s => s.id !== id);
    setSettings(updated);
    saveToStorage(BUDGET_SETTINGS_KEY, updated);
  };

  const handleAddExecution = () => {
    if (!execForm.dept || !execForm.amount) return;
    const newExec: BudgetExecution = {
      id: Date.now().toString(),
      dept: execForm.dept,
      item: execForm.item,
      amount: Number(execForm.amount),
      date: execForm.date,
      memo: execForm.memo,
      createdAt: new Date().toISOString(),
    };
    const updated = [...executions, newExec];
    setExecutions(updated);
    saveToStorage(BUDGET_EXECUTIONS_KEY, updated);
    setExecForm(f => ({ ...f, amount: '', memo: '' }));
    setShowExecForm(false);
  };

  const handleDeleteExecution = (id: string) => {
    const updated = executions.filter(e => e.id !== id);
    setExecutions(updated);
    saveToStorage(BUDGET_EXECUTIONS_KEY, updated);
  };

  // 집행 현황 차트 데이터 생성
  const chartData = deptList.map(dept => {
    const budget = settings
      .filter(s => s.dept === dept)
      .reduce((acc, s) => acc + s.amount, 0);
    const executed = executions
      .filter(e => e.dept === dept)
      .reduce((acc, e) => acc + e.amount, 0);
    const remaining = Math.max(0, budget - executed);
    return { dept, budget, executed, remaining };
  }).filter(d => d.budget > 0 || d.executed > 0);

  const getStatusBadge = (budget: number, executed: number) => {
    if (budget === 0) return null;
    const ratio = executed / budget;
    if (ratio >= 1) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-600">
          초과
        </span>
      );
    }
    if (ratio >= 0.9) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-600">
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
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-[var(--foreground)]">예산 관리</h2>
          <p className="text-sm text-[var(--toss-gray-3)] mt-0.5">부서별 예산 설정 및 집행 현황을 관리합니다.</p>
        </div>
        {activeTab === '집행현황' && (
          <button
            onClick={() => setShowExecForm(true)}
            className="px-4 py-2 rounded-[10px] bg-[var(--toss-blue)] text-white text-sm font-bold hover:opacity-90 transition-opacity"
          >
            + 집행 등록
          </button>
        )}
      </div>

      {/* 탭 */}
      <div className="flex gap-1 bg-[var(--toss-gray-1)] p-1 rounded-[12px] w-fit">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-[10px] text-sm font-bold transition-all ${activeTab === tab.id
              ? 'bg-white text-[var(--toss-blue)] shadow-sm'
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
          <div className="bg-[var(--toss-card)] rounded-[16px] p-5 border border-[var(--toss-border)] shadow-sm">
            <h3 className="text-sm font-bold text-[var(--foreground)] mb-4">예산 등록</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-[var(--toss-gray-3)] mb-1.5">부서명</label>
                <input
                  list="dept-list-budget"
                  value={settingForm.dept}
                  onChange={e => setSettingForm(f => ({ ...f, dept: e.target.value }))}
                  placeholder="부서 선택 또는 입력"
                  className="w-full px-3 py-2 rounded-[10px] border border-[var(--toss-border)] bg-[var(--toss-gray-1)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--toss-blue)] transition-colors"
                />
                <datalist id="dept-list-budget">
                  {deptList.map(d => <option key={d} value={d} />)}
                </datalist>
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--toss-gray-3)] mb-1.5">연도</label>
                <input
                  type="number"
                  value={settingForm.year}
                  onChange={e => setSettingForm(f => ({ ...f, year: Number(e.target.value) }))}
                  className="w-full px-3 py-2 rounded-[10px] border border-[var(--toss-border)] bg-[var(--toss-gray-1)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--toss-blue)] transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--toss-gray-3)] mb-1.5">월</label>
                <select
                  value={settingForm.month}
                  onChange={e => setSettingForm(f => ({ ...f, month: Number(e.target.value) }))}
                  className="w-full px-3 py-2 rounded-[10px] border border-[var(--toss-border)] bg-[var(--toss-gray-1)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--toss-blue)] transition-colors"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                    <option key={m} value={m}>{m}월</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--toss-gray-3)] mb-1.5">예산 항목</label>
                <select
                  value={settingForm.item}
                  onChange={e => setSettingForm(f => ({ ...f, item: e.target.value as BudgetItem }))}
                  className="w-full px-3 py-2 rounded-[10px] border border-[var(--toss-border)] bg-[var(--toss-gray-1)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--toss-blue)] transition-colors"
                >
                  {BUDGET_ITEMS.map(item => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--toss-gray-3)] mb-1.5">예산액 (원)</label>
                <input
                  type="number"
                  value={settingForm.amount}
                  onChange={e => setSettingForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder="0"
                  className="w-full px-3 py-2 rounded-[10px] border border-[var(--toss-border)] bg-[var(--toss-gray-1)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--toss-blue)] transition-colors"
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={handleAddSetting}
                  disabled={!settingForm.dept || !settingForm.amount}
                  className="w-full px-4 py-2 rounded-[10px] bg-[var(--toss-blue)] text-white text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  등록
                </button>
              </div>
            </div>
          </div>

          {/* 등록된 예산 목록 */}
          <div className="bg-[var(--toss-card)] rounded-[16px] border border-[var(--toss-border)] shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--toss-border)]">
              <span className="text-sm font-bold text-[var(--foreground)]">등록된 예산 ({settings.length}건)</span>
            </div>
            {settings.length === 0 ? (
              <div className="py-12 text-center text-sm text-[var(--toss-gray-3)]">등록된 예산이 없습니다.</div>
            ) : (
              <div className="divide-y divide-[var(--toss-border)]">
                {settings.map(s => (
                  <div key={s.id} className="flex items-center justify-between px-5 py-3 hover:bg-[var(--toss-gray-1)]/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[var(--toss-blue-light)] text-[var(--toss-blue)]">{s.item}</span>
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
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
              <div className="bg-[var(--toss-card)] rounded-[20px] p-6 w-full max-w-md shadow-2xl border border-[var(--toss-border)] mx-4">
                <h3 className="text-base font-bold text-[var(--foreground)] mb-4">집행 등록</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-[var(--toss-gray-3)] mb-1.5">부서</label>
                    <input
                      list="dept-list-exec"
                      value={execForm.dept}
                      onChange={e => setExecForm(f => ({ ...f, dept: e.target.value }))}
                      placeholder="부서 선택 또는 입력"
                      className="w-full px-3 py-2 rounded-[10px] border border-[var(--toss-border)] bg-[var(--toss-gray-1)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--toss-blue)] transition-colors"
                    />
                    <datalist id="dept-list-exec">
                      {deptList.map(d => <option key={d} value={d} />)}
                    </datalist>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[var(--toss-gray-3)] mb-1.5">항목</label>
                    <select
                      value={execForm.item}
                      onChange={e => setExecForm(f => ({ ...f, item: e.target.value as BudgetItem }))}
                      className="w-full px-3 py-2 rounded-[10px] border border-[var(--toss-border)] bg-[var(--toss-gray-1)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--toss-blue)] transition-colors"
                    >
                      {BUDGET_ITEMS.map(item => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[var(--toss-gray-3)] mb-1.5">금액 (원)</label>
                    <input
                      type="number"
                      value={execForm.amount}
                      onChange={e => setExecForm(f => ({ ...f, amount: e.target.value }))}
                      placeholder="0"
                      className="w-full px-3 py-2 rounded-[10px] border border-[var(--toss-border)] bg-[var(--toss-gray-1)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--toss-blue)] transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[var(--toss-gray-3)] mb-1.5">날짜</label>
                    <input
                      type="date"
                      value={execForm.date}
                      onChange={e => setExecForm(f => ({ ...f, date: e.target.value }))}
                      className="w-full px-3 py-2 rounded-[10px] border border-[var(--toss-border)] bg-[var(--toss-gray-1)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--toss-blue)] transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[var(--toss-gray-3)] mb-1.5">메모</label>
                    <input
                      type="text"
                      value={execForm.memo}
                      onChange={e => setExecForm(f => ({ ...f, memo: e.target.value }))}
                      placeholder="메모 (선택)"
                      className="w-full px-3 py-2 rounded-[10px] border border-[var(--toss-border)] bg-[var(--toss-gray-1)] text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--toss-blue)] transition-colors"
                    />
                  </div>
                </div>
                <div className="flex gap-2 mt-5">
                  <button
                    onClick={() => setShowExecForm(false)}
                    className="flex-1 px-4 py-2 rounded-[10px] border border-[var(--toss-border)] text-sm font-bold text-[var(--toss-gray-3)] hover:bg-[var(--toss-gray-1)] transition-colors"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleAddExecution}
                    disabled={!execForm.dept || !execForm.amount}
                    className="flex-1 px-4 py-2 rounded-[10px] bg-[var(--toss-blue)] text-white text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    등록
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 차트 */}
          {chartData.length > 0 ? (
            <div className="bg-[var(--toss-card)] rounded-[16px] p-5 border border-[var(--toss-border)] shadow-sm">
              <h3 className="text-sm font-bold text-[var(--foreground)] mb-4">부서별 예산 vs 집행 현황</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--toss-border)" />
                  <XAxis dataKey="dept" tick={{ fontSize: 12, fill: 'var(--toss-gray-3)' }} />
                  <YAxis tickFormatter={(v: number) => `${(v / 10000).toFixed(0)}만`} tick={{ fontSize: 11, fill: 'var(--toss-gray-3)' }} />
                  <Tooltip
                    formatter={(value: any, name: any) => [
                      `${(value || 0).toLocaleString()}원`,
                      name === 'budget' ? '예산' : name === 'executed' ? '집행' : '잔액'
                    ]}
                    contentStyle={{ borderRadius: '10px', border: '1px solid var(--toss-border)', background: 'var(--toss-card)' }}
                  />
                  <Bar dataKey="budget" name="예산" fill="#4F8EF7" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="executed" name="집행" fill="#FF6B6B" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="remaining" name="잔액" fill="#34C759" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="bg-[var(--toss-card)] rounded-[16px] p-5 border border-[var(--toss-border)] shadow-sm text-center py-12 text-sm text-[var(--toss-gray-3)]">
              예산 데이터가 없습니다. 먼저 예산을 설정해주세요.
            </div>
          )}

          {/* 부서별 요약 카드 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {chartData.map(d => {
              const ratio = d.budget > 0 ? d.executed / d.budget : 0;
              return (
                <div key={d.dept} className="bg-[var(--toss-card)] rounded-[16px] p-4 border border-[var(--toss-border)] shadow-sm">
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
                        <div className="w-full bg-[var(--toss-gray-1)] rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full transition-all ${ratio >= 1 ? 'bg-red-500' : ratio >= 0.9 ? 'bg-orange-400' : 'bg-[var(--toss-blue)]'}`}
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
          <div className="bg-[var(--toss-card)] rounded-[16px] border border-[var(--toss-border)] shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--toss-border)]">
              <span className="text-sm font-bold text-[var(--foreground)]">집행 내역 ({executions.length}건)</span>
            </div>
            {executions.length === 0 ? (
              <div className="py-12 text-center text-sm text-[var(--toss-gray-3)]">등록된 집행 내역이 없습니다.</div>
            ) : (
              <div className="divide-y divide-[var(--toss-border)]">
                {[...executions].reverse().map(e => (
                  <div key={e.id} className="flex items-center justify-between px-5 py-3 hover:bg-[var(--toss-gray-1)]/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[var(--toss-gray-1)] text-[var(--toss-gray-3)]">{e.item}</span>
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
