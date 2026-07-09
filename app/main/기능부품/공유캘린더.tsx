'use client';
import { useState, useMemo, useEffect } from 'react';
import { db } from '@/lib/db-client';
import { CalendarTable } from '@/app/components/CalendarTable';
import { toast } from '@/lib/toast';

export default function SharedCalendar() {
  const today = useMemo(() => new Date(), []);
  const [currentDate, setCurrentDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Month range
  const startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const endDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

  // Load events
  useEffect(() => {
    let mounted = true;
    async function loadData() {
      setLoading(true);
      setLoadError(null);
      try {
        const ym = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;

        // 1. 근무표(Shift) — 테이블 미존재/권한 오류 시 빈 목록 + 안내 (무음 실패 방지)
        const shiftRes = await db
          .from('nurse_schedules')
          .select('staff_id, day, shift_code')
          .eq('year_month', ym);
        let shifts: unknown[] = [];
        if (shiftRes.error) {
          const msg = String((shiftRes.error as { message?: string })?.message || shiftRes.error);
          console.warn('[공유캘린더] nurse_schedules:', msg);
          if (mounted) setLoadError(msg);
          // no such table 등은 빈 캘린더 + 배너, 그 외는 toast
          if (/no such table|not allowed|does not exist/i.test(msg)) {
            toast('근무표 테이블을 찾을 수 없습니다. 빈 캘린더로 표시합니다.', 'warning');
          } else {
            toast('근무표 일정을 불러오지 못했습니다.', 'error');
          }
        } else {
          shifts = Array.isArray(shiftRes.data) ? shiftRes.data : [];
        }

        // 2. 게시판 일정(선택) — 실패해도 근무표는 유지
        let boardEvents: unknown[] = [];
        try {
          const boardRes = await db
            .from('board_posts')
            .select('id, title, created_at, category')
            .eq('category', '일정')
            .limit(100);
          if (!boardRes.error && Array.isArray(boardRes.data)) {
            boardEvents = boardRes.data;
          }
        } catch {
          /* ignore */
        }

        if (mounted) {
          setEvents([...(shifts as any[]), ...(boardEvents as any[])]);
        }
      } catch (err) {
        console.error('[공유캘린더] load exception:', err);
        if (mounted) {
          setEvents([]);
          setLoadError(err instanceof Error ? err.message : '일정 로드 실패');
        }
        toast('일정을 불러오지 못했습니다. 근무표 테이블이 없으면 빈 캘린더로 표시됩니다.', 'error');
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

  const copySyncUrl = () => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem('user') || localStorage.getItem('staff') : null;
      let staffId = '';
      if (raw) {
        const u = JSON.parse(raw) as { id?: string; user_id?: string };
        staffId = String(u.id || u.user_id || '').trim();
      }
      if (!staffId) {
        toast('로그인 정보를 확인할 수 없어 동기화 URL을 만들지 못했습니다.', 'warning');
        return;
      }
      const url = `${window.location.origin}/api/calendar/feed?token=${encodeURIComponent(staffId)}`;
      void navigator.clipboard.writeText(url);
      toast('캘린더 동기화 URL이 복사되었습니다.', 'success');
    } catch {
      toast('URL 복사에 실패했습니다.', 'error');
    }
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
        {loadError && !loading && (
          <div
            role="alert"
            className="mb-3 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 px-4 py-3 text-[12px] font-bold text-red-700 dark:text-red-300"
          >
            근무표 일정을 불러오지 못했습니다. 간호근무표 저장 여부 또는 DB 테이블(nurse_schedules)을 확인하세요.
            <span className="block mt-1 text-[11px] font-medium opacity-80">{loadError}</span>
          </div>
        )}
        {!loading && !loadError && events.length === 0 && (
          <div className="mb-3 rounded-xl border border-[var(--border)] bg-[var(--muted)] px-4 py-3 text-[12px] font-bold text-[var(--toss-gray-4)]">
            이번 달 등록된 근무표 일정이 없습니다. 간호근무표에서 편성·저장하면 여기에 표시됩니다.
          </div>
        )}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden h-full">
          <CalendarTable
            mode="month-grid"
            startDate={startDate}
            endDate={endDate}
            renderCell={(cell) => {
              const dayNum = cell.date.getDate();
              // Find shifts for this day (board posts without day are ignored in day cells)
              const dayShifts = events.filter(e => e && e.day != null && Number(e.day) === dayNum);

              return (
                <div className="flex flex-col gap-1 w-full h-full p-1 overflow-y-auto">
                  {dayShifts.map((shift, i) => (
                    <div key={i} className="px-1.5 py-0.5 text-[10px] rounded bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 font-bold truncate">
                      [직원{String(shift.staff_id ?? '').slice(0, 4)}] {shift.shift_code}
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
