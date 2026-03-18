'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

const STATUS_COLORS: Record<string, string> = {
  '대기': 'bg-yellow-100 text-yellow-700 border-yellow-200',
  '진행중': 'bg-blue-100 text-blue-700 border-blue-200',
  '승인': 'bg-green-100 text-green-700 border-green-200',
  '반려': 'bg-red-100 text-red-600 border-red-200',
  '기안': 'bg-purple-100 text-purple-700 border-purple-200',
};

function getDaysInMonth(year: number, month: number) { return new Date(year, month, 0).getDate(); }
function getFirstDayOfWeek(year: number, month: number) { return new Date(year, month - 1, 1).getDay(); }

export default function ApprovalCalendar({ user }: { user: any }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const ym = `${year}-${String(month).padStart(2, '0')}`;

  const fetchApprovals = useCallback(async () => {
    setLoading(true);
    const startDate = `${ym}-01`;
    const endDate = `${ym}-${String(getDaysInMonth(year, month)).padStart(2, '0')}`;
    const { data } = await supabase.from('approvals').select('*')
      .or(`created_at.gte.${startDate},updated_at.gte.${startDate}`)
      .order('created_at', { ascending: false });
    // Filter by month
    const filtered = (data || []).filter(a => {
      const d = a.created_at?.slice(0, 7) === ym || a.updated_at?.slice(0, 7) === ym;
      return d;
    });
    setApprovals(filtered);
    setLoading(false);
  }, [ym]);

  useEffect(() => { fetchApprovals(); }, [fetchApprovals]);

  const prevMonth = () => { if (month === 1) { setYear(y => y - 1); setMonth(12); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 12) { setYear(y => y + 1); setMonth(1); } else setMonth(m => m + 1); };

  const days = getDaysInMonth(year, month);
  const firstDow = getFirstDayOfWeek(year, month);

  const byDay: Record<number, any[]> = {};
  approvals.forEach(a => {
    const d = new Date(a.created_at);
    if (d.getFullYear() === year && d.getMonth() + 1 === month) {
      const day = d.getDate();
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push(a);
    }
  });

  const selectedApprovals = selectedDay ? (byDay[selectedDay] || []) : [];

  const statusCounts: Record<string, number> = {};
  approvals.forEach(a => { statusCounts[a.status] = (statusCounts[a.status] || 0) + 1; });

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="p-3 border-b border-[var(--border)] flex flex-col md:flex-row gap-2 items-start md:items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-[var(--radius-md)] hover:bg-[var(--muted)] text-[var(--toss-gray-4)] font-bold">‹</button>
          <h2 className="text-base font-bold text-[var(--foreground)]">{year}년 {month}월 결재 캘린더</h2>
          <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-[var(--radius-md)] hover:bg-[var(--muted)] text-[var(--toss-gray-4)] font-bold">›</button>
        </div>
        <div className="flex gap-2 flex-wrap">
          {Object.entries(statusCounts).map(([status, count]) => (
            <span key={status} className={`px-2 py-0.5 rounded-[var(--radius-md)] text-[10px] font-bold border ${STATUS_COLORS[status] || 'bg-[var(--tab-bg)] text-[var(--toss-gray-4)] border-[var(--border)]'}`}>
              {status} {count}건
            </span>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* 캘린더 */}
        <div className="flex-1 p-4 overflow-auto">
          {/* 요일 헤더 */}
          <div className="grid grid-cols-7 mb-1">
            {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
              <div key={d} className={`text-center text-[10px] font-bold py-1 ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-[var(--toss-gray-3)]'}`}>{d}</div>
            ))}
          </div>

          {/* 날짜 그리드 */}
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstDow }).map((_, i) => <div key={`empty-${i}`} />)}
            {Array.from({ length: days }, (_, i) => i + 1).map(d => {
              const dayApprovals = byDay[d] || [];
              const isToday = year === today.getFullYear() && month === today.getMonth() + 1 && d === today.getDate();
              const isSelected = selectedDay === d;
              const dow = (firstDow + d - 1) % 7;
              return (
                <button
                  key={d}
                  onClick={() => setSelectedDay(prev => prev === d ? null : d)}
                  className={`min-h-[80px] p-1.5 rounded-[var(--radius-md)] text-left border transition-all ${isSelected ? 'border-[var(--accent)] bg-[var(--toss-blue-light)]' : isToday ? 'border-[var(--accent)]/30 bg-[var(--toss-blue-light)]/30' : 'border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)]'}`}
                >
                  <p className={`text-xs font-bold mb-1 ${isToday ? 'text-[var(--accent)]' : dow === 0 ? 'text-red-500' : dow === 6 ? 'text-blue-500' : 'text-[var(--foreground)]'}`}>{d}</p>
                  <div className="space-y-0.5">
                    {dayApprovals.slice(0, 3).map(a => (
                      <div key={a.id} className={`px-1 py-0.5 rounded text-[8px] font-bold truncate border ${STATUS_COLORS[a.status] || 'bg-[var(--tab-bg)] text-[var(--toss-gray-4)] border-[var(--border)]'}`}>
                        {a.title}
                      </div>
                    ))}
                    {dayApprovals.length > 3 && <p className="text-[8px] text-[var(--toss-gray-3)] font-bold">+{dayApprovals.length - 3}건</p>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 사이드 패널 */}
        {selectedDay && (
          <div className="w-full md:w-72 border-t md:border-t-0 md:border-l border-[var(--border)] p-4 overflow-auto shrink-0">
            <p className="text-sm font-bold text-[var(--foreground)] mb-3">{month}월 {selectedDay}일 결재 현황</p>
            {selectedApprovals.length === 0 ? (
              <p className="text-xs text-[var(--toss-gray-3)] text-center py-5">이 날짜에 결재가 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {selectedApprovals.map(a => (
                  <div key={a.id} className="p-3 bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-md)]">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="text-xs font-bold text-[var(--foreground)] flex-1">{a.title}</p>
                      <span className={`px-1.5 py-0.5 rounded-[var(--radius-md)] text-[9px] font-bold border shrink-0 ${STATUS_COLORS[a.status] || 'bg-[var(--tab-bg)] text-[var(--toss-gray-4)] border-[var(--border)]'}`}>{a.status}</span>
                    </div>
                    <p className="text-[9px] text-[var(--toss-gray-3)]">{a.type} · {a.sender_name}</p>
                    <p className="text-[9px] text-[var(--toss-gray-3)]">{a.created_at?.slice(0, 16)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
