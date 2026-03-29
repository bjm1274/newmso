'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';

const CHANGE_LABELS: Record<string, string> = {
  base_salary: '기본급',
  meal: '식대',
  vehicle: '차량',
  childcare: '보육',
  research: '연구',
  position_allowance: '직책수당',
  other: '기타',
};

type SalaryChangeHistoryRow = {
  id: string;
  staff_id: string;
  change_type: string;
  before_value: number | null;
  after_value: number | null;
  effective_date: string;
};

type Props = {
  staffId?: string;
  staffName?: string;
};

export default function SalaryChangeHistory({ staffId, staffName }: Props) {
  const [list, setList] = useState<SalaryChangeHistoryRow[]>([]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      let query = supabase
        .from('salary_change_history')
        .select('id, staff_id, change_type, before_value, after_value, effective_date')
        .order('effective_date', { ascending: false })
        .limit(20);

      if (staffId) query = query.eq('staff_id', staffId);

      const { data, error } = await query;

      if (cancelled) return;

      if (error) {
        console.error('급여 변경 이력 조회 실패:', error);
        toast('급여 변경 이력을 불러오지 못했습니다.', 'warning');
        setList([]);
        return;
      }

      setList((data ?? []) as SalaryChangeHistoryRow[]);
    })();

    return () => {
      cancelled = true;
    };
  }, [staffId]);

  if (list.length === 0) return null;

  return (
    <div className="border border-[var(--border)] p-4 bg-[var(--card)] rounded-[var(--radius-md)] shadow-sm">
      <div className="pb-2 border-b border-[var(--border)] mb-3">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">급여 변경 이력</h3>
        {staffName ? (
          <p className="mt-1 text-[11px] text-[var(--toss-gray-4)]">{staffName} 최근 변경 20건</p>
        ) : null}
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
