'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode } from 'react';
import { useIsMobile } from './useIsMobile';

export type KpiTrend = 'up' | 'down' | 'flat';

export type KpiCard = {
  id: string;
  label: string;
  value: ReactNode;
  delta?: { value: string; trend: KpiTrend };
  description?: string;
  icon?: ReactNode;
  /** 카드 클릭 액션 (선택) */
  onSelect?: () => void;
};

export type SwipeableKpiCardsProps = {
  cards: KpiCard[];
  className?: string;
  ariaLabel?: string;
};

const trendStyles: Record<KpiTrend, { text: string; bg: string; symbol: string }> = {
  up: { text: 'text-[var(--success)]', bg: 'bg-[var(--success-light)]', symbol: '▲' },
  down: { text: 'text-[var(--danger)]', bg: 'bg-[var(--danger-light)]', symbol: '▼' },
  flat: { text: 'text-[var(--zinc-500)]', bg: 'bg-[var(--tab-bg)]', symbol: '–' } };

function KpiCardItem({ card, isActive }: { card: KpiCard; isActive: boolean }) {
  const trend = card.delta ? trendStyles[card.delta.trend] : null;
  const handleClick = card.onSelect;
  const Container: 'button' | 'div' = handleClick ? 'button' : 'div';
  return (
    <Container
      type={handleClick ? 'button' : undefined}
      onClick={handleClick}
      aria-current={isActive ? 'true' : undefined}
      className="erp-stat-card w-full snap-center text-left transition-colors"
      style={{ scrollSnapAlign: 'center' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold text-[var(--zinc-500)] truncate">
            {card.label}
          </p>
          <p className="mt-3 text-2xl font-bold text-[var(--foreground)] truncate">
            {card.value}
          </p>
          {card.description ? (
            <p className="mt-1 text-[11px] font-semibold text-[var(--zinc-400)] truncate">
              {card.description}
            </p>
          ) : null}
          {trend && card.delta ? (
            <span
              className={`mt-2 inline-flex items-center gap-1 rounded-[var(--radius-md)] px-2 py-0.5 text-[11px] font-bold ${trend.bg} ${trend.text}`}
            >
              <span aria-hidden>{trend.symbol}</span>
              <span>{card.delta.value}</span>
            </span>
          ) : null}
        </div>
        {card.icon ? (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent-light)] text-[var(--accent)]">
            {card.icon}
          </span>
        ) : null}
      </div>
    </Container>
  );
}

export function SwipeableKpiCards({
  cards,
  className = '',
  ariaLabel = 'KPI 지표 카드' }: SwipeableKpiCardsProps) {
  const isMobile = useIsMobile();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  const cardCount = cards.length;

  const updateActiveFromScroll = useCallback(() => {
    const node = scrollRef.current;
    if (!node || cardCount === 0) return;
    const center = node.scrollLeft + node.clientWidth / 2;
    let bestIdx = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    itemRefs.current.forEach((el, idx) => {
      if (!el) return;
      const itemCenter = el.offsetLeft + el.offsetWidth / 2;
      const dist = Math.abs(itemCenter - center);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = idx;
      }
    });
    setActiveIndex(bestIdx);
  }, [cardCount]);

  useEffect(() => {
    if (!isMobile) return;
    const node = scrollRef.current;
    if (!node) return;
    const handler = () => updateActiveFromScroll();
    node.addEventListener('scroll', handler, { passive: true });
    return () => node.removeEventListener('scroll', handler);
  }, [isMobile, updateActiveFromScroll]);

  const scrollToIndex = useCallback((idx: number) => {
    const target = itemRefs.current[idx];
    const container = scrollRef.current;
    if (!target || !container) return;
    const left =
      target.offsetLeft - (container.clientWidth - target.offsetWidth) / 2;
    container.scrollTo({ left, behavior: 'smooth' });
  }, []);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (cardCount === 0) return;
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        const next = Math.min(cardCount - 1, activeIndex + 1);
        setActiveIndex(next);
        scrollToIndex(next);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        const prev = Math.max(0, activeIndex - 1);
        setActiveIndex(prev);
        scrollToIndex(prev);
      } else if (event.key === 'Home') {
        event.preventDefault();
        setActiveIndex(0);
        scrollToIndex(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        const last = cardCount - 1;
        setActiveIndex(last);
        scrollToIndex(last);
      }
    },
    [activeIndex, cardCount, scrollToIndex],
  );

  const dots = useMemo(
    () => Array.from({ length: cardCount }, (_, idx) => idx),
    [cardCount],
  );

  if (cardCount === 0) {
    return null;
  }

  if (!isMobile) {
    return (
      <div
        role="region"
        aria-label={ariaLabel}
        className={`grid gap-3 grid-cols-2 xl:grid-cols-4 ${className}`}
      >
        {cards.map((card, idx) => (
          <div
            key={card.id}
            ref={(el) => {
              itemRefs.current[idx] = el;
            }}
          >
            <KpiCardItem card={card} isActive={false} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div
        ref={scrollRef}
        role="region"
        aria-label={ariaLabel}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded-[var(--radius-md)]"
        style={{
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none' }}
      >
        {cards.map((card, idx) => (
          <div
            key={card.id}
            ref={(el) => {
              itemRefs.current[idx] = el;
            }}
            className="shrink-0"
            style={{ flex: '0 0 85%', maxWidth: '85%' }}
            aria-roledescription="슬라이드"
            aria-label={`${idx + 1}/${cardCount} ${card.label}`}
          >
            <KpiCardItem card={card} isActive={idx === activeIndex} />
          </div>
        ))}
      </div>
      {cardCount > 1 ? (
        <div
          role="tablist"
          aria-label="KPI 카드 페이지"
          className="flex items-center justify-center gap-1.5"
        >
          {dots.map((idx) => {
            const active = idx === activeIndex;
            return (
              <button
                key={idx}
                type="button"
                role="tab"
                aria-selected={active}
                aria-label={`${idx + 1}번째 카드로 이동`}
                onClick={() => {
                  setActiveIndex(idx);
                  scrollToIndex(idx);
                }}
                className={`h-1.5 rounded-full transition-all ${
                  active
                    ? 'w-4 bg-[var(--accent)]'
                    : 'w-1.5 bg-[var(--zinc-300)]'
                }`}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export default SwipeableKpiCards;
