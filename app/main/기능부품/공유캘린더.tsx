'use client';
import { useState, useMemo, useEffect, useCallback } from 'react';
import { db } from '@/lib/db-client';
import { CalendarTable } from '@/app/components/CalendarTable';
import { toast } from '@/lib/toast';
import { canAccessCalendarFeature, canAccessMainMenu } from '@/lib/access-control';

type UserLike = {
  id?: string;
  user_id?: string;
  role?: string | null;
  company?: string | null;
  status?: string | null;
  permissions?: Record<string, unknown> | null;
};

function readSessionUser(): UserLike | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('user') || localStorage.getItem('staff');
    if (!raw) return null;
    return JSON.parse(raw) as UserLike;
  } catch {
    return null;
  }
}

export default function SharedCalendar() {
  const today = useMemo(() => new Date(), []);
  const [currentDate, setCurrentDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sessionUser, setSessionUser] = useState<UserLike | null>(null);

  useEffect(() => {
    setSessionUser(readSessionUser());
  }, []);

  const canOpenMenu = canAccessMainMenu(sessionUser, '공유캘린더');
  const canViewShifts = canAccessCalendarFeature(sessionUser, '근무표조회');
  const canViewBoard = canAccessCalendarFeature(sessionUser, '게시판일정');
  const canSyncExternal = canAccessCalendarFeature(sessionUser, '외부동기화');
  const canViewAllStaff = canAccessCalendarFeature(sessionUser, '전체직원근무표');
  const selfStaffId = String(sessionUser?.id || sessionUser?.user_id || '').trim();

  // Month range
  const startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const endDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

  // Load events
  useEffect(() => {
    if (!sessionUser) return;
    if (!canOpenMenu) {
      setEvents([]);
      setLoading(false);
      setLoadError('공유캘린더 메뉴 권한이 없습니다.');
      return;
    }

    let mounted = true;
    async function loadData() {
      setLoading(true);
      setLoadError(null);
      try {
        const ym = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
        let shifts: unknown[] = [];
        let boardEvents: unknown[] = [];

        // 1. 근무표 — 세부 권한 calendar_근무표조회
        if (canViewShifts) {
          let query = db
            .from('nurse_schedules')
            .select('staff_id, day, shift_code')
            .eq('year_month', ym);
          // 전체 직원 열람 불가 시 본인 일정만
          if (!canViewAllStaff && selfStaffId) {
            query = query.eq('staff_id', selfStaffId);
          }
          const shiftRes = await query;
          if (shiftRes.error) {
            const msg = String((shiftRes.error as { message?: string })?.message || shiftRes.error);
            console.warn('[공유캘린더] nurse_schedules:', msg);
            if (mounted) setLoadError(msg);
            if (/no such table|not allowed|does not exist/i.test(msg)) {
              toast('근무표 테이블을 찾을 수 없습니다. 빈 캘린더로 표시합니다.', 'warning');
            } else {
              toast('근무표 일정을 불러오지 못했습니다.', 'error');
            }
          } else {
            shifts = Array.isArray(shiftRes.data) ? shiftRes.data : [];
          }
        }

        // 2. 게시판 일정 — 세부 권한 calendar_게시판일정
        //
        // 예전에는 `.select('… category').eq('category','일정')` 이었다. board_posts 에
        // `category` 컬럼은 없고(실제 이름은 `board_type`), SQLite 가 큰따옴표 토큰을
        // 문자열 리터럴로 해석하는 바람에 조건이 `'category' = '일정'` 즉 상시 거짓이 되어
        // 에러 없이 늘 0건이었다. 게다가 설령 컬럼명을 고쳤어도 반환 행에 `day` 가 없어
        // 렌더 필터(`e.day != null`)를 통과할 수 없었다 — 이중으로 죽어 있었다.
        //
        // 이제 "일정 메타(schedule_date)를 가진 글"을 이번 달 범위로 조회하고,
        // schedule_date 에서 day 를 파생시켜 근무표 행과 같은 모양으로 만든다.
        // (board_type 에 '일정' 이라는 값은 실제로 존재한 적이 없다. 수술일정·MRI일정 등
        //  일정성 게시글은 모두 schedule_date 로 식별된다.)
        if (canViewBoard) {
          try {
            const monthStart = `${ym}-01`;
            const lastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
            const monthEnd = `${ym}-${String(lastDay).padStart(2, '0')}`;
            const boardRes = await db
              .from('board_posts')
              .select('id, title, board_type, schedule_date, schedule_time')
              .gte('schedule_date', monthStart)
              .lte('schedule_date', monthEnd)
              .limit(200);
            if (boardRes.error) {
              console.warn('[공유캘린더] board_posts:', boardRes.error);
            } else if (Array.isArray(boardRes.data)) {
              boardEvents = boardRes.data
                .map((row) => {
                  const r = row as Record<string, unknown>;
                  const dayNum = Number(String(r.schedule_date ?? '').slice(8, 10));
                  if (!Number.isFinite(dayNum) || dayNum <= 0) return null;
                  return {
                    id: r.id,
                    kind: 'board' as const,
                    day: dayNum,
                    title: String(r.title ?? '(제목 없음)'),
                    board_type: String(r.board_type ?? ''),
                    schedule_time: r.schedule_time ? String(r.schedule_time) : '' };
                })
                .filter(Boolean);
            }
          } catch (err) {
            console.warn('[공유캘린더] board_posts exception:', err);
          }
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
    void loadData();
    return () => {
      mounted = false;
    };
  }, [
    currentDate,
    sessionUser,
    canOpenMenu,
    canViewShifts,
    canViewBoard,
    canViewAllStaff,
    selfStaffId,
  ]);

  const changeMonth = (offset: number) => {
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
  };

  const copySyncUrl = useCallback(async () => {
    if (!canSyncExternal) {
      toast('외부 캘린더 동기화 권한이 없습니다.', 'warning');
      return;
    }
    try {
      // 서명 토큰 발급 (평문 staff_id 토큰 금지 — 근무표 유출 방지)
      const res = await fetch('/api/calendar/feed-token', { credentials: 'include' });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        url?: string;
        error?: string;
      } | null;
      if (!res.ok || !json?.ok || !json.url) {
        toast(json?.error || '동기화 URL을 만들지 못했습니다. 다시 로그인해 주세요.', 'error');
        return;
      }
      await navigator.clipboard.writeText(json.url);
      toast('캘린더 동기화 URL이 복사되었습니다. (90일 유효 서명 토큰)', 'success');
    } catch {
      toast('URL 복사에 실패했습니다.', 'error');
    }
  }, [canSyncExternal]);

  if (sessionUser && !canOpenMenu) {
    return (
      <div className="flex flex-col h-full items-center justify-center bg-[var(--background)] p-8">
        <p className="text-sm font-bold text-[var(--toss-gray-4)]">공유캘린더 메뉴 권한이 없습니다.</p>
        <p className="text-xs text-[var(--toss-gray-3)] mt-2">관리자 → 권한 관리에서 「공유캘린더」를 허용해 주세요.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[var(--background)]">
      {/* ── 헤더 ── */}
      <div className="shrink-0 flex items-center justify-between p-5 border-b border-[var(--border)] bg-[var(--card)]">
        <div className="flex flex-col">
          <h2 className="text-xl font-black text-[var(--foreground)] tracking-tight">공유캘린더</h2>
          <p className="text-sm text-[var(--toss-gray-4)] font-bold">
            {canViewAllStaff ? '전사 및 부서 일정을 한눈에 확인하세요.' : '본인 근무 일정을 확인하세요.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {canSyncExternal && (
            <button
              type="button"
              onClick={copySyncUrl}
              className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white font-bold text-sm hover:bg-emerald-600 transition-colors"
            >
              🔗 구글 캘린더 동기화
            </button>
          )}
          <div className="w-px h-6 bg-[var(--border)] mx-1" />
          <button
            type="button"
            onClick={() => changeMonth(-1)}
            className="px-3 py-1.5 rounded-lg bg-[var(--muted)] text-[var(--foreground)] font-bold text-sm hover:bg-[var(--border)] transition-colors"
          >
            이전 달
          </button>
          <span className="text-lg font-black min-w-[100px] text-center">
            {currentDate.getFullYear()}년 {currentDate.getMonth() + 1}월
          </span>
          <button
            type="button"
            onClick={() => changeMonth(1)}
            className="px-3 py-1.5 rounded-lg bg-[var(--muted)] text-[var(--foreground)] font-bold text-sm hover:bg-[var(--border)] transition-colors"
          >
            다음 달
          </button>
        </div>
      </div>

      {/* ── 캘린더 본문 ── */}
      <div className="flex-1 overflow-auto p-4 relative">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/50 dark:bg-black/50 backdrop-blur-sm">
            <span className="animate-pulse font-bold text-[var(--accent)]">불러오는 중...</span>
          </div>
        )}
        {!canViewShifts && !canViewBoard && !loading && (
          <div
            role="alert"
            className="mb-3 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 px-4 py-3 text-[12px] font-bold text-amber-800 dark:text-amber-200"
          >
            근무표·게시판 일정 조회 권한이 없습니다. 관리자 → 권한 관리 → 공유캘린더 세부 권한을 확인하세요.
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
        {/* 안내 문구가 '근무표' 를 말하므로 게시판 일정은 이 판정에서 제외한다. */}
        {!loading && !loadError && canViewShifts && events.filter((e) => e && e.kind !== 'board' && e.day != null).length === 0 && (
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
              const dayEvents = events.filter((e) => e && e.day != null && Number(e.day) === dayNum);

              return (
                <div className="flex flex-col gap-1 w-full h-full p-1 overflow-y-auto">
                  {dayEvents.map((ev, i) =>
                    // 게시판 일정은 shift_code 가 없다 — 예전 렌더는 근무표 모양만 알고 있어서
                    // 게시글 행이 들어와도 "[직원] undefined" 로 찍혔을 것이다. 종류별로 나눠 표기한다.
                    ev.kind === 'board' ? (
                      <div
                        key={`b-${i}`}
                        title={`${ev.board_type ? `[${ev.board_type}] ` : ''}${ev.title}`}
                        className="px-1.5 py-0.5 text-[10px] rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 font-bold truncate"
                      >
                        {ev.schedule_time ? `${String(ev.schedule_time).slice(0, 5)} ` : ''}
                        {ev.title}
                      </div>
                    ) : (
                      <div
                        key={`s-${i}`}
                        className="px-1.5 py-0.5 text-[10px] rounded bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 font-bold truncate"
                      >
                        [직원{String(ev.staff_id ?? '').slice(0, 4)}] {ev.shift_code}
                      </div>
                    ),
                  )}
                </div>
              );
            }}
          />
        </div>
      </div>
    </div>
  );
}
