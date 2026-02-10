'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { WEEKLY_MAX_HOURS } from '@/lib/tax-free-limits';

export default function WeeklyHoursMonitor({ selectedCo, yearMonth: initialYm }: any) {
  const [yearMonth, setYearMonth] = useState(initialYm || new Date().toISOString().slice(0, 7));
  const [weeklyData, setWeeklyData] = useState<{ staffId: string; name: string; company?: string; weekStart: string; hours: number; exceeds: boolean }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [y, m] = yearMonth.split('-').map(Number);
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 0);
      const { data: att } = await supabase
        .from('attendances')
        .select('*, staff_members(name, company)')
        .gte('work_date', start.toISOString().slice(0, 10))
        .lte('work_date', end.toISOString().slice(0, 10));

      const byStaffWeek: Record<string, { name: string; company?: string; hours: number }> = {};
      (att || []).forEach((a: any) => {
        const d = new Date(a.work_date);
        const weekNum = Math.floor((d.getDate() - 1) / 7);
        const weekStart = new Date(y, m - 1, weekNum * 7 + 1).toISOString().slice(0, 10);
        const key = `${a.staff_id}_${weekStart}`;
        const hrs = (a.work_hours_minutes || 0) / 60;
        if (!byStaffWeek[key]) {
          byStaffWeek[key] = {
            name: a.staff_members?.name || '',
            company: a.staff_members?.company,
            hours: 0,
          };
        }
        byStaffWeek[key].hours += hrs;
      });

      const list = Object.entries(byStaffWeek).map(([k, v]) => {
        const [staffId, weekStart] = k.split('_');
        return {
          staffId,
          name: v.name,
          company: v.company,
          weekStart,
          hours: Math.round(v.hours * 10) / 10,
          exceeds: v.hours > WEEKLY_MAX_HOURS,
        };
      });
      let filtered = list;
      if (selectedCo && selectedCo !== '전체') {
        filtered = list.filter((x) => x.company === selectedCo);
      }
      setWeeklyData(filtered.filter((x) => x.exceeds).sort((a, b) => b.hours - a.hours));
      setLoading(false);
    })();
  }, [yearMonth, selectedCo]);

  return (
    <div className="border border-amber-200 p-6 bg-amber-50/50 rounded-[1.75rem]">
      <h3 className="text-[11px] font-black text-amber-700 uppercase tracking-widest mb-4">주 52시간 근무 모니터링</h3>
      <div className="flex items-center gap-2 mb-4">
        <input type="month" value={yearMonth} onChange={(e) => setYearMonth(e.target.value)} className="p-2 border rounded-lg text-xs font-bold" />
      </div>
      {loading ? (
        <p className="text-xs text-gray-500">로딩 중...</p>
      ) : weeklyData.length === 0 ? (
        <p className="text-xs font-bold text-green-600">52시간 초과 없음</p>
      ) : (
        <div className="space-y-2">
          {weeklyData.slice(0, 10).map((x, i) => (
            <div key={i} className="flex justify-between items-center py-2 border-b border-amber-100 last:border-0">
              <span className="text-xs font-bold text-gray-800">{x.name}</span>
              <span className="text-xs font-black text-red-600">{x.hours}h (초과)</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
