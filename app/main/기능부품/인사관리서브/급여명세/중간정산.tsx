'use client';
import { toast } from '@/lib/toast';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { calculateSeverancePay, formatWorkPeriod } from '@/lib/severance-pay';
import { logAudit } from '@/lib/audit';
import SmartDatePicker from '../../공통/SmartDatePicker';

export default function InterimSettlement({ staffs = [], selectedCo, onRefresh }: Record<string, unknown>) {
  const _staffs = (staffs as Record<string, unknown>[]) ?? [];
  const _onRefresh = onRefresh as (() => void) | undefined;
  const [selectedStaff, setSelectedStaff] = useState<Record<string, unknown> | null>(null);
  const [settlementDate, setSettlementDate] = useState(new Date().toISOString().split('T')[0]);
  const [reason, setReason] = useState('퇴사');
  const [includeSeverance, setIncludeSeverance] = useState(true);
  const [loading, setLoading] = useState(false);
  const [filterRetirees, setFilterRetirees] = useState(false);

  const filtered = selectedCo === '전체'
    ? _staffs
    : _staffs.filter((s: any) => s.company === selectedCo);

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
    if (!selectedStaff) return toast('정산 대상을 선택해 주세요.', 'warning');
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
        deduction_detail: {},
        net_pay: calc.total,
        attendance_deduction: 0,
        advance_pay: 0,
        status: '확정',
        record_type: 'interim',
        settlement_reason: reason,
        settlement_date: settlementDate,
        severance_pay: calc.severance,
      };

      const { error: payrollSaveError } = await supabase.from('payroll_records').upsert(record, { onConflict: 'staff_id,year_month' });
      if (payrollSaveError) throw payrollSaveError;

      const u = typeof window !== 'undefined' ? (() => { try { return JSON.parse(localStorage.getItem('erp_user') || '{}'); } catch { return {}; } })() : {};
      try {
        await logAudit('중간정산확정', 'payroll', yearMonth, { staff: selectedStaff.name, total: calc.total, severance: calc.severance }, u.id, u.name);
      } catch (auditError) {
        console.error('interim payroll audit log failed:', auditError);
      }

      toast('중간정산이 저장되었습니다.', 'success');
      setSelectedStaff(null);
      if (_onRefresh) _onRefresh();
    } catch (e) {
      console.error(e);
      toast('저장 중 오류가 발생했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[var(--card)] p-4 rounded-[var(--radius-md)] border border-[var(--border)] shadow-sm animate-in fade-in duration-300" data-testid="interim-settlement-view">
      <div className="mb-4 pb-3 border-b border-[var(--border)]">
        <h2 className="text-lg font-bold text-[var(--foreground)]">중간정산</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filterRetirees}
                onChange={(e) => setFilterRetirees(e.target.checked)}
                className="w-4 h-4 rounded border-[var(--border)] text-[var(--accent)]"
              />
              <span className="text-xs font-medium text-[var(--toss-gray-4)]">퇴직자만 보기</span>
            </label>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-[var(--toss-gray-4)]">정산 대상자</label>
            <select
              data-testid="interim-settlement-staff-select"
              value={(selectedStaff?.id ?? '') as string}
              onChange={(e) => setSelectedStaff(candidates.find((s: any) => String(s.id) === e.target.value) || null)}
              className="w-full h-10 px-3 bg-[var(--input-bg)] border border-[var(--border)] rounded-md text-sm font-medium focus:ring-2 focus:ring-[var(--accent)] focus:border-[var(--accent)]"
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
            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--toss-gray-4)]">정산 기준일</label>
              <SmartDatePicker value={settlementDate} onChange={val => setSettlementDate(val)} className="w-full h-10 px-3 bg-[var(--input-bg)] border border-[var(--border)] rounded-md text-sm font-medium" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--toss-gray-4)]">정산 사유</label>
              <select data-testid="interim-settlement-reason-select" value={reason} onChange={(e) => setReason(e.target.value)} className="w-full h-10 px-3 bg-[var(--input-bg)] border border-[var(--border)] rounded-md text-sm font-medium focus:ring-2 focus:ring-[var(--accent)]/30"
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
                  className="w-4 h-4 rounded border-[var(--border)] text-[var(--accent)]"
                />
                <span className="text-xs font-medium text-[var(--toss-gray-4)]">퇴직금 포함</span>
              </label>
            </div>
          )}
        </div>

        <div className="bg-[var(--tab-bg)] p-4 rounded-[var(--radius-md)] border border-[var(--border)] flex flex-col justify-center">
          {result ? (
            <div className="space-y-4">
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-xs font-medium text-[var(--toss-gray-3)] mb-1">정산 총액 (세전)</p>
                  <p className="text-xl font-bold text-[var(--accent)]">{result.total.toLocaleString()}원</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium text-[var(--toss-gray-3)] mb-1">근무 일수</p>
                  <p className="text-sm font-semibold text-[var(--foreground)]">{result.workedDays} / {result.lastDay}일</p>
                </div>
              </div>
              <div className="space-y-1.5 pt-3 border-t border-[var(--border)]">
                <div className="flex justify-between text-xs font-medium text-[var(--toss-gray-4)]">
                  <span>기본급 (일할)</span>
                  <span>{result.proRatedBase.toLocaleString()}원</span>
                </div>
                <div className="flex justify-between text-xs font-medium text-[var(--toss-gray-4)]">
                  <span>식대 (일할)</span>
                  <span>{result.meal.toLocaleString()}원</span>
                </div>
                {result.severance > 0 && (
                  <div className="flex justify-between text-xs font-medium text-emerald-700">
                    <span>퇴직금 (재직 {formatWorkPeriod(result.workDays)})</span>
                    <span>{result.severance.toLocaleString()}원</span>
                  </div>
                )}
              </div>
              <button data-testid="interim-settlement-save-button" onClick={handleConfirm} disabled={loading} className="w-full py-3 bg-[var(--accent)] text-white text-sm font-semibold rounded-[var(--radius-md)] hover:opacity-90 disabled:opacity-50">
                {loading ? '저장 중...' : '저장하기'}
              </button>
            </div>
          ) : (
            <div className="text-center py-5">
              <p className="text-xs font-medium text-[var(--toss-gray-3)]">정산 대상을 선택하면 실시간 계산 결과가 표시됩니다.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
