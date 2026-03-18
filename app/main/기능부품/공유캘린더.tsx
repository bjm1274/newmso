import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import SmartMonthPicker from './공통/SmartMonthPicker';
import SmartDatePicker from './공통/SmartDatePicker';

export default function SharedCalendar({ user }: any) {
  const [yearMonth, setYearMonth] = useState(new Date().toISOString().slice(0, 7));
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => {
    const [y, m] = yearMonth.split('-').map(Number);
    const start = `${yearMonth}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const end = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;

    const fetchEvents = async () => {
      const sources: any[] = [];
      const { data: leaves } = await supabase.from('leave_requests').select('*, staff_members(name)').eq('status', '승인').gte('start_date', start).lte('end_date', end);
      (leaves || []).forEach((l: any) => {
        const startD = new Date(l.start_date);
        const endD = new Date(l.end_date);
        for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
          sources.push({ date: d.toISOString().slice(0, 10), type: '휴가', title: `${l.staff_members?.name || ''} ${l.leave_type}` });
        }
      });
      const { data: meetings } = await supabase.from('meeting_bookings').select('*').gte('date', start).lte('date', end);
      (meetings || []).forEach((m: any) => sources.push({ date: m.date, type: '회의', title: `${m.room} ${m.start_time}` }));
      setEvents(sources);
    };
    fetchEvents();
  }, [yearMonth]);

  const [y, m] = yearMonth.split('-').map(Number);
  const firstDay = new Date(y, m - 1, 1).getDay();
  const lastDay = new Date(y, m, 0).getDate();
  const days = Array.from({ length: firstDay + lastDay }, (_, i) => i < firstDay ? null : i - firstDay + 1);

  return (
    <div className="bg-[var(--card)] p-4 border border-[var(--border)] rounded-[var(--radius-md)] shadow-sm">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-semibold text-[var(--foreground)]">공유 캘린더</h3>
        <SmartMonthPicker value={yearMonth} onChange={setYearMonth} />
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {['일', '월', '화', '수', '목', '금', '토'].map(d => <div key={d} className="text-[11px] font-semibold text-[var(--toss-gray-3)] py-2">{d}</div>)}
        {days.map((d, i) => {
          if (d === null) return <div key={i} />;
          const dateStr = `${yearMonth}-${String(d).padStart(2, '0')}`;
          const dayEvents = events.filter(e => e.date === dateStr);
          return (
            <div key={i} className="min-h-[60px] p-1 border border-[var(--border-subtle)] rounded-[var(--radius-md)]">
              <p className="text-xs font-bold text-[var(--toss-gray-4)]">{d}</p>
              {dayEvents.slice(0, 2).map((e, j) => (
                <p key={j} className="text-[11px] font-bold truncate bg-blue-50 text-[var(--accent)] rounded px-0.5 mt-0.5">{e.title}</p>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
