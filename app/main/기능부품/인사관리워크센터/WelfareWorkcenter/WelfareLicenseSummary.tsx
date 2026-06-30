'use client';

/**
 * WelfareLicenseSummary — 면허·자격 탭 요약 카드 (reference §1229~1252)
 *
 * hr-grid-3 카드 그리드 (이름 아바타 + 자격 + 만료일 chip)
 * - 최대 6개 표시
 * - 만료 임박(90일 이내)은 warn/danger 톤 우선 노출
 *
 * 데이터: staff_licenses (직원별 자격증)
 */

import { useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/db-client';

interface LicenseCardData {
  id: string;
  staffName: string;
  initial: string;
  cert: string;
  sub: string;
  exp: string;
  days: number | null;
  tone: 'success' | 'warn' | 'danger' | 'muted';
}

const TONE_CLS: Record<LicenseCardData['tone'], string> = {
  success: 'bg-emerald-500/15 text-emerald-700',
  warn: 'bg-amber-500/15 text-amber-700',
  danger: 'bg-red-500/15 text-red-700',
  muted: 'bg-[var(--muted)] text-[var(--toss-gray-4)]' };

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const target = new Date(`${dateStr}T00:00:00+09:00`);
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  const today = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function pickTone(days: number | null): LicenseCardData['tone'] {
  if (days === null) return 'success';
  if (days <= 7) return 'danger';
  if (days <= 90) return 'warn';
  return 'success';
}

function formatExp(dateStr: string | null, days: number | null): string {
  if (!dateStr) return '영구';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  const label = `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
  if (days !== null && days <= 90 && days >= 0) return `D-${days}`;
  if (days !== null && days < 0) return `만료 +${Math.abs(days)}`;
  return label;
}

export default function WelfareLicenseSummary() {
  const [cards, setCards] = useState<LicenseCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      setErrMsg(null);
      try {
        const { data, error } = await db
          .from('staff_licenses')
          .select('id, staff_id, staff_name, license_name, sub_category, expiry_date')
          .order('expiry_date', { ascending: true, nullsFirst: false })
          .limit(60);
        if (cancelled) return;
        if (error) throw error;
        const list = (data as Array<Record<string, unknown>> | null) ?? [];
        const items: LicenseCardData[] = list.map((r) => {
          const expDateStr = r.expiry_date ? String(r.expiry_date) : null;
          const days = daysUntil(expDateStr);
          const name = String(r.staff_name ?? '직원');
          return {
            id: String(r.id ?? ''),
            staffName: name,
            initial: name.charAt(0),
            cert: String(r.license_name ?? '자격'),
            sub: String(r.sub_category ?? ''),
            exp: formatExp(expDateStr, days),
            days,
            tone: pickTone(days) };
        });
        // 만료 임박(warn/danger) 우선 정렬, 그 다음 success/muted
        items.sort((a, b) => {
          const order = { danger: 0, warn: 1, success: 2, muted: 3 } as const;
          if (order[a.tone] !== order[b.tone]) return order[a.tone] - order[b.tone];
          if (a.days !== null && b.days !== null) return a.days - b.days;
          return 0;
        });
        setCards(items.slice(0, 6));
      } catch (error) {
        if (cancelled) return;
        console.error('[WelfareLicenseSummary] fetch failed', error);
        setErrMsg('자격증 데이터를 불러오지 못했습니다.');
        setCards([]);
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
    <section className="app-card flex flex-col p-3 md:p-4" aria-labelledby="welfare-license-summary-title">
      <header className="mb-2 flex items-center justify-between">
        <h3 id="welfare-license-summary-title" className="text-[13px] font-bold text-[var(--foreground)]">
          면허·자격 현황 (상위 6명)
        </h3>
      </header>
      {loading ? (
        <div className="py-6 text-center text-[12px] text-[var(--toss-gray-4)]">불러오는 중…</div>
      ) : errMsg ? (
        <div role="alert" className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          {errMsg}
        </div>
      ) : !hasCards ? (
        <div className="py-6 text-center text-[12px] text-[var(--toss-gray-4)]">등록된 자격증이 없습니다.</div>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <li key={card.id} className="flex flex-col gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] px-2.5 py-2">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent)]/10 text-[11px] font-bold text-[var(--accent)]" aria-hidden="true">
                  {card.initial}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-bold text-[var(--foreground)]">{card.staffName}</div>
                  <div className="truncate text-[10.5px] text-[var(--toss-gray-4)]">{card.cert}</div>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${TONE_CLS[card.tone]}`}>{card.exp}</span>
              </div>
              {card.sub && (
                <div className="truncate text-[11px] text-[var(--toss-gray-4)]">{card.sub}</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
