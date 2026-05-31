'use client';

/**
 * MultiDateCalendar — 다중 날짜 선택 달력 (연차계획·연차촉진 날짜 선택용).
 * 오늘부터 N개월 그리드. 과거일 비활성. 선택 가능 일수(max) 초과 시 추가 차단.
 * JM: 단일 책임(날짜 그리드), JM6(button aria-pressed)
 */

import { useMemo } from 'react';

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function MultiDateCalendar({
  selected,
  onToggle,
  max,
  months = 3,
}: {
  selected: Set<string>;
  onToggle: (date: string) => void;
  max: number;
  months?: number;
}) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const todayStr = ymd(today);

  const monthsData = useMemo(() => {
    const out: { label: string; days: (string | null)[] }[] = [];
    for (let i = 0; i < months; i++) {
      const base = new Date(today.getFullYear(), today.getMonth() + i, 1);
      const year = base.getFullYear();
      const month = base.getMonth();
      const firstDow = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const cells: (string | null)[] = [];
      for (let b = 0; b < firstDow; b++) cells.push(null);
      for (let d = 1; d <= daysInMonth; d++) cells.push(ymd(new Date(year, month, d)));
      out.push({ label: `${year}년 ${month + 1}월`, days: cells });
    }
    return out;
  }, [today, months]);

  const atMax = selected.size >= max;

  return (
    <div>
      {monthsData.map((m) => (
        <div key={m.label} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 800, padding: '4px 4px 8px' }}>{m.label}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {WEEK.map((w, i) => (
              <div
                key={w}
                style={{
                  textAlign: 'center',
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '4px 0',
                  color: i === 0 ? 'var(--m-danger)' : i === 6 ? 'var(--m-accent)' : 'var(--z-500)',
                }}
              >
                {w}
              </div>
            ))}
            {m.days.map((d, idx) => {
              if (!d) return <div key={`e${idx}`} />;
              const isSel = selected.has(d);
              const isPast = d < todayStr;
              const disabled = isPast || (!isSel && atMax);
              const dayNum = Number(d.slice(8, 10));
              return (
                <button
                  key={d}
                  type="button"
                  disabled={disabled}
                  aria-pressed={isSel}
                  aria-label={`${d}${isSel ? ' 선택됨' : ''}`}
                  onClick={() => onToggle(d)}
                  style={{
                    aspectRatio: '1 / 1',
                    minHeight: 38,
                    borderRadius: 8,
                    border: 'none',
                    fontSize: 13,
                    fontWeight: isSel ? 800 : 600,
                    cursor: disabled ? 'default' : 'pointer',
                    background: isSel ? 'var(--m-accent)' : 'transparent',
                    color: isSel
                      ? '#fff'
                      : isPast
                        ? 'var(--z-300)'
                        : !isSel && atMax
                          ? 'var(--z-300)'
                          : 'var(--z-800)',
                  }}
                >
                  {dayNum}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
