'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

function generateICS(events: { title: string; start: string; end: string; desc?: string }[]) {
  const formatDT = (d: string) => d.replace(/-/g, '').replace(/T/g, '').slice(0, 15) + '00';
  let ics = 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//SY INC. MSO//Calendar//KO\nCALSCALE:GREGORIAN\nMETHOD:PUBLISH\n';
  events.forEach((e) => {
    const start = formatDT(e.start);
    const end = formatDT(e.end);
    ics += `BEGIN:VEVENT\nDTSTART:${start}\nDTEND:${end}\nSUMMARY:${e.title.replace(/\n/g, '\\n')}\n`;
    if (e.desc) ics += `DESCRIPTION:${e.desc}\n`;
    ics += `END:VEVENT\n`;
  });
  ics += 'END:VCALENDAR';
  return ics;
}

export default function CalendarSync({ yearMonth }: { yearMonth?: string }) {
  const [ym, setYm] = useState(yearMonth || new Date().toISOString().slice(0, 7));
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => {
    const [y, m] = ym.split('-').map(Number);
    const start = `${ym}-01`;
    const end = `${ym}-${new Date(y, m, 0).getDate()}`;

    const fetchEvents = async () => {
      const list: { title: string; start: string; end: string; desc?: string }[] = [];
      const { data: leaves } = await supabase.from('leave_requests').select('*, staff_members(name)').eq('status', '승인').gte('start_date', start).lte('end_date', end);
      (leaves || []).forEach((l: any) => {
        list.push({
          title: `휴가: ${l.staff_members?.name || ''} ${l.leave_type}`,
          start: `${l.start_date}T09:00:00`,
          end: `${l.end_date}T18:00:00`,
          desc: l.reason,
        });
      });
      setEvents(list);
    };
    fetchEvents();
  }, [ym]);

  const exportICS = () => {
    const ics = generateICS(events);
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MSO_캘린더_${ym}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const googleCalendarUrl = () => {
    const base = 'https://calendar.google.com/calendar/render?action=TEMPLATE';
    const first = events[0];
    if (!first) return base;
    const url = `${base}&text=${encodeURIComponent(first.title)}&dates=${first.start.replace(/[-:]/g, '').slice(0, 15)}/${first.end.replace(/[-:]/g, '').slice(0, 15)}`;
    return url;
  };

  return (
    <div className="bg-white p-6 rounded-lg border border-gray-100 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-800 mb-4">캘린더 동기화</h3>
      <div className="flex items-center gap-2 mb-4">
        <input type="month" value={ym} onChange={(e) => setYm(e.target.value)} className="p-2 border rounded-lg text-sm font-bold" />
        <span className="text-xs text-gray-500">({events.length}건)</span>
      </div>
      <div className="flex flex-col gap-2">
        <button onClick={exportICS} className="w-full py-3 bg-blue-600 text-white text-xs font-semibold rounded-xl">
          .ics 파일 다운로드 (구글/아웃룩 가져오기)
        </button>
        <a href={googleCalendarUrl()} target="_blank" rel="noopener noreferrer" className="w-full py-3 bg-gray-100 text-gray-700 text-xs font-semibold rounded-xl text-center">
          구글 캘린더에 추가
        </a>
      </div>
      <p className="mt-4 text-[10px] text-gray-500">* .ics 파일을 구글 캘린더 또는 아웃룩에서 가져오기로 등록하세요.</p>
    </div>
  );
}
