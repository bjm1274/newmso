'use client';

/**
 * OP체크 보드 — 실시간 상태판.
 * useOpBoard (5s 폴링). 카드 상태 토글 → setOpCardState (낙관적 업데이트).
 *
 * 🔴 모바일 단독 최우선 — 5 PC 화면 → 1 모바일.
 * 핸드오프 m-screens-addon-details §AD1 (SOpCheck) 이식.
 *
 * JM: ~200줄.
 * JM3: 상태 변경 실패 시 롤백 + toast.
 * JM6: 카드 button + aria-pressed로 상태 노출.
 */

import { useCallback, useMemo, useState } from 'react';
import type { ErpUser } from '@/types';
import { toast } from '@/lib/toast';
import { logger } from '@/lib/logger';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import OPCard from './OP체크카드';
import {
  setOpCardState,
  useOpBoard,
  type OpCheckCard,
  type OpCheckCardState } from './data-hooks';

type Filter = 'all' | 'inprog' | 'wait' | 'done' | 'hold';

function syncLabel(date: Date): string {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return `${diff}초 전`;
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  return `${Math.floor(diff / 3600)}시간 전`;
}

export default function OP체크보드({
  user,
  onBack,
  onOpenDetail }: {
  user: ErpUser;
  onBack: () => void;
  onOpenDetail: (card: OpCheckCard) => void;
}) {
  const company = typeof user.company === 'string' ? user.company : undefined;
  const { cards, loading, lastSync, refresh } = useOpBoard({ company, pollMs: 5000 });
  const [filter, setFilter] = useState<Filter>('all');
  const [optimistic, setOptimistic] = useState<Record<string, OpCheckCardState>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  // 낙관적 상태 머지
  const mergedCards = useMemo<OpCheckCard[]>(() => {
    return cards.map((c) => {
      const next = optimistic[c.id];
      return next ? { ...c, state: next } : c;
    });
  }, [cards, optimistic]);

  const counts = useMemo(
    () => ({
      all: mergedCards.length,
      inprog: mergedCards.filter((c) => c.state === '수술중').length,
      wait: mergedCards.filter((c) => c.state === '준비중' || c.state === '준비완료').length,
      done: mergedCards.filter((c) => c.state === '완료').length,
      hold: mergedCards.filter((c) => c.state === '보류').length }),
    [mergedCards],
  );

  const filtered = useMemo(() => {
    if (filter === 'inprog') return mergedCards.filter((c) => c.state === '수술중');
    if (filter === 'wait') return mergedCards.filter((c) => c.state === '준비중' || c.state === '준비완료');
    if (filter === 'done') return mergedCards.filter((c) => c.state === '완료');
    if (filter === 'hold') return mergedCards.filter((c) => c.state === '보류');
    return mergedCards;
  }, [mergedCards, filter]);

  const handleChange = useCallback(
    async (card: OpCheckCard, next: OpCheckCardState) => {
      if (busyId) return;
      const prev = card.state;
      setBusyId(card.id);
      setOptimistic((m) => ({ ...m, [card.id]: next }));
      try {
        await setOpCardState(card, next, {
          id: user.id,
          name: user.name,
          company: typeof user.company === 'string' ? user.company : null });
        toast(`${card.patient}: ${prev} → ${next}`, 'success');
        await refresh();
        setOptimistic((m) => {
          const cp = { ...m };
          delete cp[card.id];
          return cp;
        });
      } catch (err) {
        logger.warn('[mobile-addon] op state change', err);
        toast('상태 변경에 실패했습니다.', 'error');
        setOptimistic((m) => {
          const cp = { ...m };
          delete cp[card.id];
          return cp;
        });
      } finally {
        setBusyId(null);
      }
    },
    [busyId, user.id, user.name, user.company, refresh],
  );

  return (
    <div className="m-screen">
      <MobileHeader
        title="OP체크"
        sub={`실시간 · 마지막 갱신 ${syncLabel(lastSync)}`}
        back={onBack}
        actions={
          <button type="button" onClick={() => void refresh()} aria-label="새로고침">
            <MIcon name="refresh" size={20} />
          </button>
        }
      />

      <div className="m-chip-bar">
        <button type="button" className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>
          전체<span className="cnt">{counts.all}</span>
        </button>
        <button type="button" className={filter === 'inprog' ? 'on' : ''} onClick={() => setFilter('inprog')}>
          수술중<span className="cnt">{counts.inprog}</span>
        </button>
        <button type="button" className={filter === 'wait' ? 'on' : ''} onClick={() => setFilter('wait')}>
          대기<span className="cnt">{counts.wait}</span>
        </button>
        <button type="button" className={filter === 'done' ? 'on' : ''} onClick={() => setFilter('done')}>
          완료<span className="cnt">{counts.done}</span>
        </button>
        <button type="button" className={filter === 'hold' ? 'on' : ''} onClick={() => setFilter('hold')}>
          보류<span className="cnt">{counts.hold}</span>
        </button>
      </div>

      <div className="m-scroll">
        <div style={{ padding: '12px 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {loading && filtered.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}>
              불러오는 중…
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 12 }}>
              해당 상태의 수술이 없습니다.
            </div>
          )}
          {filtered.map((c) => (
            <OPCard
              key={c.id}
              card={c}
              busy={busyId === c.id}
              onChange={handleChange}
              onOpenDetail={onOpenDetail}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
