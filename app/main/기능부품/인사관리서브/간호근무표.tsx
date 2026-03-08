'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

const SHIFTS = [
  { code: 'D', label: '데이', color: 'bg-blue-100 text-blue-700', hours: '07:00~15:30' },
  { code: 'E', label: '이브닝', color: 'bg-orange-100 text-orange-700', hours: '15:00~23:30' },
  { code: 'N', label: '나이트', color: 'bg-purple-100 text-purple-700', hours: '23:00~07:30' },
  { code: 'O', label: 'OFF', color: 'bg-gray-100 text-gray-500', hours: '-' },
  { code: 'H', label: '휴가', color: 'bg-green-100 text-green-600', hours: '-' },
  { code: 'S', label: '교육', color: 'bg-yellow-100 text-yellow-700', hours: '-' },
];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function getDayOfWeek(year: number, month: number, day: number) {
  return new Date(year, month - 1, day).getDay(); // 0=일, 6=토
}

export default function NurseSchedule({ staffs = [], selectedCo, user }: { staffs: any[]; selectedCo: string; user: any }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [schedule, setSchedule] = useState<Record<string, Record<number, string>>>({});
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [dept, setDept] = useState('간호부');

  const nurses = staffs.filter(s =>
    (s.department?.includes('간호') || s.department?.includes('nursing') || s.department === dept) &&
    (selectedCo === '전체' || s.company === selectedCo)
  );
  const depts = Array.from(new Set(staffs.map((s: any) => s.department).filter(Boolean))).sort();
  const days = getDaysInMonth(year, month);

  const ym = `${year}-${String(month).padStart(2, '0')}`;

  const fetchSchedule = useCallback(async () => {
    const { data } = await supabase.from('nurse_schedules').select('*').eq('year_month', ym);
    const m: Record<string, Record<number, string>> = {};
    (data || []).forEach((row: any) => {
      if (!m[row.staff_id]) m[row.staff_id] = {};
      m[row.staff_id][row.day] = row.shift_code;
    });
    setSchedule(m);
  }, [ym]);

  useEffect(() => { fetchSchedule(); }, [fetchSchedule]);

  const setShift = (staffId: string, day: number, code: string) => {
    if (!editMode) return;
    setSchedule(prev => ({ ...prev, [staffId]: { ...(prev[staffId] || {}), [day]: code } }));
  };

  const cycleShift = (staffId: string, day: number) => {
    if (!editMode) return;
    const current = schedule[staffId]?.[day] || 'O';
    const idx = SHIFTS.findIndex(s => s.code === current);
    const next = SHIFTS[(idx + 1) % SHIFTS.length].code;
    setShift(staffId, day, next);
  };

  const saveSchedule = async () => {
    setSaving(true);
    try {
      const rows: any[] = [];
      nurses.forEach(n => {
        Object.entries(schedule[n.id] || {}).forEach(([dayStr, code]) => {
          rows.push({ staff_id: n.id, year_month: ym, day: Number(dayStr), shift_code: code });
        });
      });
      await supabase.from('nurse_schedules').delete().eq('year_month', ym).in('staff_id', nurses.map(n => n.id));
      if (rows.length > 0) await supabase.from('nurse_schedules').insert(rows);
      setEditMode(false);
      alert('근무표가 저장되었습니다.');
    } catch { alert('저장 실패'); } finally { setSaving(false); }
  };

  // 자동 생성: D/E/N/O 균등 배분
  const autoGenerate = () => {
    if (!confirm(`${nurses.length}명의 간호 근무표를 자동 생성하시겠습니까?\n기존 근무표가 덮어씌워집니다.`)) return;
    setGenerating(true);
    const codes = ['D', 'E', 'N', 'O', 'O', 'D', 'E'];
    const newSchedule: Record<string, Record<number, string>> = {};
    nurses.forEach((n, ni) => {
      newSchedule[n.id] = {};
      for (let d = 1; d <= days; d++) {
        const dow = getDayOfWeek(year, month, d);
        if (dow === 0 || dow === 6) {
          newSchedule[n.id][d] = 'O';
        } else {
          newSchedule[n.id][d] = codes[(ni + d) % codes.length];
        }
      }
    });
    setSchedule(newSchedule);
    setEditMode(true);
    setGenerating(false);
  };

  const shiftInfo = (code: string) => SHIFTS.find(s => s.code === code) || SHIFTS[3];

  const countByShift = (day: number, code: string) =>
    nurses.filter(n => (schedule[n.id]?.[day] || 'O') === code).length;

  const staffShiftCount = (staffId: string, code: string) =>
    Object.values(schedule[staffId] || {}).filter(c => c === code).length;

  const prevMonth = () => { if (month === 1) { setYear(y => y - 1); setMonth(12); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 12) { setYear(y => y + 1); setMonth(1); } else setMonth(m => m + 1); };

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="p-4 md:p-6 border-b border-[var(--toss-border)] bg-[var(--toss-card)] flex flex-col md:flex-row gap-3 items-start md:items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)] font-bold">‹</button>
          <h2 className="text-base font-bold text-[var(--foreground)]">{year}년 {month}월 간호 근무표</h2>
          <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)] font-bold">›</button>
        </div>
        <div className="flex gap-2 flex-wrap">
          <select value={dept} onChange={e => setDept(e.target.value)} className="px-3 py-1.5 border border-[var(--toss-border)] rounded-[10px] text-xs font-bold bg-[var(--toss-card)] outline-none">
            {depts.map(d => <option key={d}>{d}</option>)}
          </select>
          <button onClick={autoGenerate} disabled={generating || nurses.length === 0} className="px-3 py-1.5 bg-purple-500 text-white rounded-[10px] text-xs font-bold disabled:opacity-50">자동 생성</button>
          <button onClick={() => setEditMode(v => !v)} className={`px-3 py-1.5 rounded-[10px] text-xs font-bold ${editMode ? 'bg-orange-500 text-white' : 'bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)]'}`}>{editMode ? '편집 중' : '편집'}</button>
          {editMode && <button onClick={saveSchedule} disabled={saving} className="px-3 py-1.5 bg-[var(--toss-blue)] text-white rounded-[10px] text-xs font-bold disabled:opacity-50">{saving ? '저장 중...' : '저장'}</button>}
        </div>
      </div>

      {/* 범례 */}
      <div className="flex flex-wrap gap-2 px-4 py-2 border-b border-[var(--toss-border)] shrink-0">
        {SHIFTS.map(s => (
          <span key={s.code} className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${s.color}`}>{s.code} {s.label} {s.hours !== '-' ? s.hours : ''}</span>
        ))}
      </div>

      {nurses.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-[var(--toss-gray-3)] font-bold text-sm">
          간호부 직원이 없습니다. 부서 필터를 변경해보세요.
        </div>
      ) : (
        <div className="flex-1 overflow-auto custom-scrollbar">
          <table className="text-left border-collapse" style={{ minWidth: `${180 + days * 36}px` }}>
            <thead className="sticky top-0 z-20">
              <tr className="bg-[var(--toss-card)] border-b border-[var(--toss-border)]">
                <th className="px-3 py-2 text-[10px] font-semibold text-[var(--toss-gray-3)] w-32 sticky left-0 bg-[var(--toss-card)] z-30">이름</th>
                {Array.from({ length: days }, (_, i) => i + 1).map(d => {
                  const dow = getDayOfWeek(year, month, d);
                  const isSun = dow === 0, isSat = dow === 6;
                  const isToday = year === today.getFullYear() && month === today.getMonth() + 1 && d === today.getDate();
                  return (
                    <th key={d} className={`w-9 py-2 text-center text-[9px] font-semibold ${isSun ? 'text-red-500' : isSat ? 'text-blue-500' : 'text-[var(--toss-gray-3)]'} ${isToday ? 'bg-[var(--toss-blue-light)]' : ''}`}>
                      <div>{d}</div>
                      <div className="text-[8px]">{'일월화수목금토'[dow]}</div>
                    </th>
                  );
                })}
                <th className="px-2 py-2 text-[9px] font-semibold text-[var(--toss-gray-3)] text-center w-8">D</th>
                <th className="px-2 py-2 text-[9px] font-semibold text-[var(--toss-gray-3)] text-center w-8">E</th>
                <th className="px-2 py-2 text-[9px] font-semibold text-[var(--toss-gray-3)] text-center w-8">N</th>
                <th className="px-2 py-2 text-[9px] font-semibold text-[var(--toss-gray-3)] text-center w-8">OFF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--toss-border)]">
              {nurses.map(n => (
                <tr key={n.id} className="hover:bg-[var(--toss-gray-1)]/30">
                  <td className="px-3 py-1.5 sticky left-0 bg-[var(--toss-card)] border-r border-[var(--toss-border)] z-10">
                    <p className="text-xs font-bold text-[var(--foreground)]">{n.name}</p>
                    <p className="text-[9px] text-[var(--toss-gray-3)]">{n.position}</p>
                  </td>
                  {Array.from({ length: days }, (_, i) => i + 1).map(d => {
                    const code = schedule[n.id]?.[d] || 'O';
                    const si = shiftInfo(code);
                    return (
                      <td key={d} className="p-0.5 text-center">
                        <button
                          onClick={() => cycleShift(n.id, d)}
                          className={`w-8 h-7 rounded-[5px] text-[9px] font-bold transition-all ${si.color} ${editMode ? 'hover:opacity-70 cursor-pointer' : 'cursor-default'}`}
                          title={`${n.name} ${d}일: ${si.label}`}
                        >{code}</button>
                      </td>
                    );
                  })}
                  {['D', 'E', 'N', 'O'].map(code => (
                    <td key={code} className="text-center text-[10px] font-bold text-[var(--toss-gray-4)]">{staffShiftCount(n.id, code)}</td>
                  ))}
                </tr>
              ))}
              {/* 일별 집계 */}
              <tr className="bg-[var(--toss-gray-1)]/50 border-t-2 border-[var(--toss-border)]">
                <td className="px-3 py-1.5 sticky left-0 bg-[var(--toss-gray-1)]/80 text-[9px] font-bold text-[var(--toss-gray-3)]">D/E/N</td>
                {Array.from({ length: days }, (_, i) => i + 1).map(d => (
                  <td key={d} className="text-center py-1">
                    <div className="text-[8px] text-blue-600 font-bold">{countByShift(d, 'D')}</div>
                    <div className="text-[8px] text-orange-600 font-bold">{countByShift(d, 'E')}</div>
                    <div className="text-[8px] text-purple-600 font-bold">{countByShift(d, 'N')}</div>
                  </td>
                ))}
                <td colSpan={4} />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
