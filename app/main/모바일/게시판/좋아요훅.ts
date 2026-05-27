'use client';

/**
 * 좋아요훅 — board_post_likes 토글 + likes_count 동기화.
 *   PC 게시판.tsx handleLike 패턴을 모바일로 압축.
 * JM: 단일 책임 (좋아요 토글 + 내 좋아요 Set 로드), ~150줄 이내
 * JM3: 낙관적 → 실패 롤백 toast
 * JM4: any 금지, error code 좁히기
 * JM5: 내 user_id로만 insert/delete (eq 필터)
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';

const LIKE_TABLE = 'board_post_likes';

function isMissingTable(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code === '42P01') return true;
  return String(e.message ?? '').toLowerCase().includes('does not exist');
}

// ─────────────────────────────────────────────
// 사용자의 좋아요 Set 로드
// ─────────────────────────────────────────────

export async function loadMyLikes(userId: string | null): Promise<Set<string>> {
  if (!userId) return new Set();
  try {
    const { data, error } = await supabase
      .from(LIKE_TABLE)
      .select('post_id')
      .eq('user_id', userId);
    if (error) {
      if (isMissingTable(error)) return new Set();
      throw error;
    }
    return new Set(
      (Array.isArray(data) ? data : [])
        .map((row) => String((row as { post_id?: unknown }).post_id ?? '').trim())
        .filter(Boolean),
    );
  } catch {
    return new Set();
  }
}

// ─────────────────────────────────────────────
// 좋아요 토글 — 서버 동기화된 count 반환
// ─────────────────────────────────────────────

export type ToggleLikeResult = {
  liked: boolean;
  /** 최종 likes_count (실패 시 prevLikes 그대로) */
  likesCount: number;
  ok: boolean;
};

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

  const nextLiked = !prevLiked;

  try {
    if (prevLiked) {
      const { error } = await supabase
        .from(LIKE_TABLE)
        .delete()
        .eq('post_id', postId)
        .eq('user_id', userId);
      if (error && !isMissingTable(error)) throw error;
    } else {
      const { error } = await supabase
        .from(LIKE_TABLE)
        .insert([{ post_id: postId, user_id: userId }]);
      // 23505 = unique 충돌 → 이미 like 상태였다고 보고 진행
      if (error && (error as { code?: string }).code !== '23505' && !isMissingTable(error)) {
        throw error;
      }
    }

    // 실제 count 동기화
    const { count, error: countError } = await supabase
      .from(LIKE_TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('post_id', postId);
    const realCount = countError ? (nextLiked ? prevLikes + 1 : Math.max(prevLikes - 1, 0)) : (count ?? 0);

    // board_posts.likes_count 업데이트는 best-effort
    void supabase.from('board_posts').update({ likes_count: realCount }).eq('id', postId);

    return { liked: nextLiked, likesCount: realCount, ok: true };
  } catch (err) {
    toast(`좋아요 처리 실패: ${(err as Error)?.message ?? '오류'}`, 'error');
    return { liked: prevLiked, likesCount: prevLikes, ok: false };
  }
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
