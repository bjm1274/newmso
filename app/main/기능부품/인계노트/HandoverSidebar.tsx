'use client';

import type { Summary } from './handover-types';
import { emptySummary, monthLabel, toDateKey, WEEKDAY_LABELS } from './handover-types';

type HandoverSidebarProps = {
  currentMonth: Date;
  currentMonthGrid: Array<Date | null>;
  selectedDateKey: string;
  todayKey: string;
  summaryByDate: Map<string, Summary>;
  generalNoteCount: number;
  patientGroupCount: number;
  visibleNoteCount: number;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  onSelectDate: (date: Date) => void;
};

export default function HandoverSidebar({
  currentMonth,
  currentMonthGrid,
  selectedDateKey,
  todayKey,
  summaryByDate,
  generalNoteCount,
  patientGroupCount,
  visibleNoteCount,
  onPreviousMonth,
  onNextMonth,
  onSelectDate,
}: HandoverSidebarProps) {
  return (
    <aside className="space-y-4">
      <section className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--page-bg)] p-3">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onPreviousMonth}
            className="rounded-[var(--radius-md)] bg-[var(--card)] px-2.5 py-1.5 text-xs font-semibold text-[var(--foreground)]"
          >
            이전
          </button>
          <h4 className="text-sm font-bold text-[var(--foreground)]">{monthLabel(currentMonth)}</h4>
          <button
            type="button"
            onClick={onNextMonth}
            className="rounded-[var(--radius-md)] bg-[var(--card)] px-2.5 py-1.5 text-xs font-semibold text-[var(--foreground)]"
          >
            다음
          </button>
        </div>

        <div className="mt-2 grid grid-cols-7 gap-1">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="py-0.5 text-center text-[10px] font-bold text-[var(--toss-gray-3)]">
              {label}
            </div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {currentMonthGrid.map((cell, index) => {
            if (!cell) {
              return (
                <div
                  key={`empty-${index}`}
                  className="min-h-[64px] rounded-[var(--radius-md)] border border-transparent"
                />
              );
            }

            const dateKey = toDateKey(cell);
            const summary = summaryByDate.get(dateKey) || emptySummary();
            const isSelected = dateKey === selectedDateKey;
            const isToday = dateKey === todayKey;

            return (
              <button
                key={dateKey}
                type="button"
                onClick={() => onSelectDate(cell)}
                className={`min-h-[64px] rounded-[var(--radius-md)] border px-2 py-1.5 text-left transition ${
                  isSelected
                    ? 'border-[var(--accent)] bg-[var(--toss-blue-light)]/60 shadow-sm'
                    : 'border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]/40 hover:bg-[var(--toss-blue-light)]/20'
                }`}
              >
                <div className="flex h-full flex-col justify-between">
                  <div className="flex items-start justify-between">
                    <span
                      className={`text-[11px] font-black ${
                        isToday ? 'text-[var(--success)]' : 'text-[var(--foreground)]'
                      }`}
                    >
                      {cell.getDate()}
                    </span>
                    {summary.total > 0 ? (
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                    ) : null}
                  </div>
                  <div className="text-[10px] font-semibold text-[var(--toss-gray-3)]">
                    {summary.total > 0 ? `총 ${summary.total}건` : ''}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="grid grid-cols-3 gap-3 xl:grid-cols-1">
        <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--page-bg)] p-3">
          <div className="text-xs font-bold text-[var(--toss-gray-3)]">선택일 공통 인계</div>
          <div className="mt-2 text-xl font-black text-[var(--foreground)]">{generalNoteCount}건</div>
        </div>
        <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--page-bg)] p-3">
          <div className="text-xs font-bold text-[var(--toss-gray-3)]">선택일 환자별 인계</div>
          <div className="mt-2 text-xl font-black text-[var(--success)]">{patientGroupCount}명</div>
        </div>
        <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--page-bg)] p-3">
          <div className="text-xs font-bold text-[var(--toss-gray-3)]">검색 결과</div>
          <div className="mt-2 text-xl font-black text-[var(--foreground)]">{visibleNoteCount}건</div>
        </div>
      </section>
    </aside>
  );
}
