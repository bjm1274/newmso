'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

const DEFAULT_ENTRY = [
  { label: '계약서 서명', done: false, done_at: null },
  { label: '인사카드 작성', done: false, done_at: null },
  { label: 'PC/장비 지급', done: false, done_at: null },
  { label: '시스템 계정 발급', done: false, done_at: null },
];

const DEFAULT_EXIT = [
  { label: '업무 인계', done: false, done_at: null },
  { label: '장비 반납', done: false, done_at: null },
  { label: '최종 급여 정산', done: false, done_at: null },
  { label: '퇴직금 지급', done: false, done_at: null },
];

export default function OnboardingChecklist({ staffId, staffName, type }: { staffId: string; staffName: string; type: '입사' | '퇴사' }) {
  const [items, setItems] = useState<any[]>(type === '입사' ? DEFAULT_ENTRY : DEFAULT_EXIT);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('onboarding_checklists').select('items').eq('staff_id', staffId).eq('checklist_type', type).single();
      if (data?.items?.length) setItems(data.items);
    })();
  }, [staffId, type]);

  const toggle = async (idx: number) => {
    const next = [...items];
    next[idx] = { ...next[idx], done: !next[idx].done, done_at: !next[idx].done ? new Date().toISOString() : null };
    setItems(next);
    await supabase.from('onboarding_checklists').upsert({ staff_id: staffId, checklist_type: type, items: next }, { onConflict: 'staff_id,checklist_type' });
  };

  return (
    <div className="border border-gray-200 p-6 bg-white rounded-[1.75rem] shadow-sm">
      <h3 className="text-[11px] font-black text-gray-600 uppercase tracking-widest mb-4">{type} 온보딩 - {staffName}</h3>
      <div className="space-y-2">
        {items.map((x, i) => (
          <label key={i} className="flex items-center gap-3 py-2 cursor-pointer">
            <input type="checkbox" checked={x.done} onChange={() => toggle(i)} className="w-4 h-4 rounded" />
            <span className={x.done ? 'line-through text-gray-500' : 'font-bold'}>{x.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
