'use client';

/**
 * 모바일 공유캘린더 — PC SharedCalendar 통합 연동.
 *   - 직원 연차/휴가 (leave_requests)
 *   - 회사 행사 및 공휴일 (company_holidays)
 *   - 간호근무표 (nurse_schedules)
 *   - 게시판 일정 (board_posts)
 * 세부 권한: calendar_근무표조회 / calendar_게시판일정 / calendar_전체직원근무표
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/db-client';
import { toast } from '@/lib/toast';
import { canAccessCalendarFeature, canAccessMainMenu } from '@/lib/access-control';
import type { ErpUser } from '@/types';
import MobileHeader from '../셸/MobileHeader';
import MChip from '../공통/MChip';
import MIcon from '../공통/MIcon';

type MobileCalEvent =
  | {
      id: string;
      kind: 'leave';
      day: number;
      staff_id: string;
      staff_name: string;
      department?: string;
      leave_type: string;
      reason?: string;
    }
  | {
      id: string;
      kind: 'holiday';
      day: number;
      title: string;
      note?: string;
    }
  | {
      id: string;
      kind: 'shift';
      day: number;
      staff_id: string;
      staff_name: string;
      shift_code: string;
    }
  | {
      id: string;
      kind: 'board';
      day: number;
      title: string;
      board_type?: string;
      schedule_time?: string;
    };

type FilterCategory = 'all' | 'leave' | 'holiday' | 'shift' | 'board';

export default function 공유캘린더({
  onBack,
  user,
}: {
  onBack: () => void;
  user?: ErpUser | null;
}) {
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [events, setEvents] = useState<MobileCalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterCategory>('all');

  const canMenu = canAccessMainMenu(user as never, '공유캘린더');
  const canViewShifts = canAccessCalendarFeature(user as never, '근무표조회');
  const canViewBoard = canAccessCalendarFeature(user as never, '게시판일정');
  const canViewAll = canAccessCalendarFeature(user as never, '전체직원근무표');
  const selfId = String((user as { id?: string } | null | undefined)?.id ?? '').trim();
  const userCompany = user?.company || '';

  const year = cursor.getFullYear();
  const month = cursor.getMonth() + 1;
  const ym = `${year}-${String(month).padStart(2, '0')}`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthStart = `${ym}-01`;
  const monthEnd = `${ym}-${String(daysInMonth).padStart(2, '0')}`;

  const load = useCallback(async () => {
    if (!canMenu) {
      setEvents([]);
      setError('공유캘린더 메뉴 권한이 없습니다.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const loaded: MobileCalEvent[] = [];

      // 0. 직원 정보 맵
      const staffMap = new Map<string, { name: string; department?: string; company?: string }>();
      try {
        let sq = db.from('staff_members').select('id, name, department, company');
        if (userCompany && userCompany !== '전체') {
          sq = sq.eq('company', userCompany);
        }
        const { data: sData } = await sq;
        if (Array.isArray(sData)) {
          for (const s of sData) {
            staffMap.set(String(s.id), {
              name: String(s.name || ''),
              department: s.department ? String(s.department) : undefined,
              company: s.company ? String(s.company) : undefined,
            });
          }
        }
      } catch (e) {
        console.warn('[모바일-공유캘린더] staff_members fetch warn:', e);
      }

      // 1. 직원 연차/휴가 (leave_requests)
      try {
        let leaveQuery = db
          .from('leave_requests')
          .select('id, staff_id, leave_type, start_date, end_date, reason, status')
          .lte('start_date', monthEnd)
          .gte('end_date', monthStart);

        if (!canViewAll && selfId) {
          leaveQuery = leaveQuery.eq('staff_id', selfId);
        }

        const { data: leaveData } = await leaveQuery;
        if (Array.isArray(leaveData)) {
          for (const r of leaveData) {
            if (r.status === '반려') continue;
            const sId = String(r.staff_id || '');
            const sInfo = staffMap.get(sId);
            if (userCompany && userCompany !== '전체' && sInfo?.company && sInfo.company !== userCompany) {
              continue;
            }

            // 날짜 경계는 'YYYY-MM-DD' 문자열로 자른다 — PC 와 동일(9차 M03).
            // Date 산술은 날짜 문자열을 UTC 자정으로, 달 경계를 로컬 자정으로
            // 파싱해 9시간이 어긋났고, 그 탓에 말일 연차가 통째로 사라졌다.
            const reqStartKey = String(r.start_date).slice(0, 10);
            const reqEndKey = String(r.end_date || r.start_date).slice(0, 10);
            const loopStartKey = reqStartKey > monthStart ? reqStartKey : monthStart;
            const loopEndKey = reqEndKey < monthEnd ? reqEndKey : monthEnd;
            if (loopStartKey > loopEndKey) continue;

            const firstDayNum = Number(loopStartKey.slice(8, 10));
            const lastLoopDayNum = Number(loopEndKey.slice(8, 10));
            if (!Number.isFinite(firstDayNum) || !Number.isFinite(lastLoopDayNum)) continue;

            for (let dayNum = firstDayNum; dayNum <= lastLoopDayNum; dayNum += 1) {
              loaded.push({
                id: `leave-${r.id}-${dayNum}`,
                kind: 'leave',
                day: dayNum,
                staff_id: sId,
                staff_name: sInfo?.name || `직원(${sId.slice(0, 4)})`,
                department: sInfo?.department,
                leave_type: String(r.leave_type || '연차'),
                reason: r.reason ? String(r.reason) : undefined,
              });
            }
          }
        }
      } catch (e) {
        console.warn('[모바일-공유캘린더] leave_requests error:', e);
      }

      // 2. 회사 행사 및 공휴일 (company_holidays)
      try {
        const { data: holidayData } = await db
          .from('company_holidays')
          .select('id, name, holiday_date, note, company_name')
          .gte('holiday_date', monthStart)
          .lte('holiday_date', monthEnd);

        if (Array.isArray(holidayData)) {
          for (const h of holidayData) {
            const cName = String(h.company_name || '전체');
            if (userCompany && userCompany !== '전체' && cName !== '전체' && cName !== userCompany) {
              continue;
            }
            const dayNum = Number(String(h.holiday_date ?? '').slice(8, 10));
            if (Number.isFinite(dayNum) && dayNum >= 1 && dayNum <= 31) {
              loaded.push({
                id: `holiday-${h.id}`,
                kind: 'holiday',
                day: dayNum,
                title: String(h.name || '회사 행사'),
                note: h.note ? String(h.note) : undefined,
              });
            }
          }
        }
      } catch (e) {
        console.warn('[모바일-공유캘린더] company_holidays error:', e);
      }

      // 3. 근무표 (nurse_schedules)
      if (canViewShifts) {
        try {
          // limit(2000) 은 /api/d1/query 의 limit 상한(1000)을 넘어 payload 검증에서 400 이 났고,
          // 여기서 error 를 보지 않아 근무표가 조용히 통째로 비어 있었다.
          // 한 달치로 이미 한정된 조회라 PC 공유캘린더(app/main/기능부품/공유캘린더.tsx:141)처럼 상한을 두지 않는다.
          // 운영 nurse_schedules 는 id/staff_id/year_month/day/shift_code/created_at 뿐이라
          // staff_name 을 같이 select 하면 SQLITE_ERROR 로 쿼리 전체가 죽는다.
          // 이름은 staffMap(staff_members) 으로 staff_id 를 조회해 얻는다 — PC 와 동일.
          let shiftQuery = db
            .from('nurse_schedules')
            .select('staff_id, day, shift_code')
            .eq('year_month', ym);

          if (!canViewAll && selfId) {
            shiftQuery = shiftQuery.eq('staff_id', selfId);
          }

          // error 를 보지 않던 것이 이 결함을 오래 숨긴 원인이다 — PC 와 같이 명시적으로 남긴다.
          const { data: shiftData, error: shiftErr } = await shiftQuery;
          if (shiftErr) {
            console.warn('[모바일-공유캘린더] nurse_schedules:', shiftErr);
          } else if (Array.isArray(shiftData)) {
            for (const r of shiftData) {
              const dayNum = Number(r.day);
              if (Number.isFinite(dayNum) && dayNum >= 1 && dayNum <= 31 && r.shift_code) {
                const sId = String(r.staff_id || '');
                const sInfo = staffMap.get(sId);
                loaded.push({
                  id: `shift-${sId}-${dayNum}-${r.shift_code}`,
                  kind: 'shift',
                  day: dayNum,
                  staff_id: sId,
                  staff_name: sInfo?.name || `직원(${sId.slice(0, 4)})`,
                  shift_code: String(r.shift_code),
                });
              }
            }
          }
        } catch (e) {
          console.warn('[모바일-공유캘린더] nurse_schedules error:', e);
        }
      }

      // 4. 게시판 일정 (board_posts)
      if (canViewBoard) {
        try {
          // M04: limit(100) + ORDER BY 없음 → schedule_date 인덱스 순서로 앞 100건만 들어와
          // 월말 한 주가 통째로 빠졌다(2026-07 은 128건 중 28건 누락, 7/25~7/31 이 전부 비었다).
          // 이미 한 달 범위로 좁힌 조회(운영 최대 128건/월)이므로 상한 자체를 없애 그 달 전건을 받는다.
          // PC(app/main/기능부품/공유캘린더.tsx)도 같은 이유로 limit(200) 을 없앴다 — 2차에서 처리.
          const { data: boardData } = await db
            .from('board_posts')
            .select('id, title, board_type, schedule_date, schedule_time')
            .gte('schedule_date', monthStart)
            .lte('schedule_date', monthEnd);

          if (Array.isArray(boardData)) {
            for (const b of boardData) {
              const dayNum = Number(String(b.schedule_date ?? '').slice(8, 10));
              if (Number.isFinite(dayNum) && dayNum >= 1 && dayNum <= 31) {
                loaded.push({
                  id: `board-${b.id}`,
                  kind: 'board',
                  day: dayNum,
                  title: String(b.title || '(제목 없음)'),
                  board_type: String(b.board_type || ''),
                  schedule_time: b.schedule_time ? String(b.schedule_time) : undefined,
                });
              }
            }
          }
        } catch (e) {
          console.warn('[모바일-공유캘린더] board_posts error:', e);
        }
      }

      setEvents(loaded);
    } catch (e) {
      setEvents([]);
      setError(e instanceof Error ? e.message : '일정 로드 실패');
      toast('공유캘린더를 불러오지 못했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  }, [ym, monthStart, monthEnd, year, month, canMenu, canViewShifts, canViewBoard, canViewAll, selfId, userCompany]);

  useEffect(() => {
    void load();
  }, [load]);

  // 필터링 적용
  const filteredEvents = useMemo(() => {
    if (activeFilter === 'all') return events;
    return events.filter((e) => e.kind === activeFilter);
  }, [events, activeFilter]);

  // 날짜별 그룹핑
  const byDay = useMemo(() => {
    const map = new Map<number, MobileCalEvent[]>();
    for (const r of filteredEvents) {
      const d = Number(r.day);
      if (!Number.isFinite(d) || d < 1) continue;
      const list = map.get(d) ?? [];
      list.push(r);
      map.set(d, list);
    }
    return map;
  }, [filteredEvents]);

  // 각 유형별 개수
  const counts = useMemo(() => {
    const res = { all: events.length, leave: 0, holiday: 0, shift: 0, board: 0 };
    for (const e of events) {
      if (e.kind in res) res[e.kind]++;
    }
    return res;
  }, [events]);

  return (
    <div className="m-screen">
      <MobileHeader title="공유캘린더" back={onBack} />
      
      {/* ── 월 이동 네비게이션 ── */}
      <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, background: 'var(--m-card-bg)' }}>
        <button
          type="button"
          className="m-btn ghost"
          onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))}
          aria-label="이전 달"
          style={{ width: 36, height: 36, padding: 0 }}
        >
          ‹
        </button>
        <div style={{ flex: 1, textAlign: 'center', fontWeight: 800, fontSize: 16 }}>
          {cursor.getFullYear()}년 {cursor.getMonth() + 1}월
          <span style={{ fontSize: 11, color: 'var(--z-500)', marginLeft: 6, fontWeight: 600 }}>
            ({userCompany || '전사'})
          </span>
        </div>
        <button
          type="button"
          className="m-btn ghost"
          onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))}
          aria-label="다음 달"
          style={{ width: 36, height: 36, padding: 0 }}
        >
          ›
        </button>
      </div>

      {/* ── 가로 스크롤 필터 칩 바 ── */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          padding: '8px 16px',
          overflowX: 'auto',
          flexShrink: 0,
          borderBottom: '1px solid var(--m-border)',
          background: 'var(--m-bg)',
        }}
      >
        <button
          type="button"
          onClick={() => setActiveFilter('all')}
          className={`m-filter-chip ${activeFilter === 'all' ? 'active' : ''}`}
          style={{
            padding: '4px 10px',
            borderRadius: 20,
            fontSize: 12,
            fontWeight: 700,
            border: 'none',
            background: activeFilter === 'all' ? 'var(--z-800)' : 'var(--m-card-bg)',
            color: activeFilter === 'all' ? 'white' : 'var(--z-700)',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          전체 ({counts.all})
        </button>

        <button
          type="button"
          onClick={() => setActiveFilter('leave')}
          style={{
            padding: '4px 10px',
            borderRadius: 20,
            fontSize: 12,
            fontWeight: 700,
            border: 'none',
            background: activeFilter === 'leave' ? '#059669' : 'var(--m-card-bg)',
            color: activeFilter === 'leave' ? 'white' : '#059669',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          🌴 연차/휴가 ({counts.leave})
        </button>

        <button
          type="button"
          onClick={() => setActiveFilter('holiday')}
          style={{
            padding: '4px 10px',
            borderRadius: 20,
            fontSize: 12,
            fontWeight: 700,
            border: 'none',
            background: activeFilter === 'holiday' ? '#e11d48' : 'var(--m-card-bg)',
            color: activeFilter === 'holiday' ? 'white' : '#e11d48',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          🚩 행사/공휴일 ({counts.holiday})
        </button>

        {canViewShifts && (
          <button
            type="button"
            onClick={() => setActiveFilter('shift')}
            style={{
              padding: '4px 10px',
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 700,
              border: 'none',
              background: activeFilter === 'shift' ? '#2563eb' : 'var(--m-card-bg)',
              color: activeFilter === 'shift' ? 'white' : '#2563eb',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            ⏱️ 근무표 ({counts.shift})
          </button>
        )}

        {canViewBoard && (
          <button
            type="button"
            onClick={() => setActiveFilter('board')}
            style={{
              padding: '4px 10px',
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 700,
              border: 'none',
              background: activeFilter === 'board' ? '#d97706' : 'var(--m-card-bg)',
              color: activeFilter === 'board' ? 'white' : '#d97706',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            📌 게시판 ({counts.board})
          </button>
        )}
      </div>

      {/* ── 일정 목록 ── */}
      <div className="m-scroll">
        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--z-500)', padding: 32 }}>일정을 불러오는 중…</p>
        ) : error ? (
          <div className="m-card" style={{ margin: 16, padding: 16 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <MIcon name="calendar" size={18} />
              <strong>일정을 표시할 수 없습니다</strong>
            </div>
            <p style={{ fontSize: 13, color: 'var(--z-500)', margin: 0 }}>{error}</p>
          </div>
        ) : (
          <div style={{ padding: '10px 12px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
              const list = byDay.get(day) ?? [];
              if (list.length === 0) return null;

              return (
                <div key={day} className="m-card macos-squircle-sm" style={{ padding: '12px 14px' }}>
                  <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>
                      {cursor.getMonth() + 1}월 {day}일
                    </span>
                    <span style={{ color: 'var(--z-500)', fontSize: 12, fontWeight: 600 }}>
                      {list.length}건
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {list.map((ev) => {
                      if (ev.kind === 'holiday') {
                        return (
                          <div
                            key={ev.id}
                            style={{
                              padding: '6px 10px',
                              borderRadius: 8,
                              background: '#ffe4e6',
                              color: '#9f1239',
                              fontSize: 12,
                              fontWeight: 800,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            <span>🚩</span>
                            <span>{ev.title}</span>
                            {ev.note && <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.8 }}>({ev.note})</span>}
                          </div>
                        );
                      }

                      if (ev.kind === 'leave') {
                        return (
                          <div
                            key={ev.id}
                            style={{
                              padding: '6px 10px',
                              borderRadius: 8,
                              background: '#d1fae5',
                              color: '#065f46',
                              fontSize: 12,
                              fontWeight: 700,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            <span>🌴</span>
                            <span>
                              [{ev.leave_type}] {ev.staff_name}
                              {ev.department ? ` (${ev.department})` : ''}
                            </span>
                            {ev.reason && (
                              <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.8, marginLeft: 'auto' }}>
                                {ev.reason}
                              </span>
                            )}
                          </div>
                        );
                      }

                      if (ev.kind === 'board') {
                        return (
                          <div
                            key={ev.id}
                            style={{
                              padding: '6px 10px',
                              borderRadius: 8,
                              background: '#fef3c7',
                              color: '#92400e',
                              fontSize: 12,
                              fontWeight: 700,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            <span>📌</span>
                            <span>
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
                          style={{
                            padding: '6px 10px',
                            borderRadius: 8,
                            background: '#dbeafe',
                            color: '#1e40af',
                            fontSize: 12,
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                          }}
                        >
                          <span>⏱️</span>
                          <span>
                            [{ev.staff_name}] {ev.shift_code}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {byDay.size === 0 && (
              <div className="m-card" style={{ padding: 24, textAlign: 'center' }}>
                <p style={{ margin: 0, color: 'var(--z-500)', fontWeight: 600 }}>
                  등록된 일정이 없습니다.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

