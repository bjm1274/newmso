'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getKoreanPublicHolidayName } from '@/lib/korean-public-holidays';
import type { StaffMember } from '@/types';

interface WelfareCalendarProps {
  staffs: StaffMember[];
  selectedCo?: string;
}

const WEEK_HEADERS = ['일', '월', '화', '수', '목', '금', '토'];

interface CalendarEvent {
  type: 'birthday' | 'congrat' | 'checkup' | 'license' | 'device' | 'incident';
  label: string;
  color: string;
  details: string;
}

export default function WelfareCalendar({ staffs = [], selectedCo = '전체' }: WelfareCalendarProps) {
  const [monthAnchor, setMonthAnchor] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [loading, setLoading] = useState(false);

  // 데이터베이스 수집 상태
  const [famEvents, setFamEvents] = useState<any[]>([]);
  const [chkEvents, setChkEvents] = useState<any[]>([]);
  const [licEvents, setLicEvents] = useState<any[]>([]);
  const [devEvents, setDevEvents] = useState<any[]>([]);
  const [incEvents, setIncEvents] = useState<any[]>([]);

  const year = monthAnchor.getFullYear();
  const month0 = monthAnchor.getMonth();

  const shiftMonth = useCallback((delta: -1 | 1) => {
    setMonthAnchor((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }, []);

  const setToday = useCallback(() => {
    const now = new Date();
    setMonthAnchor(new Date(now.getFullYear(), now.getMonth(), 1));
  }, []);

  // KST 기준 오늘 날짜 구하기
  const todayIso = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);

  // 캘린더 일자 그리드 생성
  const cells = useMemo(() => {
    const first = new Date(year, month0, 1);
    const lastDay = new Date(year, month0 + 1, 0).getDate();
    const startDow = first.getDay();
    const list: Array<{ iso: string | null; day: number; dow: number }> = [];

    // 이전 달 빈 칸 채우기
    for (let i = 0; i < startDow; i += 1) {
      list.push({ iso: null, day: 0, dow: i });
    }

    // 이번 달 일자 채우기
    for (let d = 1; d <= lastDay; d += 1) {
      const iso = `${year}-${String(month0 + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      list.push({ iso, day: d, dow: new Date(iso).getDay() });
    }

    // 다음 달 빈 칸 채우기 (7열 그리드 정렬)
    while (list.length % 7 !== 0) {
      list.push({ iso: null, day: 0, dow: list.length % 7 });
    }

    return list;
  }, [year, month0]);

  // Supabase로부터 데이터 패치
  useEffect(() => {
    let active = true;
    const fetchMonthData = async () => {
      setLoading(true);
      try {
        const monthStart = `${year}-${String(month0 + 1).padStart(2, '0')}-01`;
        const lastDayStr = String(new Date(year, month0 + 1, 0).getDate()).padStart(2, '0');
        const monthEnd = `${year}-${String(month0 + 1).padStart(2, '0')}-${lastDayStr}`;

        const [famRes, chkRes, licRes, devRes, incRes] = await Promise.all([
          supabase
            .from('congratulations_condolences')
            .select('*')
            .gte('event_date', monthStart)
            .lte('event_date', monthEnd),
          supabase
            .from('health_checkups')
            .select('*')
            .eq('status', '완료')
            .gte('completed_date', monthStart)
            .lte('completed_date', monthEnd),
          supabase
            .from('staff_licenses')
            .select('*')
            .gte('expiry_date', monthStart)
            .lte('expiry_date', monthEnd),
          supabase
            .from('medical_devices')
            .select('*')
            .gte('next_inspection_date', monthStart)
            .lte('next_inspection_date', monthEnd),
          supabase
            .from('incident_reports')
            .select('*')
            .gte('incident_date', monthStart)
            .lte('incident_date', monthEnd),
        ]);

        if (!active) return;

        setFamEvents(famRes.data || []);
        setChkEvents(chkRes.data || []);
        setLicEvents(licRes.data || []);
        setDevEvents(devRes.data || []);
        setIncEvents(incRes.data || []);
      } catch (error) {
        console.error('WelfareCalendar data fetch error:', error);
      } finally {
        if (active) setLoading(false);
      }
    };

    void fetchMonthData();
    return () => {
      active = false;
    };
  }, [year, month0]);

  // 이벤트 날짜별 그룹핑
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    const addEvent = (date: string, ev: CalendarEvent) => {
      const list = map.get(date) ?? [];
      list.push(ev);
      map.set(date, list);
    };

    // 1. 직원 생일 (virtual)
    // 재직자 필터링
    const activeStaffs = staffs.filter((s) => {
      const isResigned = (s as { status?: string }).status === '퇴사';
      if (isResigned) return false;
      if (selectedCo !== '전체' && s.company !== selectedCo) return false;
      return true;
    });

    activeStaffs.forEach((staff) => {
      let birthMonth: number | null = null;
      let birthDay: number | null = null;
      if (staff.birth_date) {
        const cleanBirth = String(staff.birth_date).replace(/[^0-9]/g, '');
        if (cleanBirth.length === 8) {
          birthMonth = Number(cleanBirth.slice(4, 6));
          birthDay = Number(cleanBirth.slice(6, 8));
        } else if (cleanBirth.length === 4) {
          birthMonth = Number(cleanBirth.slice(0, 2));
          birthDay = Number(cleanBirth.slice(2, 4));
        } else if (String(staff.birth_date).includes('-')) {
          const parts = String(staff.birth_date).split('-');
          if (parts.length === 3) {
            birthMonth = Number(parts[1]);
            birthDay = Number(parts[2]);
          }
        }
      }
      if ((birthMonth === null || birthDay === null) && (staff as any).resident_no) {
        const digits = String((staff as any).resident_no).replace(/[^0-9]/g, '');
        if (digits.length >= 6) {
          birthMonth = Number(digits.slice(2, 4));
          birthDay = Number(digits.slice(4, 6));
        }
      }
      if (birthMonth === month0 + 1 && birthDay !== null) {
        const dateStr = `${year}-${String(birthMonth).padStart(2, '0')}-${String(birthDay).padStart(2, '0')}`;
        addEvent(dateStr, {
          type: 'birthday',
          label: `🎂 ${staff.name} 생일`,
          color: 'bg-blue-500/10 text-blue-700 border-blue-200/50 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/30',
          details: `${staff.name} (${staff.position} / ${staff.department || '부서 없음'}) 생일`,
        });
      }
    });

    // 직원 ID로 조회용 매핑 테이블 생성
    const staffsMap = new Map(staffs.map((s) => [s.id, s]));

    const belongsToSelectedCompany = (staffId: string | undefined) => {
      if (selectedCo === '전체') return true;
      if (!staffId) return false;
      const st = staffsMap.get(staffId);
      return st && st.company === selectedCo;
    };

    // 2. 경조사
    famEvents.forEach((item) => {
      if (item.event_type === '생일') return; // 생일은 중복 표시 안 함
      if (selectedCo !== '전체' && item.company !== selectedCo) return;

      const dateKey = (item.event_date || '').slice(0, 10);
      if (dateKey) {
        addEvent(dateKey, {
          type: 'congrat',
          label: `🎉 ${item.staff_name} ${item.event_type}`,
          color: 'bg-pink-500/10 text-pink-700 border-pink-200/50 dark:bg-pink-950/40 dark:text-pink-300 dark:border-pink-900/30',
          details: `${item.staff_name} ${item.event_type} (${item.relation || '본인'}${item.recipient ? ` / ${item.recipient}` : ''})`,
        });
      }
    });

    // 3. 건강검진
    chkEvents.forEach((item) => {
      if (!belongsToSelectedCompany(item.staff_id)) return;
      const dateKey = (item.completed_date || '').slice(0, 10);
      const staffName = staffsMap.get(item.staff_id)?.name || '직원';
      if (dateKey) {
        addEvent(dateKey, {
          type: 'checkup',
          label: `🩺 ${staffName} 검진`,
          color: 'bg-emerald-500/10 text-emerald-700 border-emerald-200/50 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/30',
          details: `${staffName} 건강검진 완료`,
        });
      }
    });

    // 4. 면허·자격
    licEvents.forEach((item) => {
      if (!belongsToSelectedCompany(item.staff_id)) return;
      const dateKey = (item.expiry_date || '').slice(0, 10);
      const staffName = staffsMap.get(item.staff_id)?.name || '직원';
      if (dateKey) {
        addEvent(dateKey, {
          type: 'license',
          label: `💳 ${staffName} 면허만료`,
          color: 'bg-orange-500/10 text-orange-700 border-orange-200/50 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-900/30',
          details: `${staffName} ${item.license_name || '면허'} 만료일`,
        });
      }
    });

    // 5. 의료기기 점검
    devEvents.forEach((item) => {
      // 의료기기 점검은 회사 정보가 DB에 있을 수 있으나 전체 표시 처리
      const dateKey = (item.next_inspection_date || '').slice(0, 10);
      if (dateKey) {
        addEvent(dateKey, {
          type: 'device',
          label: `⚙️ ${item.name || item.device_name} 점검`,
          color: 'bg-violet-500/10 text-violet-700 border-violet-200/50 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900/30',
          details: `${item.name || item.device_name} 정기점검일`,
        });
      }
    });

    // 6. 사고 보고
    incEvents.forEach((item) => {
      const dateKey = (item.incident_date || '').slice(0, 10);
      if (dateKey) {
        addEvent(dateKey, {
          type: 'incident',
          label: `🚨 ${item.type} 사고`,
          color: 'bg-rose-500/10 text-rose-700 border-rose-200/50 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/30',
          details: `🚨 ${item.type} 사고 발생 (${item.location}) - 상태: ${item.status}`,
        });
      }
    });

    return map;
  }, [staffs, selectedCo, month0, year, famEvents, chkEvents, licEvents, devEvents, incEvents]);

  // 이달의 모든 이벤트를 플랫 리스트로 정리 (달력 하단 요약용)
  const monthlySummaryList = useMemo(() => {
    const list: Array<{ date: string; event: CalendarEvent }> = [];
    eventsByDate.forEach((events, dateStr) => {
      events.forEach((ev) => {
        list.push({ date: dateStr, event: ev });
      });
    });
    return list.sort((a, b) => a.date.localeCompare(b.date));
  }, [eventsByDate]);

  return (
    <div className="flex flex-col h-full bg-[var(--page-bg)] animate-in fade-in duration-300 space-y-4">
      {/* 캘린더 헤더 & 컨트롤 */}
      <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3 bg-[var(--card)] rounded-2xl shadow-sm shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="inline-flex h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
          <h3 className="text-sm font-extrabold text-[var(--foreground)]">복지 & 준수 일정 달력</h3>
          {selectedCo !== '전체' && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[var(--muted)] text-[var(--toss-gray-4)]">
              {selectedCo}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={setToday}
            className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)] transition-all"
          >
            오늘
          </button>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              aria-label="이전 달"
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--card)] text-[12px] font-black text-[var(--toss-gray-4)] hover:bg-[var(--muted)] transition-all"
            >
              ‹
            </button>
            <span className="tnum min-w-[95px] text-center text-xs font-black text-[var(--foreground)]">
              {year}년 {month0 + 1}월
            </span>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              aria-label="다음 달"
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--card)] text-[12px] font-black text-[var(--toss-gray-4)] hover:bg-[var(--muted)] transition-all"
            >
              ›
            </button>
          </div>
        </div>
      </header>

      {/* 로딩 인디케이터 */}
      {loading ? (
        <div className="flex items-center justify-center py-20 bg-[var(--card)] border border-[var(--border)] rounded-2xl">
          <div className="flex flex-col items-center gap-2">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
            <p className="text-[11px] font-bold text-[var(--toss-gray-3)]">데이터 조회 중...</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 flex-1">
          {/* 달력 본체 (3/4 영역) */}
          <div className="lg:col-span-3 bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-sm flex flex-col min-w-0">
            {/* 요일 헤더 */}
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-extrabold uppercase tracking-wider text-[var(--toss-gray-4)] pb-2 border-b border-[var(--border-subtle)]">
              {WEEK_HEADERS.map((label, idx) => (
                <div
                  key={label}
                  className={`px-1 py-1 ${
                    idx === 0 ? 'text-red-600' : idx === 6 ? 'text-blue-600' : 'text-[var(--toss-gray-4)]'
                  }`}
                >
                  {label}
                </div>
              ))}
            </div>

            {/* 날짜 그리드 */}
            <ul className="grid grid-cols-7 gap-1.5 mt-2 flex-1 min-h-[400px]">
              {cells.map((cell, idx) => {
                if (cell.iso === null) {
                  return (
                    <li
                      key={`empty-${idx}`}
                      className="min-h-[70px] rounded-xl bg-[var(--muted)]/20 border border-transparent"
                    />
                  );
                }

                const isToday = cell.iso === todayIso;
                const isSun = cell.dow === 0;
                const isSat = cell.dow === 6;
                const holidayName = getKoreanPublicHolidayName(cell.iso);
                const dayEvents = eventsByDate.get(cell.iso) ?? [];

                return (
                  <li
                    key={cell.iso}
                    className={`flex min-h-[75px] flex-col rounded-xl border p-1.5 transition-all overflow-hidden ${
                      isToday
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)] shadow-sm'
                        : holidayName
                        ? 'border-red-200 bg-red-500/5'
                        : 'border-[var(--border)] bg-[var(--card)] hover:border-[var(--toss-gray-2)]'
                    }`}
                  >
                    {/* 날짜 번호 및 공휴일 표시 */}
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-[10px] font-black ${
                          isToday
                            ? 'text-[var(--accent)] font-black'
                            : isSun || holidayName
                            ? 'text-red-600 font-bold'
                            : isSat
                            ? 'text-blue-600 font-bold'
                            : 'text-[var(--foreground)]'
                        }`}
                      >
                        {cell.day}
                      </span>
                      {holidayName && (
                        <span className="text-[8px] font-black bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 px-1 rounded truncate max-w-[40px]">
                          {holidayName}
                        </span>
                      )}
                    </div>

                    {/* 일자별 이벤트 리스트 */}
                    <div className="mt-1 flex-1 overflow-y-auto no-scrollbar space-y-0.5 max-h-[70px]">
                      {dayEvents.map((ev, eIdx) => (
                        <div
                          key={eIdx}
                          title={ev.details}
                          className={`text-[9px] font-bold px-1 py-0.5 rounded border ${ev.color} truncate cursor-help hover:scale-[1.02] transition-transform`}
                        >
                          {ev.label}
                        </div>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* 복지 일정 목록 요약 (1/4 영역) */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-sm flex flex-col h-[525px] overflow-hidden lg:h-auto">
            <div className="border-b border-[var(--border-subtle)] pb-2 mb-3">
              <h4 className="text-xs font-black text-[var(--foreground)] flex items-center gap-1.5">
                📅 이달의 복지 일정 리스트
                <span className="text-[10px] bg-[var(--accent)] text-white font-bold px-1.5 py-0.5 rounded-full">
                  {monthlySummaryList.length}건
                </span>
              </h4>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2.5 pr-1">
              {monthlySummaryList.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <span className="text-2xl mb-1">🏖️</span>
                  <p className="text-[10px] font-bold text-[var(--toss-gray-3)]">이달의 일정이 없습니다.</p>
                </div>
              ) : (
                monthlySummaryList.map((item, idx) => {
                  const day = item.date.slice(8, 10);
                  return (
                    <div
                      key={idx}
                      className="flex items-start gap-2.5 p-2 rounded-xl bg-[var(--muted)]/40 border border-[var(--border-subtle)] hover:bg-[var(--muted)]/80 transition-colors"
                    >
                      <div className="bg-[var(--accent)] text-white text-[10px] font-black h-7 w-7 rounded-lg flex items-center justify-center shrink-0">
                        {day}일
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-extrabold text-[var(--foreground)] leading-tight">
                          {item.event.label}
                        </p>
                        <p className="text-[9px] text-[var(--toss-gray-4)] font-medium mt-0.5 leading-snug">
                          {item.event.details}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
