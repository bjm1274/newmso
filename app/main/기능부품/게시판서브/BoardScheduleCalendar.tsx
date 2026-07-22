'use client';

/**
 * 게시판 수술일정·MRI일정 달력 뷰.
 * 모바일 반응형 완벽 대응: 좁은 화면 찌그러짐 방지 및 모바일 수술 카드 리스트 뷰 통합.
 */

import { useState } from 'react';
import { EmptyState } from '@/app/components/StatePanel';
import type { BoardPost } from '@/types';

export interface ScheduleCalendarData {
  filteredPosts: BoardPost[];
  eventsByDate: Record<string, BoardPost[]>;
  days: Date[];
  month: number;
  toKey: (date: Date) => string;
}

interface BoardScheduleCalendarProps {
  activeBoard: string;
  calendarMonth: Date;
  searchKeyword: string;
  canCreatePost: boolean;
  showNewPost: boolean;
  legacySchedulePosts: BoardPost[];
  loading: boolean;
  scheduleCalendarData: ScheduleCalendarData;
  onSearchChange: (value: string) => void;
  onChangeMonth: (next: Date) => void;
  onToggleNewPost: () => void;
  onSelectPost: (postId: string) => void;
}

export default function BoardScheduleCalendar({
  activeBoard,
  calendarMonth,
  searchKeyword,
  canCreatePost,
  showNewPost,
  legacySchedulePosts,
  loading,
  scheduleCalendarData,
  onSearchChange,
  onChangeMonth,
  onToggleNewPost,
  onSelectPost,
}: BoardScheduleCalendarProps) {
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);

  return (
    <div className="min-w-0 space-y-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3 md:p-4 shadow-sm">
      <div className="flex min-w-0 flex-col items-start justify-between gap-3 md:flex-row md:items-center md:gap-4">
        <div className="flex min-w-0 items-center justify-between w-full md:w-auto">
          <h3 className="text-lg md:text-xl font-bold text-[var(--foreground)]">
            {calendarMonth.getFullYear()}년 {calendarMonth.getMonth() + 1}월 {activeBoard}
          </h3>
          {canCreatePost && (
            <button
              type="button"
              data-testid="board-toggle-new-post"
              onClick={onToggleNewPost}
              className="md:hidden inline-flex items-center justify-center whitespace-nowrap rounded-[var(--radius-md)] bg-[var(--accent)] px-3 py-1.5 text-[12px] font-bold text-white shadow-sm hover:opacity-95 active:scale-[0.98] transition-all"
            >
              {showNewPost ? '취소' : '+ 새 일정'}
            </button>
          )}
        </div>

        <div className="flex w-full min-w-0 flex-col gap-2 text-xs font-bold md:w-auto md:flex-row md:items-center">
          <input
            value={searchKeyword}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="환자명 또는 차트번호 검색"
            className="w-full min-w-0 px-3 py-2 font-semibold rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] text-[13px] md:text-xs outline-none focus:ring-2 focus:ring-[var(--accent)]/30 md:w-48"
          />
          <div className="grid w-full grid-cols-3 gap-1.5 md:flex md:w-auto">
            <button
              type="button"
              onClick={() =>
                onChangeMonth(
                  new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1),
                )
              }
              className="inline-flex items-center justify-center whitespace-nowrap rounded-[var(--radius-md)] border border-[var(--border)] px-2.5 py-1.5 text-[12px] text-[var(--toss-gray-4)] hover:bg-[var(--muted)] active:bg-[var(--muted)]"
            >
              이전 달
            </button>
            <button
              type="button"
              onClick={() => onChangeMonth(new Date())}
              className="inline-flex items-center justify-center whitespace-nowrap rounded-[var(--radius-md)] border border-[var(--border)] px-2.5 py-1.5 text-[12px] text-[var(--toss-gray-4)] hover:bg-[var(--muted)] active:bg-[var(--muted)]"
            >
              오늘
            </button>
            <button
              type="button"
              onClick={() =>
                onChangeMonth(
                  new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1),
                )
              }
              className="inline-flex items-center justify-center whitespace-nowrap rounded-[var(--radius-md)] border border-[var(--border)] px-2.5 py-1.5 text-[12px] text-[var(--toss-gray-4)] hover:bg-[var(--muted)] active:bg-[var(--muted)]"
            >
              다음 달
            </button>
          </div>
          {canCreatePost && (
            <button
              type="button"
              data-testid="board-toggle-new-post"
              onClick={onToggleNewPost}
              className="hidden md:inline-flex items-center justify-center whitespace-nowrap rounded-[var(--radius-md)] bg-[var(--accent)] px-3.5 py-1.5 text-[12px] font-bold text-white shadow-sm hover:opacity-95 active:scale-[0.98] transition-all"
            >
              {showNewPost ? '취소' : (activeBoard === '수술일정' ? '+ 새 수술일정' : '+ 새 MRI일정')}
            </button>
          )}
        </div>
      </div>

      {legacySchedulePosts.length > 0 && (
        <div
          data-testid="board-legacy-schedule-warning"
          className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-3 py-3 text-[11px] text-amber-800"
        >
          <p className="font-bold">일정 정보가 빠진 예전 게시물이 있어 달력에 표시되지 않습니다.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {legacySchedulePosts.slice(0, 8).map((post) => (
              <button
                key={post.id}
                type="button"
                onClick={() => onSelectPost(post.id)}
                className="rounded-[var(--radius-md)] border border-amber-200 bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-bold text-amber-800 hover:bg-amber-100"
              >
                {post.title || '제목 없음'}
              </button>
            ))}
          </div>
        </div>
      )}

      {(() => {
        if (loading) {
          return (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4 animate-pulse">
                  <div className="h-4 w-1/4 bg-[var(--border)] rounded mb-2" />
                  <div className="h-3 w-1/2 bg-[var(--border)] rounded" />
                </div>
              ))}
            </div>
          );
        }

        const { filteredPosts, eventsByDate, days, month, toKey } = scheduleCalendarData;

        if (filteredPosts.length === 0) {
          return (
            <EmptyState
              title="등록된 일정이 없습니다"
              description="새 일정을 등록하면 캘린더에 날짜별로 표시됩니다."
              compact
            />
          );
        }

        const activeDateKey = selectedDateKey || (eventsByDate[toKey(new Date())] ? toKey(new Date()) : null);

        return (
          <div className="space-y-4">
            {/* 달력 그리드 */}
            <div className="border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden bg-[var(--card)]">
              <div className="grid grid-cols-7 bg-[var(--muted)] text-[11px] font-bold text-[var(--toss-gray-3)] border-b border-[var(--border)]">
                {['일', '월', '화', '수', '목', '금', '토'].map((d) => (
                  <div key={d} className="py-2 text-center">
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 text-[11px]">
                {days.map((d, idx) => {
                  const key = toKey(d);
                  const inMonth = d.getMonth() === month;
                  const events = eventsByDate[key] || [];
                  const isSelected = activeDateKey === key;

                  return (
                    <div
                      key={key + idx}
                      data-testid={`board-calendar-day-${key}`}
                      onClick={() => {
                        if (events.length > 0) setSelectedDateKey(key);
                      }}
                      className={`min-h-[52px] md:min-h-[90px] border-b border-r border-[var(--border)] p-1 md:p-1.5 align-top transition-colors ${
                        inMonth ? 'bg-[var(--card)]' : 'bg-[var(--muted)]/40'
                      } ${isSelected ? 'ring-2 ring-inset ring-[var(--accent)] bg-[var(--accent)]/5' : ''} ${
                        events.length > 0 ? 'cursor-pointer hover:bg-[var(--muted)]/60' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className={`text-[11px] font-bold ${
                            !inMonth
                              ? 'text-[var(--toss-gray-3)]/60'
                              : d.getDay() === 0
                              ? 'text-red-500'
                              : d.getDay() === 6
                              ? 'text-[var(--accent)]'
                              : 'text-[var(--foreground)]'
                          }`}
                        >
                          {d.getDate()}
                        </span>
                        {events.length > 0 && (
                          <span
                            className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-full ${
                              activeBoard === '수술일정'
                                ? 'bg-red-500 text-white'
                                : 'bg-purple-600 text-white'
                            }`}
                          >
                            {events.length}건
                          </span>
                        )}
                      </div>

                      {/* PC 화면 달력 이벤트 리스트 */}
                      <div className="hidden md:block space-y-1">
                        {events.slice(0, 4).map((ev: Record<string, unknown>) => (
                          <button
                            key={ev.id as React.Key}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectPost(ev.id as string);
                            }}
                            className="w-full text-left px-1.5 py-1 rounded-md bg-[var(--toss-blue-light)]/60 text-[11px] font-bold text-[var(--foreground)] hover:bg-[var(--toss-blue-light)] flex flex-row items-center gap-1 leading-tight overflow-hidden"
                          >
                            <span className="text-[var(--accent)] shrink-0 font-bold">{(ev.schedule_time as string) || ''}</span>
                            <span className="truncate opacity-90 flex-1 min-w-0">{(ev.patient_name as string) || (ev.title as string)}</span>
                            <span className="font-semibold text-emerald-700 dark:text-emerald-400 shrink-0 max-w-[40%] truncate">
                              {ev.content ? `(${ev.content as string})` : null}
                            </span>
                          </button>
                        ))}
                        {events.length > 4 && (
                          <p className="text-[10px] text-[var(--toss-gray-3)] font-bold text-center mt-0.5">
                            + {events.length - 4}건 더보기
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 모바일 시원한 일자별 수술/MRI 일정 카드 목록 */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between px-1">
                <h4 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
                  <span>📅</span>
                  <span>
                    {activeDateKey
                      ? `${activeDateKey} 일정 (${(eventsByDate[activeDateKey] || []).length}건)`
                      : `이번 달 전체 일정 (${filteredPosts.length}건)`}
                  </span>
                </h4>
                {activeDateKey && (
                  <button
                    type="button"
                    onClick={() => setSelectedDateKey(null)}
                    className="text-[11px] font-bold text-[var(--accent)] hover:underline"
                  >
                    전체 보기
                  </button>
                )}
              </div>

              <div className="space-y-2.5">
                {(activeDateKey ? eventsByDate[activeDateKey] || [] : filteredPosts).map((ev) => (
                  <div
                    key={ev.id}
                    onClick={() => onSelectPost(ev.id)}
                    className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] p-3.5 shadow-sm hover:border-[var(--accent)]/50 active:scale-[0.99] transition-all cursor-pointer space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded bg-[var(--accent)]/10 text-[var(--accent)] font-extrabold text-[12px]">
                            {ev.schedule_time || '시간 미지정'}
                          </span>
                          <span className="font-bold text-[15px] text-[var(--foreground)]">
                            {ev.patient_name ? `${ev.patient_name} 환자` : ev.title}
                          </span>
                          {ev.content && (
                            <span className="text-[12px] font-medium text-[var(--toss-gray-4)]">
                              (차트: {ev.content})
                            </span>
                          )}
                        </div>
                        <h5 className="font-semibold text-[13px] text-[var(--foreground)] mt-1 line-clamp-1">
                          {ev.title}
                        </h5>
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded-[var(--radius-md)] text-[11px] font-bold shrink-0 ${
                          activeBoard === '수술일정'
                            ? 'bg-red-500/10 text-red-600 border border-red-200/50'
                            : 'bg-purple-500/10 text-purple-600 border border-purple-200/50'
                        }`}
                      >
                        {activeBoard === '수술일정' ? '🏥 수술' : '🔬 MRI'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11.5px] text-[var(--toss-gray-4)] border-t border-[var(--border)]/60 pt-2 flex-wrap gap-2">
                      <div className="flex items-center gap-3">
                        <span>🗓️ {ev.schedule_date}</span>
                        {ev.schedule_room && <span>📍 {ev.schedule_room}</span>}
                      </div>

                      <div className="flex items-center gap-1 flex-wrap">
                        {ev.surgery_fasting && (
                          <span className="px-1.5 py-0.5 rounded bg-red-500/10 text-red-600 text-[10px] font-bold">
                            금식
                          </span>
                        )}
                        {ev.surgery_inpatient && (
                          <span className="px-1.5 py-0.5 rounded bg-[var(--accent)]/10 text-[var(--accent)] text-[10px] font-bold">
                            입원
                          </span>
                        )}
                        {ev.surgery_guardian && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 text-[10px] font-bold">
                            보호자
                          </span>
                        )}
                        {ev.surgery_caregiver && (
                          <span className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-600 text-[10px] font-bold">
                            간병인
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
