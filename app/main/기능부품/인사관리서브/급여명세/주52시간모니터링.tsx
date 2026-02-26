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
      const parts = (yearMonth || '').split('-');
      if (parts.length < 2) {
        setLoading(false);
        return;
      }
      const y = Number(parts[0]);
      const m = Number(parts[1]);

      if (isNaN(y) || isNaN(m)) {
        setLoading(false);
        return;
      }

      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 0);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        setLoading(false);
        return;
      }

      const { data: att } = await supabase
        .from('attendances')
        .select('*, staff_members(name, company)')
        .gte('work_date', start.toISOString().slice(0, 10))
        .lte('work_date', end.toISOString().slice(0, 10));

      const byStaffWeek: Record<string, { name: string; company?: string; hours: number }> = {};
      (att || []).forEach((a: any) => {
        const d = new Date(a.work_date);
        if (isNaN(d.getTime())) return;
        const weekNum = Math.floor((d.getDate() - 1) / 7);
        const wsDate = new Date(y, m - 1, weekNum * 7 + 1);
        if (isNaN(wsDate.getTime())) return;
        const weekStart = wsDate.toISOString().slice(0, 10);
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
    <div className="border border-[var(--toss-border)] p-5 bg-[var(--toss-card)] rounded-[12px] shadow-sm">
      <div className="pb-2 border-b border-[var(--toss-border)] mb-3">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">주 52시간 모니터링</h3>
      </div>
      <div className="mb-4">
        <input type="month" value={yearMonth} onChange={(e) => setYearMonth(e.target.value)} className="h-9 px-3 border border-[var(--toss-border)] rounded-md text-sm font-medium w-full" />
      </div>
      {loading ? (
        <p className="text-xs text-[var(--toss-gray-3)]">로딩 중...</p>
      ) : weeklyData.length === 0 ? (
        <p className="text-xs font-medium text-emerald-600">52시간 초과 없음</p>
      ) : (
        <div className="space-y-1.5">
          {weeklyData.slice(0, 10).map((x, i) => (
            <div key={i} className="flex justify-between items-center py-2 border-b border-[var(--toss-border)] last:border-0">
              <span className="text-xs font-medium text-[var(--foreground)]">{x.name}</span>
              <span className="text-xs font-medium text-red-600">{x.hours}h 초과</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
