'use client';
import type { CommuteLog } from './commute-types';
import { formatKoreanClock, parseDbTimestamp } from '@/lib/date-formatter';

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
    <div className="bg-[var(--card)] border border-[var(--border)] py-1.5 px-2 rounded-[var(--radius-md)] text-center shadow-sm">
      <p className="text-[10px] font-bold text-[var(--toss-gray-3)] mb-0.5 uppercase leading-tight">{label}</p>
      <p
        className="text-base font-bold leading-tight"
        style={{
          color: isWarning
            ? 'var(--warning)'
            : isSuccess
              ? 'var(--success)'
              : 'var(--foreground)' }}
      >
        {value}
      </p>
    </div>
  );
}

// ──────────────────────────────────────────────
// AttendanceCalendar
// ──────────────────────────────────────────────

// KST 고정. 예전에는 getHours() 라 렌더 환경의 TZ 를 따랐고, 서버 렌더
// (Workers=UTC)에서는 출근 05:09 가 20:09 로 찍혔다.
const formatHHmm = formatKoreanClock;

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
      if (status === '결근') return 'text-red-500 font-bold';
      if (status === '지각') return 'text-orange-500 font-bold';
      if (status === '연차' || status === '반차') return 'text-purple-500 font-bold';
      if (status === '병가') return 'text-blue-500 font-bold';
      return 'text-green-600 font-bold';
    }
    const dayOfWeek = new Date(year, month, day).getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) return 'text-[var(--toss-gray-3)]'; // weekend - no attendance OK
    if (new Date(year, month, day) < today) return 'text-red-400 font-semibold'; // past weekday no record
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
        {cells.map((day, idx) => {
          const dateKey = day ? `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` : '';
          const log = day ? logByDate.get(dateKey) : null;
          return (
            <div
              key={idx}
              className={`min-h-[46px] py-1 px-0.5 flex flex-col justify-between items-center rounded-[var(--radius-md)] text-[11px] ${
                day ? getDayCellStyle(day) : ''
              }`}
            >
              {day ? (
                <>
                  <span className="font-bold text-[12px] leading-none">{day}</span>
                  {log && (log.check_in || log.check_out) && (
                    <div className="flex flex-row justify-center items-center gap-1 leading-none w-full mt-1.5 flex-wrap">
                      {log.check_in && (
                        <span className="text-[12px] font-black text-emerald-800 tracking-tighter">
                          {formatHHmm(log.check_in)}
                        </span>
                      )}
                      {log.check_in && log.check_out && <span className="text-[11px] text-[var(--toss-gray-3)] font-bold">~</span>}
                      {log.check_out && (
                        <span className="text-[12px] font-black text-rose-800 tracking-tighter">
                          {formatHHmm(log.check_out)}
                        </span>
                      )}
                    </div>
                  )}
                </>
              ) : (
                ''
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-[var(--toss-gray-3)]">
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-green-600" />정상</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-orange-500" />지각</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-purple-500" />연차/반차</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-red-500" />결근</span>
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
    // 공백형 DB 타임스탬프를 로컬 TZ 로 읽지 않도록 정본 파서를 쓴다.
    const checkIn = log.check_in ? parseDbTimestamp(String(log.check_in)) : null;
    const checkOut = log.check_out ? parseDbTimestamp(String(log.check_out)) : null;
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
      {/* 차트 영역: 막대 위에 시간 라벨 항상 노출 */}
      <div className="flex items-end gap-0.5 overflow-x-auto pb-1" style={{ height: '88px' }}>
        {data.map(({ day, hours, status }) => {
          const heightPercent = maxHours > 0 ? (hours / maxHours) * 100 : 0;
          // 색상 토큰화 4톤: 정상=success, 지각/조퇴=warning, 미기록=muted, 결근=danger
          const barBg =
            hours === 0
              ? status === '결근'
                ? 'var(--danger)'
                : 'var(--border)'
              : status === '지각' || status === '조퇴'
                ? 'var(--warning)'
                : 'var(--success)';
          const labelText =
            hours > 0
              ? hours >= 1
                ? `${hours.toFixed(0)}h`
                : `${Math.round(hours * 60)}m`
              : '';
          return (
            <div
              key={day}
              className="flex flex-1 shrink-0 flex-col items-center"
              style={{ minWidth: '10px', maxWidth: '24px', height: '88px', justifyContent: 'flex-end' }}
            >
              {/* 항상 보이는 시간 라벨 */}
              <span
                className="text-[7px] leading-none mb-0.5 text-[var(--toss-gray-3)] tabular-nums"
                style={{ minHeight: '10px' }}
              >
                {labelText}
              </span>
              {/* 막대 */}
              <div
                className="w-full rounded-t-sm transition-all"
                style={{
                  height: `${Math.max(hours > 0 ? 15 : 4, heightPercent)}%`,
                  background: barBg,
                  maxHeight: '60px' }}
              />
              {/* 날짜 라벨 */}
              <span className="text-[8px] text-[var(--toss-gray-3)] mt-0.5">{day}</span>
            </div>
          );
        })}
      </div>
      {/* 범례: 4톤 토큰 색상 동기화 */}
      <div className="mt-2 flex items-center gap-3 text-[10px] text-[var(--toss-gray-3)]">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: 'var(--success)' }} />
          정상
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: 'var(--warning)' }} />
          지각·조퇴
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: 'var(--border)' }} />
          미기록
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: 'var(--danger)' }} />
          결근
        </span>
      </div>
    </div>
  );
}
