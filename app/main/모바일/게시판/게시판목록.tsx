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

import { memo, useEffect, useMemo, useState } from 'react';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import {
  BOARD_CATS,
  type BoardCatId,
  type BoardListPost,
  boardTypeToCat } from './data-hooks';
import { usePullToRefresh } from '../공통/usePullToRefresh';
import PullRefreshIndicator from '../공통/PullRefreshIndicator';
import BoardScheduleCalendar from './일정달력';
import PostCardMemo from './게시판카드';

// ─── 카테고리 홈 정의 ─────────────────────────────────────
type BoardCategory = {
  id: BoardCatId;
  label: string;
  subtitle: string;
  icon: string;
  tone: 'accent' | 'success' | 'warn' | 'danger' | 'muted';
};

const HOME_CATEGORIES: BoardCategory[] = [
  { id: 'notice',  label: '공지사항',     subtitle: '병원 공지 · 전달사항',      icon: 'bell',     tone: 'warn' },
  { id: 'free',    label: '자유게시판',   subtitle: '자유 토론 · 소통',           icon: 'chat',     tone: 'success' },
  { id: 'event',   label: '경조사 소식',  subtitle: '경조사 안내',                icon: 'bookmark', tone: 'danger' },
  { id: 'op',      label: '수술 일정',    subtitle: '수술 스케줄 공유',           icon: 'calendar', tone: 'danger' },
  { id: 'mri',     label: 'MRI 일정',     subtitle: 'MRI 스케줄 · 판독 대기',    icon: 'calendar', tone: 'accent' },
  { id: 'share',   label: '업무가이드',   subtitle: '응급 · 수술 · 접수 SOP',    icon: 'fileText', tone: 'accent' },
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
  /** 헤더 sub 텍스트에 표시할 회사명 */
  company?: string;
};

// ─── 필터 유틸 ────────────────────────────────────────────
function filterByCat(posts: BoardListPost[], cat: BoardCatId): BoardListPost[] {
  if (cat === 'all') return posts;
  return posts.filter((p) => boardTypeToCat(p.board_type as string | null) === cat);
}

function countByCat(posts: BoardListPost[], cat: BoardCatId): number {
  return filterByCat(posts, cat).length;
}

// ─── 카테고리 홈 뷰 ──────────────────────────────────────
function BoardHomeView({
  posts,
  onOpenCategory }: {
  posts: BoardListPost[];
  onOpenCategory: (catId: BoardCatId) => void;
}) {
  return (
    <div
      className="m-screen"
      style={{
        background: 'transparent',
        display: 'flex',
        flexDirection: 'column' }}
    >
      <div
        className="macos-glass"
        style={{
          padding: '16px 20px 12px',
          display: 'flex',
          alignItems: 'center',
          borderBottom: '1px solid rgba(0, 0, 0, 0.05)',
          background: 'rgba(255, 255, 255, 0.55)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)' }}
      >
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--z-500)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>협업</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--foreground)', letterSpacing: '-0.02em', marginTop: 1 }}>게시판</div>
        </div>
      </div>
      <div className="m-scroll" style={{ background: 'transparent', padding: '12px 0 24px' }}>
        <div style={{ padding: '4px 20px 10px', fontSize: 12, fontWeight: 800, color: 'var(--z-500)', letterSpacing: '-0.01em' }}>
          카테고리
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {HOME_CATEGORIES.map((c) => {
            const unread = countUnread(posts, c.id);
            return (
              <button
                key={c.id}
                type="button"
                className="macos-glass macos-squircle-sm"
                onClick={() => onOpenCategory(c.id)}
                aria-label={`${c.label}${unread > 0 ? ` ${unread}건 안 읽음` : ''}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 16px',
                  margin: '0 16px 8px',
                  background: 'rgba(255, 255, 255, 0.65)',
                  border: '1px solid rgba(255, 255, 255, 0.35)',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.03)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  width: 'calc(100% - 32px)' }}
              >
                <div
                  className="macos-squircle-sm"
                  style={{
                    width: 32,
                    height: 32,
                    display: 'grid',
                    placeItems: 'center',
                    background: c.tone === 'accent' ? 'rgba(0, 122, 255, 0.12)' :
                                c.tone === 'success' ? 'rgba(52, 199, 89, 0.12)' :
                                c.tone === 'warn' ? 'rgba(255, 149, 0, 0.12)' :
                                c.tone === 'danger' ? 'rgba(255, 59, 48, 0.12)' :
                                'rgba(0, 0, 0, 0.05)',
                    color: c.tone === 'accent' ? '#007AFF' :
                           c.tone === 'success' ? '#34C759' :
                           c.tone === 'warn' ? '#FF9500' :
                           c.tone === 'danger' ? '#FF3B30' :
                           'var(--z-600)',
                    flexShrink: 0 }}
                >
                  <MIcon name={c.icon} size={16} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--z-900)', letterSpacing: '-0.01em' }}>
                    {c.label}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 600, marginTop: 1.5 }}>
                    {c.subtitle}
                  </div>
                </div>
                {unread > 0 && (
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 999,
                      background: 'linear-gradient(135deg, #FF3B30, #FF453A)',
                      fontSize: 10,
                      fontWeight: 800,
                      color: '#fff',
                      boxShadow: '0 2px 6px rgba(255, 59, 48, 0.25)',
                      marginRight: 4 }}
                  >
                    {unread}
                  </span>
                )}
                <MIcon name="chevR" size={14} color="var(--z-400)" />
              </button>
            );
          })}
        </div>
        {/* 전체 보기 링크 */}
        <div style={{ padding: '8px 16px 0' }}>
          <button
            type="button"
            onClick={() => onOpenCategory('all')}
            className="macos-glass macos-squircle-sm"
            style={{
              width: '100%',
              padding: '12px 16px',
              background: 'rgba(0, 122, 255, 0.08)',
              border: '1px solid rgba(0, 122, 255, 0.15)',
              fontSize: 13,
              fontWeight: 800,
              color: '#007AFF',
              textAlign: 'center',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0, 122, 255, 0.05)' }}
          >
            전체 글 보기
          </button>
        </div>
        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}



// ─── 메인 컴포넌트 ───────────────────────────────────────
function SBoardBase({
  posts,
  loading,
  cat,
  onCat,
  onOpen,
  onWrite,
  onBack,
  onRefresh,
  showHome,
  onOpenCategory,
  company }: SBoardProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  // Phase: op/mri 일정 게시판 — 리스트 ↔ 달력 토글
  const isScheduleCat = cat === 'op' || cat === 'mri';
  const [calendarView, setCalendarView] = useState(isScheduleCat);

  // 카테고리 전환 시 기본 뷰 모드 자동 동기화
  useEffect(() => {
    setCalendarView(isScheduleCat);
  }, [cat, isScheduleCat]);
  const filtered = useMemo(() => {
    const byCat = filterByCat(posts, cat);
    const q = query.trim().toLowerCase();
    if (!q) return byCat;
    return byCat.filter((p) =>
      [p.title, p.content, p.author_name].some((v) =>
        String(v ?? '').toLowerCase().includes(q),
      ),
    );
  }, [posts, cat, query]);

  const { containerRef, refreshing, pullProgress } = usePullToRefresh({
    onRefresh: onRefresh ?? (() => Promise.resolve()),
    enabled: !!onRefresh });

  // Phase 6: 카테고리 홈 뷰
  if (showHome && onOpenCategory) {
    return <BoardHomeView posts={posts} onOpenCategory={onOpenCategory} />;
  }

  return (
    <div
      className="m-screen"
      data-variant="mobile"
      style={{
        background: 'transparent',
        display: 'flex',
        flexDirection: 'column' }}
    >
      <PullRefreshIndicator refreshing={refreshing} pullProgress={pullProgress} />
      <MobileHeader
        title="게시판"
        sub={company ?? ''}
        back={onBack}
        actions={
          <>
            {isScheduleCat && (
              <button
                type="button"
                aria-label={calendarView ? '목록 보기' : '달력 보기'}
                aria-pressed={calendarView}
                onClick={() => setCalendarView((v) => !v)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: 'rgba(0, 0, 0, 0.03)',
                  border: '1px solid rgba(0, 0, 0, 0.05)',
                  cursor: 'pointer' }}
              >
                <MIcon name={calendarView ? 'list' : 'calendar'} size={15} color="var(--z-600)" />
              </button>
            )}
            <button
              type="button"
              aria-label="검색"
              aria-pressed={searchOpen}
              onClick={() => {
                setSearchOpen((v) => {
                  if (v) setQuery('');
                  return !v;
                });
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 28,
                height: 28,
                borderRadius: 8,
                background: 'rgba(0, 0, 0, 0.03)',
                border: '1px solid rgba(0, 0, 0, 0.05)',
                cursor: 'pointer' }}
            >
              <MIcon name="search" size={15} color="var(--z-600)" />
            </button>
            <button
              type="button"
              onClick={onWrite}
              aria-label="새 글 작성"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 28,
                height: 28,
                borderRadius: 8,
                background: 'rgba(0, 0, 0, 0.03)',
                border: '1px solid rgba(0, 0, 0, 0.05)',
                cursor: 'pointer' }}
            >
              <MIcon name="edit" size={15} color="var(--z-600)" />
            </button>
          </>
        }
      />
      {searchOpen && (
        <div style={{ padding: '8px 16px 4px' }}>
          <div
            className="macos-glass macos-squircle-sm"
            style={{
              display: 'flex',
              alignItems: 'center',
              background: 'rgba(0, 0, 0, 0.04)',
              border: '1px solid rgba(0, 0, 0, 0.05)',
              padding: '6px 12px',
              height: 36 }}
          >
            <span style={{ marginRight: 6, display: 'flex', alignItems: 'center' }}><MIcon name="search" size={15} color="var(--z-500)" /></span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="제목·내용·작성자 검색"
              aria-label="게시글 검색"
              autoFocus
              style={{
                flex: 1,
                fontSize: 13,
                fontFamily: 'inherit',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--z-900)',
                width: '100%' }}
            />
          </div>
        </div>
      )}
      <div
        className="m-chip-bar macos-glass"
        style={{
          background: 'rgba(255, 255, 255, 0.4)',
          borderBottom: '1px solid rgba(0, 0, 0, 0.05)',
          padding: '8px 16px',
          display: 'flex',
          gap: 6,
          overflowX: 'auto',
          scrollbarWidth: 'none' }}
      >
        {BOARD_CATS.filter((c) => c.id !== 'all').map((c) => {
          const active = cat === c.id;
          return (
            <button
              key={c.id}
              type="button"
              className={`macos-squircle-sm ${active ? 'on' : ''}`}
              onClick={() => onCat(c.id)}
              aria-pressed={active}
              style={{
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 800,
                borderRadius: 8,
                background: active ? '#007AFF' : 'rgba(0, 0, 0, 0.04)',
                color: active ? '#fff' : 'var(--z-700)',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                whiteSpace: 'nowrap',
                boxShadow: active ? '0 2px 8px rgba(0, 122, 255, 0.25)' : 'none' }}
            >
              {c.label}
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  opacity: 0.8,
                  background: active ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.05)',
                  padding: '1px 5px',
                  borderRadius: 4 }}
              >
                {countByCat(posts, c.id)}
              </span>
            </button>
          );
        })}
      </div>
      <div className="m-scroll" ref={containerRef} style={{ overscrollBehaviorY: 'contain' }}>
        {isScheduleCat && calendarView ? (
          <BoardScheduleCalendar posts={filtered} isMri={cat === 'mri'} onOpen={onOpen} />
        ) : (
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
            />
          ))}
        </div>
        )}
      </div>
    </div>
  );
}

const SBoard = memo(SBoardBase);
export default SBoard;
