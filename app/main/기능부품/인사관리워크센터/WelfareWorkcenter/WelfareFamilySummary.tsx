'use client';

/**
 * WelfareFamilySummary — 경조사 탭 요약 카드 (reference §1168~1198)
 *
 * 좌: 최근 경조사 hr-family-list 4행 (이름 + 유형 chip + 일자)
 * 우: 경조사 규정 hr-rules 5규칙 (이름/일수·금액)
 *
 * 데이터: family_events 또는 인접 테이블에서 최근 4건 fetch.
 * 규정: 정적 (회사 정책)
 *
 * JM3: fetch 실패 시 inline 메시지, 풀 화면(CongratulationsCondolences)이 폴백
 */

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface FamilyEvent {
  id: string;
  staffName: string;
  kind: string;
  date: string;
  tone: 'success' | 'muted' | 'warn';
}

function pickTone(kind: string): 'success' | 'muted' | 'warn' {
  if (!kind) return 'muted';
  if (kind.includes('결혼') || kind.includes('출산')) return 'success';
  if (kind.includes('상') || kind.includes('사망')) return 'muted';
  return 'warn';
}

function formatDateCompact(value: unknown): string {
  if (!value) return '';
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

const CHIP_CLS: Record<FamilyEvent['tone'], string> = {
  success: 'bg-emerald-500/15 text-emerald-700',
  muted: 'bg-[var(--muted)] text-[var(--toss-gray-4)]',
  warn: 'bg-amber-500/15 text-amber-700',
};

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
        const { data, error } = await supabase
          .from('family_events')
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
      <section className="app-card flex flex-col p-3 md:p-4" aria-labelledby="welfare-family-recent-title">
        <header className="mb-2 flex items-center justify-between">
          <h3 id="welfare-family-recent-title" className="text-[13px] font-bold text-[var(--foreground)]">
            최근 경조사
          </h3>
          {!loading && hasEvents && (
            <span className="text-[10px] font-medium text-[var(--toss-gray-4)]">
              최근 4건
            </span>
          )}
        </header>
        {loading ? (
          <div className="py-6 text-center text-[12px] text-[var(--toss-gray-4)]">불러오는 중…</div>
        ) : errMsg ? (
          <div role="alert" className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
            {errMsg}
          </div>
        ) : !hasEvents ? (
          <div className="py-6 text-center text-[12px] text-[var(--toss-gray-4)]">최근 경조사가 없습니다.</div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {events.map((ev) => (
              <li key={ev.id} className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] px-2.5 py-1.5">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${CHIP_CLS[ev.tone]}`}>{ev.kind}</span>
                <span className="text-[12px] font-bold text-[var(--foreground)]">{ev.staffName}</span>
                <span className="tnum ml-auto text-[11px] font-semibold text-[var(--toss-gray-4)]">{ev.date}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

