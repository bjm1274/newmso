'use client';
import { useState, useMemo, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { CalendarTable } from '@/app/components/CalendarTable';
import { toast } from '@/lib/toast';

export default function SharedCalendar() {
  const today = useMemo(() => new Date(), []);
  const [currentDate, setCurrentDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Month range
  const startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const endDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

  // Load events
  useEffect(() => {
    let mounted = true;
    async function loadData() {
      setLoading(true);
      try {
        const ym = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
        
        // 1. 근무표(Shift) 데이터 로드
        const { data: shifts } = await supabase
          .from('nurse_schedules')
          .select('staff_id, day, shift_code')
          .eq('year_month', ym);

        // 2. 다른 일정(게시판 일정 등)이 있다면 로드 가능 (여기서는 예시로 생략)
        
        if (mounted) {
          setEvents(shifts || []);
        }
      } catch (err) {
        console.error(err);
        toast('일정을 불러오지 못했습니다.', 'error');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadData();
    return () => { mounted = false; };
  }, [currentDate]);

  const changeMonth = (offset: number) => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
  };

  // Dummy rows for CalendarTable (month-grid needs at least one row, we can just pass a dummy one)
  const rows = [{ id: 'all' }];

  const copySyncUrl = () => {
    // 실제 환경에서는 현재 로그인한 직원의 ID를 사용 (예시로 user.id 대신 'test-user-id')
    const staffId = 'test-user-id'; // To do: use context to get actual user ID
    const url = `${window.location.origin}/api/calendar/feed?token=${staffId}`;
    navigator.clipboard.writeText(url);
    toast('구글 캘린더 동기화 URL이 복사되었습니다.', 'success');
  };

  return (
    <div className="flex flex-col h-full bg-[var(--background)]">
      {/* ── 헤더 ── */}
      <div className="shrink-0 flex items-center justify-between p-5 border-b border-[var(--border)] bg-[var(--card)]">
        <div className="flex flex-col">
          <h2 className="text-xl font-black text-[var(--foreground)] tracking-tight">공유캘린더</h2>
          <p className="text-sm text-[var(--toss-gray-4)] font-bold">전사 및 부서 일정을 한눈에 확인하세요.</p>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={copySyncUrl} className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white font-bold text-sm hover:bg-emerald-600 transition-colors">
            🔗 구글 캘린더 동기화
          </button>
          <div className="w-px h-6 bg-[var(--border)] mx-1" />
          <button type="button" onClick={() => changeMonth(-1)} className="px-3 py-1.5 rounded-lg bg-[var(--muted)] text-[var(--foreground)] font-bold text-sm hover:bg-[var(--border)] transition-colors">이전 달</button>
          <span className="text-lg font-black min-w-[100px] text-center">{currentDate.getFullYear()}년 {currentDate.getMonth() + 1}월</span>
          <button type="button" onClick={() => changeMonth(1)} className="px-3 py-1.5 rounded-lg bg-[var(--muted)] text-[var(--foreground)] font-bold text-sm hover:bg-[var(--border)] transition-colors">다음 달</button>
        </div>
      </div>

      {/* ── 캘린더 본문 ── */}
      <div className="flex-1 overflow-auto p-4 relative">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/50 dark:bg-black/50 backdrop-blur-sm">
            <span className="animate-pulse font-bold text-[var(--accent)]">불러오는 중...</span>
          </div>
        )}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden h-full">
          <CalendarTable
            mode="month-grid"
            startDate={startDate}
            endDate={endDate}
            rows={rows}
            renderCell={(row, cellInfo) => {
              const dayNum = cellInfo.date.getDate();
              // Find shifts for this day
              const dayShifts = events.filter(e => e.day === dayNum);
              
              return (
                <div className="flex flex-col gap-1 w-full h-full p-1 overflow-y-auto">
                  {dayShifts.map((shift, i) => (
                    <div key={i} className="px-1.5 py-0.5 text-[10px] rounded bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 font-bold truncate">
                      [직원{shift.staff_id.slice(0, 4)}] {shift.shift_code}
                    </div>
                  ))}
                  {/* ICS 구독 관련 UI는 나중에 헤더 버튼으로 추가할 예정 */}
                </div>
              );
            }}
          />
        </div>
      </div>
    </div>
  );
}
