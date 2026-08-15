'use client';

/**
 * 일정달력 — 수술일정/MRI일정 월간 달력 뷰(모바일·터치형).
 * PC `게시판.tsx` scheduleCalendarData + BoardScheduleCalendar 로직을 모바일로 압축.
 *   - 42칸(6주) 그리드, posts를 schedule_date(YYYY-MM-DD)로 그룹핑
 *   - 셀 탭 → 그 날 첫 일정 상세로 이동, 칩 탭 → 해당 일정 상세
 *   - 이전/오늘/다음 달 이동
 * 미러: board_posts.schedule_date / schedule_time / patient_name / content(차트번호)
 * JM: 단일 책임(달력 표시), JM2(useMemo), JM4(any 금지), JM6(button·aria)
 */

import { useMemo, useState } from 'react';
import { normalizeScheduleDateValue } from '@/app/main/기능부품/게시판-view-utils';
import MIcon from '../공통/MIcon';
import type { BoardListPost } from './data-hooks';

export type BoardScheduleCalendarProps = {
  posts: BoardListPost[];
  /** 'op' | 'mri' — 표시 라벨 분기 */
  isMri: boolean;
  onOpen: (postId: string) => void;
};

const WEEK_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function toKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function BoardScheduleCalendar({ posts, isMri, onOpen }: BoardScheduleCalendarProps) {
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [search, setSearch] = useState('');
  const [selectedDate, setSelectedDate] = useState<string>(() => toKey(new Date()));

  const { eventsByDate, days, month, hasAny } = useMemo(() => {
    const searchLower = search.trim().toLowerCase();
    const filtered = searchLower
      ? posts.filter(
          (p) =>
            String(p.patient_name ?? '').toLowerCase().includes(searchLower) ||
            String(p.content ?? '').toLowerCase().includes(searchLower) ||
            String(p.title ?? '').toLowerCase().includes(searchLower),
        )
      : posts;

    const map: Record<string, BoardListPost[]> = {};
    filtered.forEach((p) => {
      const dateKey = normalizeScheduleDateValue(p.schedule_date);
      if (!dateKey) return;
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(p);
    });

    const year = calendarMonth.getFullYear();
    const m = calendarMonth.getMonth();
    const startDay = new Date(year, m, 1).getDay();
    const startDate = new Date(year, m, 1 - startDay);
    const grid = Array.from({ length: 42 }, (_, i) => {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      return d;
    });

    return { eventsByDate: map, days: grid, month: m, hasAny: Object.keys(map).length > 0 };
  }, [posts, search, calendarMonth]);

  const goMonth = (delta: number) => {
    setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };
  const goToday = () => {
    const now = new Date();
    setCalendarMonth(new Date(now.getFullYear(), now.getMonth(), 1));
  };

  return (
    <div style={{ padding: '12px 12px 24px' }}>
      {/* 헤더: 월 + 이동 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--z-900)', flex: 1, letterSpacing: '-0.02em' }}>
          {calendarMonth.getFullYear()}년 {calendarMonth.getMonth() + 1}월
        </div>
        <button
          type="button"
          onClick={() => goMonth(-1)}
          aria-label="이전 달"
          className="macos-glass macos-squircle-sm"
          style={{ width: 34, height: 34, border: '1px solid rgba(0, 0, 0, 0.05)', display: 'grid', placeItems: 'center', background: 'rgba(255, 255, 255, 0.55)', cursor: 'pointer' }}
        >
          <MIcon name="chevL" size={16} color="var(--z-600)" />
        </button>
        <button
          type="button"
          onClick={goToday}
          className="macos-glass macos-squircle-sm"
          style={{ height: 34, padding: '0 12px', border: '1px solid rgba(0, 0, 0, 0.05)', background: 'rgba(255, 255, 255, 0.55)', fontSize: 12, fontWeight: 800, color: 'var(--z-700)', cursor: 'pointer' }}
        >
          오늘
        </button>
        <button
          type="button"
          onClick={() => goMonth(1)}
          aria-label="다음 달"
          className="macos-glass macos-squircle-sm"
          style={{ width: 34, height: 34, border: '1px solid rgba(0, 0, 0, 0.05)', display: 'grid', placeItems: 'center', background: 'rgba(255, 255, 255, 0.55)', cursor: 'pointer' }}
        >
          <MIcon name="chevR" size={16} color="var(--z-600)" />
        </button>
      </div>

      {/* 검색 */}
      <div
        className="macos-glass macos-squircle-sm"
        style={{
          display: 'flex',
          alignItems: 'center',
          background: 'rgba(0, 0, 0, 0.04)',
          border: '1px solid rgba(0, 0, 0, 0.05)',
          padding: '6px 12px',
          height: 36,
          marginBottom: 12 }}
      >
        <span style={{ marginRight: 6, display: 'flex', alignItems: 'center' }}><MIcon name="search" size={15} color="var(--z-500)" /></span>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="환자명·차트번호 검색"
          aria-label="일정 검색"
          style={{
            flex: 1,
            fontSize: 13,
            fontFamily: 'inherit',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--z-900)',
            width: '100%' }}
        />
      </div>

      {/* 요일 헤더 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 2 }}>
        {WEEK_LABELS.map((d, i) => (
          <div
            key={d}
            style={{
              textAlign: 'center',
              fontSize: 11,
              fontWeight: 800,
              padding: '4px 0',
              color: i === 0 ? 'var(--m-danger, #ef4444)' : i === 6 ? 'var(--m-accent)' : 'var(--z-500)' }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* 날짜 그리드 */}
      <div
        className="macos-glass"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          border: '1px solid rgba(0, 0, 0, 0.05)',
          borderRadius: 14,
          overflow: 'hidden',
          background: 'rgba(255, 255, 255, 0.35)',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.03)' }}
      >
        {days.map((d, idx) => {
          const key = toKey(d);
          const inMonth = d.getMonth() === month;
          const events = eventsByDate[key] || [];
          const dow = d.getDay();
          const isSelected = selectedDate === key;
          return (
            <div
              key={`${key}-${idx}`}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedDate(key)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedDate(key); }}
              style={{
                minHeight: 72,
                borderRight: (idx % 7) === 6 ? 'none' : '1px solid rgba(0, 0, 0, 0.05)',
                borderBottom: idx < 35 ? '1px solid rgba(0, 0, 0, 0.05)' : 'none',
                padding: 4,
                background: isSelected
                  ? 'var(--m-accent-soft)'
                  : inMonth
                    ? 'rgba(255, 255, 255, 0.45)'
                    : 'rgba(0, 0, 0, 0.02)',
                boxShadow: isSelected ? 'inset 0 0 0 2px var(--m-accent)' : 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                cursor: 'pointer',
                transition: 'all 150ms ease' }}
            >
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 800,
                  color: !inMonth
                    ? 'var(--z-400)'
                    : dow === 0
                      ? '#FF3B30'
                      : dow === 6
                        ? 'var(--m-accent)'
                        : 'var(--z-800)' }}
              >
                {d.getDate()}
              </div>
              {events.slice(0, 3).map((ev) => (
                <div
                  key={String(ev.id)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    borderRadius: 6,
                    background: 'var(--m-accent-soft)',
                    padding: '3px 4px',
                    fontSize: 9,
                    fontWeight: 800,
                    color: 'var(--m-accent)',
                    lineHeight: 1.2,
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                    pointerEvents: 'none' }}
                >
                  <span style={{ opacity: 0.8, marginRight: 2 }}>{ev.schedule_time || ''}</span>
                  {ev.patient_name || ev.title}
                </div>
              ))}
              {events.length > 3 && (
                <div
                  style={{
                    fontSize: 9,
                    fontWeight: 800,
                    color: 'var(--m-accent)',
                    textAlign: 'center',
                    padding: '2px 0',
                    pointerEvents: 'none' }}
                >
                  +{events.length - 3}건
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 선택일 일정 목록 */}
      {(() => {
        const selectedEvents = eventsByDate[selectedDate] || [];
        const [y, m, d] = selectedDate.split('-');
        return (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--z-600)', marginBottom: 10, paddingLeft: 4 }}>
              {y}년 {parseInt(m ?? '0')}월 {parseInt(d ?? '0')}일 {isMri ? 'MRI건수' : '수술건수'}: {selectedEvents.length}건
            </div>
            {selectedEvents.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {selectedEvents.map((ev) => (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => onOpen(ev.id)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      background: 'rgba(255, 255, 255, 0.55)',
                      border: '1px solid rgba(0, 0, 0, 0.05)',
                      borderRadius: 12,
                      padding: '12px 14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.02)' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                      <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--m-accent)' }}>
                        {ev.schedule_time || '시간 미지정'}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--z-500)' }}>
                        {ev.author_name ?? ''}
                      </span>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--z-900)' }}>
                      {ev.patient_name || ev.title}
                    </div>
                    {ev.content && (
                      <div style={{ fontSize: 12, color: 'var(--z-600)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
                        {ev.content}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div style={{
                textAlign: 'center',
                padding: '24px 0',
                color: 'var(--z-400)',
                fontSize: 12,
                fontWeight: 700,
                background: 'rgba(255, 255, 255, 0.25)',
                borderRadius: 12,
                border: '1px dashed rgba(0, 0, 0, 0.05)'
              }}>
                선택하신 날짜에 예정된 일정이 없습니다.
              </div>
            )}
          </div>
        );
      })()}

      {!hasAny && (
        <div
          style={{
            textAlign: 'center',
            padding: '24px 0',
            fontSize: 13,
            color: 'var(--z-500)',
            fontWeight: 600,
            marginTop: 20 }}
        >
          {isMri ? '등록된 MRI 일정이 없습니다.' : '등록된 수술 일정이 없습니다.'}
          <br />
          <span style={{ fontSize: 11 }}>새 일정을 등록하면 날짜별로 표시됩니다.</span>
        </div>
      )}
    </div>
  );
}
