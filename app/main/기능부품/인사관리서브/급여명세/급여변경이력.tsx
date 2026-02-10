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
    <div className="border border-gray-200 p-6 bg-white rounded-[1.75rem] shadow-sm">
      <h3 className="text-[11px] font-black text-gray-600 uppercase tracking-widest mb-4">급여 변경 이력</h3>
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {list.map((r) => (
          <div key={r.id} className="flex justify-between items-center py-2 border-b border-gray-50 text-xs">
            <span className="font-bold">{CHANGE_LABELS[r.change_type] || r.change_type}</span>
            <span>{(r.before_value || 0).toLocaleString()} → {(r.after_value || 0).toLocaleString()}</span>
            <span className="text-gray-500">{r.effective_date}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
