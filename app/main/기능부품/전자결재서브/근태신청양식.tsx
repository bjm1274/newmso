'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function AttendanceForms({ user, staffs, formType, setExtraData, setFormTitle }: any) {
  const [attData, setAttData] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState('');

  useEffect(() => {
    const load = async () => {
      const { data: att } = await supabase.from('attendance').select('*').eq('staff_id', user.id).order('date', { ascending: false });
      const { data: sch } = await supabase.from('work_schedules').select('*');
      setAttData(att || []); setSchedules(sch || []);
    };
    load();
  }, [user.id]);

  const calculateOT = (record: any) => {
    const staff = staffs.find((s: any) => s.id === user.id);
    const schedule = schedules.find(sch => sch.id === staff?.schedule_id);
    if (!record.check_out || !schedule) return 0;
    const actualOut = new Date(record.check_out);
    const [h, m] = schedule.end_time.split(':');
    const schOut = new Date(record.check_out); schOut.setHours(parseInt(h), parseInt(m), 0);
    if (actualOut > schOut) return Math.floor(((actualOut.getTime() - schOut.getTime()) / (1000 * 60 * 60)) * 2) / 2;
    return 0;
  };

  return (
    <div className="animate-in fade-in duration-300">
      {/* 🏖️ 연차/휴가: 원본 3열 레이아웃 (모바일 패딩 조정) */}
      {formType === '연차/휴가' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 bg-[var(--toss-blue-light)]/50 p-6 md:p-10 rounded-[1.5rem] md:rounded-[2.5rem] border border-[var(--toss-blue-light)] shadow-inner">
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-[var(--toss-blue)] ml-1 uppercase">휴가 종류</label>
            <select className="w-full p-4 rounded-[12px] bg-[var(--toss-card)] font-bold text-xs border-none shadow-sm focus:ring-2 focus:ring-[var(--toss-blue)]/30"
              onChange={e => setExtraData((prev: any) => ({ ...prev, vType: e.target.value }))}>
              <option>연차 (1.0)</option><option>반차 (0.5)</option><option>병가</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-[var(--toss-blue)] ml-1 uppercase">시작 일자</label>
            <input type="date" className="w-full p-4 rounded-[12px] bg-[var(--toss-card)] font-bold text-xs shadow-sm border-none focus:ring-2 focus:ring-[var(--toss-blue)]/30"
              onChange={e => setExtraData((prev: any) => ({ ...prev, startDate: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-[var(--toss-blue)] ml-1 uppercase">종료 일자</label>
            <input type="date" className="w-full p-4 rounded-[12px] bg-[var(--toss-card)] font-bold text-xs shadow-sm border-none focus:ring-2 focus:ring-[var(--toss-blue)]/30"
              onChange={e => setExtraData((prev: any) => ({ ...prev, endDate: e.target.value }))} />
          </div>
        </div>
      )}

      {/* ⏱️ 연장근무: 원본 연동 버튼 리스트 (모바일 패딩 조정) */}
      {formType === '연장근무' && (
        <div className="bg-orange-50/50 p-6 md:p-10 rounded-[1.5rem] md:rounded-[2.5rem] border border-orange-100 space-y-4 md:space-y-6 shadow-inner">
          <h4 className="text-xs font-bold text-orange-600">📌 최근 초과 근무 내역 선택</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
            {attData.map((a, i) => {
              const ot = calculateOT(a);
              if (ot <= 0) return null;
              return (
                <button key={i} onClick={() => {
                  setSelectedDate(a.date);
                  setExtraData({ date: a.date, hours: ot, amount: ot * 15000 });
                  setFormTitle(`[추가수당청구] ${a.date} 연장근무 ${ot}시간`);
                }} className={`p-4 md:p-5 rounded-[16px] border-2 text-left transition-all flex justify-between items-center ${selectedDate === a.date ? 'border-orange-500 bg-[var(--toss-card)] shadow-lg' : 'bg-[var(--toss-card)]/50 border-[var(--toss-border)] hover:bg-[var(--toss-card)]'}`}>
                  <div><span className="text-[10px] md:text-[11px] font-bold text-[var(--toss-gray-3)]">{a.date}</span><p className="text-xs font-bold text-[var(--foreground)]">퇴근: {a.check_out.slice(11, 16)}</p></div>
                  <span className="text-[10px] md:text-[11px] font-bold text-orange-500 bg-orange-50 px-2 py-1 rounded-[12px]">+{ot}H</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}