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

type CalendarEvent =
  | {
      id: string;
      kind: 'shift';
      day: number;
      staff_id: string;
      staff_name?: string;
      shift_code: string;
    }
  | {
      id: string;
      kind: 'leave';
      day: number;
      staff_id: string;
      staff_name: string;
      department?: string;
      leave_type: string;
      reason?: string;
      status: string;
    }
  | {
      id: string;
      kind: 'holiday';
      day: number;
      title: string;
      note?: string;
      company_name?: string;
    }
  | {
      id: string;
      kind: 'board';
      day: number;
      title: string;
      board_type?: string;
      schedule_time?: string;
    };

type EventFilterType = 'all' | 'shift' | 'leave' | 'holiday' | 'board';

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
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sessionUser, setSessionUser] = useState<UserLike | null>(null);
  const [filterType, setFilterType] = useState<EventFilterType>('all');

  useEffect(() => {
    setSessionUser(readSessionUser());
  }, []);

  const canOpenMenu = canAccessMainMenu(sessionUser, '공유캘린더');
  const canViewShifts = canAccessCalendarFeature(sessionUser, '근무표조회');
  const canViewBoard = canAccessCalendarFeature(sessionUser, '게시판일정');
  const canSyncExternal = canAccessCalendarFeature(sessionUser, '외부동기화');
  const canViewAllStaff = canAccessCalendarFeature(sessionUser, '전체직원근무표');
  const selfStaffId = String(sessionUser?.id || sessionUser?.user_id || '').trim();
  const userCompany = sessionUser?.company || '';

  // Month range
  const startDate = useMemo(() => new Date(currentDate.getFullYear(), currentDate.getMonth(), 1), [currentDate]);
  const endDate = useMemo(() => new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0), [currentDate]);

  // Load events (Shifts + Leave + Holidays + Board)
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
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth() + 1;
        const ym = `${year}-${String(month).padStart(2, '0')}`;
        const lastDayNum = new Date(year, month, 0).getDate();
        const monthStart = `${ym}-01`;
        const monthEnd = `${ym}-${String(lastDayNum).padStart(2, '0')}`;

        const loadedEvents: CalendarEvent[] = [];

        // 0. 직원 정보 맵 (이름, 부서 등 매핑 및 테넌트 격리)
        const staffMap = new Map<string, { name: string; department?: string; company?: string }>();
        try {
          let staffQuery = db.from('staff_members').select('id, name, department, company');
          if (userCompany && userCompany !== '전체') {
            staffQuery = staffQuery.eq('company', userCompany);
          }
          const { data: staffData } = await staffQuery;
          if (Array.isArray(staffData)) {
            for (const s of staffData) {
              staffMap.set(String(s.id), {
                name: String(s.name || ''),
                department: s.department ? String(s.department) : undefined,
                company: s.company ? String(s.company) : undefined,
              });
            }
          }
        } catch (e) {
          console.warn('[공유캘린더] staff_members fetch warn:', e);
        }

        // 1. 근무표 — 세부 권한 calendar_근무표조회
        if (canViewShifts) {
          try {
            let query = db
              .from('nurse_schedules')
              .select('staff_id, day, shift_code, staff_name')
              .eq('year_month', ym);
            if (!canViewAllStaff && selfStaffId) {
              query = query.eq('staff_id', selfStaffId);
            }
            const shiftRes = await query;
            if (shiftRes.error) {
              console.warn('[공유캘린더] nurse_schedules:', shiftRes.error);
            } else if (Array.isArray(shiftRes.data)) {
              for (const row of shiftRes.data) {
                const dayNum = Number(row.day);
                if (Number.isFinite(dayNum) && dayNum >= 1 && dayNum <= 31 && row.shift_code) {
                  const sId = String(row.staff_id || '');
                  const sInfo = staffMap.get(sId);
                  loadedEvents.push({
                    id: `shift-${sId}-${dayNum}-${row.shift_code}`,
                    kind: 'shift',
                    day: dayNum,
                    staff_id: sId,
                    staff_name: sInfo?.name || row.staff_name || `직원(${sId.slice(0, 4)})`,
                    shift_code: String(row.shift_code),
                  });
                }
              }
            }
          } catch (e) {
            console.warn('[공유캘린더] nurse_schedules exception:', e);
          }
        }

        // 2. 직원 연차/휴가 (leave_requests)
        try {
          let leaveQuery = db
            .from('leave_requests')
            .select('id, staff_id, leave_type, start_date, end_date, reason, status')
            .lte('start_date', monthEnd)
            .gte('end_date', monthStart);

          // 전체 열람 권한이 없으면 본인 연차만
          if (!canViewAllStaff && selfStaffId) {
            leaveQuery = leaveQuery.eq('staff_id', selfStaffId);
          }

          const { data: leaveData, error: leaveErr } = await leaveQuery;
          if (leaveErr) {
            console.warn('[공유캘린더] leave_requests error:', leaveErr);
          } else if (Array.isArray(leaveData)) {
            for (const r of leaveData) {
              const sId = String(r.staff_id || '');
              const sInfo = staffMap.get(sId);
              // 테넌트 격리: 소속 회사 일치 확인 (전체 열람일 때 타 회사 직원 제외)
              if (userCompany && userCompany !== '전체' && sInfo && sInfo.company && sInfo.company !== userCompany) {
                continue;
              }

              // 반려된 건은 표시 제외
              if (r.status === '반려') continue;

              const reqStart = new Date(r.start_date);
              const reqEnd = new Date(r.end_date || r.start_date);
              const loopStart = new Date(Math.max(reqStart.getTime(), startDate.getTime()));
              const loopEnd = new Date(Math.min(reqEnd.getTime(), endDate.getTime()));

              for (let d = new Date(loopStart); d <= loopEnd; d.setDate(d.getDate() + 1)) {
                const dayNum = d.getDate();
                loadedEvents.push({
                  id: `leave-${r.id}-${dayNum}`,
                  kind: 'leave',
                  day: dayNum,
                  staff_id: sId,
                  staff_name: sInfo?.name || `직원(${sId.slice(0, 4)})`,
                  department: sInfo?.department,
                  leave_type: String(r.leave_type || '연차'),
                  reason: r.reason ? String(r.reason) : undefined,
                  status: String(r.status || '승인'),
                });
              }
            }
          }
        } catch (e) {
          console.warn('[공유캘린더] leave_requests exception:', e);
        }

        // 3. 회사 행사 및 공휴일 (company_holidays)
        try {
          const { data: holidayData, error: holidayErr } = await db
            .from('company_holidays')
            .select('id, name, holiday_date, note, company_name')
            .gte('holiday_date', monthStart)
            .lte('holiday_date', monthEnd);

          if (holidayErr) {
            console.warn('[공유캘린더] company_holidays error:', holidayErr);
          } else if (Array.isArray(holidayData)) {
            for (const h of holidayData) {
              const cName = String(h.company_name || '전체');
              // 테넌트 격리: 회사 일치 또는 전체
              if (userCompany && userCompany !== '전체' && cName !== '전체' && cName !== userCompany) {
                continue;
              }
              const dayNum = Number(String(h.holiday_date ?? '').slice(8, 10));
              if (Number.isFinite(dayNum) && dayNum >= 1 && dayNum <= 31) {
                loadedEvents.push({
                  id: `holiday-${h.id}`,
                  kind: 'holiday',
                  day: dayNum,
                  title: String(h.name || '회사 행사'),
                  note: h.note ? String(h.note) : undefined,
                  company_name: cName,
                });
              }
            }
          }
        } catch (e) {
          console.warn('[공유캘린더] company_holidays exception:', e);
        }

        // 4. 게시판 일정 — 세부 권한 calendar_게시판일정
        if (canViewBoard) {
          try {
            const boardRes = await db
              .from('board_posts')
              .select('id, title, board_type, schedule_date, schedule_time')
              .gte('schedule_date', monthStart)
              .lte('schedule_date', monthEnd)
              .limit(200);

            if (boardRes.error) {
              console.warn('[공유캘린더] board_posts:', boardRes.error);
            } else if (Array.isArray(boardRes.data)) {
              for (const row of boardRes.data) {
                const dayNum = Number(String(row.schedule_date ?? '').slice(8, 10));
                if (Number.isFinite(dayNum) && dayNum >= 1 && dayNum <= 31) {
                  loadedEvents.push({
                    id: `board-${row.id}`,
                    kind: 'board',
                    day: dayNum,
                    title: String(row.title ?? '(제목 없음)'),
                    board_type: String(row.board_type ?? ''),
                    schedule_time: row.schedule_time ? String(row.schedule_time) : undefined,
                  });
                }
              }
            }
          } catch (err) {
            console.warn('[공유캘린더] board_posts exception:', err);
          }
        }

        if (mounted) {
          setEvents(loadedEvents);
        }
      } catch (err) {
        console.error('[공유캘린더] load exception:', err);
        if (mounted) {
          setEvents([]);
          setLoadError(err instanceof Error ? err.message : '일정 로드 실패');
        }
        toast('일정을 불러오지 못했습니다.', 'error');
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
    startDate,
    endDate,
    sessionUser,
    canOpenMenu,
    canViewShifts,
    canViewBoard,
    canViewAllStaff,
    selfStaffId,
    userCompany,
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
      toast('캘린더 동기화 URL이 복사되었습니다. (구글/애플 캘린더 연동용)', 'success');
    } catch {
      toast('URL 복사에 실패했습니다.', 'error');
    }
  }, [canSyncExternal]);

  // 필터링된 이벤트
  const filteredEvents = useMemo(() => {
    if (filterType === 'all') return events;
    return events.filter((e) => e.kind === filterType);
  }, [events, filterType]);

  // 각 유형별 건수 집계
  const counts = useMemo(() => {
    const res = { all: events.length, shift: 0, leave: 0, holiday: 0, board: 0 };
    for (const ev of events) {
      if (ev.kind in res) {
        res[ev.kind]++;
      }
    }
    return res;
  }, [events]);

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
      {/* ── 상단 헤더 ── */}
      <div className="shrink-0 flex flex-wrap items-center justify-between p-4 md:p-5 border-b border-[var(--border)] bg-[var(--card)] gap-3">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-black text-[var(--foreground)] tracking-tight">공유캘린더</h2>
            <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-primary/10 text-primary">
              {userCompany || '전사'}
            </span>
          </div>
          <p className="text-xs md:text-sm text-[var(--toss-gray-4)] font-semibold mt-0.5">
            {canViewAllStaff
              ? '전사 직원 연차, 근무표, 회사 행사 및 주요 일정을 통합 확인합니다.'
              : '본인 연차, 근무 일정 및 회사 주요 일정을 확인합니다.'}
          </p>
        </div>

        <div className="flex items-center gap-2 md:gap-3 flex-wrap">
          {canSyncExternal && (
            <button
              type="button"
              onClick={copySyncUrl}
              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs md:text-sm shadow-sm transition-all flex items-center gap-1.5"
            >
              <span>🔗</span>
              <span>캘린더 동기화 URL</span>
            </button>
          )}

          <div className="flex items-center bg-[var(--muted)] p-1 rounded-xl border border-[var(--border)]">
            <button
              type="button"
              onClick={() => changeMonth(-1)}
              className="px-2.5 py-1 rounded-lg text-[var(--foreground)] font-bold text-xs hover:bg-[var(--card)] transition-colors"
              aria-label="이전 달"
            >
              ◀
            </button>
            <span className="text-sm md:text-base font-extrabold px-3 min-w-[90px] text-center text-[var(--foreground)]">
              {currentDate.getFullYear()}년 {currentDate.getMonth() + 1}월
            </span>
            <button
              type="button"
              onClick={() => changeMonth(1)}
              className="px-2.5 py-1 rounded-lg text-[var(--foreground)] font-bold text-xs hover:bg-[var(--card)] transition-colors"
              aria-label="다음 달"
            >
              ▶
            </button>
          </div>
        </div>
      </div>

      {/* ── 필터 및 범례 바 ── */}
      <div className="shrink-0 flex items-center justify-between px-5 py-2.5 bg-[var(--card)]/60 border-b border-[var(--border)] text-xs overflow-x-auto gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-bold text-[var(--toss-gray-4)] mr-1 shrink-0">보기 필터:</span>
          
          <button
            type="button"
            onClick={() => setFilterType('all')}
            className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
              filterType === 'all'
                ? 'bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-sm'
                : 'bg-[var(--muted)] text-[var(--foreground)] hover:bg-[var(--border)]'
            }`}
          >
            전체 ({counts.all})
          </button>

          <button
            type="button"
            onClick={() => setFilterType('leave')}
            className={`px-2.5 py-1 rounded-lg font-bold transition-all flex items-center gap-1 ${
              filterType === 'leave'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 hover:bg-emerald-100'
            }`}
          >
            <span>🌴</span>
            <span>연차/휴가 ({counts.leave})</span>
          </button>

          <button
            type="button"
            onClick={() => setFilterType('holiday')}
            className={`px-2.5 py-1 rounded-lg font-bold transition-all flex items-center gap-1 ${
              filterType === 'holiday'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 hover:bg-rose-100'
            }`}
          >
            <span>🚩</span>
            <span>회사행사/공휴일 ({counts.holiday})</span>
          </button>

          {canViewShifts && (
            <button
              type="button"
              onClick={() => setFilterType('shift')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all flex items-center gap-1 ${
                filterType === 'shift'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 hover:bg-blue-100'
              }`}
            >
              <span>⏱️</span>
              <span>근무표 ({counts.shift})</span>
            </button>
          )}

          {canViewBoard && (
            <button
              type="button"
              onClick={() => setFilterType('board')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all flex items-center gap-1 ${
                filterType === 'board'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 hover:bg-amber-100'
              }`}
            >
              <span>📌</span>
              <span>게시판일정 ({counts.board})</span>
            </button>
          )}
        </div>

        <div className="hidden lg:flex items-center gap-3 text-[11px] text-[var(--toss-gray-4)] font-medium shrink-0">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> 연차</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" /> 행사</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> 근무</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> 일정</span>
        </div>
      </div>

      {/* ── 캘린더 본문 ── */}
      <div className="flex-1 overflow-auto p-4 relative">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 dark:bg-black/60 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="font-bold text-xs text-[var(--foreground)]">일정을 불러오는 중...</span>
            </div>
          </div>
        )}

        {loadError && !loading && (
          <div
            role="alert"
            className="mb-3 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 px-4 py-3 text-[12px] font-bold text-red-700 dark:text-red-300"
          >
            일정을 불러오는 중 오류가 발생했습니다: {loadError}
          </div>
        )}

        {!loading && filteredEvents.length === 0 && (
          <div className="mb-3 rounded-xl border border-[var(--border)] bg-[var(--muted)] px-4 py-3 text-[12px] font-bold text-[var(--toss-gray-4)]">
            이번 달 등록된 일정이 없습니다.
          </div>
        )}

        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden h-full shadow-sm">
          <CalendarTable
            mode="month-grid"
            startDate={startDate}
            endDate={endDate}
            renderCell={(cell) => {
              const dayNum = cell.date.getDate();
              const dayEvents = filteredEvents.filter((e) => e && Number(e.day) === dayNum);

              return (
                <div className="flex flex-col gap-1 w-full h-full p-1 overflow-y-auto max-h-[120px]">
                  {dayEvents.map((ev) => {
                    if (ev.kind === 'holiday') {
                      return (
                        <div
                          key={ev.id}
                          title={`${ev.title}${ev.note ? ` (${ev.note})` : ''}`}
                          className="px-1.5 py-0.5 text-[10px] rounded-md bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-900 font-extrabold truncate flex items-center gap-1 shadow-2xs"
                        >
                          <span className="shrink-0">🚩</span>
                          <span className="truncate">{ev.title}</span>
                        </div>
                      );
                    }

                    if (ev.kind === 'leave') {
                      return (
                        <div
                          key={ev.id}
                          title={`[${ev.leave_type}] ${ev.staff_name}${ev.department ? ` (${ev.department})` : ''}${ev.reason ? ` - ${ev.reason}` : ''}`}
                          className="px-1.5 py-0.5 text-[10px] rounded-md bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-900 font-bold truncate flex items-center gap-1 shadow-2xs"
                        >
                          <span className="shrink-0">🌴</span>
                          <span className="truncate">
                            [{ev.leave_type}] {ev.staff_name}
                          </span>
                        </div>
                      );
                    }

                    if (ev.kind === 'board') {
                      return (
                        <div
                          key={ev.id}
                          title={`${ev.board_type ? `[${ev.board_type}] ` : ''}${ev.title}`}
                          className="px-1.5 py-0.5 text-[10px] rounded-md bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-900 font-bold truncate flex items-center gap-1 shadow-2xs"
                        >
                          <span className="shrink-0">📌</span>
                          <span className="truncate">
                            {ev.schedule_time ? `${String(ev.schedule_time).slice(0, 5)} ` : ''}
                            {ev.title}
                          </span>
                        </div>
                      );
                    }

                    // Shift (근무표)
                    return (
                      <div
                        key={ev.id}
                        title={`[근무] ${ev.staff_name || ev.staff_id}: ${ev.shift_code}`}
                        className="px-1.5 py-0.5 text-[10px] rounded-md bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-200 border border-blue-200 dark:border-blue-900 font-bold truncate flex items-center gap-1 shadow-2xs"
                      >
                        <span className="shrink-0">⏱️</span>
                        <span className="truncate">
                          [{ev.staff_name || ev.staff_id.slice(0, 4)}] {ev.shift_code}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            }}
          />
        </div>
      </div>
    </div>
  );
}

