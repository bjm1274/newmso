'use client';

/**
 * 게시판 모바일 — 데이터 훅·유틸·상수.
 * PC `app/main/기능부품/게시판.tsx`의 supabase 쿼리 패턴을 발췌해 모바일 전용으로 압축.
 * JM: 단일 책임 (데이터 계층), ~250줄 이내
 * JM2: select는 필요한 컬럼만, 리스트는 limit(100)
 * JM3: try/catch + toast
 * JM4: any 금지, 모든 타입 명시
 * JM5: SQL 인젝션 회피(supabase eq 사용), 본문은 텍스트 렌더
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import type { AttachmentItem, BoardPost } from '@/types';
import {
  BOARD_COMMENT_SELECT,
  BOARD_POST_OPTIONAL_COLUMNS,
  BOARD_POST_REQUIRED_SELECT_COLUMNS,
  buildAttachmentMetaContent,
  buildSelectColumns,
  normalizeBoardPost,
} from '@/app/main/기능부품/게시판공통';
import { withMissingColumnsFallback } from '@/lib/supabase-compat';
import { loadStarSet } from './별표훅';

// ─────────────────────────────────────────────
// 카테고리 정의 — handoff와 1:1
// ─────────────────────────────────────────────

export type BoardCatId = 'all' | 'notice' | 'free' | 'event' | 'op' | 'mri' | 'share' | 'meal';

export type BoardCatDef = {
  id: BoardCatId;
  label: string;
  /** supabase board_type 값(=PC와 동일). all/meal은 mapping 없음 */
  boardType?: string;
  tone?: 'accent' | 'success' | 'warning' | 'danger' | '';
};

export const BOARD_CATS: BoardCatDef[] = [
  { id: 'all',    label: '전체',     tone: '' },
  { id: 'notice', label: '공지',     boardType: '공지사항', tone: 'accent' },
  { id: 'free',   label: '자유',     boardType: '자유게시판', tone: '' },
  { id: 'event',  label: '경조사',   boardType: '경조사', tone: 'warning' },
  { id: 'op',     label: '수술일정', boardType: '수술일정', tone: 'success' },
  { id: 'mri',    label: 'MRI일정',  boardType: 'MRI일정', tone: 'success' },
  { id: 'share',  label: '업무공유', boardType: '업무가이드', tone: 'warning' },
  { id: 'meal',   label: '식단',     tone: '' }, // 별도 board 없음 → 자유 안의 '식단' 태그
];

const LIST_BOARD_TYPES = BOARD_CATS
  .map((cat) => cat.boardType)
  .filter((v): v is string => Boolean(v));

export function boardTypeToCat(boardType: string | null | undefined): BoardCatId {
  const cat = BOARD_CATS.find((c) => c.boardType === boardType);
  return cat ? cat.id : 'free';
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
};

export function useBoardPosts(userId: string | null, company?: string | null): UseBoardPostsResult {
  const [posts, setPosts] = useState<BoardListPost[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await withMissingColumnsFallback<BoardPost[]>(
        async (omittedColumns) => {
          let q = supabase
            .from('board_posts')
            .select(
              buildSelectColumns(
                BOARD_POST_REQUIRED_SELECT_COLUMNS,
                BOARD_POST_OPTIONAL_COLUMNS,
                omittedColumns,
              ),
            )
            .in('board_type', LIST_BOARD_TYPES)
            .order('created_at', { ascending: false })
            .limit(100);
          if (company && company !== '전체') q = q.eq('company', company);
          const result = await q;
          return result as unknown as { data: BoardPost[] | null; error: unknown };
        },
        [...BOARD_POST_OPTIONAL_COLUMNS],
      );

      const rawList = Array.isArray(data) ? data.map((p) => normalizeBoardPost(p)) : [];
      // 예약 발행 — 미래 시점의 글은 본인 글이 아니면 숨김 (PC와 동일 정책)
      const nowMs = Date.now();
      const list = rawList.filter((p) => {
        const sched = (p as { scheduled_publish_at?: string | null }).scheduled_publish_at;
        if (!sched) return true;
        const t = new Date(sched).getTime();
        if (!Number.isFinite(t) || t <= nowMs) return true;
        // 본인 글이거나 명시적 author_id가 같으면 노출
        return userId && String(p.author_id ?? '') === String(userId);
      });

      // 댓글 개수 일괄 조회 (post_id별)
      const ids = list.map((p) => String(p.id)).filter(Boolean);
      let commentCounts: Record<string, number> = {};
      if (ids.length > 0) {
        const { data: commentRows } = await supabase
          .from('board_post_comments')
          .select('post_id')
          .in('post_id', ids);
        if (Array.isArray(commentRows)) {
          commentCounts = (commentRows as { post_id: string }[]).reduce<Record<string, number>>(
            (acc, row) => {
              const key = String(row.post_id);
              acc[key] = (acc[key] || 0) + 1;
              return acc;
            },
            {},
          );
        }
      }

      // 즐겨찾기 — 서버 board_post_stars 우선 + LS 폴백 (별표훅.loadStarSet)
      const starSet = await loadStarSet(userId);

      const enriched: BoardListPost[] = list.map((p) => ({
        ...(p as BoardListPost),
        comment_count: commentCounts[String(p.id)] || 0,
        starred: starSet.has(String(p.id)),
      }));

      setPosts(enriched);
    } catch (err) {
      toast(`게시판 조회 실패: ${(err as Error)?.message ?? '오류'}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [userId, company]);

  useEffect(() => {
    void fetchPosts();
  }, [fetchPosts]);

  return { posts, loading, refetch: fetchPosts };
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
  user: { id?: string | null; name?: string | null } | null,
): UseBoardDetailResult {
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
          const result = await supabase
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
      const { data } = await supabase
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
      if (!user?.id) {
        toast('로그인한 후 댓글을 등록할 수 있습니다.', 'error');
        return false;
      }
      try {
        const { data, error } = await supabase
          .from('board_post_comments')
          .insert([
            {
              post_id: postId,
              author_id: user.id,
              author_name: user.name ?? '익명',
              content: trimmed,
              parent_comment_id: parentCommentId,
            },
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
    [postId, user?.id, user?.name],
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
// 글 작성(insert)
// ─────────────────────────────────────────────

export type PostImportance = 'normal' | 'urgent';

export type CreateBoardPostInput = {
  catId: BoardCatId;
  title: string;
  content: string;
  attachments?: AttachmentItem[];
  /** P2: 익명 작성 — 자유/익명 board에서만 의미 있음 */
  anonymous?: boolean;
  /** P2: 상단 고정 (관리자 권한 필요 — 호출 측 게이트) */
  pinned?: boolean;
  /** P2: 중요도 — 'urgent'일 때 status='중요'로 매핑 (PC와 동일) */
  importance?: PostImportance;
  /** P2: 예약 발행 — ISO/HTML datetime-local 값 (빈 문자열은 무시) */
  scheduledPublishAt?: string | null;
  user: { id?: string | null; name?: string | null; company?: string | null; company_id?: string | null } | null;
};

function toIsoOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  // <input type="datetime-local"> → 'YYYY-MM-DDTHH:mm' (TZ 없음). 로컬 시간으로 해석 후 ISO 변환.
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  // 미래만 의미 있음 (과거 예약은 즉시 발행과 같으므로 null 처리)
  if (d.getTime() <= Date.now()) return null;
  return d.toISOString();
}

export async function createBoardPost(input: CreateBoardPostInput): Promise<BoardPost | null> {
  const {
    catId,
    title,
    content,
    attachments,
    anonymous = false,
    pinned = false,
    importance = 'normal',
    scheduledPublishAt = null,
    user,
  } = input;
  const cat = BOARD_CATS.find((c) => c.id === catId);
  const boardType = cat?.boardType ?? '자유게시판';
  if (!user?.id) {
    toast('로그인한 후 글을 등록할 수 있습니다.', 'error');
    return null;
  }

  // 첨부가 있으면 content에 [[ATTACHMENTS_META]]...[[/ATTACHMENTS_META]] 임베드.
  // 동시에 board_posts.attachments 컬럼에도 시도 (없는 환경에선 withMissingColumnsFallback이 처리).
  const normalizedAttachments: AttachmentItem[] = Array.isArray(attachments)
    ? attachments
        .map((a) => ({
          name: String(a?.name ?? '').trim(),
          url: String(a?.url ?? '').trim(),
          type: String(a?.type ?? '').trim() || undefined,
          size: typeof a?.size === 'number' ? a.size : undefined,
        }))
        .filter((a) => a.name && a.url)
    : [];

  const baseContent = content.trim();
  const finalContent = normalizedAttachments.length > 0
    ? buildAttachmentMetaContent(baseContent, normalizedAttachments)
    : baseContent;

  const scheduledIso = toIsoOrNull(scheduledPublishAt);
  const statusValue = importance === 'urgent' ? '중요' : null;

  type InsertPayload = {
    board_type: string;
    title: string;
    content: string;
    author_id: string | null;
    author_name: string;
    company: string | null;
    company_id: string | null;
    is_anonymous: boolean;
    attachments?: AttachmentItem[];
    is_pinned?: boolean;
    status?: string | null;
    scheduled_publish_at?: string | null;
  };
  const payload: InsertPayload = {
    board_type: boardType,
    title: title.trim(),
    content: finalContent,
    // JM5: 익명일 때 author_id 비식별 (PC와 동일)
    author_id: anonymous ? null : user.id,
    author_name: anonymous ? '익명' : (user.name ?? '익명'),
    company: anonymous ? null : (user.company ?? null),
    company_id: anonymous ? null : (user.company_id ?? null),
    is_anonymous: anonymous,
  };
  if (normalizedAttachments.length > 0) payload.attachments = normalizedAttachments;
  if (pinned) payload.is_pinned = true;
  if (statusValue) payload.status = statusValue;
  if (scheduledIso) payload.scheduled_publish_at = scheduledIso;

  try {
    let { data, error } = await supabase
      .from('board_posts')
      .insert([payload])
      .select()
      .single();
    // optional 컬럼이 없는 환경 → 메시지에 등장한 컬럼을 제외하고 재시도 (한 번)
    if (error) {
      const msg = String((error as { message?: string }).message ?? '');
      const optional: Array<keyof InsertPayload> = ['attachments', 'is_pinned', 'status', 'scheduled_publish_at'];
      const toOmit = optional.filter((k) => new RegExp(String(k), 'i').test(msg));
      if (toOmit.length > 0) {
        const retryPayload: InsertPayload = { ...payload };
        toOmit.forEach((k) => { delete retryPayload[k]; });
        const retry = await supabase.from('board_posts').insert([retryPayload]).select().single();
        data = retry.data;
        error = retry.error;
      }
    }
    if (error) throw error;
    return data as BoardPost;
  } catch (err) {
    toast(`등록 실패: ${(err as Error)?.message ?? '오류'}`, 'error');
    return null;
  }
}

// ─────────────────────────────────────────────
// 작성자 아바타 톤(이름 기반 결정)
// ─────────────────────────────────────────────

const AVATAR_TONES = ['blue', 'pink', 'violet', 'orange', 'cyan', 'green'] as const;
export type BoardAvatarTone = (typeof AVATAR_TONES)[number];

export function pickAvatarTone(seed: string | null | undefined): BoardAvatarTone {
  const s = String(seed ?? '');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
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
        kind,
      };
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

