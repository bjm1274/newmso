'use client';

/**
 * 플레이스홀더 — 채팅/게시판/결재/더보기 4개 라우트의 임시 화면.
 * 다음 세션에서 실제 모바일 화면으로 차례 교체.
 * JM: 단일 책임, ~70줄
 */

import MobileHeader from './MobileHeader';
import MCard from '../공통/MCard';
import MIcon from '../공통/MIcon';

const COPY: Record<string, { title: string; desc: string; icon: string }> = {
  chat: {
    title: '채팅',
    desc: '모바일 채팅 화면은 다음 단계에서 도입됩니다. 지금은 데스크톱에서 사용해주세요.',
    icon: 'chat',
  },
  board: {
    title: '게시판',
    desc: '모바일 게시판 화면은 다음 단계에서 도입됩니다. 지금은 데스크톱에서 사용해주세요.',
    icon: 'board',
  },
  approval: {
    title: '결재',
    desc: '모바일 결재함은 다음 단계에서 도입됩니다. 지금은 데스크톱에서 사용해주세요.',
    icon: 'approval',
  },
  more: {
    title: '더보기',
    desc: '모바일 더보기 메뉴는 다음 단계에서 도입됩니다. 지금은 데스크톱에서 사용해주세요.',
    icon: 'more',
  },
};

export type 플레이스홀더Props = {
  kind: 'chat' | 'board' | 'approval' | 'more';
};

export default function 플레이스홀더({ kind }: 플레이스홀더Props) {
  const c = COPY[kind];
  return (
    <div className="m-screen">
      <MobileHeader title={c.title} />
      <div className="m-scroll" style={{ padding: '24px 16px' }}>
        <MCard>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '32px 8px', textAlign: 'center' }}>
            <div
              style={{
                width: 56, height: 56, borderRadius: 14,
                background: 'var(--m-accent-soft)', color: 'var(--m-accent)',
                display: 'grid', placeItems: 'center',
              }}
              aria-hidden="true"
            >
              <MIcon name={c.icon} size={28} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.018em' }}>준비 중</div>
            <div style={{ fontSize: 12, color: 'var(--z-500)', fontWeight: 600, lineHeight: 1.6, maxWidth: 280 }}>
              {c.desc}
            </div>
          </div>
        </MCard>
      </div>
    </div>
  );
}
