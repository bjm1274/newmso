'use client';
import { toast } from '@/lib/toast';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useIsMobile } from '@/app/components/useIsMobile';
import { DesktopOnlyNotice } from '@/app/components/DesktopOnlyNotice';

type AttendanceDeductionRulesProps = {
  selectedCo?: string;
  compact?: boolean;
  disabled?: boolean;
};

export default function AttendanceDeductionRules(props: AttendanceDeductionRulesProps) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return <DesktopOnlyNotice feature="근태 차감 규칙 설정" />;
  }
  return <AttendanceDeductionRulesDesktop {...props} />;
}

function AttendanceDeductionRulesDesktop({
  selectedCo = '전체',
  compact = false,
  disabled = false,
}: AttendanceDeductionRulesProps) {
  const [rules, setRules] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const companyName = String(selectedCo || '').trim();

  const fetchRules = useCallback(async () => {
    if (!companyName || disabled) {
      setRules(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('attendance_deduction_rules')
      .select('*')
      .eq('company_name', companyName)
      .maybeSingle();
    if (data) setRules({ ...data, company_name: companyName });
    else {
      const { data: all } = await supabase.from('attendance_deduction_rules').select('*').eq('company_name', '전체').maybeSingle();
      setRules({
        ...(all || { late_deduction_type: 'fixed', late_deduction_amount: 10000, early_leave_deduction_type: 'fixed', early_leave_deduction_amount: 10000 }),
        company_name: companyName,
      });
    }
    setLoading(false);
  }, [companyName, disabled]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const handleSave = async () => {
    if (disabled || !companyName) return toast('회사명을 먼저 입력해 주세요.', 'warning');
    if (!rules) return;
    setSaving(true);
    try {
      await supabase.from('attendance_deduction_rules').upsert({
        company_name: companyName,
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

  if (disabled || !companyName) {
    return (
      <div className={`${compact ? '' : 'max-w-2xl'} rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm opacity-70`}>
        <h3 className="text-base font-bold text-[var(--foreground)]">근태 차감 규칙 설정</h3>
        <p className="mt-2 text-xs font-semibold text-[var(--toss-gray-3)]">회사명을 입력하면 근태 규칙을 설정할 수 있습니다.</p>
      </div>
    );
  }

  if (loading || !rules) return <div className="p-5">로딩 중...</div>;

  return (
    <div className={`bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4 shadow-sm ${compact ? '' : 'max-w-2xl'}`}>
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
              <input type="number" min={0} value={(rules.late_deduction_amount as string) || 0} onChange={e => setRules({ ...rules, late_deduction_amount: Math.max(0, Number(e.target.value)) })} className="w-32 p-2 border border-[var(--border)] rounded-[var(--radius-md)] text-sm font-bold" />
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
              <input type="number" min={0} value={(rules.early_leave_deduction_amount as string) || 0} onChange={e => setRules({ ...rules, early_leave_deduction_amount: Math.max(0, Number(e.target.value)) })} className="w-32 p-2 border border-[var(--border)] rounded-[var(--radius-md)] text-sm font-bold" />
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
