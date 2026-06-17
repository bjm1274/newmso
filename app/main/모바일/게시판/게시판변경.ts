'use client';

/**
 * 게시판 모바일 — 변경(mutation) 헬퍼.
 * PC `app/main/기능부품/게시판.tsx`의 update/delete/투표 경로를 발췌해 모바일 전용으로 압축.
 *  - updateBoardPost : board_posts.update (제목/본문/첨부/투표)
 *  - deleteBoardPost : board_posts.delete (하드 삭제, PC handleDeletePost 미러)
 *  - deleteBoardComment : board_post_comments.delete (답글 먼저, PC handleDeleteComment 미러)
 *  - togglePollVote : board_posts.poll_votes JSONB 토글 (PC handlePostPollVote 미러)
 * JM: 단일 책임 (변경 계층), JM3(try/catch + toast), JM4(any 금지)
 */

import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import type { AttachmentItem } from '@/types';
import { buildAttachmentMetaContent } from '@/app/main/기능부품/게시판공통';
import type { BoardPollInput, UpdateBoardPostInput } from './data-hooks';

/** 투표 입력 정규화 — 옵션 2개 미만이면 null (PC와 동일 정책) */
export function normalizePoll(poll: BoardPollInput | null | undefined): BoardPollInput | null {
  if (!poll) return null;
  const options = (Array.isArray(poll.options) ? poll.options : [])
    .map((o) => String(o ?? '').trim())
    .filter(Boolean);
  if (options.length < 2) return null;
  const normalized: BoardPollInput = {
    question: String(poll.question ?? '').trim(),
    options,
    anonymous: Boolean(poll.anonymous),
    multiple: Boolean(poll.multiple),
  };
  if (poll.prize && poll.prize.name.trim() && poll.prize.winnerCount >= 1) {
    normalized.prize = { winnerCount: poll.prize.winnerCount, name: poll.prize.name.trim() };
  }
  return normalized;
}

// ─────────────────────────────────────────────
// 게시글 수정(update) — board_posts.update 매핑 (제목/본문/첨부/투표)
// PC handleEditPostStart + 저장 경로를 모바일용으로 압축
// ─────────────────────────────────────────────

export async function updateBoardPost(input: UpdateBoardPostInput): Promise<boolean> {
  const { postId, title, content, attachments, poll } = input;
  if (!postId) return false;

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
  // poll === undefined → 투표 필드 미변경 / null → 투표 제거 (PC editing: poll=null)
  const normalizedPoll = poll === undefined ? undefined : normalizePoll(poll);

  type UpdatePayload = {
    title: string;
    content: string;
    attachments?: AttachmentItem[];
    poll?: BoardPollInput | null;
  };
  const payload: UpdatePayload = { title: title.trim(), content: finalContent };
  if (normalizedAttachments.length > 0) payload.attachments = normalizedAttachments;
  if (poll !== undefined) payload.poll = normalizedPoll ?? null;

  try {
    let { error } = await supabase.from('board_posts').update(payload).eq('id', postId);
    if (error) {
      const msg = String((error as { message?: string }).message ?? '');
      const optional: Array<keyof UpdatePayload> = ['attachments', 'poll'];
      const toOmit = optional.filter((k) => new RegExp(String(k), 'i').test(msg));
      if (toOmit.length > 0) {
        const retryPayload: UpdatePayload = { ...payload };
        toOmit.forEach((k) => { delete retryPayload[k]; });
        const retry = await supabase.from('board_posts').update(retryPayload).eq('id', postId);
        error = retry.error;
      }
    }
    if (error) throw error;
    return true;
  } catch (err) {
    toast(`수정 실패: ${(err as Error)?.message ?? '오류'}`, 'error');
    return false;
  }
}

// ─────────────────────────────────────────────
// 게시글 삭제(delete) — PC handleDeletePost와 동일 (하드 삭제)
// ─────────────────────────────────────────────

export async function deleteBoardPost(postId: string): Promise<boolean> {
  if (!postId) return false;
  try {
    const { error } = await supabase.from('board_posts').delete().eq('id', postId);
    if (error) throw error;
    return true;
  } catch (err) {
    toast(`게시물 삭제 실패: ${(err as Error)?.message ?? '오류'}`, 'error');
    return false;
  }
}

// ─────────────────────────────────────────────
// 댓글 삭제(delete) — PC handleDeleteComment와 동일
// 자식 댓글(parent_comment_id) 먼저 삭제 후 대상 삭제
// ─────────────────────────────────────────────

export async function deleteBoardComment(commentId: string): Promise<boolean> {
  if (!commentId) return false;
  try {
    // 답글 먼저 삭제 (PC와 동일 순서)
    await supabase.from('board_post_comments').delete().eq('parent_comment_id', commentId);
    const { error } = await supabase.from('board_post_comments').delete().eq('id', commentId);
    if (error) throw error;
    return true;
  } catch (err) {
    toast(`댓글 삭제 실패: ${(err as Error)?.message ?? '오류'}`, 'error');
    return false;
  }
}

// ─────────────────────────────────────────────
// 투표 — 옵션 토글 (board_posts.poll_votes JSONB 업데이트, PC handlePostPollVote 미러)
// ─────────────────────────────────────────────

export type PollVotes = Record<string, string[]>;

/**
 * poll_votes JSONB를 낙관적으로 계산해 반환 + DB 업데이트.
 * 단일 선택(!multiple)일 경우 기존 표를 제거한 뒤 추가.
 * 이미 해당 옵션에 투표했으면 취소.
 */
export async function togglePollVote(
  postId: string,
  optIdx: number,
  userId: string,
  currentVotes: PollVotes,
  multiple: boolean,
): Promise<PollVotes | null> {
  if (!postId || !userId) return null;
  const key = String(optIdx);
  const next: PollVotes = {};
  // deep copy
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
  try {
    const { error } = await supabase
      .from('board_posts')
      .update({ poll_votes: next })
      .eq('id', postId);
    if (error) throw error;
    return next;
  } catch (err) {
    toast(`투표 실패: ${(err as Error)?.message ?? '오류'}`, 'error');
    return null;
  }
}
