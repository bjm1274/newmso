'use client';

/**
 * 게시판 수술일정·MRI일정 달력 뷰.
 * 게시판.tsx 인라인 JSX를 동작 보존 그대로 추출한 프레젠테이션 컴포넌트.
 * 데이터(scheduleCalendarData) 계산과 상태는 부모(게시판.tsx)가 소유한다.
 */

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
  onSelectPost }: BoardScheduleCalendarProps) {
  return (
    <div className="min-w-0 space-y-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm md:p-4">
      <div className="flex min-w-0 flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div className="flex min-w-0 items-center gap-4">
          <div>
            <h3 className="text-lg md:text-xl font-semibold text-[var(--foreground)] mt-1">
              {calendarMonth.getFullYear()}년 {calendarMonth.getMonth() + 1}월
            </h3>
          </div>
        </div>

        <div className="flex w-full min-w-0 flex-col gap-2 text-xs font-bold md:w-auto md:flex-row md:items-center">
          <input
            value={searchKeyword}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="환자명 또는 차트번호 검색"
            className="w-full min-w-0 px-3 py-1.5 font-semibold rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] outline-none focus:ring-2 focus:ring-[var(--accent)]/30 md:w-48"
          />
          <div className="grid w-full grid-cols-3 gap-2 md:flex md:w-auto">
            <button
              type="button"
              onClick={() =>
                onChangeMonth(
                  new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1)
                )
              }
              className="inline-flex items-center justify-center whitespace-nowrap rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-1.5 text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
            >
              이전 달
            </button>
            <button
              type="button"
              onClick={() => onChangeMonth(new Date())}
              className="inline-flex items-center justify-center whitespace-nowrap rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-1.5 text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
            >
              오늘
            </button>
            <button
              type="button"
              onClick={() =>
                onChangeMonth(
                  new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1)
                )
              }
              className="inline-flex items-center justify-center whitespace-nowrap rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-1.5 text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
            >
              다음 달
            </button>
          </div>
          {canCreatePost && (
            <button
              type="button"
              data-testid="board-toggle-new-post"
              onClick={onToggleNewPost}
              className="inline-flex items-center justify-center whitespace-nowrap rounded-[var(--radius-md)] bg-[var(--accent)] px-3.5 py-1.5 text-[12px] font-bold text-white shadow-sm hover:opacity-95 active:scale-[0.98] transition-all"
              aria-label={showNewPost ? '일정 등록 취소' : (activeBoard === '수술일정' ? '+ 새 수술일정 등록' : '+ 새 MRI일정 등록')}
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
          <p className="mt-1 font-semibold text-amber-700">
            아래 게시물은 날짜와 시간이 저장되지 않아 수정 후 다시 저장해야 합니다.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {legacySchedulePosts.slice(0, 8).map((post) => (
              <button
                key={post.id}
                type="button"
                data-testid={`board-legacy-schedule-item-${post.id}`}
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
                <div key={i} className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4">
                  <div className="h-4 w-1/4 bg-[var(--border)] rounded animate-pulse mb-2" />
                  <div className="h-3 w-1/2 bg-[var(--border)] rounded animate-pulse" />
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

        return (
          <div className="border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden">
            <div className="grid grid-cols-7 bg-[var(--muted)] text-[11px] font-semibold text-[var(--toss-gray-3)]">
              {['일', '월', '화', '수', '목', '금', '토'].map((d) => (
                <div key={d} className="px-2 py-2 text-center">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 bg-[var(--card)] text-[11px]">
              {days.map((d, idx) => {
                const key = toKey(d);
                const inMonth = d.getMonth() === month;
                const events = eventsByDate[key] || [];
                return (
                  <div
                    key={key + idx}
                    data-testid={`board-calendar-day-${key}`}
                    className={`min-h-[80px] border border-[var(--border)] p-1.5 align-top ${inMonth ? 'bg-[var(--card)]' : 'bg-[var(--tab-bg)]'
                      }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={`text-[11px] font-semibold ${!inMonth ? 'text-[var(--toss-gray-3)]' : d.getDay() === 0
                          ? 'text-red-500'
                          : d.getDay() === 6
                            ? 'text-[var(--accent)]'
                            : 'text-[var(--foreground)]'
                          }`}
                      >
                        {d.getDate()}
                      </span>
                      {events.length > 0 && (
                        <button
                          data-testid={`board-calendar-day-count-${key}`}
                          type="button"
                          onClick={() => events[0] && onSelectPost(events[0].id)}
                          className="text-[11px] font-semibold text-[var(--accent)] px-2 py-1 rounded-[var(--radius-md)] hover:bg-[var(--toss-blue-light)]"
                        >
                          {events.length}건
                        </button>
                      )}
                    </div>
                    <div className="space-y-1">
                      {events.slice(0, 4).map((ev: Record<string, unknown>) => (
                        <button
                          key={ev.id as React.Key}
                          type="button"
                          onClick={() => onSelectPost(ev.id as string)}
                          className="w-full text-left px-1.5 py-1 rounded-md bg-[var(--toss-blue-light)]/50 text-[10px] md:text-[11px] font-bold text-[var(--foreground)] hover:bg-[var(--toss-blue-light)] flex flex-row items-center gap-1 leading-[1.2] overflow-hidden"
                        >
                          <span className="text-[var(--accent)] shrink-0">{(ev.schedule_time as string) || ''}</span>
                          <span className="truncate opacity-80 flex-1 min-w-0">{ev.title as string}</span>
                          <span className="font-semibold text-emerald-700 dark:text-emerald-400 shrink-0 max-w-[40%] truncate">
                            {(ev.patient_name as string) || '미지정'} {ev.content ? `(${ev.content as string})` : null}
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
        );
      })()}
    </div>
  );
}
