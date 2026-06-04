'use client';

/**
 * SHrAttend — 모바일 인사관리: 근태
 *
 * 3 segment (대시 / 근무표 / 달력) — 모바일 정책: 본인 근무표·달력 중심.
 *  - 대시: 이번 달 본인 KPI (출근일/지각/조퇴/연차) + 최근 7일 기록
 *  - 근무표: 이번 주 일별 행 (출근·퇴근 시간)
 *  - 달력: 월간 그리드 (출근=accent dot, 지각=warning dot, 휴무=danger 색)
 *
 * 본인 데이터만 (RLS + staff_id 명시).
 *
 * JM6: button 시맨틱, aria-current="page" 활용
 */

import { useMemo, useState } from 'react';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import MChip from '../공통/MChip';
import MKpi from '../공통/MKpi';
import {
  useMyAttendanceMonth,
  useDerivedMonthKey,
  formatDateShort,
  type AttendanceDailyRow,
} from './data-hooks';
import 근태조정신청 from './근태조정신청';
import { CalTab } from './근태달력탭';

export type SHrAttendTab = 'dash' | 'schedule' | 'cal';

export type SHrAttendProps = {
  staffId: string | null;
  company?: string;
  onBack: () => void;
};

export default function 근태({ staffId, company, onBack }: SHrAttendProps) {
  const [tab, setTab] = useState<SHrAttendTab>('dash');
  const [cursor, setCursor] = useState(() => new Date());
  const [adjustDate, setAdjustDate] = useState<string | null>(null);
  const monthKey = useDerivedMonthKey(cursor);
  const { rows, loading } = useMyAttendanceMonth(staffId, monthKey);

  const summary = useMemo(() => deriveMonthSummary(rows), [rows]);

  // 근태 조정 신청 폼으로 진입
  if (adjustDate && staffId) {
    return (
      <근태조정신청
        staffId={staffId}
        targetDate={adjustDate}
        onBack={() => setAdjustDate(null)}
      />
    );
  }

  return (
    <div className="m-screen">
      <MobileHeader
        title="근태"
        sub={`${company ?? ''}${company ? ' · ' : ''}${cursor.getFullYear()}.${String(
          cursor.getMonth() + 1,
        ).padStart(2, '0')}`}
        back={onBack}
        actions={
          <button
            type="button"
            onClick={() => setCursor(new Date())}
            aria-label="이번 달로 이동"
          >
            <MIcon name="calendar" size={20} />
          </button>
        }
      />
      <div
        style={{
          padding: '10px 16px 0',
          background: 'var(--m-card)',
          borderBottom: '1px solid var(--m-border)',
        }}
      >
        <div className="m-seg" role="tablist" aria-label="근태 탭">
          <button
            type="button"
            className={tab === 'dash' ? 'on' : ''}
            onClick={() => setTab('dash')}
            role="tab"
            aria-selected={tab === 'dash'}
          >
            대시
          </button>
          <button
            type="button"
            className={tab === 'schedule' ? 'on' : ''}
            onClick={() => setTab('schedule')}
            role="tab"
            aria-selected={tab === 'schedule'}
          >
            근무표
          </button>
          <button
            type="button"
            className={tab === 'cal' ? 'on' : ''}
            onClick={() => setTab('cal')}
            role="tab"
            aria-selected={tab === 'cal'}
          >
            달력
          </button>
        </div>
      </div>
      <div className="m-scroll">
        {loading && (
          <div
            style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}
          >
            불러오는 중...
          </div>
        )}
        {!loading && tab === 'dash' && (
          <DashTab rows={rows} summary={summary} onAdjust={setAdjustDate} />
        )}
        {!loading && tab === 'schedule' && <ScheduleTab rows={rows} cursor={cursor} />}
        {!loading && tab === 'cal' && (
          <CalTab rows={rows} cursor={cursor} onChange={setCursor} />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 집계 헬퍼
// ─────────────────────────────────────────────────────────────

type MonthSummary = {
  presentDays: number;
  lateCnt: number;
  earlyCnt: number;
  leaveCnt: number;
};

function deriveMonthSummary(rows: AttendanceDailyRow[]): MonthSummary {
  let presentDays = 0;
  let lateCnt = 0;
  let earlyCnt = 0;
  let leaveCnt = 0;
  for (const r of rows) {
    const s = String(r.status ?? '').trim();
    if (r.check_in || s === 'present' || s === 'late' || s === 'early_leave') presentDays += 1;
    if (s === 'late') lateCnt += 1;
    if (s === 'early_leave') earlyCnt += 1;
    if (s === 'annual_leave' || s === 'half_leave' || s === 'sick_leave') leaveCnt += 1;
  }
  return { presentDays, lateCnt, earlyCnt, leaveCnt };
}

// ─────────────────────────────────────────────────────────────
// 대시 탭
// ─────────────────────────────────────────────────────────────

function DashTab({
  rows,
  summary,
  onAdjust,
}: {
  rows: AttendanceDailyRow[];
  summary: MonthSummary;
  onAdjust: (date: string) => void;
}) {
  const recent = useMemo(
    () =>
      [...rows]
        .filter((r) => r.check_in || r.check_out || r.status)
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .slice(0, 7),
    [rows],
  );

  const kpis: ReadonlyArray<{
    label: string;
    value: string;
    sub: string;
    tone: '' | 'accent' | 'success' | 'warning';
  }> = [
    {
      label: '출근',
      value: String(summary.presentDays),
      sub: '이번 달 일수',
      tone: 'success',
    },
    {
      label: '지각',
      value: String(summary.lateCnt),
      sub: summary.lateCnt > 0 ? '사유 입력 권장' : '-',
      tone: summary.lateCnt > 0 ? 'warning' : '',
    },
    {
      label: '조퇴',
      value: String(summary.earlyCnt),
      sub: '-',
      tone: summary.earlyCnt > 0 ? 'warning' : '',
    },
    {
      label: '휴가',
      value: String(summary.leaveCnt),
      sub: '연차·반차·병가',
      tone: 'accent',
    },
  ];

  return (
    <>
      <div
        style={{
          padding: '14px 16px 0',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
        }}
      >
        {kpis.map((k) => (
          <MKpi
            key={k.label}
            icon={
              k.label === '출근'
                ? 'checkCircle'
                : k.label === '지각'
                  ? 'clock'
                  : k.label === '조퇴'
                    ? 'alertTri'
                    : 'calendar'
            }
            label={k.label}
            value={k.value}
            sub={k.sub}
            tone={k.tone}
          />
        ))}
      </div>

      <div className="m-section">
        <div className="m-section-h">
          <div className="lbl">최근 기록</div>
        </div>
        {recent.length === 0 ? (
          <div className="m-card" style={{ padding: 16, color: 'var(--z-500)', fontSize: 13 }}>
            이번 달 기록이 없습니다.
          </div>
        ) : (
          <div className="m-card flush">
            {recent.map((r) => {
              const tone = statusTone(r.status);
              const adjustable =
                r.status === 'late' || r.status === 'early_leave' || r.status === 'missing';
              return (
                <div key={r.date} className="m-list-row">
                  <div className={'ico-tile tone-' + (tone || '')}>
                    <MIcon name="clock" size={18} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="lbl">{formatDateShort(r.date)}</div>
                    <div className="sub">
                      {fmtHm(r.check_in)} ~ {fmtHm(r.check_out)}
                    </div>
                  </div>
                  {adjustable ? (
                    <button
                      type="button"
                      onClick={() => onAdjust(r.date)}
                      aria-label={`${r.date} 근태 조정 신청`}
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: 'var(--m-accent)',
                        padding: '4px 8px',
                        borderRadius: 6,
                        background: 'var(--m-accent-soft, rgba(37,99,235,.08))',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      조정 신청
                    </button>
                  ) : (
                    <MChip tone={tone}>{statusLabel(r.status)}</MChip>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div style={{ height: 24 }} />
    </>
  );
}

function statusLabel(status: string | null): string {
  switch (status) {
    case 'present':
      return '출근';
    case 'late':
      return '지각';
    case 'early_leave':
      return '조퇴';
    case 'absent':
      return '결근';
    case 'annual_leave':
      return '연차';
    case 'half_leave':
      return '반차';
    case 'sick_leave':
      return '병가';
    case 'holiday':
      return '휴일';
    case 'missing':
      return '미체크';
    default:
      return '-';
  }
}

function statusTone(status: string | null): '' | 'accent' | 'success' | 'warning' | 'danger' {
  switch (status) {
    case 'present':
      return 'success';
    case 'late':
    case 'early_leave':
      return 'warning';
    case 'absent':
    case 'missing':
      return 'danger';
    case 'annual_leave':
    case 'half_leave':
    case 'sick_leave':
    case 'holiday':
      return 'accent';
    default:
      return '';
  }
}

function fmtHm(iso: string | null): string {
  if (!iso) return '—';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleTimeString('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

// ─────────────────────────────────────────────────────────────
// 근무표 탭 (이번 달 일별 행 — 가까운 14일)
// ─────────────────────────────────────────────────────────────

function ScheduleTab({ rows, cursor }: { rows: AttendanceDailyRow[]; cursor: Date }) {
  const byDate = useMemo(() => {
    const map = new Map<string, AttendanceDailyRow>();
    for (const r of rows) map.set(r.date, r);
    return map;
  }, [rows]);

  const days = useMemo(() => {
    const list: { dateStr: string; date: Date }[] = [];
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const last = new Date(y, m + 1, 0).getDate();
    for (let d = 1; d <= last; d += 1) {
      const dt = new Date(y, m, d);
      const dateStr = dt.toLocaleDateString('en-CA');
      list.push({ dateStr, date: dt });
    }
    return list;
  }, [cursor]);

  return (
    <div style={{ padding: '14px 16px 24px' }}>
      <div className="m-card flush">
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--m-border)',
            fontSize: 13,
            fontWeight: 800,
            textAlign: 'center',
          }}
        >
          {cursor.getFullYear()}년 {cursor.getMonth() + 1}월 근무표
        </div>
        {days.map((d, idx) => {
          const row = byDate.get(d.dateStr);
          const tone = statusTone(row?.status ?? null);
          const dow = ['일', '월', '화', '수', '목', '금', '토'][d.date.getDay()] ?? '';
          const isLast = idx === days.length - 1;
          return (
            <div
              key={d.dateStr}
              className="m-list-row"
              style={{
                borderBottom: isLast ? 'none' : '1px solid var(--m-border)',
                gridTemplateColumns: '52px 1fr auto',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--z-500)' }}>
                {dow} {d.date.getDate()}
              </div>
              <div>
                <div className="lbl">
                  {row?.check_in ? `${fmtHm(row.check_in)} ~ ${fmtHm(row.check_out)}` : '근무 없음'}
                </div>
                <div className="sub">{statusLabel(row?.status ?? null)}</div>
              </div>
              {row?.status && <MChip tone={tone}>{statusLabel(row.status)}</MChip>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// CalTab은 근태달력탭.tsx로 분리됨 (JM 500줄 이내 유지)
