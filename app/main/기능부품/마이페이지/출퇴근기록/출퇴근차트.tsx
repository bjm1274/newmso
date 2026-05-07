'use client';
import type { CommuteLog } from './commute-types';

// ──────────────────────────────────────────────
// getDisplayStatus 헬퍼 (차트/캘린더 내부 전용)
// ──────────────────────────────────────────────

function getDisplayStatus(log: CommuteLog | null | undefined) {
  return String(log?.displayStatus || log?.status || '').trim();
}

// ──────────────────────────────────────────────
// StatItem
// ──────────────────────────────────────────────

interface StatItemProps {
  label: string;
  value: string;
  isWarning?: boolean;
  isSuccess?: boolean;
}

export function StatItem({ label, value, isWarning, isSuccess }: StatItemProps) {
  return (
    <div className="bg-[var(--card)] border border-[var(--border)] p-4 rounded-[var(--radius-lg)] text-center shadow-sm">
      <p className="text-[11px] font-bold text-[var(--toss-gray-3)] mb-2 uppercase">{label}</p>
      <p className={`text-2xl font-semibold ${isWarning ? 'text-red-500' : isSuccess ? 'text-[var(--accent)]' : 'text-[var(--foreground)]'}`}>{value}</p>
    </div>
  );
}

// ──────────────────────────────────────────────
// TimeBox
// ──────────────────────────────────────────────

interface TimeBoxProps {
  label: string;
  time: string;
}

export function TimeBox({ label, time }: TimeBoxProps) {
  return (
    <div className="text-right">
      <p className="text-[11px] font-bold text-[var(--toss-gray-3)] mb-1">{label}</p>
      <p className="text-base font-semibold text-[var(--foreground)]">{time}</p>
    </div>
  );
}

// ──────────────────────────────────────────────
// AttendanceCalendar
// ──────────────────────────────────────────────

export function AttendanceCalendar({ logs, currentMonth }: { logs: CommuteLog[]; currentMonth: Date }) {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  const logByDate = new Map<string, CommuteLog>();
  logs.forEach((log) => {
    const dateKey = String(log.date || '').slice(0, 10);
    if (dateKey) logByDate.set(dateKey, log);
  });

  const cells: (null | number)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  // pad to full weeks
  while (cells.length % 7 !== 0) cells.push(null);

  const getDayCellStyle = (day: number): string => {
    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const log = logByDate.get(dateKey);
    if (log) {
      const status = getDisplayStatus(log);
      if (status === '결근') return 'bg-red-500/100/15 text-red-500 font-semibold';
      if (status === '지각') return 'bg-orange-500/100/15 text-orange-600 font-semibold';
      if (status === '연차' || status === '반차') return 'bg-purple-500/100/15 text-purple-600 font-semibold';
      if (status === '병가') return 'bg-blue-500/100/15 text-blue-600 font-semibold';
      return 'bg-green-500/100/15 text-green-700 font-semibold';
    }
    const dayOfWeek = new Date(year, month, day).getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) return 'text-[var(--toss-gray-3)]'; // weekend - no attendance OK
    if (new Date(year, month, day) < today) return 'bg-red-500/100/10 text-red-400'; // past weekday no record
    return 'text-[var(--toss-gray-4)]';
  };

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3">
      <div className="grid grid-cols-7 mb-1">
        {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
          <div key={d} className={`text-center text-[10px] font-bold py-1 ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-[var(--toss-gray-3)]'}`}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, idx) => (
          <div
            key={idx}
            className={`aspect-square flex items-center justify-center rounded-[var(--radius-md)] text-[11px] ${
              day ? getDayCellStyle(day) : ''
            }`}
          >
            {day || ''}
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-[var(--toss-gray-3)]">
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-green-500/100/30" />정상</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-orange-500/100/30" />지각</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-purple-500/100/30" />연차/반차</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-red-500/100/20" />결근</span>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// WorkHoursChart
// ──────────────────────────────────────────────

export function WorkHoursChart({ logs }: { logs: CommuteLog[] }) {
  if (logs.length === 0) return null;

  const data = [...logs].reverse().map((log) => {
    const checkIn = log.check_in ? new Date(String(log.check_in)) : null;
    const checkOut = log.check_out ? new Date(String(log.check_out)) : null;
    const hours =
      checkIn && checkOut && !Number.isNaN(checkIn.getTime()) && !Number.isNaN(checkOut.getTime())
        ? Math.min(12, Math.max(0, (checkOut.getTime() - checkIn.getTime()) / 3600000))
        : 0;
    const day = String(log.date || '').slice(8, 10).replace(/^0/, '');
    const status = getDisplayStatus(log);
    return { day, hours, status };
  });

  const maxHours = Math.max(8, ...data.map((d) => d.hours));
  const totalWorked = data.reduce((sum, d) => sum + d.hours, 0);
  const avgHours = data.filter((d) => d.hours > 0).length > 0
    ? totalWorked / data.filter((d) => d.hours > 0).length
    : 0;

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--toss-gray-3)]">이번 달 근무시간</p>
        <div className="flex items-center gap-3 text-[11px] text-[var(--toss-gray-3)]">
          <span>총 <strong className="text-[var(--foreground)]">{totalWorked.toFixed(0)}h</strong></span>
          <span>평균 <strong className="text-[var(--accent)]">{avgHours.toFixed(1)}h</strong></span>
        </div>
      </div>
      <div className="flex h-16 items-end gap-0.5 overflow-x-auto pb-1">
        {data.map(({ day, hours, status }) => {
          const heightPercent = maxHours > 0 ? (hours / maxHours) * 100 : 0;
          const barColor =
            hours === 0
              ? status === '결근'
                ? 'bg-red-300'
                : 'bg-[var(--border)]'
              : status === '지각'
                ? 'bg-orange-400'
                : 'bg-[var(--accent)]';
          return (
            <div
              key={day}
              className="flex flex-1 shrink-0 flex-col items-center gap-0.5"
              style={{ minWidth: '10px', maxWidth: '24px' }}
            >
              <div className="relative flex w-full flex-1 items-end">
                <div
                  className={`w-full rounded-t-sm ${barColor} transition-all`}
                  style={{ height: `${Math.max(hours > 0 ? 15 : 4, heightPercent)}%` }}
                  title={`${day}일: ${hours > 0 ? hours.toFixed(1) + 'h' : status || '결근'}`}
                />
              </div>
              <span className="text-[8px] text-[var(--toss-gray-3)]">{day}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex items-center gap-3 text-[10px] text-[var(--toss-gray-3)]">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-[var(--accent)]" />
          정상
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-orange-400" />
          지각
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-[var(--border)]" />
          미기록
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-red-300" />
          결근
        </span>
      </div>
    </div>
  );
}
