'use client';

/**
 * 게시판 모바일 — 데이터 훅·유틸·상수.
 * PC `app/main/기능부품/게시판.tsx`의 db 쿼리 패턴을 발췌해 모바일 전용으로 압축.
 * JM: 단일 책임 (데이터 계층), ~250줄 이내
 * JM2: select는 필요한 컬럼만, 리스트는 limit(100)
 * JM3: try/catch + toast
 * JM4: any 금지, 모든 타입 명시
 * JM5: SQL 인젝션 회피(db eq 사용), 본문은 텍스트 렌더
 *
 * 글 작성 create: 기능부품/게시판서브/create-board-post.ts SSOT re-export
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { db } from '@/lib/db-client';
import { toast } from '@/lib/toast';
import { pickAvatarTone as pickAvatarToneLib, type AvatarTone } from '@/lib/avatar-tone';
import type { AttachmentItem, BoardPost } from '@/types';
import {
  BOARD_COMMENT_SELECT,
  BOARD_POST_OPTIONAL_COLUMNS,
  BOARD_POST_REQUIRED_SELECT_COLUMNS,
  buildSelectColumns,
  normalizeBoardPost } from '@/app/main/기능부품/게시판공통';
import { withMissingColumnsFallback } from '@/lib/db-compat';
import { useResolvedStaffId } from '@/lib/use-resolved-staff-id';
import { loadStarSet } from './별표훅';
import { readViewCache, writeViewCache } from '@/lib/view-cache';

// create / notice-broadcast / author resolve — PC·모바일 공유 SSOT
export {
  createBoardPost,
  insertBoardPost,
  broadcastNoticeIfNeeded,
  resolveAuthorStaffId,
  normalizePoll,
  isVoiceBoardType,
  type PostImportance,
  type BoardPollInput,
  type ScheduleMetaInput,
  type CreateBoardPostInput,
} from '@/app/main/기능부품/게시판서브/create-board-post';

// ─────────────────────────────────────────────
// 카테고리 정의 — handoff와 1:1
// ─────────────────────────────────────────────

export type BoardCatId =
  | 'all'
  | 'notice'
  | 'free'
  | 'event'
  | 'op'
  | 'mri'
  | 'share';

export type BoardCatDef = {
  id: BoardCatId;
  label: string;
  /** db board_type 값(=PC와 동일). all은 mapping 없음 */
  boardType?: string;
  tone?: 'accent' | 'success' | 'warning' | 'danger' | '';
};

/** PC BOARD_IDS 와 동일 (익명소리함·직원제안함 제거) */
export const BOARD_CATS: BoardCatDef[] = [
  { id: 'all',     label: '전체',     tone: '' },
  { id: 'notice',  label: '공지',     boardType: '공지사항', tone: 'accent' },
  { id: 'free',    label: '자유',     boardType: '자유게시판', tone: '' },
  { id: 'event',   label: '경조사',   boardType: '경조사', tone: 'warning' },
  { id: 'op',      label: '수술일정', boardType: '수술일정', tone: 'success' },
  { id: 'mri',     label: 'MRI일정',  boardType: 'MRI일정', tone: 'success' },
  { id: 'share',   label: '업무공유', boardType: '업무가이드', tone: 'warning' },
];

const LIST_BOARD_TYPES = BOARD_CATS
  .map((cat) => cat.boardType)
  .filter((v): v is string => Boolean(v));

/** 목록에서 제외 (폐지 보드) */
const REMOVED_BOARD_TYPES = new Set(['익명소리함', '직원제안함']);

/** 레거시 board_type → 현재 타입. 한 벌 쿼리로 받으므로 역매핑으로 정규화한다. */
const LEGACY_BOARD_TYPE_ALIASES: Record<string, string[]> = {
  'MRI일정': ['MRI일정표', 'mri'],
  '수술일정': ['수술'] };

const LEGACY_BOARD_TYPE_TO_CANONICAL = new Map<string, string>(
  Object.entries(LEGACY_BOARD_TYPE_ALIASES).flatMap(([canonical, aliases]) =>
    [canonical, ...aliases].map((alias) => [alias, canonical] as [string, string]),
  ),
);

/** 목록 조회에 쓰는 board_type 전체 (레거시 별칭 포함) */
const ALL_LIST_BOARD_TYPES = Array.from(
  new Set(LIST_BOARD_TYPES.flatMap((t) => [t, ...(LEGACY_BOARD_TYPE_ALIASES[t] ?? [])])),
);

/**
 * 목록에서 쓰지 않는 선택 컬럼은 받지 않는다.
 *
 * board_id / updated_at / company_id / tags / poll / poll_votes 는 목록 카드·달력
 * 어디서도 읽지 않는데 616행 × 6컬럼이라 응답의 13% 를 차지했다. 상세 화면은
 * useBoardPostDetail 이 따로 조회하므로 영향이 없다.
 */
const BOARD_LIST_UNUSED_COLUMNS = new Set([
  'board_id',
  'updated_at',
  'company_id',
  'tags',
  'poll',
  'poll_votes',
]);

const BOARD_LIST_OPTIONAL_COLUMNS = BOARD_POST_OPTIONAL_COLUMNS.filter(
  (c) => !BOARD_LIST_UNUSED_COLUMNS.has(c),
);

/**
 * 캐시에 남길 글 수.
 *
 * 전건(616)을 그대로 넣으면 IndexedDB 에 매 조회마다 600KB 를 구조화 복제로
 * 써 넣게 되고, 그 비용이 메인 스레드에서 나온다 — 빠르게 하려고 넣은 캐시가
 * 오히려 목록 진입을 붙잡았다. 캐시는 "첫 화면에 먼저 보여줄 그림" 이므로
 * 최근 것만 남긴다(첫 렌더 30개 + 더 보기 두어 번 분량).
 */
const BOARD_LIST_CACHE_MAX = 100;

/** 목록 캐시 스코프 (lib/view-cache) — 새로고침 후에도 즉시 그리기 위함 */
const BOARD_LIST_CACHE_SCOPE = 'board:list';

/** 목록 상한. 타입별 1000 → 전체 1000 (현재 전체 게시글이 616건) */
const BOARD_LIST_LIMIT = 1000;

/** board_type → cat. 미매칭(전역 subView '전체' 등)은 'all' — free로 강제하지 않음 */
export function boardTypeToCat(boardType: string | null | undefined): BoardCatId {
  if (!boardType || boardType === '전체' || boardType === 'all') return 'all';
  const cat = BOARD_CATS.find((c) => c.boardType === boardType || c.id === boardType);
  return cat ? cat.id : 'all';
}

/**
 * 게시판 subView 해석.
 * - '전체'/빈값/타 메뉴 잔여값 → 전체 리스트 (리스트가 메인)
 * - 보드 id/board_type → 해당 카테고리 리스트
 */
export function resolveBoardSubView(subView: string | null | undefined): {
  cat: BoardCatId;
  openList: boolean;
} {
  // 메인 진입: 항상 리스트(전체). 카테고리 홈은 쓰지 않음.
  if (!subView || subView === '전체' || subView === 'all') {
    return { cat: 'all', openList: true };
  }
  // 폐지 보드·레거시 id → 전체로 폴백
  if (
    subView === 'suggest' ||
    subView === 'anon' ||
    subView === '직원제안함' ||
    subView === '익명소리함' ||
    subView === '제안함'
  ) {
    return { cat: 'all', openList: true };
  }
  const isCatId = BOARD_CATS.some((c) => c.id === subView);
  if (isCatId) return { cat: subView as BoardCatId, openList: true };
  const cat = BOARD_CATS.find((c) => c.boardType === subView);
  if (cat) return { cat: cat.id, openList: true };
  return { cat: 'all', openList: true };
}

// ─────────────────────────────────────────────
// 게시글 목록 훅
// ─────────────────────────────────────────────

export type BoardListPost = BoardPost & {
  /** 사용자별 즐겨찾기 */
  starred?: boolean;
  /** 댓글 개수 */
  comment_count?: number;
};

export type UseBoardPostsResult = {
  posts: BoardListPost[];
  loading: boolean;
  refetch: () => Promise<void>;
  /** 다음 페이지를 이어붙인다. 서버 페이징이 동작할 때만 의미가 있다. */
  loadMore: () => Promise<void>;
  /** 서버에 더 남아 있는지 */
  hasMore: boolean;
};

/**
 * 모듈 캐시 — 게시판 탭 언마운트 후에도 칩 카운트·목록이 0으로 깜빡이지 않게 유지.
 * 카테고리 전환은 클라이언트 필터만 하고, 항상 전체 보드를 병렬 조회한다.
 */
let boardPostsCache: { userId: string | null; company: string | null; posts: BoardListPost[] } | null = null;
let boardPostsInflight: Promise<BoardListPost[]> | null = null;

/**
 * 보드 타입 하나당 받아오는 글 수.
 *
 * 처음에는 전체를 최신순 100건으로 끊었는데, 최신 100건 중 77건이 MRI·수술이라
 * 공지사항 탭이 통째로 비었다. 화면이 카테고리 탭 구조라 보드별로 끊어야 한다.
 */
const BOARD_PER_BOARD_STEP = 30;

type BoardPageResult = { posts: BoardPost[]; hasMore: boolean } | null;

/**
 * 서버 페이지 조회.
 *
 * 클라이언트 D1 게이트웨이로는 페이지를 끊을 수 없다 — 일정 글 147건은
 * schedule_date 가 비어 있고 날짜가 본문 [[SCHEDULE_META]] 안에만 있어서,
 * SQL 로 거르면 달력에서 사라진다. 서버가 META 를 먼저 해석하고 끊어 준다.
 * 실패하면 null 을 돌려 호출부가 기존 전건 조회로 되돌아간다.
 */
async function fetchBoardPageFromServer(perBoard: number): Promise<BoardPageResult> {
  if (typeof fetch !== 'function') return null;
  try {
    const res = await fetch('/api/board/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ mode: 'list', perBoard }) });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as
      | { ok: true; posts: BoardPost[]; hasMore?: boolean }
      | { ok: false }
      | null;
    if (!json || json.ok !== true || !Array.isArray(json.posts)) return null;
    return { posts: json.posts, hasMore: Boolean(json.hasMore) };
  } catch {
    return null;
  }
}

/**
 * 게시글 목록 조회 (활성 보드 타입별 병렬 + 병합).
 * boardTypeFilter 는 더 이상 서버 필터에 쓰지 않음 — 칩 카운트가 전부 0으로 떨어지는 원인.
 */
export function useBoardPosts(
  userId: string | null,
  company?: string | null,
  _boardTypeFilter?: string | null,
): UseBoardPostsResult {
  const companyKey = company && company !== '전체' ? company : null;
  const cached =
    boardPostsCache &&
    boardPostsCache.userId === userId &&
    boardPostsCache.company === companyKey
      ? boardPostsCache.posts
      : null;
  const [posts, setPosts] = useState<BoardListPost[]>(() => cached ?? []);
  const [loading, setLoading] = useState(() => !cached);
  // 서버 페이징 커서. null 이면 더 없음(또는 폴백으로 전건을 받은 상태).
  // 보드당 몇 건까지 받았는지. 더 보기를 누르면 이 깊이를 늘려 다시 받는다.
  const [perBoard, setPerBoard] = useState(BOARD_PER_BOARD_STEP);
  // fetchPosts 는 useCallback 안에서 최신 깊이를 봐야 한다(재생성 없이).
  const perBoardRef = useRef(BOARD_PER_BOARD_STEP);
  perBoardRef.current = perBoard;
  const [serverHasMore, setServerHasMore] = useState(false);
  const loadingMoreRef = useRef(false);

  /**
   * 조회 경로가 어디든 목록으로 만드는 공통 처리.
   * (서버 페이지·폴백 전건 조회·추가 페이지가 모두 이걸 쓴다)
   */
  const enrich = useCallback(async (input: BoardPost[]): Promise<BoardListPost[]> => {
    const byId = new Map<string, BoardPost>();
    for (const p of input) {
      const id = String(p.id ?? '');
      if (!id) continue;
      const normalized = normalizeBoardPost(p);
      // 레거시 board_type (mri -> MRI일정 등) 정규화
      const canonical = LEGACY_BOARD_TYPE_TO_CANONICAL.get(String(normalized.board_type ?? '').trim());
      if (canonical) normalized.board_type = canonical;
      byId.set(id, normalized);
    }
    let rawList = Array.from(byId.values()).sort((a, b) => {
      const ta = new Date(String(a.created_at ?? 0)).getTime();
      const tb = new Date(String(b.created_at ?? 0)).getTime();
      return tb - ta;
    });

    rawList = rawList.filter(
      (p) => !REMOVED_BOARD_TYPES.has(String(p.board_type ?? '').trim()),
    );

    const nowMs = Date.now();
    const list = rawList.filter((p) => {
      const sched = (p as { scheduled_publish_at?: string | null }).scheduled_publish_at;
      if (!sched) return true;
      const t = new Date(sched).getTime();
      if (!Number.isFinite(t) || t <= nowMs) return true;
      return userId && String(p.author_id ?? '') === String(userId);
    });

    const ids = list.map((p) => String(p.id)).filter(Boolean);
    const commentCounts: Record<string, number> = {};
    const CHUNK = 200;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      const { data: commentRows } = await db
        .from('board_post_comments')
        .select('post_id')
        .in('post_id', chunk);
      if (Array.isArray(commentRows)) {
        for (const row of commentRows as { post_id: string }[]) {
          const key = String(row.post_id);
          commentCounts[key] = (commentCounts[key] || 0) + 1;
        }
      }
    }

    const starSet = await loadStarSet(userId);
    return list.map((p) => ({
      ...(p as BoardListPost),
      comment_count: commentCounts[String(p.id)] || 0,
      starred: starSet.has(String(p.id)),
    }));
  }, [userId]);

  const fetchPosts = useCallback(async () => {
    // 캐시가 있으면 소프트 리프레시 — loading 깜빡임 없이 배경 갱신
    const hasCache = Boolean(
      boardPostsCache &&
        boardPostsCache.userId === userId &&
        boardPostsCache.company === companyKey &&
        boardPostsCache.posts.length > 0,
    );
    if (!hasCache) setLoading(true);

    const run = async (): Promise<BoardListPost[]> => {
      // 서버 페이지가 먼저다. 첫 진입에 617건(620KB)을 통째로 받던 것을
      // 100건(89KB)으로 끊는다. 라우트가 없거나 실패하면 아래 전건 조회로 간다.
      const page = await fetchBoardPageFromServer(perBoardRef.current);
      if (page) {
        setServerHasMore(page.hasMore);
        return enrich(page.posts);
      }
      // 폴백(전건 조회)에서는 더 받을 것이 없다.
      setServerHasMore(false);

      // ── 폴백: 예전 경로(전건 조회) ──
      // 보드 타입마다 따로 쿼리하던 것을 한 번으로 합쳐 둔 상태다.
      const { data, error } = await withMissingColumnsFallback<BoardPost[]>(
        async (omittedColumns) => {
          const result = await db
            .from('board_posts')
            .select(
              buildSelectColumns(
                BOARD_POST_REQUIRED_SELECT_COLUMNS,
                BOARD_LIST_OPTIONAL_COLUMNS,
                omittedColumns,
              ),
            )
            .in('board_type', ALL_LIST_BOARD_TYPES)
            .order('created_at', { ascending: false })
            .limit(BOARD_LIST_LIMIT);
          return result as unknown as { data: BoardPost[] | null; error: unknown };
        },
        [...BOARD_LIST_OPTIONAL_COLUMNS],
      );
      if (error) {
        throw error instanceof Error
          ? error
          : new Error(
              typeof error === 'object' && error && 'message' in error
                ? String((error as { message?: string }).message)
                : '게시판 조회 실패',
            );
      }

      return enrich(Array.isArray(data) ? data : []);
    };


    // 메모리 캐시가 없을 때만 저장분을 먼저 그린다. 새로고침 직후 빈 화면 대신
    // 지난번 목록을 보여주고, 아래 네트워크 응답이 오면 갈아끼운다.
    if (!hasCache) {
      void (async () => {
        const cached = await readViewCache<BoardListPost[]>(
          userId,
          BOARD_LIST_CACHE_SCOPE,
          companyKey ?? 'all',
        );
        if (!cached || cached.length === 0) return;
        // 그 사이 **이 조합의** 실제 응답이 도착했으면 캐시로 되돌리지 않는다.
        // (다른 사용자·회사의 캐시가 남아 있을 수 있으므로 신원까지 대조한다.)
        if (
          boardPostsCache &&
          boardPostsCache.userId === userId &&
          boardPostsCache.company === companyKey
        ) {
          return;
        }
        setPosts(cached);
        setLoading(false);
      })();
    }

    try {
      // 동일 user 동시 요청 합치기
      if (!boardPostsInflight) {
        boardPostsInflight = run().finally(() => {
          boardPostsInflight = null;
        });
      }
      const enriched = await boardPostsInflight;
      boardPostsCache = { userId, company: companyKey, posts: enriched };
      setPosts(enriched);
      void writeViewCache(
        userId,
        BOARD_LIST_CACHE_SCOPE,
        companyKey ?? 'all',
        enriched.slice(0, BOARD_LIST_CACHE_MAX),
      );
    } catch (err) {
      toast(`게시판 조회 실패: ${(err as Error)?.message ?? '오류'}`, 'error');
      // 캐시가 있으면 빈 목록으로 지우지 않음 (숫자 깜빡임 방지)
      if (
        !boardPostsCache ||
        boardPostsCache.userId !== userId ||
        boardPostsCache.company !== companyKey
      ) {
        setPosts([]);
      }
    } finally {
      setLoading(false);
    }
  }, [userId, company]);

  /**
   * 다음 페이지를 이어붙인다.
   *
   * 폴백 경로(전건 조회)로 받았을 때는 커서가 없으므로 아무 일도 하지 않는다 —
   * 그 경우 목록에는 이미 전건이 들어 있다.
   */
  /**
   * 더 보기 — 보드당 깊이를 늘려 다시 받는다.
   *
   * 커서로 이어붙이지 않는 이유: 커서는 전역 최신순이라 보드별 균형이 깨진다
   * (그래서 공지 탭이 통째로 비었다). 깊이를 늘리면 모든 탭이 함께 깊어진다.
   */
  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !serverHasMore) return;
    loadingMoreRef.current = true;
    const nextDepth = perBoardRef.current + BOARD_PER_BOARD_STEP;
    try {
      const page = await fetchBoardPageFromServer(nextDepth);
      if (!page) return;
      perBoardRef.current = nextDepth;
      setPerBoard(nextDepth);
      setServerHasMore(page.hasMore);
      const merged = await enrich(page.posts);
      boardPostsCache = { userId, company: companyKey, posts: merged };
      setPosts(merged);
    } catch (err) {
      toast(`게시판 추가 조회 실패: ${(err as Error)?.message ?? '오류'}`, 'error');
    } finally {
      loadingMoreRef.current = false;
    }
  }, [serverHasMore, userId, companyKey, enrich]);

  useEffect(() => {
    void fetchPosts();
  }, [fetchPosts]);

  return { posts, loading, refetch: fetchPosts, loadMore, hasMore: serverHasMore };
}

// ─────────────────────────────────────────────
// 단건 + 댓글
// ─────────────────────────────────────────────

export type BoardComment = {
  id: string;
  post_id: string;
  author_id?: string | null;
  author_name?: string | null;
  content?: string | null;
  parent_comment_id?: string | null;
  created_at?: string | null;
};

export type UseBoardDetailResult = {
  post: BoardListPost | null;
  comments: BoardComment[];
  loading: boolean;
  refetchComments: () => Promise<void>;
  addComment: (content: string, parentCommentId?: string | null) => Promise<boolean>;
  /** 좋아요/조회수 등 낙관적 업데이트용 */
  patchPost: (patch: Partial<BoardListPost>) => void;
};

export function useBoardDetail(
  postId: string | null,
  user: { id?: string | null; name?: string | null; employee_no?: string | null; auth_user_id?: string | null } | null,
): UseBoardDetailResult {
  const resolvedAuthorId = useResolvedStaffId(user as Record<string, unknown> | null | undefined);
  const [post, setPost] = useState<BoardListPost | null>(null);
  const [comments, setComments] = useState<BoardComment[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchPost = useCallback(async () => {
    if (!postId) {
      setPost(null);
      return;
    }
    setLoading(true);
    try {
      const { data } = await withMissingColumnsFallback<BoardPost>(
        async (omittedColumns) => {
          const result = await db
            .from('board_posts')
            .select(
              buildSelectColumns(
                BOARD_POST_REQUIRED_SELECT_COLUMNS,
                BOARD_POST_OPTIONAL_COLUMNS,
                omittedColumns,
              ),
            )
            .eq('id', postId)
            .maybeSingle();
          return result as unknown as { data: BoardPost | null; error: unknown };
        },
        [...BOARD_POST_OPTIONAL_COLUMNS],
      );
      setPost(data ? (normalizeBoardPost(data) as BoardListPost) : null);
    } catch (err) {
      toast(`게시글 조회 실패: ${(err as Error)?.message ?? '오류'}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [postId]);

  const refetchComments = useCallback(async () => {
    if (!postId) return;
    try {
      const { data } = await db
        .from('board_post_comments')
        .select(BOARD_COMMENT_SELECT)
        .eq('post_id', postId)
        .order('created_at', { ascending: true })
        .limit(200);
      setComments(Array.isArray(data) ? (data as BoardComment[]) : []);
    } catch (err) {
      toast(`댓글 조회 실패: ${(err as Error)?.message ?? '오류'}`, 'error');
    }
  }, [postId]);

  useEffect(() => {
    void fetchPost();
    void refetchComments();
  }, [fetchPost, refetchComments]);

  const addComment = useCallback(
    async (content: string, parentCommentId: string | null = null) => {
      const trimmed = content.trim();
      if (!trimmed || !postId) return false;
      // resolve 실패 시 raw user.id 폴백
      const authorId = resolvedAuthorId || (typeof user?.id === 'string' ? user.id : null);
      if (!authorId) {
        toast('로그인한 후 댓글을 등록할 수 있습니다.', 'error');
        return false;
      }
      try {
        const { data, error } = await db
          .from('board_post_comments')
          .insert([
            {
              post_id: postId,
              author_id: authorId,
              author_name: user?.name ?? '익명',
              content: trimmed,
              parent_comment_id: parentCommentId },
          ])
          .select()
          .maybeSingle();
        if (error) throw error;
        if (data) {
          setComments((prev) => [...prev, data as BoardComment]);
        }
        return true;
      } catch (err) {
        toast(`댓글 등록 실패: ${(err as Error)?.message ?? '오류'}`, 'error');
        return false;
      }
    },
    [postId, resolvedAuthorId, user?.id, user?.name],
  );

  const patchPost = useCallback((patch: Partial<BoardListPost>) => {
    setPost((prev) => (prev ? ({ ...prev, ...patch } as BoardListPost) : prev));
  }, []);

  return { post, comments, loading, refetchComments, addComment, patchPost };
}

// ─────────────────────────────────────────────
// 즐겨찾기(별표) — 별표훅.ts 로 이전됨.
// 외부 호환을 위해 re-export 만 유지.
// ─────────────────────────────────────────────
export { toggleStarServer, loadStarSet, useStarSet } from './별표훅';

// ─────────────────────────────────────────────
// 글 작성(insert) — SSOT: 기능부품/게시판서브/create-board-post.ts
// (타입·createBoardPost·normalizePoll 은 파일 상단 re-export)
// ─────────────────────────────────────────────

/** 게시글 수정 입력 — board_posts.update 매핑 (제목/본문/첨부/투표) */
export type UpdateBoardPostInput = {
  postId: string;
  title: string;
  content: string;
  attachments?: AttachmentItem[];
  /** null이면 기존 투표 제거 (PC editing 시 poll=null과 동일) */
  poll?: import('@/app/main/기능부품/게시판서브/create-board-post').BoardPollInput | null;
};

// 변경(mutation) 헬퍼는 게시판변경.ts로 분리 (JM 500줄 이내 유지).
export {
  updateBoardPost,
  deleteBoardPost,
  deleteBoardComment,
  togglePollVote,
  type PollVotes } from './게시판변경';

// ─────────────────────────────────────────────
// 작성자 아바타 톤(이름 기반 결정)
// ─────────────────────────────────────────────

export type BoardAvatarTone = Exclude<AvatarTone, 'gray'>;

export function pickAvatarTone(seed: string | null | undefined): BoardAvatarTone {
  return pickAvatarToneLib(seed) as BoardAvatarTone;
}

// ─────────────────────────────────────────────
// 날짜 포맷
// ─────────────────────────────────────────────

export function formatShortDate(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${m}/${day}`;
}

export function formatLongDate(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const ampm = d.getHours() < 12 ? '오전' : '오후';
  const h12 = d.getHours() % 12 || 12;
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${ampm} ${h12}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ─────────────────────────────────────────────
// 첨부 안전 추출
// ─────────────────────────────────────────────

export type SafeAttachment = AttachmentItem & {
  /** 카테고리 — 'image' | 'video' | 'file' */
  kind: 'image' | 'video' | 'file';
};

export function getSafeAttachments(post: BoardPost | null): SafeAttachment[] {
  if (!post) return [];
  const list = Array.isArray(post.attachments) ? post.attachments : [];
  return list
    .map((item) => {
      const name = String(item?.name ?? '').trim();
      const url = String(item?.url ?? '').trim();
      const type = String(item?.type ?? '').trim();
      const kind = inferKind(name, type);
      return {
        name,
        url,
        size: typeof item?.size === 'number' ? item.size : undefined,
        type,
        kind };
    })
    .filter((a) => a.name && a.url);
}

function inferKind(nameOrUrl: string, explicitType: string): 'image' | 'video' | 'file' {
  const t = explicitType.toLowerCase();
  if (t === 'image' || t === 'video' || t === 'file') return t;
  if (t.startsWith('image/')) return 'image';
  if (t.startsWith('video/')) return 'video';
  const ext = (nameOrUrl.split('?')[0].split('.').pop() || '').toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'heic', 'heif', 'avif'].includes(ext)) return 'image';
  if (['mp4', 'mov', 'avi', 'wmv', 'webm', 'mkv', 'm4v'].includes(ext)) return 'video';
  return 'file';
}

/**
 * 달력이 보는 달의 일정 글만 조회한다.
 *
 * 목록을 100건 페이지로 끊으면서 달력이 그 배열을 더 쓸 수 없게 됐다.
 * 서버가 [[SCHEDULE_META]] 를 해석한 뒤 달로 거르므로, schedule_date 컬럼이
 * 비어 있고 날짜가 본문 안에만 있던 147건도 제 날짜에 뜬다.
 *
 * 실패하면 null 을 돌려 호출부가 부모의 목록으로 되돌아가게 한다 — 달력이
 * 통째로 비는 것보다 낫다.
 */
export function useBoardScheduleMonth(month: string): {
  posts: BoardListPost[] | null;
  loading: boolean;
} {
  const [posts, setPosts] = useState<BoardListPost[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!/^\d{4}-\d{2}$/.test(month)) return;
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch('/api/board/list', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ mode: 'calendar', month }) });
        if (!active) return;
        if (!res.ok) { setPosts(null); return; }
        const json = (await res.json().catch(() => null)) as
          | { ok: true; posts: BoardListPost[] }
          | { ok: false }
          | null;
        if (!active) return;
        setPosts(json && json.ok === true && Array.isArray(json.posts) ? json.posts : null);
      } catch {
        if (active) setPosts(null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [month]);

  return { posts, loading };
}
