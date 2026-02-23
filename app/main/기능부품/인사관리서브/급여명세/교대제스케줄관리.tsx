'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function ShiftPatternManager({ selectedCo }: { selectedCo?: string }) {
  const [shifts, setShifts] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      let q = supabase.from('work_shifts').select('*').eq('is_active', true);
      if (selectedCo && selectedCo !== '전체') q = q.eq('company_name', selectedCo);
      const { data } = await q;
      setShifts(data || []);
    })();
  }, [selectedCo]);

  return (
    <div className="border border-[var(--toss-border)] p-4 bg-[var(--toss-card)] rounded-[12px] shadow-sm">
      <div className="pb-2 border-b border-[var(--toss-border)] mb-3">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">교대제 스케줄</h3>
      </div>
      <div className="space-y-2">
        {shifts.map((s) => (
          <div key={s.id} className="p-3 bg-[var(--page-bg)] rounded-[12px] border border-[var(--toss-border)] flex justify-between items-center">
            <div>
              <p className="text-sm font-semibold text-[var(--foreground)]">{s.name}</p>
              <p className="text-[11px] text-[var(--toss-gray-3)]">{s.start_time} ~ {s.end_time}</p>
            </div>
            {s.shift_type && <span className="text-xs font-medium text-[var(--toss-blue)]">{s.shift_type}</span>}
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-[var(--toss-gray-3)]">* 근무형태 관리에서 교대 유형(day/swing/night)을 설정할 수 있습니다.</p>
    </div>
  );
}
