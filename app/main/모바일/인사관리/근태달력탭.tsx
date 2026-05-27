'use client';

/**
 * 근태달력탭 — 근태.tsx에서 분리된 달력 탭 컴포넌트.
 * JM: 단일 책임, ~100줄
 * JM6: button에 aria-label
 */

import { useMemo } from 'react';
import MIcon from '../공통/MIcon';
import { isKoreanPublicHoliday } from '@/lib/korean-public-holidays';
import type { AttendanceDailyRow } from './data-hooks';

export function dotColorForStatus(status: string | null): string | null {
  if (!status) return null;
  if (status === 'late' || status === 'early_leave') return 'var(--m-warning)';
  if (status === 'absent' || status === 'missing') return 'var(--m-danger)';
  if (status === 'present') return 'var(--m-success)';
  if (status === 'annual_leave' || status === 'half_leave' || status === 'sick_leave')
    return 'var(--m-accent)';
  return null;
}

export function CalTab({
  rows,
  cursor,
  onChange,
}: {
  rows: AttendanceDailyRow[];
  cursor: Date;
  onChange: (next: Date) => void;
}) {
  const byDate = useMemo(() => {
    const map = new Map<string, AttendanceDailyRow>();
    for (const r of rows) map.set(r.date, r);
    return map;
  }, [rows]);

  const y = cursor.getFullYear();
  const m = cursor.getMonth();
  const firstDow = new Date(y, m, 1).getDay();
  const lastDate = new Date(y, m + 1, 0).getDate();
  const todayStr = new Date().toLocaleDateString('en-CA');

  return (
    <div style={{ padding: '14px 16px 0' }}>
      <div className="m-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <button
            type="button"
            onClick={() => onChange(new Date(y, m - 1, 1))}
            aria-label="이전 달"
            style={{ color: 'var(--z-500)' }}
          >
            <MIcon name="chevL" size={18} />
          </button>
          <span style={{ flex: 1, textAlign: 'center', fontSize: 15, fontWeight: 800 }}>
            {y}년 {m + 1}월
          </span>
          <button
            type="button"
            onClick={() => onChange(new Date(y, m + 1, 1))}
            aria-label="다음 달"
            style={{ color: 'var(--z-500)' }}
          >
            <MIcon name="chevR" size={18} />
          </button>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: 4,
            fontSize: 11,
            fontWeight: 700,
            marginBottom: 6,
          }}
        >
          {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
            <div
              key={d}
              style={{
                textAlign: 'center',
                color: i === 0 ? 'var(--m-danger)' : i === 6 ? 'var(--m-accent)' : 'var(--z-500)',
              }}
            >
              {d}
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {Array.from({ length: firstDow + lastDate }).map((_, i) => {
            const day = i - firstDow + 1;
            if (day < 1 || day > lastDate) return <div key={i} style={{ aspectRatio: 1 }} />;
            const dt = new Date(y, m, day);
            const dateStr = dt.toLocaleDateString('en-CA');
            const row = byDate.get(dateStr);
            const isToday = dateStr === todayStr;
            const isHoliday = isKoreanPublicHoliday(dateStr) || dt.getDay() === 0;
            const dot = dotColorForStatus(row?.status ?? null);
            return (
              <div
                key={i}
                style={{
                  aspectRatio: 1,
                  position: 'relative',
                  background: isToday ? 'var(--m-accent)' : 'transparent',
                  color: isToday ? '#fff' : isHoliday ? 'var(--m-danger)' : 'var(--z-700)',
                  borderRadius: 8,
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 13,
                  fontWeight: isToday ? 800 : 600,
                }}
              >
                {day}
                {dot && !isToday && (
                  <span
                    style={{
                      position: 'absolute',
                      bottom: 3,
                      width: 4,
                      height: 4,
                      borderRadius: 999,
                      background: dot,
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ height: 24 }} />
    </div>
  );
}
