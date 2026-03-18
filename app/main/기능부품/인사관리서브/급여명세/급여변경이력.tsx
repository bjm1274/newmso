'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

const CHANGE_LABELS: Record<string, string> = {
  base_salary: '기본급', meal: '식대', vehicle: '차량', childcare: '보육', research: '연구', position_allowance: '직책수당', other: '기타',
};

export default function SalaryChangeHistory({ staffId, staffName }: { staffId?: string; staffName?: string }) {
  const [list, setList] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      let q = supabase.from('salary_change_history').select('*').order('effective_date', { ascending: false }).limit(20);
      if (staffId) q = q.eq('staff_id', staffId);
      const { data } = await q;
      setList(data || []);
    })();
  }, [staffId]);

  if (list.length === 0) return null;

  return (
    <div className="border border-[var(--border)] p-4 bg-[var(--card)] rounded-[var(--radius-md)] shadow-sm">
      <div className="pb-2 border-b border-[var(--border)] mb-3">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">급여 변경 이력</h3>
      </div>
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {list.map((r) => (
          <div key={r.id} className="flex justify-between items-center py-2 border-b border-[var(--border)] text-xs">
            <span className="font-medium">{CHANGE_LABELS[r.change_type] || r.change_type}</span>
            <span className="text-[var(--toss-gray-4)]">{(r.before_value || 0).toLocaleString()} → {(r.after_value || 0).toLocaleString()}</span>
            <span className="text-[var(--toss-gray-3)]">{r.effective_date}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
