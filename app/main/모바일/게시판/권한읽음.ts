'use client';

/**
 * 권한읽음 — 게시글 수정/삭제 권한 판별 + 읽음 현황(board_post_reads) 데이터 훅.
 * PC `app/main/기능부품/게시판.tsx`의 canEditPost/canDeletePost + 읽음 모달 데이터 소스를 모바일로 압축.
 *  - canEditMobilePost / canDeleteMobilePost : 작성자 본인 또는 관리자
 *  - isAnonymousReadStatusPost : 익명 작성·익명 투표 게시글은 읽음 추적 미사용 (PC와 동일)
 *  - useReadStatus : staff_members(audience) + board_post_reads → readers/pending 분리
 * 미러 테이블: board_post_reads(post_id, user_id, read_at), staff_members(id,name,company,company_id,department,position,status)
 * JM: 단일 책임(권한·읽음), JM3(try/catch·실패 무시), JM4(any 금지)
 */

import { useCallback, useEffect, useState } from 'react';
import { db } from '@/lib/db-client';
import {
  canDeleteBoardCommentByAdminFlag,
  canDeleteBoardPostByAdminFlag,
  canEditBoardPostByAdminFlag } from '@/lib/board-permissions';
import type { BoardListPost } from './data-hooks';

// ─────────────────────────────────────────────
// 권한 — 판정은 lib/board-permissions 정본에 위임
//
// 예전에는 PC `게시판.tsx` 의 canEditPost/canDeletePost 를 import 가 아니라 여기에
// **'미러 구현'** 으로 다시 써 두었고, 그러다 실제로 갈라졌다(8차 D09-016).
// 대표적으로 익명 글이면 여기만 작성자 본인까지 막아서, 같은 사람이 PC 에서는 자기
// 익명 글을 수정할 수 있고 모바일에서는 못 했다. 아래 래퍼는 호출부 시그니처만 유지하고
// 판정은 정본 하나만 쓰도록 남겨 둔 얇은 층이다.
// ─────────────────────────────────────────────

/** 익명 작성 게시글 — 읽음 추적 판정용 */
function isAnonymousAuthorPost(post: BoardListPost | null): boolean {
  if (!post) return false;
  return Boolean((post as { is_anonymous?: boolean | null }).is_anonymous);
}

/** poll JSONB 익명 투표 여부 */
function hasAnonymousPoll(post: BoardListPost | null): boolean {
  if (!post) return false;
  let poll: unknown = (post as { poll?: unknown }).poll;
  if (typeof poll === 'string') {
    try {
      poll = JSON.parse(poll) as unknown;
    } catch {
      return false;
    }
  }
  if (!poll || typeof poll !== 'object' || Array.isArray(poll)) return false;
  return Boolean((poll as { anonymous?: unknown }).anonymous);
}

/**
 * 읽음 추적/현황 비활성 (PC isAnonymousReadStatusPost 미러).
 * 익명 작성 + 익명 투표 게시글 — 참여/미확인 노출로 익명성 훼손 방지.
 */
export function isAnonymousReadStatusPost(post: BoardListPost | null): boolean {
  if (!post) return false;
  return isAnonymousAuthorPost(post) || hasAnonymousPoll(post);
}

/** 수정 가능 — 작성자 본인 또는 관리자. 판정은 lib/board-permissions 정본. */
export function canEditMobilePost(
  post: BoardListPost | null,
  userId: string | null | undefined,
  canAdmin: boolean,
): boolean {
  return canEditBoardPostByAdminFlag(post, userId, canAdmin);
}

/** 삭제 가능 — 작성자 본인 또는 관리자. 판정은 lib/board-permissions 정본. */
export function canDeleteMobilePost(
  post: BoardListPost | null,
  userId: string | null | undefined,
  canAdmin: boolean,
): boolean {
  return canDeleteBoardPostByAdminFlag(post, userId, canAdmin);
}

/** 댓글 삭제 가능 — 댓글 작성자 본인 또는 관리자. 판정은 lib/board-permissions 정본. */
export function canDeleteMobileComment(
  commentAuthorId: string | null | undefined,
  userId: string | null | undefined,
  canAdmin: boolean,
): boolean {
  return canDeleteBoardCommentByAdminFlag(commentAuthorId, userId, canAdmin);
}

// ─────────────────────────────────────────────
// 읽음 현황 — board_post_reads + staff_members
// ─────────────────────────────────────────────

export type ReadStatusMember = {
  id: string;
  name: string;
  department?: string | null;
  position?: string | null;
  company?: string | null;
};

export type UseReadStatusResult = {
  readers: ReadStatusMember[];
  pending: ReadStatusMember[];
  loading: boolean;
  /** 읽음 현황 1회 로드 (시트 열 때 호출) */
  load: () => Promise<void>;
};

type StaffRow = {
  id?: unknown;
  name?: unknown;
  department?: unknown;
  position?: unknown;
  company?: unknown;
};

function isMissingTable(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code === '42P01') return true;
  return String(e.message ?? '').toLowerCase().includes('does not exist');
}

/**
 * 읽음 현황 데이터 — PC openReadStatusModal + readStatusReaders/Pending 미러.
 *  - 전 직원(audience) = staff_members 재직자
 *  - 읽음 = board_post_reads.user_id ∪ {author_id}
 *  - 미확인 = audience − 읽음 − author
 */
export function useReadStatus(post: BoardListPost | null): UseReadStatusResult {
  const [readers, setReaders] = useState<ReadStatusMember[]>([]);
  const [pending, setPending] = useState<ReadStatusMember[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!post || isAnonymousReadStatusPost(post)) {
      setReaders([]);
      setPending([]);
      return;
    }
    const postId = String(post.id ?? '').trim();
    if (!postId) return;
    setLoading(true);
    try {
      // 전 직원(재직자) — 회사 필터 없이 전사 대상 (PC와 동일)
      const { data: audienceData } = await db
        .from('staff_members')
        .select('id, name, company, department, position, status')
        .neq('status', '퇴사')
        .neq('status', '퇴직')
        .order('name', { ascending: true });
      const audience: ReadStatusMember[] = (Array.isArray(audienceData) ? audienceData : [])
        .map((row) => {
          const r = row as StaffRow;
          return {
            id: String(r.id ?? '').trim(),
            name: String(r.name ?? '').trim(),
            department: r.department == null ? null : String(r.department),
            position: r.position == null ? null : String(r.position),
            company: r.company == null ? null : String(r.company) };
        })
        .filter((m) => m.id);

      // 읽음 집합
      const readSet = new Set<string>();
      const { data: readRows, error: readErr } = await db
        .from('board_post_reads')
        .select('user_id')
        .eq('post_id', postId);
      if (!readErr && Array.isArray(readRows)) {
        readRows.forEach((row) => {
          const uid = String((row as { user_id?: unknown }).user_id ?? '').trim();
          if (uid) readSet.add(uid);
        });
      } else if (readErr && !isMissingTable(readErr)) {
        // 테이블 미존재 외 오류는 무시 (읽음은 보조 정보)
      }

      const authorId = String(post.author_id ?? '').trim();
      const nextReaders = audience.filter((m) => (authorId && m.id === authorId) || readSet.has(m.id));
      const nextPending = audience.filter((m) => !(authorId && m.id === authorId) && !readSet.has(m.id));
      setReaders(nextReaders);
      setPending(nextPending);
    } catch {
      // 읽음 현황 실패는 조용히 무시 (보조 정보)
    } finally {
      setLoading(false);
    }
  }, [post]);

  // post 변경 시 현황 초기화 (시트 재오픈 때 load로 다시 채움)
  useEffect(() => {
    setReaders([]);
    setPending([]);
  }, [post?.id]);

  return { readers, pending, loading, load };
}

// ─────────────────────────────────────────────
// 읽음 마킹 — 상세 진입 시 1회 upsert (PC markBoardPostRead 미러)
// board_post_reads(post_id, user_id, read_at) onConflict 'post_id,user_id'
// ─────────────────────────────────────────────

export async function markBoardPostRead(
  post: BoardListPost | null,
  userId: string | null | undefined,
): Promise<void> {
  if (!post || !userId) return;
  if (isAnonymousReadStatusPost(post)) return;
  const postId = String(post.id ?? '').trim();
  if (!postId) return;
  try {
    await db.from('board_post_reads').upsert(
      [{ post_id: postId, user_id: String(userId), read_at: new Date().toISOString() }],
      { onConflict: 'post_id,user_id' },
    );
  } catch {
    // 읽음 마킹 실패는 무시 (통계 목적)
  }
}
