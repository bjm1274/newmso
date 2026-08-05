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
import WelfareSummaryShell from './WelfareSummaryShell';
import { daysUntil, expiryTone, WELFARE_TONE_CLS, type WelfareTone } from './welfare-summary-utils';

interface LicenseCardData {
  id: string;
  staffName: string;
  initial: string;
  cert: string;
  sub: string;
  exp: string;
  days: number | null;
  tone: WelfareTone;
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
        // staff_licenses 에는 `staff_name`·`sub_category` 컬럼이 없다(18컬럼 어디에도).
        // 예전 셀렉트는 그 둘을 함께 요청했고, SQLite 관용 동작 때문에 에러 대신 빈 값이
        // 돌아와 모든 카드가 '직원' + 빈 부제로 렌더됐다 — 누구의 자격증인지 알 수 없었다.
        // 이름은 staff_id 로 staff_members 를 별도 조회해 해석하고, 부제는 실컬럼
        // license_type 을 쓴다.
        const { data, error } = await db
          .from('staff_licenses')
          .select('id, staff_id, license_name, license_type, expiry_date')
          .order('expiry_date', { ascending: true, nullsFirst: false })
          .limit(60);
        if (cancelled) return;
        if (error) throw error;
        const list = (data as Array<Record<string, unknown>> | null) ?? [];

        const staffIds = Array.from(
          new Set(list.map((r) => String(r.staff_id ?? '')).filter(Boolean)),
        );
        const nameById = new Map<string, string>();
        if (staffIds.length > 0) {
          const { data: staffRows, error: staffError } = await db
            .from('staff_members')
            .select('id, name')
            .in('id', staffIds);
          if (staffError) {
            // 이름 해석 실패는 카드 자체를 죽일 이유가 아니다 — '직원' 폴백으로 계속 간다.
            console.warn('[WelfareLicenseSummary] staff name resolve failed', staffError);
          }
          for (const s of (staffRows as Array<Record<string, unknown>> | null) ?? []) {
            nameById.set(String(s.id ?? ''), String(s.name ?? ''));
          }
        }
        if (cancelled) return;

        const items: LicenseCardData[] = list.map((r) => {
          const expDateStr = r.expiry_date ? String(r.expiry_date) : null;
          const days = daysUntil(expDateStr);
          const name = nameById.get(String(r.staff_id ?? '')) || '직원';
          return {
            id: String(r.id ?? ''),
            staffName: name,
            initial: name.charAt(0),
            cert: String(r.license_name ?? '자격'),
            sub: String(r.license_type ?? ''),
            exp: formatExp(expDateStr, days),
            days,
            tone: expiryTone(days),
          };
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
    <WelfareSummaryShell
      titleId="welfare-license-summary-title"
      title="면허·자격 현황 (상위 6명)"
      loading={loading}
      error={errMsg}
      empty={!hasCards}
      emptyText="등록된 자격증이 없습니다."
    >
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <li
            key={card.id}
            className="flex flex-col gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] px-2.5 py-2"
          >
            <div className="flex items-center gap-2">
              <div
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent)]/10 text-[11px] font-bold text-[var(--accent)]"
                aria-hidden="true"
              >
                {card.initial}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-bold text-[var(--foreground)]">{card.staffName}</div>
                <div className="truncate text-[10.5px] text-[var(--toss-gray-4)]">{card.cert}</div>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${WELFARE_TONE_CLS[card.tone]}`}>
                {card.exp}
              </span>
            </div>
            {card.sub && <div className="truncate text-[11px] text-[var(--toss-gray-4)]">{card.sub}</div>}
          </li>
        ))}
      </ul>
    </WelfareSummaryShell>
  );
}
