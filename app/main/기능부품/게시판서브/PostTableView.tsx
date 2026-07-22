'use client';

/**
 * 게시판 표 컴팩트 뷰 (A안 — 결정 23번)
 * - 헤더(제목/통계/검색/필터/새 게시물), 툴바(태그 chip + 정렬 select + 안읽음/즐겨찾기 segmented)
 * - data-table 베이스 표(★/번호/제목·태그·첨부/작성자/날짜/조회/♥/⋯)
 *
 * JM 준수:
 * - JM: 500줄 이내 단일 책임 (목록 뷰만 담당, fetch/CRUD 로직은 부모 게시판.tsx 유지)
 * - JM2: 필터·정렬·태그 카탈로그·통계는 useMemo 캐시
 * - JM3: 즐겨찾기 localStorage 실패는 console 경고로 격리, 사용자 메시지 없음
 * - JM4: any 금지, 명시적 타입과 union
 * - JM6: th[scope=col], th[aria-sort], 검색 input aria-label, 키보드 toggle
 */

import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { EmptyState } from '@/app/components/StatePanel';
import {
  getBoardPostAuthorSignal,
  getBoardPostPreview,
  isScheduledNoticePending,
  normalizeBoardPostStatus } from '../게시판-view-utils';
import type { BoardPost } from '@/types';
import {
  READ_FILTER_LABELS,
  SORT_LABELS,
  formatShortDate,
  getAttachmentCount,
  getCommentCount,
  getPostTags,
  readFavoritesFromStorage,
  writeFavoritesToStorage,
  type ReadFilter,
  type SortKey } from './post-table-helpers';
import PostMoreMenu from './PostMoreMenu';

export type { SortKey, ReadFilter } from './post-table-helpers';

interface PostTableViewProps {
  boardLabel: string;
  posts: BoardPost[];
  loading: boolean;
  noticeVisibilityTick: number;
  myLikedPostIds: Set<string>;
  postReadMap: Record<string, Set<string>>;
  effectiveBoardUserId: string;
  canCreatePost: boolean;
  showNewPost: boolean;
  onToggleNewPost: () => void;
  onSelectPost: (postId: string) => void;
  onToggleLike: (post: BoardPost) => void;
  /** ⋯ more 메뉴 액션 (handoff/04-board §3-4). 미전달 시 메뉴 항목 비노출. */
  onEditPost?: (postId: string) => void;
  onDeletePost?: (postId: string) => void;
  onShareToChat?: (postId: string) => void;
  /** 작성자/관리자 권한 판정. 미전달 시 메뉴 항목 비노출. */
  canEditPost?: (post: BoardPost) => boolean;
  canDeletePost?: (post: BoardPost) => boolean;
  emptyDescription?: string;
}

export default function PostTableView({
  boardLabel,
  posts,
  loading,
  noticeVisibilityTick,
  myLikedPostIds,
  postReadMap,
  effectiveBoardUserId,
  canCreatePost,
  showNewPost,
  onToggleNewPost,
  onSelectPost,
  onToggleLike,
  onEditPost,
  onDeletePost,
  onShareToChat,
  canEditPost,
  canDeletePost,
  emptyDescription }: PostTableViewProps) {
  // ── 상태: 검색, 정렬, 태그, 안읽음/즐겨찾기, 즐겨찾기 ──
  const [searchKeyword, setSearchKeyword] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('recent');
  const [readFilter, setReadFilter] = useState<ReadFilter>('all');
  const [activeTag, setActiveTag] = useState<string>('all');
  const [favorites, setFavorites] = useState<Set<string>>(() => readFavoritesFromStorage());

  // 게시판 변경 시 필터 리셋
  useEffect(() => {
    setActiveTag('all');
    setReadFilter('all');
    setSearchKeyword('');
  }, [boardLabel]);

  const toggleFavorite = useCallback((postId: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      writeFavoritesToStorage(next);
      return next;
    });
  }, []);

  // 태그 카탈로그: 게시물에서 추출 (상위 N개)
  const tagCatalog = useMemo<string[]>(() => {
    const counter = new Map<string, number>();
    posts.forEach((post) => {
      getPostTags(post).forEach((tag) => {
        counter.set(tag, (counter.get(tag) ?? 0) + 1);
      });
    });
    return Array.from(counter.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([tag]) => tag);
  }, [posts]);

  // 안 읽음 판정
  const isUnread = useCallback(
    (post: BoardPost): boolean => {
      if (!effectiveBoardUserId) return false;
      const readSet = postReadMap[String(post.id ?? '').trim()];
      return !readSet || !readSet.has(effectiveBoardUserId);
    },
    [effectiveBoardUserId, postReadMap],
  );

  // 필터링 + 정렬
  const filteredPosts = useMemo<BoardPost[]>(() => {
    const keyword = searchKeyword.trim().toLowerCase();
    const filtered = posts.filter((post) => {
      // 예약 게시물 노출은 부모에서 이미 처리 (visiblePosts) — 여기서는 추가 안전망
      if (isScheduledNoticePending(post, noticeVisibilityTick)) return false;

      if (activeTag !== 'all') {
        const tags = getPostTags(post);
        if (!tags.some((t) => t.toLowerCase() === activeTag.toLowerCase())) return false;
      }

      if (readFilter === 'unread' && !isUnread(post)) return false;
      if (readFilter === 'favorite' && !favorites.has(String(post.id ?? '').trim())) return false;

      if (keyword) {
        const title = String(post.title ?? '').toLowerCase();
        const author = String(post.author_name ?? '').toLowerCase();
        const content = String(post.content ?? '').toLowerCase();
        const tagText = getPostTags(post).join(' ').toLowerCase();
        if (
          !title.includes(keyword) &&
          !author.includes(keyword) &&
          !content.includes(keyword) &&
          !tagText.includes(keyword)
        ) {
          return false;
        }
      }
      return true;
    });

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      // 중요 게시물 우선
      const aImportant = normalizeBoardPostStatus(a.status) === '중요' ? 1 : 0;
      const bImportant = normalizeBoardPostStatus(b.status) === '중요' ? 1 : 0;
      if (aImportant !== bImportant) return bImportant - aImportant;

      switch (sortKey) {
        case 'views':
          return ((b.views as number) ?? 0) - ((a.views as number) ?? 0);
        case 'likes':
          return ((b.likes_count as number) ?? 0) - ((a.likes_count as number) ?? 0);
        case 'comments':
          return getCommentCount(b) - getCommentCount(a);
        case 'recent':
        default: {
          const aTime = new Date(a.created_at ?? 0).getTime();
          const bTime = new Date(b.created_at ?? 0).getTime();
          return bTime - aTime;
        }
      }
    });
    return sorted;
  }, [posts, searchKeyword, activeTag, readFilter, sortKey, favorites, isUnread, noticeVisibilityTick]);

  const handleSortKeyDown = (event: KeyboardEvent<HTMLButtonElement>, key: ReadFilter) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setReadFilter(key);
    }
  };

  return (
    <div className="space-y-3">
      {/* ── 상단 툴바 (일렬 정리) ── */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between pb-2 border-b border-[var(--border)]">
        {/* 좌: 태그 chip row */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTag('all')}
            aria-pressed={activeTag === 'all'}
            className={`h-7 rounded-[var(--radius-md)] px-2.5 text-[11px] font-bold transition ${
              activeTag === 'all'
                ? 'bg-[var(--toss-blue-light)] text-[var(--accent)]'
                : 'border border-[var(--border)] text-[var(--toss-gray-4)] hover:bg-[var(--muted)]'
            }`}
          >
            전체
          </button>
          {tagCatalog.map((tag) => {
            const active = activeTag === tag;
            return (
              <button
                key={tag}
                type="button"
                onClick={() => setActiveTag(tag)}
                aria-pressed={active}
                className={`h-7 rounded-[var(--radius-md)] px-2.5 text-[11px] font-bold transition ${
                  active
                    ? 'bg-[var(--toss-blue-light)] text-[var(--accent)]'
                    : 'border border-[var(--border)] text-[var(--toss-gray-4)] hover:bg-[var(--muted)]'
                }`}
              >
                #{tag}
              </button>
            );
          })}
        </div>

        {/* 우: 읽음 필터 + 정렬 + 검색 + 새 게시물 */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 읽음 필터 segmented */}
          <div
            role="tablist"
            aria-label="읽음 필터"
            className="inline-flex items-center gap-0.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] p-0.5"
          >
            {(Object.keys(READ_FILTER_LABELS) as ReadFilter[]).map((k) => {
              const active = readFilter === k;
              return (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setReadFilter(k)}
                  onKeyDown={(e) => handleSortKeyDown(e, k)}
                  className={`h-7 rounded-[var(--radius-md)] px-2.5 text-[11px] font-bold transition ${
                    active ? 'bg-[var(--accent)] text-white' : 'text-[var(--toss-gray-4)] hover:bg-[var(--card)]'
                  }`}
                >
                  {READ_FILTER_LABELS[k]}
                </button>
              );
            })}
          </div>

          {/* 정렬 select */}
          <label className="sr-only" htmlFor="board-sort-select">정렬</label>
          <select
            id="board-sort-select"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="h-8 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 text-[11px] font-bold text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
          >
            {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
              <option key={k} value={k}>{SORT_LABELS[k]}</option>
            ))}
          </select>

          {/* 검색 */}
          <div className="relative">
            <span
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--toss-gray-3)]"
              aria-hidden="true"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </span>
            <input
              type="search"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              placeholder="제목·작성자·태그 검색"
              aria-label="게시물 검색"
              className="h-8 w-44 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] pl-8 pr-3 text-[11px] font-semibold text-[var(--foreground)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/30"
            />
          </div>

          {/* 새 게시물 버튼 */}
          {canCreatePost && (
            <button
              type="button"
              data-testid="board-toggle-new-post"
              onClick={onToggleNewPost}
              className="h-8 rounded-[var(--radius-md)] bg-[var(--accent)] px-3 text-[11px] font-bold text-white shadow-sm hover:opacity-95"
            >
              {showNewPost ? '취소' : '+ 새 게시물'}
            </button>
          )}
        </div>
      </div>

      {/* ── 표 (라이브 §3-3: ★ 컬럼 폐지, 7열) ── */}
      <div className="erp-table-card">
        <table className="data-table compact board-tbl" aria-label={`${boardLabel} 게시물 목록`}>
          <thead>
            <tr>
              <th scope="col" style={{ width: 60, textAlign: 'right' }}>번호</th>
              <th scope="col">제목</th>
              <th scope="col" style={{ width: 140 }}>작성자</th>
              <th scope="col" style={{ width: 100 }}>등록일</th>
              <th scope="col" style={{ width: 60, textAlign: 'right' }} aria-sort={sortKey === 'views' ? 'descending' : 'none'}>조회</th>
              <th scope="col" style={{ width: 60, textAlign: 'right' }} aria-sort={sortKey === 'likes' ? 'descending' : 'none'}>좋아요</th>
              <th scope="col" style={{ width: 40 }}><span className="sr-only">메뉴</span></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={`skeleton-${i}`}>
                  <td colSpan={7}>
                    <div className="h-5 w-full animate-pulse rounded bg-[var(--border)]" />
                  </td>
                </tr>
              ))
            ) : filteredPosts.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <EmptyState
                    title="게시물이 없습니다"
                    description={emptyDescription ?? '새 게시물이 등록되면 이 목록에 표시됩니다.'}
                    compact
                  />
                </td>
              </tr>
            ) : (
              filteredPosts.map((post, idx) => {
                const postId = String(post.id ?? '').trim();
                const number = filteredPosts.length - idx;
                const tags = getPostTags(post);
                const attachCount = getAttachmentCount(post);
                const commentCount = getCommentCount(post);
                const postTitle = String(post.title ?? '').trim() || getBoardPostPreview(post) || '제목 없음';
                const author = getBoardPostAuthorSignal(post);
                const status = normalizeBoardPostStatus(post.status);
                const isImportant = status === '중요';
                const isFav = favorites.has(postId);
                const isLiked = myLikedPostIds.has(postId);
                const dateLabel = formatShortDate(post.created_at as string | null, post.scheduled_publish_at as string | null);
                const unread = isUnread(post);
                const canEditThis = canEditPost ? canEditPost(post) : false;
                const canDeleteThis = canDeletePost ? canDeletePost(post) : false;

                return (
                  <tr
                    key={postId || idx}
                    data-testid={`board-post-${postId}`}
                    onClick={() => onSelectPost(postId)}
                    className="board-tr cursor-pointer"
                  >
                    <td className="tnum" style={{ textAlign: 'right' }}>
                      <span className="board-num">{number}</span>
                    </td>
                    <td>
                      <div className="flex flex-col gap-1 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {/* 인라인 ★ 인디케이터 (지시서 §3-3: 별표된 경우만 노란) */}
                          {isFav && (
                            <svg
                              aria-label="별표"
                              className="shrink-0"
                              width="13"
                              height="13"
                              viewBox="0 0 24 24"
                              fill="#F59E0B"
                              stroke="#F59E0B"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                            </svg>
                          )}
                          {isImportant && (
                            <span className="shrink-0 rounded-[var(--radius-md)] bg-[var(--danger,#EF4444)]/10 px-1.5 py-0.5 text-[10px] font-bold text-[var(--danger,#EF4444)]">
                              중요
                            </span>
                          )}
                          {unread && (
                            <span aria-label="안 읽음" className="shrink-0 h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                          )}
                          <span className={`board-title min-w-0 truncate ${unread ? '' : 'opacity-60'}`}>
                            {postTitle}
                          </span>
                          {attachCount > 0 && (
                            <span className="shrink-0 text-[11px] text-[var(--toss-gray-3)]" title={`첨부 ${attachCount}개`} aria-label={`첨부 ${attachCount}개`}>
                              📎
                            </span>
                          )}
                          {commentCount > 0 && (
                            <span className="board-cm shrink-0">
                              💬 {commentCount}
                            </span>
                          )}
                        </div>
                        {tags.length > 0 && (
                          <div className="board-tags-row">
                            {tags.slice(0, 4).map((t) => (
                              <span key={t} className="board-tag-mini">
                                #{t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                            author.isAnonymous
                              ? 'bg-[var(--muted)] text-[var(--toss-gray-3)]'
                              : 'bg-[var(--toss-blue-light)] text-[var(--accent)]'
                          }`}
                          aria-hidden="true"
                        >
                          {author.initials}
                        </div>
                        <span className="truncate text-[12px] font-semibold text-[var(--foreground)]">
                          {author.name}
                        </span>
                      </div>
                    </td>
                    <td className="tnum">
                      <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">{dateLabel}</span>
                    </td>
                    <td className="tnum" style={{ textAlign: 'right' }}>
                      <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">
                        {((post.views as number) ?? 0).toLocaleString()}
                      </span>
                    </td>
                    <td className="tnum" style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => onToggleLike(post)}
                        aria-label={isLiked ? '좋아요 취소' : '좋아요'}
                        className={`inline-flex h-7 items-center justify-end gap-0.5 rounded-[var(--radius-md)] px-1.5 text-[11px] font-bold transition ${
                          isLiked ? 'text-[var(--danger,#EF4444)]' : 'text-[var(--toss-gray-3)] hover:text-[var(--danger,#EF4444)]'
                        }`}
                      >
                        {isLiked ? '♥' : '♡'} {((post.likes_count as number) ?? 0)}
                      </button>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <PostMoreMenu
                        postId={postId}
                        isFavorite={isFav}
                        canEdit={canEditThis}
                        canDelete={canDeleteThis}
                        onToggleFavorite={toggleFavorite}
                        onEdit={onEditPost}
                        onShareToChat={onShareToChat}
                        onDelete={onDeletePost}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
