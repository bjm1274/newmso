'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

const DEFAULT_ENTRY = [
  { label: '1. 계약서 서명', done: false, done_at: null },
  { label: '2. 인사카드 작성', done: false, done_at: null },
  { label: '3. PC/장비 지급', done: false, done_at: null },
  { label: '4. 시스템 계정 발급', done: false, done_at: null },
  { label: '5. 권한 부여 (메뉴 접근권한 설정)', done: false, done_at: null },
  { label: '6. 온보딩 교육 및 업무 안내', done: false, done_at: null },
];

const DEFAULT_EXIT = [
  { label: '1. 업무 인계', done: false, done_at: null },
  { label: '2. 권한 회수 (메뉴 접근권한 해제)', done: false, done_at: null },
  { label: '3. 장비 반납 (PC, 키, 명함 등)', done: false, done_at: null },
  { label: '4. 계정 반납 (시스템 비활성화)', done: false, done_at: null },
  { label: '5. 최종 급여 정산', done: false, done_at: null },
  { label: '6. 퇴직금 지급', done: false, done_at: null },
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

  const doneCount = items.filter((x) => x.done).length;
  const totalCount = items.length;

  return (
    <div className="border border-gray-200 p-6 bg-white rounded-[1.75rem] shadow-sm">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-[11px] font-black text-gray-600 uppercase tracking-widest">{type} 체크리스트 - {staffName}</h3>
        <span className="text-[10px] font-black text-blue-600">{doneCount}/{totalCount} 완료</span>
      </div>
      <p className="text-[10px] text-gray-500 mb-4">
        {type === '입사' ? '권한·장비·계정 발급 단계별 진행' : '권한·장비·계정 반납 후 최종 정산'}
      </p>
      <div className="space-y-2">
        {items.map((x, i) => (
          <label key={i} className="flex items-center gap-3 py-2.5 px-3 rounded-[12px] cursor-pointer hover:bg-gray-50 transition-colors">
            <input type="checkbox" checked={x.done} onChange={() => toggle(i)} className="w-4 h-4 rounded" />
            <span className={x.done ? 'line-through text-gray-500' : 'font-bold text-sm'}>{x.label}</span>
            {x.done_at && <span className="text-[9px] text-gray-400 ml-auto">{new Date(x.done_at).toLocaleDateString('ko-KR')}</span>}
          </label>
        ))}
      </div>
    </div>
  );
}
