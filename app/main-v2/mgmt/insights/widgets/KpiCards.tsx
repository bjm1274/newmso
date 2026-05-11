'use client';

/**
 * KpiCards.tsx — KPI 카드 위젯
 * JM6: 변화 방향은 텍스트(↑/↓) + 색상 병기
 */

import { useMemo } from 'react';
import { KPI_ITEMS, type KpiItem } from '../dummy-data';

function KpiCard({ item }: { item: KpiItem }) {
  const changeClass = useMemo(() => {
    if (item.direction === 'up') return 'text-[var(--success)]';
    if (item.direction === 'down') return 'text-[var(--danger)]';
    return 'text-[var(--toss-gray-4)]';
  }, [item.direction]);

  return (
    <article
      className="app-card flex flex-col gap-2 p-5"
      aria-label={`${item.label}: ${item.value}, 변화 ${item.changeLabel}`}
    >
      <span className="text-xs font-medium text-[var(--toss-gray-4)]">{item.label}</span>
      <span className="text-3xl font-bold text-[var(--foreground)]">{item.value}</span>
      <span className={`text-xs font-medium ${changeClass}`} aria-label={`변화율: ${item.changeLabel}`}>
        {item.changeLabel}
      </span>
    </article>
  );
}

export function KpiCards() {
  return (
    <section aria-label="핵심 경영 지표">
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}
      >
        {KPI_ITEMS.map((item) => (
          <KpiCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}
