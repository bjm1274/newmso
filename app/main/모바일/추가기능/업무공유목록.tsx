'use client';

/**
 * 업무공유 — 인수인계·자료·할일 카드 리스트.
 * useTaskShares (board_posts board_type='업무공유'). 🔴 모바일 단독.
 * 핸드오프 m-screens-addon-details §AD6 (SShare) 이식.
 * JM: ~150줄.
 */

import { useMemo, useState } from 'react';
import type { ErpUser } from '@/types';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import MChip from '../공통/MChip';
import MAvatar from '../공통/MAvatar';
import { pickTone, useTaskShares } from './data-hooks';

type Tab = 'all' | 'handoff' | 'todo' | 'asset';

function tabMatches(tab: Tab, tag: string): boolean {
  if (tab === 'all') return true;
  if (tab === 'handoff') return tag.includes('인수') || tag.includes('인계');
  if (tab === 'todo') return tag.includes('할일') || tag.includes('TODO');
  if (tab === 'asset') return tag.includes('자료') || tag.includes('첨부');
  return true;
}

function relativeTime(iso: string): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return '-';
  const diff = Date.now() - ts;
  if (diff < 60_000) return '방금';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}일 전`;
  return iso.slice(5, 10);
}

function MobileTaskShareList({
  user,
  onBack,
  onOpenDetail }: {
  user: ErpUser;
  onBack: () => void;
  onOpenDetail: (id: string) => void;
}) {
  const company = typeof user.company === 'string' ? user.company : undefined;
  const { rows, loading } = useTaskShares({ company, pollMs: 30000 });
  const [tab, setTab] = useState<Tab>('all');

  const counts = useMemo(
    () => ({
      all: rows.length,
      handoff: rows.filter((r) => r.tag.includes('인수') || r.tag.includes('인계')).length,
      todo: rows.filter((r) => r.tag.includes('할일')).length,
      asset: rows.filter((r) => r.tag.includes('자료')).length }),
    [rows],
  );

  const filtered = useMemo(() => rows.filter((r) => tabMatches(tab, r.tag)), [rows, tab]);

  return (
    <div className="m-screen">
      <MobileHeader
        title="업무공유"
        sub={`${company ?? ''} · ${rows.length}건`}
        back={onBack}
      />

      <div className="m-chip-bar">
        <button type="button" className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>
          전체<span className="cnt">{counts.all}</span>
        </button>
        <button type="button" className={tab === 'handoff' ? 'on' : ''} onClick={() => setTab('handoff')}>
          인수인계<span className="cnt">{counts.handoff}</span>
        </button>
        <button type="button" className={tab === 'todo' ? 'on' : ''} onClick={() => setTab('todo')}>
          할일<span className="cnt">{counts.todo}</span>
        </button>
        <button type="button" className={tab === 'asset' ? 'on' : ''} onClick={() => setTab('asset')}>
          자료<span className="cnt">{counts.asset}</span>
        </button>
      </div>

      <div className="m-scroll">
        <div style={{ padding: '12px 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {loading && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}>
              불러오는 중…
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 12 }}>
              해당 조건의 공유가 없습니다.
            </div>
          )}
          {filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onOpenDetail(p.id)}
              aria-label={`${p.title} 상세`}
              className="m-card"
              style={{ padding: '14px 16px', textAlign: 'left', width: '100%' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <MChip tone={p.tag.includes('인수') ? 'accent' : p.tag.includes('할일') ? 'warning' : ''}>
                  {p.tag}
                </MChip>
                {p.urgent && <MChip tone="danger">긴급</MChip>}
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 600 }}>
                  {relativeTime(p.created_at)}
                </span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '-0.012em' }}>{p.title}</div>
              {p.body && (
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--z-600)',
                    marginTop: 4,
                    lineHeight: 1.5,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical' as const,
                    overflow: 'hidden' }}
                >
                  {p.body}
                </div>
              )}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginTop: 8,
                  fontSize: 11,
                  color: 'var(--z-500)',
                  fontWeight: 600 }}
              >
                <MAvatar tone={pickTone(p.author_id || p.id)} size="sm">
                  {p.author.charAt(0)}
                </MAvatar>
                <b style={{ color: 'var(--z-700)' }}>{p.author}</b>
                <span style={{ color: 'var(--z-400)' }}>·</span>
                <span>{p.department}</span>
                <div style={{ flex: 1 }} />
                {p.attachments > 0 && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <MIcon name="paperclip" size={11} />
                    {p.attachments}
                  </span>
                )}
                {p.comments > 0 && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                      color: p.comments > 5 ? 'var(--m-accent)' : 'var(--z-500)' }}
                  >
                    <MIcon name="chat" size={11} />
                    {p.comments}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default MobileTaskShareList;
