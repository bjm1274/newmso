'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function StaffHistoryTimeline({ staffId, staffName }: { staffId: string | number; staffName: string }) {
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => {
    if (staffId == null || staffId === '') return;
    const fetchEvents = async () => {
      const sources: any[] = [];
      const { data: leaves } = await supabase.from('leave_requests').select('*').eq('staff_id', String(staffId)).order('created_at', { ascending: false }).limit(20);
      (leaves || []).forEach((l: any) => sources.push({ type: '휴가', date: l.start_date, desc: `${l.leave_type} ${l.start_date}~${l.end_date}`, status: l.status }));
      const { data: appr } = await supabase.from('approvals').select('*').eq('sender_id', String(staffId)).order('created_at', { ascending: false }).limit(20);
      (appr || []).forEach((a: any) => sources.push({ type: '결재', date: a.created_at?.slice(0, 10), desc: a.title, status: a.status }));
      const { data: audit } = await supabase.from('audit_logs').select('*').eq('target_id', String(staffId)).order('created_at', { ascending: false }).limit(10);
      (audit || []).forEach((a: any) => sources.push({ type: '변경', date: a.created_at?.slice(0, 10), desc: a.action, status: '' }));
      sources.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      setEvents(sources.slice(0, 15));
    };
    fetchEvents();
  }, [staffId]);

  return (
    <div className="bg-white p-6 border border-gray-100 rounded-2xl shadow-xl">
      <h3 className="text-lg font-black text-gray-900 mb-4">{staffName} 인사 이력</h3>
      <div className="space-y-3">
        {events.length === 0 ? <p className="text-gray-400 text-sm">이력이 없습니다.</p> : events.map((e, i) => (
          <div key={i} className="flex gap-4 items-start">
            <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-1.5" />
            <div>
              <p className="text-xs font-black text-gray-600">{e.date}</p>
              <p className="text-sm font-bold text-gray-800">{e.desc}</p>
              <span className="text-[9px] font-black text-gray-400">{e.type}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
