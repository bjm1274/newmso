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
    <div className="border border-gray-200 p-6 bg-white rounded-[1.75rem] shadow-sm">
      <h3 className="text-[11px] font-black text-gray-600 uppercase tracking-widest mb-4">교대제 스케줄</h3>
      <div className="space-y-3">
        {shifts.map((s) => (
          <div key={s.id} className="p-4 bg-gray-50 rounded-xl flex justify-between items-center">
            <div>
              <p className="text-sm font-black text-gray-800">{s.name}</p>
              <p className="text-[10px] text-gray-500">{s.start_time} ~ {s.end_time}</p>
            </div>
            {s.shift_type && <span className="text-[10px] font-bold text-blue-600">{s.shift_type}</span>}
          </div>
        ))}
      </div>
      <p className="mt-4 text-[10px] text-gray-400">* 근무형태 관리에서 교대 유형(day/swing/night)을 설정할 수 있습니다.</p>
    </div>
  );
}
