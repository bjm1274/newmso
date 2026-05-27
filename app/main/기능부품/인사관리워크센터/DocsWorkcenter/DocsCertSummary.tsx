'use client';

/**
 * DocsCertSummary — 증명서 발급 탭 요약 카드 (reference §1509~1550)
 *
 * 2-col split:
 * 좌: doc-cert-grid 6종 (이름 + 누적 발급 + 최근 발급)
 * 우: 발급 요청 폼(요약형) — 직원/종류/부수/용도 + primary 버튼
 *
 * 데이터: certificate_issues 테이블 (집계)
 */

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface CertCard {
  id: string;
  name: string;
  iss: number;
  last: string;
}

const FALLBACK_CERTS: CertCard[] = [
  { id: 'cert-1', name: '재직증명서', iss: 142, last: '5/8' },
  { id: 'cert-2', name: '경력증명서', iss: 18, last: '5/3' },
  { id: 'cert-3', name: '근로소득원천징수', iss: 86, last: '4/22' },
  { id: 'cert-4', name: '원천징수영수증', iss: 12, last: '4/15' },
  { id: 'cert-5', name: '휴직증명서', iss: 3, last: '3/8' },
  { id: 'cert-6', name: '결근증명서', iss: 5, last: '4/30' },
];

function formatShortDate(value: unknown): string {
  if (!value) return '-';
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function DocsCertSummary() {
  const [cards, setCards] = useState<CertCard[]>(FALLBACK_CERTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        const { data, error } = await supabase
          .from('certificate_issues')
          .select('id, document_type, count, last_issued_at')
          .order('count', { ascending: false })
          .limit(6);
        if (cancelled) return;
        if (error) throw error;
        const list = (data as Array<Record<string, unknown>> | null) ?? [];
        if (list.length > 0) {
          setCards(
            list.map((r) => ({
              id: String(r.id ?? ''),
              name: String(r.document_type ?? '증명서'),
              iss: Number(r.count ?? 0),
              last: formatShortDate(r.last_issued_at),
            })),
          );
        }
      } catch (error) {
        console.warn('[DocsCertSummary] cert fetch failed, using fallback', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void fetchData();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasCards = useMemo(() => cards.length > 0, [cards]);

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <section className="app-card flex flex-col p-3 md:p-4" aria-labelledby="docs-cert-grid-title">
        <header className="mb-2 flex items-center justify-between">
          <h3 id="docs-cert-grid-title" className="text-[13px] font-bold text-[var(--foreground)]">
            증명서 종류
          </h3>
          {!loading && <span className="text-[10px] font-medium text-[var(--toss-gray-4)]">누적 발급 상위</span>}
        </header>
        {hasCards ? (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {cards.map((c) => (
              <li key={c.id} className="flex flex-col gap-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] px-2.5 py-2">
                <span className="text-[12px] font-bold text-[var(--foreground)]">{c.name}</span>
                <div className="flex items-center justify-between text-[10.5px]">
                  <span className="text-[var(--toss-gray-4)]">누적 {c.iss}회</span>
                  <span className="tnum text-[var(--toss-gray-4)]">{c.last}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="py-6 text-center text-[12px] text-[var(--toss-gray-4)]">증명서 발급 이력이 없습니다.</div>
        )}
      </section>

      <section className="app-card flex flex-col p-3 md:p-4" aria-labelledby="docs-cert-form-title">
        <header className="mb-2 flex items-center justify-between">
          <h3 id="docs-cert-form-title" className="text-[13px] font-bold text-[var(--foreground)]">
            증명서 발급 요청 (요약)
          </h3>
        </header>
        <form
          onSubmit={(event) => event.preventDefault()}
          className="flex flex-col gap-2"
          aria-describedby="docs-cert-form-note"
        >
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">직원</span>
            <select className="h-9 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 text-[12px]" disabled>
              <option>풀 화면에서 선택</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">증명서 종류</span>
            <select className="h-9 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 text-[12px]" disabled>
              <option>재직증명서</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">부수</span>
              <input className="h-9 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 text-right text-[12px] tnum" defaultValue="1" disabled />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">용도</span>
              <select className="h-9 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 text-[12px]" disabled>
                <option>은행제출</option>
              </select>
            </label>
          </div>
          <p id="docs-cert-form-note" className="text-[11px] text-[var(--toss-gray-4)]">
            요약 화면이며 실제 제출은 아래 풀 화면에서 진행하세요.
          </p>
        </form>
      </section>
    </div>
  );
}
