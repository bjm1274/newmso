/**
 * board-poll-vote.ts
 * board_posts.poll_votes JSONB toggle — shared by PC 게시판.tsx and mobile 투표뷰.
 * Pure vote mutation + DB write; React state stays in the caller.
 */

import { db } from '@/lib/db-client';
import { toast } from '@/lib/toast';

export type PollVotes = Record<string, string[]>;

/**
 * Compute next poll_votes map without writing.
 * Single-select (!multiple): clear user's other options first, then add.
 * Already voted for this option → unvote.
 */
export function computeNextPollVotes(
  currentVotes: PollVotes,
  optIdx: number,
  userId: string,
  multiple: boolean,
): PollVotes {
  const key = String(optIdx);
  const next: PollVotes = {};
  Object.keys(currentVotes || {}).forEach((k) => {
    next[k] = Array.isArray(currentVotes[k]) ? [...currentVotes[k]] : [];
  });
  const already = Array.isArray(next[key]) && next[key].includes(userId);
  if (already) {
    next[key] = next[key].filter((id) => id !== userId);
  } else {
    if (!multiple) {
      Object.keys(next).forEach((k) => {
        next[k] = next[k].filter((id) => id !== userId);
      });
    }
    next[key] = [...(next[key] || []), userId];
  }
  return next;
}

/**
 * Toggle a poll option vote and persist poll_votes.
 * Returns the next votes map, or null on failure / missing ids.
 */
export async function togglePollVote(
  postId: string,
  optIdx: number,
  userId: string,
  currentVotes: PollVotes,
  multiple: boolean,
  options?: { silent?: boolean },
): Promise<PollVotes | null> {
  if (!postId || !userId) return null;
  const next = computeNextPollVotes(currentVotes, optIdx, userId, multiple);
  try {
    const { error } = await db
      .from('board_posts')
      .update({ poll_votes: next })
      .eq('id', postId);
    if (error) throw error;
    return next;
  } catch (err) {
    if (!options?.silent) {
      toast(`투표 실패: ${(err as Error)?.message ?? '오류'}`, 'error');
    }
    return null;
  }
}
