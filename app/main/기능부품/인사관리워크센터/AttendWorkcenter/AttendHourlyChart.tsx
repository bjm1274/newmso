'use client';

/**
 * AttendHourlyChart — 시간대별 출·퇴근 바 차트 (reference §868~899)
 *
 * - 07~20시 14 col, 입/퇴근 2-stack (in=초록, out=accent)
 * - max는 부모에서 계산 (slots/maxValue prop)
 *
 * JM: 표시 전용. 데이터 집계는 부모 (AttendDashboard).
 */

import type { HourlyInOutSlot } from './data';

interface AttendHourlyChartProps {
  slots: HourlyInOutSlot[];
  maxValue: number;
  todayIso: string;
}

const CHART_HEIGHT_PX = 120;

function barHeight(value: number, max: number): number {
  if (value <= 0) return 0;
  return Math.max(6, Math.round((value / max) * CHART_HEIGHT_PX));
}

export default function AttendHourlyChart({ slots, maxValue, todayIso }: AttendHourlyChartProps) {
  return (
    <div className="app-card flex flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2.5 md:px-4 md:py-3">
        <h3 className="text-[13px] font-bold text-[var(--foreground)]">시간대별 출·퇴근</h3>
        <div className="flex items-center gap-3 text-[11px] font-semibold text-[var(--toss-gray-4)]">
          <span className="inline-flex items-center gap-1">
            <span aria-hidden="true" className="h-2 w-2 rounded-sm bg-emerald-500" />
            출근
          </span>
          <span className="inline-flex items-center gap-1">
            <span aria-hidden="true" className="h-2 w-2 rounded-sm bg-[var(--accent)]" />
            퇴근
          </span>
          <span className="tnum">{todayIso}</span>
        </div>
      </header>
      <div className="overflow-x-auto px-3 py-3 md:px-4 md:py-3">
        <ul role="list" aria-label="시간대별 출·퇴근 인원" className="flex min-w-fit items-end gap-2">
          {slots.map((slot) => {
            const inH = barHeight(slot.in, maxValue);
            const outH = barHeight(slot.out, maxValue);
            const inTitle = slot.hour + '시 출근 ' + slot.in + '명';
            const outTitle = slot.hour + '시 퇴근 ' + slot.out + '명';
            return (
              <li key={slot.hour} className="flex w-7 flex-col items-center gap-1">
                <div className="flex h-[126px] w-full items-end justify-center gap-0.5" aria-hidden="true">
                  <div
                    title={inTitle}
                    className="flex w-2.5 flex-col items-center justify-end rounded-sm bg-emerald-500/85 text-[9px] font-bold text-white"
                    style={{ height: inH + 'px' }}
                  >
                    {slot.in > 0 ? <span className="pb-0.5 leading-none">{slot.in}</span> : null}
                  </div>
                  <div
                    title={outTitle}
                    className="flex w-2.5 flex-col items-center justify-end rounded-sm bg-[var(--accent)] text-[9px] font-bold text-white"
                    style={{ height: outH + 'px' }}
                  >
                    {slot.out > 0 ? <span className="pb-0.5 leading-none">{slot.out}</span> : null}
                  </div>
                </div>
                <div className="tnum text-[10px] font-bold text-[var(--toss-gray-4)]">{slot.hour}</div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
