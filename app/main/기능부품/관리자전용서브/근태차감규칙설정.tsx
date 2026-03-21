import { toast } from '@/lib/toast';
﻿'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export default function AttendanceDeductionRules({ selectedCo = '전체' }: Record<string, unknown>) {
  const [rules, setRules] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('attendance_deduction_rules')
      .select('*')
      .eq('company_name', selectedCo)
      .single();
    if (data) setRules(data);
    else {
      const { data: all } = await supabase.from('attendance_deduction_rules').select('*').eq('company_name', '전체').single();
      setRules(all || { company_name: selectedCo, late_deduction_type: 'fixed', late_deduction_amount: 10000, early_leave_deduction_type: 'fixed', early_leave_deduction_amount: 10000 });
    }
    setLoading(false);
  }, [selectedCo]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const handleSave = async () => {
    if (!rules) return;
    setSaving(true);
    try {
      await supabase.from('attendance_deduction_rules').upsert({
        company_name: rules.company_name || selectedCo,
        late_deduction_type: rules.late_deduction_type,
        late_deduction_amount: rules.late_deduction_amount || 0,
        early_leave_deduction_type: rules.early_leave_deduction_type,
        early_leave_deduction_amount: rules.early_leave_deduction_amount || 0,
        absent_use_daily_rate: rules.absent_use_daily_rate !== false,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'company_name' });
      toast('저장되었습니다.', 'success');
    } catch (e) {
      toast('저장 실패', 'error');
    }
    setSaving(false);
  };

  if (loading || !rules) return <div className="p-5">로딩 중...</div>;

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4 shadow-sm max-w-2xl">
      <h3 className="text-base font-bold text-[var(--foreground)] mb-2">근태 차감 규칙 설정</h3>

      <div className="space-y-4">
        <div>
          <label className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase">지각 차감 방식</label>
          <div className="flex gap-4 mt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="late" checked={rules.late_deduction_type === 'fixed'} onChange={() => setRules({ ...rules, late_deduction_type: 'fixed' })} />
              <span className="text-xs font-bold">회당 고정금액</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="late" checked={rules.late_deduction_type === 'hourly'} onChange={() => setRules({ ...rules, late_deduction_type: 'hourly' })} />
              <span className="text-xs font-bold">시급×시간</span>
            </label>
          </div>
          {rules.late_deduction_type === 'fixed' && (
            <div className="mt-2">
              <input type="number" value={(rules.late_deduction_amount as string) || 0} onChange={e => setRules({ ...rules, late_deduction_amount: Number(e.target.value) })} className="w-32 p-2 border rounded-[var(--radius-md)] text-sm font-bold" />
              <span className="ml-2 text-xs font-bold text-[var(--toss-gray-4)]">원/회</span>
            </div>
          )}
        </div>

        <div>
          <label className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase">조퇴 차감 방식</label>
          <div className="flex gap-4 mt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="early" checked={rules.early_leave_deduction_type === 'fixed'} onChange={() => setRules({ ...rules, early_leave_deduction_type: 'fixed' })} />
              <span className="text-xs font-bold">회당 고정금액</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="early" checked={rules.early_leave_deduction_type === 'hourly'} onChange={() => setRules({ ...rules, early_leave_deduction_type: 'hourly' })} />
              <span className="text-xs font-bold">시급×시간</span>
            </label>
          </div>
          {rules.early_leave_deduction_type === 'fixed' && (
            <div className="mt-2">
              <input type="number" value={(rules.early_leave_deduction_amount as string) || 0} onChange={e => setRules({ ...rules, early_leave_deduction_amount: Number(e.target.value) })} className="w-32 p-2 border rounded-[var(--radius-md)] text-sm font-bold" />
              <span className="ml-2 text-xs font-bold text-[var(--toss-gray-4)]">원/회</span>
            </div>
          )}
        </div>

        <div>
          <label className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase">결근</label>
          <p className="text-xs font-bold text-[var(--toss-gray-4)] mt-1">기본급 ÷ 해당월 근로일수 = 일당, 결근 1일 = 일당 차감</p>
        </div>
      </div>

      <button onClick={handleSave} disabled={saving} className="mt-4 w-full py-2 bg-[var(--accent)] text-white font-bold rounded-[var(--radius-md)] text-sm hover:bg-[var(--accent)] disabled:opacity-50">
        {saving ? '저장 중...' : '규칙 저장'}
      </button>
    </div>
  );
}
