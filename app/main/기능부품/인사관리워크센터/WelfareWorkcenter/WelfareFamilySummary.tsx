'use client';

/**
 * WelfareFamilySummary — 경조사 탭 요약 카드 (reference §1168~1198)
 *
 * 좌: 최근 경조사 hr-family-list 4행 (이름 + 유형 chip + 일자)
 * 우: 경조사 규정 hr-rules 5규칙 (이름/일수·금액)
 *
 * 데이터: congratulations_condolences 또는 인접 테이블에서 최근 4건 fetch.
 * 규정: 정적 (회사 정책)
 *
 * JM3: fetch 실패 시 inline 메시지, 풀 화면(CongratulationsCondolences)이 폴백
 */

import { useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/db-client';
import WelfareSummaryShell from './WelfareSummaryShell';
import { formatDateCompact, WELFARE_TONE_CLS, type WelfareTone } from './welfare-summary-utils';

interface FamilyEvent {
  id: string;
  staffName: string;
  kind: string;
  date: string;
  tone: Extract<WelfareTone, 'success' | 'muted' | 'warn'>;
}

function pickTone(kind: string): FamilyEvent['tone'] {
  if (!kind) return 'muted';
  if (kind.includes('결혼') || kind.includes('출산')) return 'success';
  if (kind.includes('상') || kind.includes('사망')) return 'muted';
  return 'warn';
}

export default function WelfareFamilySummary() {
  const [events, setEvents] = useState<FamilyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchRecent = async () => {
      setLoading(true);
      setErrMsg(null);
      try {
        const { data, error } = await db
          .from('congratulations_condolences')
          .select('id, staff_name, event_type, event_date')
          .order('event_date', { ascending: false })
          .limit(4);
        if (cancelled) return;
        if (error) throw error;
        const list = (data as Array<Record<string, unknown>> | null) ?? [];
        setEvents(
          list.map((row) => ({
            id: String(row.id ?? ''),
            staffName: String(row.staff_name ?? '직원'),
            kind: String(row.event_type ?? '기타'),
            date: formatDateCompact(row.event_date),
            tone: pickTone(String(row.event_type ?? '')),
          })),
        );
      } catch (error) {
        if (cancelled) return;
        console.error('[WelfareFamilySummary] fetch failed', error);
        setErrMsg('최근 경조사를 불러오지 못했습니다.');
        setEvents([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void fetchRecent();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasEvents = useMemo(() => events.length > 0, [events]);

  return (
    <div className="w-full">
      <WelfareSummaryShell
        titleId="welfare-family-recent-title"
        title="최근 경조사"
        meta={
          hasEvents ? (
            <span className="text-[10px] font-medium text-[var(--toss-gray-4)]">최근 4건</span>
          ) : null
        }
        loading={loading}
        error={errMsg}
        empty={!hasEvents}
        emptyText="최근 경조사가 없습니다."
      >
        <ul className="flex flex-col gap-1.5">
          {events.map((ev) => (
            <li
              key={ev.id}
              className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] px-2.5 py-1.5"
            >
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${WELFARE_TONE_CLS[ev.tone]}`}>
                {ev.kind}
              </span>
              <span className="text-[12px] font-bold text-[var(--foreground)]">{ev.staffName}</span>
              <span className="tnum ml-auto text-[11px] font-semibold text-[var(--toss-gray-4)]">{ev.date}</span>
            </li>
          ))}
        </ul>
      </WelfareSummaryShell>
    </div>
  );
}
