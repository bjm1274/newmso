'use client';

/**
 * 좋아요훅 — board_post_likes 토글 + likes_count 동기화.
 *   Mutation SSOT: 기능부품/게시판서브/board-post-like.ts
 * JM: 단일 책임 (좋아요 토글 + 내 좋아요 Set 로드), ~150줄 이내
 * JM3: 낙관적 → 실패 롤백 toast
 */

import { useCallback, useEffect, useState } from 'react';
import { toast } from '@/lib/toast';
import {
  loadMyBoardPostLikes,
  toggleBoardPostLike,
  type ToggleBoardPostLikeResult,
} from '@/app/main/기능부품/게시판서브/board-post-like';

// ─────────────────────────────────────────────
// 사용자의 좋아요 Set 로드
// ─────────────────────────────────────────────

export async function loadMyLikes(userId: string | null): Promise<Set<string>> {
  return loadMyBoardPostLikes(userId);
}

// ─────────────────────────────────────────────
// 좋아요 토글 — 서버 동기화된 count 반환
// ─────────────────────────────────────────────

export type ToggleLikeResult = ToggleBoardPostLikeResult;

export async function toggleLike(
  userId: string | null,
  postId: string,
  prevLiked: boolean,
  prevLikes: number,
): Promise<ToggleLikeResult> {
  if (!userId) {
    toast('로그인한 후 좋아요를 누를 수 있습니다.', 'error');
    return { liked: prevLiked, likesCount: prevLikes, ok: false };
  }

  const result = await toggleBoardPostLike(userId, postId, prevLiked, prevLikes);
  if (!result.ok) {
    toast(`좋아요 처리 실패: ${(result.error as Error)?.message ?? '오류'}`, 'error');
  }
  return result;
}

// ─────────────────────────────────────────────
// 훅 형태
// ─────────────────────────────────────────────

export function useMyLikes(userId: string | null): {
  likeSet: Set<string>;
  reload: () => Promise<void>;
  setLikeSet: (next: Set<string>) => void;
} {
  const [likeSet, setLikeSet] = useState<Set<string>>(new Set());

  const reload = useCallback(async () => {
    const next = await loadMyLikes(userId);
    setLikeSet(next);
  }, [userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { likeSet, reload, setLikeSet };
}
