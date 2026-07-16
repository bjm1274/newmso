/**
 * board-post-like.ts
 * board_post_likes toggle + likes_count sync.
 * Shared mutation logic for PC 게시판.tsx handleLike and mobile 좋아요훅.
 * UI/toast/optimistic state stay in the caller.
 */

import { db } from '@/lib/db-client';

const LIKE_TABLE = 'board_post_likes';

function isMissingTable(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code === '42P01') return true;
  return String(e.message ?? '').toLowerCase().includes('does not exist');
}

export type ToggleBoardPostLikeResult = {
  liked: boolean;
  likesCount: number;
  ok: boolean;
  error?: unknown;
};

/**
 * Toggle like for (userId, postId). Syncs board_posts.likes_count from COUNT(*).
 * Does not toast — callers handle UI feedback and optimistic rollback.
 */
export async function toggleBoardPostLike(
  userId: string,
  postId: string,
  prevLiked: boolean,
  prevLikes: number,
): Promise<ToggleBoardPostLikeResult> {
  if (!userId || !postId) {
    return { liked: prevLiked, likesCount: prevLikes, ok: false };
  }

  const nextLiked = !prevLiked;

  try {
    if (prevLiked) {
      const { error } = await db
        .from(LIKE_TABLE)
        .delete()
        .eq('post_id', postId)
        .eq('user_id', userId);
      if (error && !isMissingTable(error)) throw error;
    } else {
      const { error } = await db
        .from(LIKE_TABLE)
        .insert([{ post_id: postId, user_id: userId }]);
      // 23505 = unique conflict → already liked; continue
      if (error && (error as { code?: string }).code !== '23505' && !isMissingTable(error)) {
        throw error;
      }
    }

    const { count, error: countError } = await db
      .from(LIKE_TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('post_id', postId);
    const realCount = countError
      ? (nextLiked ? prevLikes + 1 : Math.max(prevLikes - 1, 0))
      : (count ?? 0);

    void db.from('board_posts').update({ likes_count: realCount }).eq('id', postId);

    return { liked: nextLiked, likesCount: realCount, ok: true };
  } catch (err) {
    return { liked: prevLiked, likesCount: prevLikes, ok: false, error: err };
  }
}

/** Load the set of post_ids the user has liked. */
export async function loadMyBoardPostLikes(userId: string | null): Promise<Set<string>> {
  if (!userId) return new Set();
  try {
    const { data, error } = await db
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
