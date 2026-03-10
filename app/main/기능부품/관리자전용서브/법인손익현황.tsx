'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface Props {
  staffs: any[];
  selectedCo: string;
  user: any;
}

interface CompanyExpense {
  id?: string;
  company: string;
  year_month: string;
  rent: number;
  materials: number;
  utilities: number;
  others: number;
}

interface CompanyStats {
  company: string;
  headcount: number;
  laborCost: number;
  perPerson: number;
  expenses: CompanyExpense | null;
  totalCost: number;
}

export default function CompanyPnL({ staffs, selectedCo, user }: Props) {
  const [yearMonth, setYearMonth] = useState(new Date().toISOString().slice(0, 7));
  const [prevMonthYM, setPrevMonthYM] = useState('');
  const [payrollData, setPayrollData] = useState<any[]>([]);
  const [expensesData, setExpensesData] = useState<CompanyExpense[]>([]);
  const [prevPayroll, setPrevPayroll] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [expenseModal, setExpenseModal] = useState<string | null>(null);
  const [expenseForm, setExpenseForm] = useState<Omit<CompanyExpense, 'id'>>({ company: '', year_month: '', rent: 0, materials: 0, utilities: 0, others: 0 });
  const [saving, setSaving] = useState(false);

  // 전월 계산
  useEffect(() => {
    const [y, m] = yearMonth.split('-').map(Number);
    const prev = new Date(y, m - 2, 1);
    setPrevMonthYM(`${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`);
  }, [yearMonth]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [payrollRes, expensesRes, prevPayrollRes] = await Promise.all([
          supabase.from('payroll_records').select('staff_id, gross_pay').eq('year_month', yearMonth),
          supabase.from('company_expenses').select('*').eq('year_month', yearMonth),
          prevMonthYM ? supabase.from('payroll_records').select('staff_id, gross_pay').eq('year_month', prevMonthYM) : Promise.resolve({ data: [] }),
        ]);
        setPayrollData(payrollRes.data || []);
        setExpensesData(expensesRes.data || []);
        setPrevPayroll((prevPayrollRes as any).data || []);
      } catch {
        setPayrollData([]);
        setExpensesData([]);
      } finally {
        setLoading(false);
      }
    };
    if (prevMonthYM) fetchData();
  }, [yearMonth, prevMonthYM]);

  const companies = Array.from(new Set(staffs.map((s: any) => s.company).filter(Boolean)));

  const stats: CompanyStats[] = companies.map(co => {
    const coStaffs = staffs.filter((s: any) => s.company === co);
    const headcount = coStaffs.length;
    const coIds = coStaffs.map((s: any) => String(s.id));
    const laborCost = payrollData
      .filter((p: any) => coIds.includes(String(p.staff_id)))
      .reduce((s: number, p: any) => s + (p.gross_pay || 0), 0);
    const perPerson = headcount > 0 ? laborCost / headcount : 0;
    const expenses = expensesData.find(e => e.company === co) || null;
    const manualCost = expenses ? (expenses.rent + expenses.materials + expenses.utilities + expenses.others) : 0;
    const totalCost = laborCost + manualCost;
    return { company: co, headcount, laborCost, perPerson, expenses, totalCost };
  });

  const maxTotal = Math.max(...stats.map(s => s.totalCost), 1);

  const getPrevLabor = (co: string) => {
    const coStaffs = staffs.filter((s: any) => s.company === co);
    const coIds = coStaffs.map((s: any) => String(s.id));
    return prevPayroll
      .filter((p: any) => coIds.includes(String(p.staff_id)))
      .reduce((s: number, p: any) => s + (p.gross_pay || 0), 0);
  };

  const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');

  const handleOpenExpenseModal = (co: string) => {
    const existing = expensesData.find(e => e.company === co);
    setExpenseForm({
      company: co,
      year_month: yearMonth,
      rent: existing?.rent || 0,
      materials: existing?.materials || 0,
      utilities: existing?.utilities || 0,
      others: existing?.others || 0,
    });
    setExpenseModal(co);
  };

  const handleSaveExpense = async () => {
    setSaving(true);
    try {
      const existing = expensesData.find(e => e.company === expenseModal);
      if (existing?.id) {
        await supabase.from('company_expenses').update(expenseForm).eq('id', existing.id);
      } else {
        await supabase.from('company_expenses').insert(expenseForm);
      }
      alert('비용이 저장되었습니다.');
      setExpenseModal(null);
      // 재조회
      const { data } = await supabase.from('company_expenses').select('*').eq('year_month', yearMonth);
      setExpensesData(data || []);
    } catch {
      alert('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto" data-testid="admin-analysis-pnl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-[var(--foreground)]">법인별 손익 현황</h2>
          <p className="text-xs text-[var(--toss-gray-3)] mt-1">인건비 중심 법인별 비용 현황 대시보드</p>
        </div>
        <input
          type="month"
          value={yearMonth}
          onChange={e => setYearMonth(e.target.value)}
          className="p-2 rounded-[8px] border border-[var(--toss-border)] bg-[var(--toss-card)] text-sm font-bold"
        />
      </div>

      {loading ? (
        <div className="text-center py-10 text-sm text-[var(--toss-gray-3)]">로딩 중...</div>
      ) : (
        <>
          {/* 법인별 카드 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {stats.map(s => {
              const prevLabor = getPrevLabor(s.company);
              const changeRate = prevLabor > 0 ? ((s.laborCost - prevLabor) / prevLabor * 100).toFixed(1) : null;
              const manualCost = s.expenses ? (s.expenses.rent + s.expenses.materials + s.expenses.utilities + s.expenses.others) : 0;
              return (
                <div key={s.company} className="bg-[var(--toss-card)] rounded-[12px] border border-[var(--toss-border)] p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-[var(--foreground)]">{s.company}</h3>
                    <button onClick={() => handleOpenExpenseModal(s.company)} className="px-2 py-1 text-[10px] font-bold bg-[var(--toss-blue)]/10 text-[var(--toss-blue)] rounded-[6px] hover:bg-[var(--toss-blue)]/20">비용 입력</button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-center mb-3">
                    <div>
                      <p className="text-[10px] text-[var(--toss-gray-3)]">총 인건비</p>
                      <p className="text-sm font-bold">{fmt(s.laborCost)}원</p>
                      {changeRate !== null && (
                        <p className={`text-[9px] font-bold ${Number(changeRate) >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                          {Number(changeRate) >= 0 ? '▲' : '▼'} {Math.abs(Number(changeRate))}%
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-[10px] text-[var(--toss-gray-3)]">직원 수</p>
                      <p className="text-sm font-bold">{s.headcount}명</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[var(--toss-gray-3)]">1인당 평균</p>
                      <p className="text-sm font-bold">{fmt(s.perPerson)}원</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[var(--toss-gray-3)]">기타 비용</p>
                      <p className="text-sm font-bold">{fmt(manualCost)}원</p>
                    </div>
                  </div>
                  <div className="border-t border-[var(--toss-border)] pt-2 flex justify-between items-center">
                    <p className="text-[10px] font-bold text-[var(--toss-gray-4)]">총 비용 합계</p>
                    <p className="text-sm font-bold text-[var(--toss-blue)]">{fmt(s.totalCost)}원</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 비교 바 차트 */}
          {stats.length > 0 && (
            <div className="bg-[var(--toss-card)] rounded-[12px] border border-[var(--toss-border)] p-4">
              <h3 className="text-sm font-bold text-[var(--foreground)] mb-4">법인 비교 (총 비용)</h3>
              {stats.map(s => (
                <div key={s.company} className="flex items-center gap-3 mb-2">
                  <span className="text-[11px] font-bold text-[var(--toss-gray-4)] w-32 shrink-0 truncate">{s.company}</span>
                  <div className="flex-1 bg-[var(--toss-gray-1)] rounded-full h-5 overflow-hidden">
                    <div
                      className="h-full bg-[var(--toss-blue)] rounded-full flex items-center px-2 transition-all"
                      style={{ width: `${(s.totalCost / maxTotal) * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-bold text-[var(--toss-gray-4)] shrink-0">{fmt(s.totalCost / 10000)}만원</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* 비용 입력 모달 */}
      {expenseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setExpenseModal(null)}>
          <div className="bg-[var(--toss-card)] rounded-[16px] p-6 max-w-sm w-full mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-[var(--foreground)] mb-4">{expenseModal} 비용 입력 ({yearMonth})</h3>
            {[
              { key: 'rent', label: '임대료' },
              { key: 'materials', label: '재료비' },
              { key: 'utilities', label: '관리비' },
              { key: 'others', label: '기타비용' },
            ].map(({ key, label }) => (
              <div key={key} className="mb-3">
                <label className="text-[10px] font-bold text-[var(--toss-gray-4)] block mb-1">{label}</label>
                <input
                  type="number"
                  value={(expenseForm as any)[key] || ''}
                  onChange={e => setExpenseForm(f => ({ ...f, [key]: Number(e.target.value) }))}
                  className="w-full p-2 text-xs border border-[var(--toss-border)] rounded-[8px] bg-[var(--toss-gray-1)] text-right"
                  placeholder="0"
                  min={0}
                />
              </div>
            ))}
            <div className="flex gap-2 mt-4">
              <button onClick={() => setExpenseModal(null)} className="flex-1 py-2 text-xs font-bold border border-[var(--toss-border)] rounded-[8px]">취소</button>
              <button onClick={handleSaveExpense} disabled={saving} className="flex-1 py-2 text-xs font-bold bg-[var(--toss-blue)] text-white rounded-[8px] disabled:opacity-50">
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
