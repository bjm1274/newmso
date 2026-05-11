'use client';

/**
 * CommuteClient.tsx — 출퇴근 화면
 *
 * - 64px 체크인 버튼 (aria-pressed 토글)
 * - 최근 7일 기록 카드
 * - 월간 요약 (총 근무일, 평균 출근 시간)
 *
 * JM2: useMemo 월간 계산, 불필요 렌더 방지
 * JM4: any 금지, 타입 명시
 * JM6: aria-pressed (출근/퇴근 상태), role="list", 상태 role="status"
 */

import React, { useState, useMemo } from 'react';
import { Clock, Calendar, TrendingUp } from 'lucide-react';

// ── 타입 ──────────────────────────────────────────────────────────────────────

type CheckStatus = 'idle' | 'checked-in' | 'checked-out';

interface DailyRecord {
  date: string; // YYYY-MM-DD
  dayLabel: string; // 예: "월"
  checkIn: string | null;
  checkOut: string | null;
  workMinutes: number | null;
}

// ── 더미 7일 기록 ─────────────────────────────────────────────────────────────

const RECENT_RECORDS: readonly DailyRecord[] = [
  { date: '2026-05-11', dayLabel: '월', checkIn: '08:52', checkOut: null, workMinutes: null },
  { date: '2026-05-10', dayLabel: '일', checkIn: null, checkOut: null, workMinutes: null },
  { date: '2026-05-09', dayLabel: '토', checkIn: null, checkOut: null, workMinutes: null },
  { date: '2026-05-08', dayLabel: '금', checkIn: '08:55', checkOut: '18:03', workMinutes: 548 },
  { date: '2026-05-07', dayLabel: '목', checkIn: '09:01', checkOut: '18:10', workMinutes: 549 },
  { date: '2026-05-06', dayLabel: '수', checkIn: '08:48', checkOut: '18:00', workMinutes: 552 },
  { date: '2026-05-05', dayLabel: '화', checkIn: null, checkOut: null, workMinutes: null },
] as const;

// ── 유틸 ──────────────────────────────────────────────────────────────────────

function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function isWeekend(dayLabel: string): boolean {
  return dayLabel === '토' || dayLabel === '일';
}

// ── 체크인 버튼 ───────────────────────────────────────────────────────────────

interface CheckInButtonProps {
  status: CheckStatus;
  currentTime: string;
  onToggle: () => void;
}

function CheckInButton({ status, currentTime, onToggle }: CheckInButtonProps) {
  const isCheckedIn = status === 'checked-in';
  const isCheckedOut = status === 'checked-out';

  const label =
    isCheckedOut ? '퇴근 완료' :
    isCheckedIn  ? '퇴근하기' :
                   '출근하기';

  const bg =
    isCheckedOut ? 'var(--muted)' :
    isCheckedIn  ? '#EF4444' :
                   'var(--accent)';

  const textColor =
    isCheckedOut ? 'var(--toss-gray-4)' : '#fff';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        padding: '24px 0',
      }}
    >
      {/* 현재 시간 */}
      <div
        role="status"
        aria-label={`현재 시간 ${currentTime}`}
        style={{ textAlign: 'center' }}
      >
        <p
          className="text-3xl font-black"
          style={{ color: 'var(--foreground)', letterSpacing: '-0.02em', margin: 0 }}
        >
          {currentTime}
        </p>
        <p className="text-sm" style={{ color: 'var(--toss-gray-4)', margin: '4px 0 0' }}>
          2026년 5월 11일 월요일
        </p>
      </div>

      {/* 체크인 버튼 (64px) */}
      <button
        type="button"
        aria-pressed={isCheckedIn}
        aria-label={
          isCheckedOut ? '퇴근 완료 (오늘 근무 종료)' :
          isCheckedIn  ? '퇴근하기 버튼 — 현재 출근 중' :
                         '출근하기 버튼 — 현재 미출근'
        }
        onClick={isCheckedOut ? undefined : onToggle}
        disabled={isCheckedOut}
        style={{
          width: '100%',
          maxWidth: 320,
          height: 64,
          borderRadius: 'var(--radius-xl)',
          background: bg,
          color: textColor,
          fontSize: 18,
          fontWeight: 800,
          border: 'none',
          cursor: isCheckedOut ? 'not-allowed' : 'pointer',
          transition: 'background var(--transition-fast), transform var(--transition-fast)',
          letterSpacing: '-0.01em',
          boxShadow: isCheckedOut ? 'none' : 'var(--shadow-md)',
        }}
        onMouseDown={(e) => {
          if (!isCheckedOut) (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.98)';
        }}
        onMouseUp={(e) => {
          (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
        }}
        className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      >
        {label}
      </button>

      {/* 상태 메시지 */}
      {isCheckedIn && (
        <p
          role="status"
          aria-live="polite"
          className="text-sm font-semibold"
          style={{ color: '#10B981', margin: 0 }}
        >
          출근 중 · 출근 시간: {RECENT_RECORDS[0]?.checkIn ?? '--:--'}
        </p>
      )}
      {isCheckedOut && (
        <p
          role="status"
          aria-live="polite"
          className="text-sm"
          style={{ color: 'var(--toss-gray-4)', margin: 0 }}
        >
          오늘 근무가 종료되었습니다.
        </p>
      )}
    </div>
  );
}

// ── 7일 기록 카드 ─────────────────────────────────────────────────────────────

function RecentRecords() {
  return (
    <section
      aria-labelledby="recent-heading"
      className="app-card"
      style={{ padding: '16px' }}
    >
      <h3
        id="recent-heading"
        className="section-title"
        style={{ margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 6 }}
      >
        <Calendar size={15} aria-hidden="true" style={{ color: 'var(--accent)' }} />
        최근 7일 기록
      </h3>

      <ul role="list" aria-label="최근 7일 출퇴근 기록" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {RECENT_RECORDS.map((rec) => {
          const isHoliday = isWeekend(rec.dayLabel) || (rec.checkIn === null && rec.checkOut === null && !isWeekend(rec.dayLabel));
          const isOff = isWeekend(rec.dayLabel) || (!rec.checkIn && !rec.checkOut);

          return (
            <li
              key={rec.date}
              aria-label={`${rec.date} (${rec.dayLabel}) 출근 ${rec.checkIn ?? '없음'} 퇴근 ${rec.checkOut ?? '없음'}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '8px 10px',
                borderRadius: 'var(--radius-md)',
                background: isOff ? 'transparent' : 'var(--page-bg)',
                opacity: isHoliday ? 0.5 : 1,
              }}
            >
              {/* 날짜 */}
              <div style={{ width: 40, flexShrink: 0, textAlign: 'center' }}>
                <p className="text-xs font-bold" style={{ color: isWeekend(rec.dayLabel) ? '#EF4444' : 'var(--foreground)', margin: 0 }}>
                  {rec.dayLabel}
                </p>
                <p className="text-[11px]" style={{ color: 'var(--toss-gray-4)', margin: 0 }}>
                  {rec.date.slice(5).replace('-', '/')}
                </p>
              </div>

              {/* 출퇴근 시간 */}
              {rec.checkIn ? (
                <>
                  <span className="text-sm" style={{ color: 'var(--foreground)', minWidth: 40 }}>
                    {rec.checkIn}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--toss-gray-4)' }}>→</span>
                  <span className="text-sm" style={{ color: rec.checkOut ? 'var(--foreground)' : 'var(--toss-gray-4)', minWidth: 40 }}>
                    {rec.checkOut ?? '근무 중'}
                  </span>
                  {rec.workMinutes !== null && (
                    <span className="text-xs ml-auto" style={{ color: 'var(--accent)' }}>
                      {formatMinutes(rec.workMinutes)}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-xs" style={{ color: 'var(--toss-gray-4)' }}>
                  {isWeekend(rec.dayLabel) ? '휴일' : '기록 없음'}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ── 월간 요약 ─────────────────────────────────────────────────────────────────

function MonthlySummary() {
  const summary = useMemo(() => {
    const workedDays = RECENT_RECORDS.filter((r) => r.workMinutes !== null).length;
    const totalMins = RECENT_RECORDS.reduce((acc, r) => acc + (r.workMinutes ?? 0), 0);
    const avgMins = workedDays > 0 ? Math.round(totalMins / workedDays) : 0;
    return { workedDays, avgMins };
  }, []);

  return (
    <section
      aria-labelledby="monthly-heading"
      className="app-card"
      style={{ padding: '16px' }}
    >
      <h3
        id="monthly-heading"
        className="section-title"
        style={{ margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 6 }}
      >
        <TrendingUp size={15} aria-hidden="true" style={{ color: 'var(--accent)' }} />
        이번 주 요약
      </h3>

      <div style={{ display: 'flex', gap: 12 }}>
        <SummaryChip label="근무 일수" value={`${summary.workedDays}일`} />
        <SummaryChip label="평균 근무" value={summary.avgMins > 0 ? formatMinutes(summary.avgMins) : '--'} />
      </div>
    </section>
  );
}

interface SummaryChipProps {
  label: string;
  value: string;
}

function SummaryChip({ label, value }: SummaryChipProps) {
  return (
    <div
      style={{
        flex: 1,
        background: 'var(--page-bg)',
        borderRadius: 'var(--radius-md)',
        padding: '12px',
        textAlign: 'center',
      }}
    >
      <p className="text-xs" style={{ color: 'var(--toss-gray-4)', margin: '0 0 4px' }}>{label}</p>
      <p className="text-base font-bold" style={{ color: 'var(--foreground)', margin: 0 }}>{value}</p>
    </div>
  );
}

// ── CommuteClient 본체 ────────────────────────────────────────────────────────

export function CommuteClient() {
  const [status, setStatus] = useState<CheckStatus>(() => {
    // 오늘 이미 출근 기록 있음
    return RECENT_RECORDS[0]?.checkIn ? 'checked-in' : 'idle';
  });

  function handleToggle() {
    setStatus((prev) => {
      if (prev === 'idle') return 'checked-in';
      if (prev === 'checked-in') return 'checked-out';
      return prev;
    });
  }

  // 더미 현재 시간 (고정)
  const CURRENT_TIME = '09:24';

  return (
    <div
      style={{
        maxWidth: 480,
        margin: '0 auto',
        padding: '16px 16px 80px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <nav aria-label="현재 위치" style={{ marginBottom: 4 }}>
        <ol style={{ display: 'flex', gap: 4, listStyle: 'none', margin: 0, padding: 0, fontSize: 12, color: 'var(--toss-gray-4)' }}>
          <li>내정보</li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" style={{ color: 'var(--foreground)' }}>출퇴근</li>
        </ol>
      </nav>

      <section className="app-card" style={{ padding: '16px' }} aria-label="출퇴근 체크인">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <Clock size={15} aria-hidden="true" style={{ color: 'var(--accent)' }} />
          <h2 className="section-title" style={{ margin: 0 }}>출퇴근 기록</h2>
        </div>
        <CheckInButton status={status} currentTime={CURRENT_TIME} onToggle={handleToggle} />
      </section>

      <RecentRecords />
      <MonthlySummary />
    </div>
  );
}
