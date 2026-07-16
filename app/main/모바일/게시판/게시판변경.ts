'use client';

/**
 * 게시판 모바일 — 변경(mutation) 헬퍼.
 * PC `app/main/기능부품/게시판.tsx`의 update/delete/투표 경로를 발췌해 모바일 전용으로 압축.
 *  - updateBoardPost : board_posts.update (제목/본문/첨부/투표)
 *  - deleteBoardPost : board_posts.delete (하드 삭제, PC handleDeletePost 미러)
 *  - deleteBoardComment : board_post_comments.delete (답글 먼저, PC handleDeleteComment 미러)
 *  - togglePollVote : re-export from 게시판서브/board-poll-vote (PC·모바일 SSOT)
 * JM: 단일 책임 (변경 계층), JM3(try/catch + toast), JM4(any 금지)
 */

import { db } from '@/lib/db-client';
import { toast } from '@/lib/toast';
import type { AttachmentItem } from '@/types';
import { buildAttachmentMetaContent } from '@/app/main/기능부품/게시판공통';
import {
  normalizePoll,
  type BoardPollInput,
} from '@/app/main/기능부품/게시판서브/create-board-post';
import type { UpdateBoardPostInput } from './data-hooks';

export { normalizePoll };

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
          size: typeof a?.size === 'number' ? a.size : undefined }))
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
    let { error } = await db.from('board_posts').update(payload).eq('id', postId);
    if (error) {
      const msg = String((error as { message?: string }).message ?? '');
      const optional: Array<keyof UpdatePayload> = ['attachments', 'poll'];
      const toOmit = optional.filter((k) => new RegExp(String(k), 'i').test(msg));
      if (toOmit.length > 0) {
        const retryPayload: UpdatePayload = { ...payload };
        toOmit.forEach((k) => { delete retryPayload[k]; });
        const retry = await db.from('board_posts').update(retryPayload).eq('id', postId);
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
    const { error } = await db.from('board_posts').delete().eq('id', postId);
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
    await db.from('board_post_comments').delete().eq('parent_comment_id', commentId);
    const { error } = await db.from('board_post_comments').delete().eq('id', commentId);
    if (error) throw error;
    return true;
  } catch (err) {
    toast(`댓글 삭제 실패: ${(err as Error)?.message ?? '오류'}`, 'error');
    return false;
  }
}

// ─────────────────────────────────────────────
// 투표 — shared board-poll-vote re-export (PC·모바일 SSOT)
// ─────────────────────────────────────────────

export {
  togglePollVote,
  computeNextPollVotes,
  type PollVotes,
} from '@/app/main/기능부품/게시판서브/board-poll-vote';
