'use client';

/**
 * SBoard — 게시판 목록 + 카테고리 홈.
 *   - showHome=true  → 카테고리 목록 (BoardHomeScreen 패턴)
 *   - showHome=false → 기존 칩바 + 글 카드 리스트
 *
 * Phase 6: 카테고리 홈 뷰 추가 — msm-appbar + msm-list 패턴.
 *
 * JM(파일당 500줄), JM2(필요한 칼럼만 select·useMemo), JM3(toast), JM6(button 시맨틱)
 */

import { memo, useMemo } from 'react';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import MChip from '../공통/MChip';
import MAvatar from '../공통/MAvatar';
import {
  BOARD_CATS,
  type BoardCatId,
  type BoardListPost,
  boardTypeToCat,
  formatShortDate,
  pickAvatarTone,
} from './data-hooks';
import { toggleStarServer } from './별표훅';
import { usePullToRefresh } from '../공통/usePullToRefresh';
import PullRefreshIndicator from '../공통/PullRefreshIndicator';

// ─── 카테고리 홈 정의 ─────────────────────────────────────
type BoardCategory = {
  id: BoardCatId;
  label: string;
  subtitle: string;
  icon: string;
  tone: 'accent' | 'success' | 'warn' | 'danger' | 'muted';
};

const HOME_CATEGORIES: BoardCategory[] = [
  { id: 'notice', label: '공지사항',     subtitle: '병원 공지 · 전달사항',      icon: 'bell',     tone: 'warn' },
  { id: 'free',   label: '자유게시판',   subtitle: '자유 토론 · 소통',           icon: 'chat',     tone: 'success' },
  { id: 'event',  label: '경조사 소식',  subtitle: '경조사 안내',                icon: 'bookmark', tone: 'danger' },
  { id: 'op',     label: '수술 일정',    subtitle: '수술 스케줄 공유',           icon: 'calendar', tone: 'danger' },
  { id: 'mri',    label: 'MRI 일정',     subtitle: 'MRI 스케줄 · 판독 대기',    icon: 'calendar', tone: 'accent' },
  { id: 'share',  label: '업무가이드',   subtitle: '응급 · 수술 · 접수 SOP',    icon: 'fileText', tone: 'accent' },
];

function countUnread(posts: BoardListPost[], catId: BoardCatId): number {
  // 간이 집계: 최근 7일 내 작성된 글 수를 unread 대용으로 표시
  const now = Date.now();
  const week = 7 * 24 * 60 * 60 * 1000;
  return posts.filter((p) => {
    if (boardTypeToCat(p.board_type as string | null) !== catId && catId !== 'all') return false;
    if (catId !== 'all' && boardTypeToCat(p.board_type as string | null) !== catId) return false;
    const created = p.created_at ? new Date(String(p.created_at)).getTime() : 0;
    return now - created < week;
  }).length;
}

// ─── Props ────────────────────────────────────────────────
export type SBoardProps = {
  posts: BoardListPost[];
  loading: boolean;
  cat: BoardCatId;
  onCat: (c: BoardCatId) => void;
  onOpen: (postId: string) => void;
  onWrite: () => void;
  onBack: () => void;
  userId: string | null;
  /** 별표 토글 반영용 — 부모 state를 재조회 */
  onStarChanged: (postId: string, starred: boolean) => void;
  /** PTR 콜백 — 부모 refetch */
  onRefresh?: () => Promise<void>;
  /** Phase 6: true이면 카테고리 홈을 표시 */
  showHome?: boolean;
  /** Phase 6: 카테고리 클릭 시 호출 */
  onOpenCategory?: (catId: BoardCatId) => void;
};

// ─── 필터 유틸 ────────────────────────────────────────────
function filterByCat(posts: BoardListPost[], cat: BoardCatId): BoardListPost[] {
  if (cat === 'all') return posts;
  if (cat === 'meal') {
    return posts.filter((p) => {
      const tags = Array.isArray(p.tags) ? p.tags.map((t) => String(t)) : [];
      return tags.includes('식단') || /식단/.test(String(p.title ?? ''));
    });
  }
  return posts.filter((p) => boardTypeToCat(p.board_type as string | null) === cat);
}

function countByCat(posts: BoardListPost[], cat: BoardCatId): number {
  return filterByCat(posts, cat).length;
}

// ─── 카테고리 홈 뷰 ──────────────────────────────────────
function BoardHomeView({
  posts,
  onOpenCategory,
}: {
  posts: BoardListPost[];
  onOpenCategory: (catId: BoardCatId) => void;
}) {
  return (
    <div className="m-screen">
      <div className="msm-appbar">
        <div className="msm-appbar-inner">
          <div>
            <div className="eyebrow">협업</div>
            <div className="title">게시판</div>
          </div>
          <div className="msm-appbar-actions">
            <button className="msm-ibtn" type="button" aria-label="검색">
              <MIcon name="search" size={19} />
            </button>
          </div>
        </div>
      </div>
      <div className="m-scroll">
        <div className="msm-sec">
          <div className="msm-sec-t">카테고리</div>
        </div>
        <div className="msm-list">
          {HOME_CATEGORIES.map((c) => {
            const unread = countUnread(posts, c.id);
            return (
              <button
                key={c.id}
                type="button"
                className="msm-list-row"
                onClick={() => onOpenCategory(c.id)}
                aria-label={`${c.label}${unread > 0 ? ` ${unread}건 안 읽음` : ''}`}
              >
                <div className={`msm-quick-ic tone-${c.tone}`}>
                  <MIcon name={c.icon} size={18} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.012em' }}>
                    {c.label}
                  </div>
                </div>
                {unread > 0 && (
                  <span className="msm-unread">{unread}</span>
                )}
                <MIcon name="chevR" size={16} color="var(--z-400)" />
              </button>
            );
          })}
        </div>
        {/* 전체 보기 링크 */}
        <div style={{ padding: '12px 16px' }}>
          <button
            type="button"
            onClick={() => onOpenCategory('all')}
            style={{
              width: '100%',
              padding: '12px 16px',
              background: 'var(--m-card)',
              border: '1px solid var(--m-border)',
              borderRadius: 'var(--m-radius-lg)',
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--m-accent)',
              textAlign: 'center',
            }}
          >
            전체 글 보기
          </button>
        </div>
        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}

// ─── 게시글 카드 ──────────────────────────────────────────
function PostCard({
  post,
  onOpen,
  onToggleStar,
}: {
  post: BoardListPost;
  onOpen: () => void;
  onToggleStar: () => void;
}) {
  const cat = boardTypeToCat(post.board_type as string | null);
  const catDef = BOARD_CATS.find((c) => c.id === cat);
  const isImportant = (post.status === '중요') ||
    (Array.isArray(post.tags) && post.tags.map((t) => String(t)).includes('중요'));
  const isPinned = Boolean(post.is_pinned);
  const authorName = String(post.author_name ?? '익명');
  const initial = authorName.charAt(0) || '?';
  const tone = pickAvatarTone(String(post.id ?? authorName));
  const views = typeof post.views === 'number' ? post.views : 0;
  const commentCount = post.comment_count ?? 0;
  const starred = Boolean(post.starred);

  return (
    <div
      className="m-card"
      style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 0 }}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${post.title} 상세 보기`}
        style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 0, width: '100%' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          {isPinned && <MIcon name="pin" size={12} color="var(--m-accent)" />}
          <MChip tone={catDef?.tone || ''}>{catDef?.label ?? '기타'}</MChip>
          {isImportant && <MChip tone="danger">중요</MChip>}
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 600 }}>
            {formatShortDate(post.created_at as string | null)}
          </span>
        </div>
        <div
          style={{
            fontSize: 14,
            fontWeight: 800,
            letterSpacing: '-0.018em',
            lineHeight: 1.45,
            color: 'var(--z-900)',
          }}
        >
          {post.title}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 8,
            fontSize: 11,
            color: 'var(--z-500)',
            fontWeight: 600,
          }}
        >
          <MAvatar tone={tone} size="sm">{initial}</MAvatar>
          <b style={{ color: 'var(--z-700)' }}>{authorName}</b>
          {post.company && (
            <>
              <span style={{ color: 'var(--z-400)' }}>·</span>
              <span>{String(post.company)}</span>
            </>
          )}
          <div style={{ flex: 1 }} />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <MIcon name="user" size={11} />
            {views}
          </span>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              color: commentCount > 0 ? 'var(--m-accent)' : 'var(--z-500)',
            }}
          >
            <MIcon name="chat" size={11} />
            {commentCount}
          </span>
        </div>
      </button>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
        <button
          type="button"
          onClick={onToggleStar}
          aria-label={starred ? '즐겨찾기 해제' : '즐겨찾기 추가'}
          aria-pressed={starred}
          style={{
            width: 28,
            height: 28,
            display: 'grid',
            placeItems: 'center',
            color: starred ? 'var(--m-warning)' : 'var(--z-400)',
          }}
        >
          <MIcon name="star" size={16} />
        </button>
      </div>
    </div>
  );
}

const PostCardMemo = memo(PostCard);

// ─── 메인 컴포넌트 ───────────────────────────────────────
function SBoardBase({
  posts,
  loading,
  cat,
  onCat,
  onOpen,
  onWrite,
  onBack,
  userId,
  onStarChanged,
  onRefresh,
  showHome,
  onOpenCategory,
}: SBoardProps) {
  const filtered = useMemo(() => filterByCat(posts, cat), [posts, cat]);

  const { containerRef, refreshing, pullProgress } = usePullToRefresh({
    onRefresh: onRefresh ?? (() => Promise.resolve()),
    enabled: !!onRefresh,
  });

  // Phase 6: 카테고리 홈 뷰
  if (showHome && onOpenCategory) {
    return <BoardHomeView posts={posts} onOpenCategory={onOpenCategory} />;
  }

  return (
    <div className="m-screen">
      <PullRefreshIndicator refreshing={refreshing} pullProgress={pullProgress} />
      <MobileHeader
        title="게시판"
        sub="박철홍정형외과"
        back={onBack}
        actions={
          <>
            <button type="button" aria-label="검색">
              <MIcon name="search" size={20} />
            </button>
            <button type="button" onClick={onWrite} aria-label="새 글 작성">
              <MIcon name="edit" size={20} />
            </button>
          </>
        }
      />
      <div className="m-chip-bar">
        {BOARD_CATS.map((c) => (
          <button
            key={c.id}
            type="button"
            className={cat === c.id ? 'on' : ''}
            onClick={() => onCat(c.id)}
            aria-pressed={cat === c.id}
          >
            {c.label}
            <span className="cnt">{countByCat(posts, c.id)}</span>
          </button>
        ))}
      </div>
      <div className="m-scroll" ref={containerRef} style={{ overscrollBehaviorY: 'contain' }}>
        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {loading && filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 0', fontSize: 13, color: 'var(--z-500)' }}>
              불러오는 중…
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="m-card" style={{ textAlign: 'center', padding: '32px 16px' }}>
              <MIcon name="board" size={24} color="var(--z-400)" />
              <div style={{ marginTop: 8, fontSize: 13, fontWeight: 700, color: 'var(--z-600)' }}>
                해당 카테고리에 게시글이 없습니다
              </div>
              <div style={{ marginTop: 4, fontSize: 11, color: 'var(--z-500)', fontWeight: 600 }}>
                우상단 글쓰기 버튼으로 등록할 수 있어요
              </div>
            </div>
          )}
          {filtered.map((post) => (
            <PostCardMemo
              key={String(post.id)}
              post={post}
              onOpen={() => onOpen(String(post.id))}
              onToggleStar={() => {
                const id = String(post.id);
                const prev = Boolean(post.starred);
                // 낙관적
                onStarChanged(id, !prev);
                void (async () => {
                  const res = await toggleStarServer(userId, id);
                  if (res.starred !== !prev) {
                    // 롤백
                    onStarChanged(id, prev);
                  } else {
                    onStarChanged(id, res.starred);
                  }
                })();
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

const SBoard = memo(SBoardBase);
export default SBoard;
