'use client';

/**
 * WidgetToggleBar.tsx — 위젯 표시/숨김 토글 바
 * JM4: WidgetId union 타입
 * JM6: aria-pressed, keyboard support
 */

import type { Dispatch, SetStateAction } from 'react';

export type WidgetId = 'kpi' | 'revenue' | 'department' | 'occupancy' | 'budget';

export interface WidgetMeta {
  id: WidgetId;
  label: string;
}

export const WIDGET_LIST: WidgetMeta[] = [
  { id: 'kpi', label: 'KPI' },
  { id: 'revenue', label: '매출·이익' },
  { id: 'occupancy', label: '환자' },
  { id: 'budget', label: '예산' },
  { id: 'department', label: '상세표' },
];

interface Props {
  visible: Set<WidgetId>;
  setVisible: Dispatch<SetStateAction<Set<WidgetId>>>;
}

export function WidgetToggleBar({ visible, setVisible }: Props) {
  function toggle(id: WidgetId) {
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="위젯 표시 설정">
      <span className="text-xs font-medium text-[var(--toss-gray-4)]">위젯:</span>
      {WIDGET_LIST.map((w) => {
        const isActive = visible.has(w.id);
        return (
          <button
            key={w.id}
            type="button"
            onClick={() => toggle(w.id)}
            aria-pressed={isActive}
            className={[
              'rounded-[var(--radius-md)] border px-3 py-1.5 text-xs font-medium transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]',
              isActive
                ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                : 'border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:border-[var(--accent)]',
            ].join(' ')}
          >
            {w.label}
          </button>
        );
      })}
    </div>
  );
}
