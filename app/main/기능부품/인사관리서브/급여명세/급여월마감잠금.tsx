'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function PayrollLockPanel({ yearMonth, companyName, onLockChange }: any) {
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('payroll_locks').select('id').eq('year_month', yearMonth).eq('company_name', companyName || '전체').single();
      setLocked(!!data);
    })();
  }, [yearMonth, companyName]);

  const toggle = async () => {
    setLoading(true);
    if (locked) {
      await supabase.from('payroll_locks').delete().eq('year_month', yearMonth).eq('company_name', companyName || '전체');
      setLocked(false);
    } else {
      const u = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('erp_user') || '{}') : {};
      await supabase.from('payroll_locks').insert({ year_month: yearMonth, company_name: companyName || '전체', locked_by: u.id });
      setLocked(true);
    }
    onLockChange?.();
    setLoading(false);
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-[var(--page-bg)] rounded-[12px] border border-[var(--toss-border)]">
      <span className="text-sm font-medium text-[var(--foreground)]">{yearMonth} 급여 마감</span>
      <button onClick={toggle} disabled={loading} className={`px-4 py-2 text-xs font-medium rounded-[12px] disabled:opacity-50 ${locked ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'}`}>
        {locked ? '잠금됨' : '잠금하기'}
      </button>
    </div>
  );
}
