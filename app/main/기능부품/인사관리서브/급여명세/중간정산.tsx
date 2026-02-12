'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { calculateSeverancePay, formatWorkPeriod } from '@/lib/severance-pay';
import { logAudit } from '@/lib/audit';

export default function InterimSettlement({ staffs = [], selectedCo, onRefresh }: any) {
  const [selectedStaff, setSelectedStaff] = useState<any>(null);
  const [settlementDate, setSettlementDate] = useState(new Date().toISOString().split('T')[0]);
  const [reason, setReason] = useState('퇴사');
  const [includeSeverance, setIncludeSeverance] = useState(true);
  const [loading, setLoading] = useState(false);
  const [filterRetirees, setFilterRetirees] = useState(false);

  const filtered = selectedCo === '전체'
    ? staffs
    : staffs.filter((s: any) => s.company === selectedCo);

  const candidates = filterRetirees
    ? filtered.filter((s: any) => (s.status || '').toLowerCase() === '퇴사' || s.resigned_at)
    : filtered;

  const calculateSettlement = (staff: any) => {
    const base = staff.base_salary ?? staff.base ?? 0;
    const mealAllowance = staff.meal_allowance ?? staff.meal ?? 200000;
    const date = new Date(settlementDate);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    const workedDays = date.getDate();

    const proRatedBase = Math.floor((base / lastDay) * workedDays);
    const meal = Math.floor((mealAllowance / lastDay) * workedDays);

    let severance = 0;
    let workDays = 0;
    if (includeSeverance && reason === '퇴사') {
      const joined = staff.joined_at || staff.join_date;
      const resigned = staff.resigned_at || settlementDate;
      if (joined) {
        const j = new Date(joined);
        const r = new Date(resigned);
        workDays = Math.max(0, Math.floor((r.getTime() - j.getTime()) / (1000 * 60 * 60 * 24)));
        const avgWage = base + (mealAllowance || 0);
        severance = calculateSeverancePay(avgWage, workDays);
      }
    }

    const subTotal = proRatedBase + meal;
    const total = subTotal + severance;

    return {
      proRatedBase,
      meal,
      severance,
      workDays,
      total,
      subTotal,
      workedDays,
      lastDay,
    };
  };

  const result = selectedStaff ? calculateSettlement(selectedStaff) : null;

  const handleConfirm = async () => {
    if (!selectedStaff) return alert('정산 대상을 선택해 주세요.');
    if (!confirm('정산 내역을 확정하고 저장하시겠습니까?')) return;

    setLoading(true);
    try {
      const calc = calculateSettlement(selectedStaff);
      const yearMonth = settlementDate.slice(0, 7) + '-I';

      const record: any = {
        staff_id: selectedStaff.id,
        year_month: yearMonth,
        base_salary: calc.proRatedBase,
        meal_allowance: calc.meal,
        vehicle_allowance: 0,
        childcare_allowance: 0,
        research_allowance: 0,
        other_taxfree: 0,
        extra_allowance: 0,
        overtime_pay: 0,
        bonus: 0,
        total_taxable: calc.proRatedBase + calc.severance,
        total_taxfree: calc.meal,
        total_deduction: 0,
        net_pay: calc.total,
        attendance_deduction: 0,
        status: '확정',
        record_type: 'interim',
        settlement_reason: reason,
        settlement_date: settlementDate,
        severance_pay: calc.severance,
      };

      await supabase.from('payroll_records').upsert(record, { onConflict: 'staff_id,year_month' });

      const u = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('erp_user') || '{}') : {};
      await logAudit('중간정산확정', 'payroll', yearMonth, { staff: selectedStaff.name, total: calc.total, severance: calc.severance }, u.id, u.name);

      alert('중간정산이 저장되었습니다.');
      setSelectedStaff(null);
      if (onRefresh) onRefresh();
    } catch (e) {
      console.error(e);
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-6 md:p-10 rounded-[2.5rem] border border-gray-100 shadow-xl animate-in fade-in duration-500">
      <div className="mb-8 border-b border-gray-50 pb-6">
        <h3 className="text-xl font-black text-gray-900 tracking-tighter italic">급여 중간정산 엔진</h3>
        <p className="text-[10px] text-blue-600 font-bold mt-1 tracking-widest">퇴직자 포함 급여 중간정산</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filterRetirees}
                onChange={(e) => setFilterRetirees(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600"
              />
              <span className="text-[11px] font-black text-gray-600">퇴직자만 보기</span>
            </label>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">정산 대상자 선택</label>
            <select
              value={selectedStaff?.id ?? ''}
              onChange={(e) => setSelectedStaff(candidates.find((s: any) => s.id === parseInt(e.target.value)) || null)}
              className="w-full p-4 bg-gray-50 rounded-2xl border-none outline-none font-black text-sm focus:ring-2 focus:ring-blue-100"
            >
              <option value="">직원을 선택하세요</option>
              {candidates.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.position || '-'}) {s.status === '퇴사' ? '[퇴사]' : ''}
                </option>
              ))}
              {candidates.length === 0 && (
                <option value="" disabled>대상이 없습니다</option>
              )}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">정산 기준일</label>
              <input
                type="date"
                value={settlementDate}
                onChange={(e) => setSettlementDate(e.target.value)}
                className="w-full p-4 bg-gray-50 rounded-2xl border-none outline-none font-black text-sm focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">정산 사유</label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full p-4 bg-gray-50 rounded-2xl border-none outline-none font-black text-sm focus:ring-2 focus:ring-blue-100"
              >
                <option value="퇴사">중도 퇴사</option>
                <option value="휴직">휴직 시작</option>
                <option value="기타">기타 사유</option>
              </select>
            </div>
          </div>

          {reason === '퇴사' && (
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeSeverance}
                  onChange={(e) => setIncludeSeverance(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600"
                />
                <span className="text-[11px] font-black text-gray-600">퇴직금 포함</span>
              </label>
            </div>
          )}
        </div>

        <div className="bg-blue-50/50 p-8 rounded-[2rem] border border-blue-100 flex flex-col justify-center">
          {result ? (
            <div className="space-y-6">
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1">정산 총액 (세전)</p>
                  <p className="text-3xl font-black text-blue-600 tracking-tighter">{result.total.toLocaleString()}원</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">근무 일수</p>
                  <p className="text-lg font-black text-gray-700">{result.workedDays} / {result.lastDay}일</p>
                </div>
              </div>
              <div className="space-y-2 pt-4 border-t border-blue-100">
                <div className="flex justify-between text-xs font-bold text-gray-600">
                  <span>기본급 (일할)</span>
                  <span>{result.proRatedBase.toLocaleString()}원</span>
                </div>
                <div className="flex justify-between text-xs font-bold text-gray-600">
                  <span>식대 (일할)</span>
                  <span>{result.meal.toLocaleString()}원</span>
                </div>
                {result.severance > 0 && (
                  <>
                    <div className="flex justify-between text-xs font-bold text-emerald-700">
                      <span>퇴직금 (재직 {formatWorkPeriod(result.workDays)})</span>
                      <span>{result.severance.toLocaleString()}원</span>
                    </div>
                  </>
                )}
              </div>
              <button
                onClick={handleConfirm}
                disabled={loading}
                className="w-full py-4 bg-blue-600 text-white rounded-xl font-black text-xs shadow-lg shadow-blue-100 hover:scale-[0.98] transition-all disabled:opacity-50"
              >
                {loading ? '저장 중...' : '정산 내역 확정 및 저장'}
              </button>
            </div>
          ) : (
            <div className="text-center py-10">
              <p className="text-xs font-black text-blue-300">정산 대상을 선택하면<br />실시간 계산 결과가 표시됩니다.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
