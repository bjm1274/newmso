'use client';

/**
 * 게시판 모바일 — 데이터 훅·유틸·상수.
 * PC `app/main/기능부품/게시판.tsx`의 db 쿼리 패턴을 발췌해 모바일 전용으로 압축.
 * JM: 단일 책임 (데이터 계층), ~250줄 이내
 * JM2: select는 필요한 컬럼만, 리스트는 limit(100)
 * JM3: try/catch + toast
 * JM4: any 금지, 모든 타입 명시
 * JM5: SQL 인젝션 회피(db eq 사용), 본문은 텍스트 렌더
 */

import { useCallback, useEffect, useState } from 'react';
import { db } from '@/lib/db-client';
import { toast } from '@/lib/toast';
import type { AttachmentItem, BoardPost } from '@/types';
import {
  BOARD_COMMENT_SELECT,
  BOARD_POST_OPTIONAL_COLUMNS,
  BOARD_POST_REQUIRED_SELECT_COLUMNS,
  buildAttachmentMetaContent,
  buildSelectColumns,
  normalizeBoardPost } from '@/app/main/기능부품/게시판공통';
import { withMissingColumnsFallback } from '@/lib/db-compat';
import { loadStarSet } from './별표훅';
import { normalizePoll } from './게시판변경';

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
};

/**
 * 모듈 캐시 — 게시판 탭 언마운트 후에도 칩 카운트·목록이 0으로 깜빡이지 않게 유지.
 * 카테고리 전환은 클라이언트 필터만 하고, 항상 전체 보드를 병렬 조회한다.
 */
let boardPostsCache: { userId: string | null; posts: BoardListPost[] } | null = null;
let boardPostsInflight: Promise<BoardListPost[]> | null = null;

/**
 * 게시글 목록 조회 (활성 보드 타입별 병렬 + 병합).
 * boardTypeFilter 는 더 이상 서버 필터에 쓰지 않음 — 칩 카운트가 전부 0으로 떨어지는 원인.
 */
export function useBoardPosts(
  userId: string | null,
  company?: string | null,
  _boardTypeFilter?: string | null,
): UseBoardPostsResult {
  const cached =
    boardPostsCache && boardPostsCache.userId === userId ? boardPostsCache.posts : null;
  const [posts, setPosts] = useState<BoardListPost[]>(() => cached ?? []);
  const [loading, setLoading] = useState(() => !cached);

  const fetchPosts = useCallback(async () => {
    // 캐시가 있으면 소프트 리프레시 — loading 깜빡임 없이 배경 갱신
    const hasCache = Boolean(boardPostsCache && boardPostsCache.userId === userId && boardPostsCache.posts.length > 0);
    if (!hasCache) setLoading(true);

    const run = async (): Promise<BoardListPost[]> => {
      const fetchOneType = async (boardType: string): Promise<BoardPost[]> => {
        const { data, error } = await withMissingColumnsFallback<BoardPost[]>(
          async (omittedColumns) => {
            const q = db
              .from('board_posts')
              .select(
                buildSelectColumns(
                  BOARD_POST_REQUIRED_SELECT_COLUMNS,
                  BOARD_POST_OPTIONAL_COLUMNS,
                  omittedColumns,
                ),
              )
              .eq('board_type', boardType)
              .order('created_at', { ascending: false })
              .limit(1000);
            const result = await q;
            return result as unknown as { data: BoardPost[] | null; error: unknown };
          },
          [...BOARD_POST_OPTIONAL_COLUMNS],
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
        return Array.isArray(data) ? data.map((p) => normalizeBoardPost(p)) : [];
      };

      const batches = await Promise.all(LIST_BOARD_TYPES.map((t) => fetchOneType(t)));
      const byId = new Map<string, BoardPost>();
      for (const batch of batches) {
        for (const p of batch) {
          const id = String(p.id ?? '');
          if (id) byId.set(id, p);
        }
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
    };

    try {
      // 동일 user 동시 요청 합치기
      if (!boardPostsInflight) {
        boardPostsInflight = run().finally(() => {
          boardPostsInflight = null;
        });
      }
      const enriched = await boardPostsInflight;
      boardPostsCache = { userId, posts: enriched };
      setPosts(enriched);
    } catch (err) {
      toast(`게시판 조회 실패: ${(err as Error)?.message ?? '오류'}`, 'error');
      // 캐시가 있으면 빈 목록으로 지우지 않음 (숫자 깜빡임 방지)
      if (!boardPostsCache || boardPostsCache.userId !== userId) {
        setPosts([]);
      }
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
      if (!user?.id) {
        toast('로그인한 후 댓글을 등록할 수 있습니다.', 'error');
        return false;
      }
      try {
        const { data, error } = await db
          .from('board_post_comments')
          .insert([
            {
              post_id: postId,
              author_id: user.id,
              author_name: user.name ?? '익명',
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

/** board_posts.poll JSONB — PC `게시판서브/board-poll-prize.ts`의 BoardPoll과 동일 형태 */
export type BoardPollInput = {
  question: string;
  options: string[];
  anonymous: boolean;
  multiple: boolean;
  prize?: { winnerCount: number; name: string };
};

/** 수술/MRI 일정 메타 — PC postData 매핑과 1:1 */
export type ScheduleMetaInput = {
  /** 'YYYY-MM-DD' */
  scheduleDate?: string | null;
  /** 'HH:mm' */
  scheduleTime?: string | null;
  scheduleRoom?: string | null;
  patientName?: string | null;
  /** 차트번호 — PC는 content 컬럼에 저장 */
  chartNo?: string | null;
  /** '좌' | '우' | '' — title 접두사로 저장 (PC와 동일) */
  side?: '좌' | '우' | '';
  fasting?: boolean;
  inpatient?: boolean;
  guardian?: boolean;
  caregiver?: boolean;
  transfusion?: boolean;
  /** MRI일정 전용 — 조영제 필요 여부 */
  contrastRequired?: boolean;
};

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
  /** P3: 투표/설문 — PC board_posts.poll JSONB */
  poll?: BoardPollInput | null;
  /** P3: 수술/MRI 일정 메타 — op/mri 카테고리에서만 의미 있음 */
  schedule?: ScheduleMetaInput | null;
  user: { id?: string | null; name?: string | null; company?: string | null; company_id?: string | null } | null;
};

/** 게시글 수정 입력 — board_posts.update 매핑 (제목/본문/첨부/투표) */
export type UpdateBoardPostInput = {
  postId: string;
  title: string;
  content: string;
  attachments?: AttachmentItem[];
  /** null이면 기존 투표 제거 (PC editing 시 poll=null과 동일) */
  poll?: BoardPollInput | null;
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

/** @deprecated 익명소리함 보드 폐지 — 항상 false */
export function isVoiceBoardType(_boardType?: string | null): boolean {
  return false;
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
    poll = null,
    schedule = null,
    user } = input;
  const cat = BOARD_CATS.find((c) => c.id === catId);
  const boardType = cat?.boardType ?? '자유게시판';
  // 자유게시판 등에서 사용자가 선택한 익명 옵션만 반영 (익명소리함 보드 폐지)
  const useAnonymous = Boolean(anonymous);
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
          size: typeof a?.size === 'number' ? a.size : undefined }))
        .filter((a) => a.name && a.url)
    : [];

  const isSchedule = boardType === '수술일정' || boardType === 'MRI일정';

  // 일정 게시판: PC와 동일하게 content 컬럼에 차트번호를 저장 (본문 입력칸 미사용)
  const baseContent = isSchedule
    ? String(schedule?.chartNo ?? '').trim()
    : content.trim();
  const finalContent = !isSchedule && normalizedAttachments.length > 0
    ? buildAttachmentMetaContent(baseContent, normalizedAttachments)
    : baseContent;

  // 일정 게시판: title 앞에 좌/우 접두사 (PC sidePrefix)
  const sidePrefix = schedule?.side === '좌' ? '좌측 ' : schedule?.side === '우' ? '우측 ' : '';
  const finalTitle = isSchedule ? `${sidePrefix}${title.trim()}` : title.trim();

  const scheduledIso = toIsoOrNull(scheduledPublishAt);
  const statusValue = importance === 'urgent' ? '중요' : null;
  const normalizedPoll = normalizePoll(poll);

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
    poll?: BoardPollInput | null;
    schedule_date?: string | null;
    schedule_time?: string | null;
    schedule_room?: string | null;
    patient_name?: string | null;
    surgery_fasting?: boolean | null;
    surgery_inpatient?: boolean | null;
    surgery_guardian?: boolean | null;
    surgery_caregiver?: boolean | null;
    surgery_transfusion?: boolean | null;
    mri_contrast_required?: boolean | null;
  };
  const payload: InsertPayload = {
    board_type: boardType,
    title: finalTitle,
    content: finalContent,
    // JM5: 익명일 때 author_id 비식별
    author_id: useAnonymous ? null : user.id,
    author_name: useAnonymous ? '익명' : (user.name ?? '익명'),
    company: useAnonymous ? null : (user.company ?? null),
    company_id: useAnonymous ? null : (user.company_id ?? null),
    is_anonymous: useAnonymous };
  if (normalizedAttachments.length > 0) payload.attachments = normalizedAttachments;
  if (pinned) payload.is_pinned = true;
  if (statusValue) payload.status = statusValue;
  if (scheduledIso) payload.scheduled_publish_at = scheduledIso;
  if (normalizedPoll) payload.poll = normalizedPoll;
  if (isSchedule && schedule) {
    payload.schedule_date = schedule.scheduleDate || null;
    payload.schedule_time = schedule.scheduleTime || null;
    payload.schedule_room = schedule.scheduleRoom || null;
    payload.patient_name = schedule.patientName || null;
    payload.surgery_fasting = Boolean(schedule.fasting);
    payload.surgery_inpatient = Boolean(schedule.inpatient);
    payload.surgery_guardian = Boolean(schedule.guardian);
    payload.surgery_caregiver = Boolean(schedule.caregiver);
    payload.surgery_transfusion = Boolean(schedule.transfusion);
    payload.mri_contrast_required = boardType === 'MRI일정' ? Boolean(schedule.contrastRequired) : null;
  }

  try {
    let { data, error } = await db
      .from('board_posts')
      .insert([payload])
      .select()
      .single();
    // optional 컬럼이 없는 환경 → 메시지에 등장한 컬럼을 제외하고 재시도 (한 번)
    if (error) {
      const msg = String((error as { message?: string }).message ?? '');
      const optional: Array<keyof InsertPayload> = [
        'attachments', 'is_pinned', 'status', 'scheduled_publish_at', 'poll',
        'schedule_date', 'schedule_time', 'schedule_room', 'patient_name',
        'surgery_fasting', 'surgery_inpatient', 'surgery_guardian',
        'surgery_caregiver', 'surgery_transfusion', 'mri_contrast_required',
      ];
      const toOmit = optional.filter((k) => new RegExp(String(k), 'i').test(msg));
      if (toOmit.length > 0) {
        const retryPayload: InsertPayload = { ...payload };
        toOmit.forEach((k) => { delete retryPayload[k]; });
        const retry = await db.from('board_posts').insert([retryPayload]).select().single();
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

// 변경(mutation) 헬퍼는 게시판변경.ts로 분리 (JM 500줄 이내 유지).
// createBoardPost가 normalizePoll을 사용하므로 상단에서 import (위 import 블록) 후 재노출.
export { normalizePoll };
export {
  updateBoardPost,
  deleteBoardPost,
  deleteBoardComment,
  togglePollVote,
  type PollVotes } from './게시판변경';

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

