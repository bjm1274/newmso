'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function PayrollLockPanel({ yearMonth, companyName, onLockChange }: { yearMonth?: unknown; companyName?: unknown; onLockChange?: () => void }) {
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
      const u = typeof window !== 'undefined' ? (() => { try { return JSON.parse(localStorage.getItem('erp_user') || '{}'); } catch { return {}; } })() : {};
      await supabase.from('payroll_locks').insert({ year_month: yearMonth, company_name: companyName || '전체', locked_by: u.id });
      setLocked(true);
    }
    onLockChange?.();
    setLoading(false);
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-[var(--page-bg)] rounded-[var(--radius-md)] border border-[var(--border)]">
      <span className="text-sm font-medium text-[var(--foreground)]">{yearMonth as string} 급여 마감</span>
      <button onClick={toggle} disabled={loading} className={`px-4 py-2 text-xs font-medium rounded-[var(--radius-md)] disabled:opacity-50 ${locked ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'}`}>
        {locked ? '잠금됨' : '잠금하기'}
      </button>
    </div>
  );
}
