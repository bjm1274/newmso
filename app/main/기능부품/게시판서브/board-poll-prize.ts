/**
 * board-poll-prize.ts
 * 게시판 투표 상품 추첨 관련 타입 정의 및 핵심 로직.
 * 화면 렌더링(React)과 분리하여 순수 비즈니스 로직만 보유.
 */

import { supabase } from '@/lib/d1-supabase-compat';
import { logger } from '@/lib/logger';

// ─── 타입 ────────────────────────────────────────────────────────────────────

export type BoardPollPrize = {
  winnerCount: number;
  name: string;
};

export type BoardPollPrizeWinner = {
  id: string;
  name: string;
};

/**
 * board_posts.poll JSONB 의 완전한 타입.
 * 추첨 미설정 시 prize / prizeWinners 는 undefined(absent).
 */
export type BoardPoll = {
  question: string;
  options: string[];
  anonymous: boolean;
  multiple: boolean;
  prize?: BoardPollPrize;
  prizeWinners?: BoardPollPrizeWinner[];
};

type PrizeStaffRow = {
  id: string | null;
  name: string | null;
};

// ─── Fisher-Yates 셔플 (순수 함수) ───────────────────────────────────────────

function fisherYatesShuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// ─── 참여자 수집 ──────────────────────────────────────────────────────────────

/** poll_votes JSONB( Record<string, string[]> )에서 고유 user_id 수집 */
export function collectParticipantIds(
  pollVotes: Record<string, unknown> | null | undefined,
): string[] {
  if (!pollVotes || typeof pollVotes !== 'object') return [];
  const seen = new Set<string>();
  for (const val of Object.values(pollVotes)) {
    if (!Array.isArray(val)) continue;
    for (const id of val) {
      const sid = String(id ?? '').trim();
      if (sid) seen.add(sid);
    }
  }
  return [...seen];
}

// ─── 추첨 핵심 함수 ───────────────────────────────────────────────────────────

export type DrawPollPrizeParams = {
  postId: string;
  poll: BoardPoll;
  pollVotes: Record<string, unknown> | null | undefined;
  /** 추첨 실행자 (게시글 작성자) 정보 */
  actorId: string;
  actorName: string;
};

export type DrawPollPrizeResult =
  | { ok: true; winners: BoardPollPrizeWinner[] }
  | { ok: false; reason: 'no_prize' | 'already_drawn' | 'no_participants' | 'error'; message: string };

/**
 * 추첨을 실행하고 DB를 업데이트한 뒤 댓글을 자동 삽입합니다.
 * - prize 미설정 → ok:false(no_prize)
 * - 이미 추첨 완료  → ok:false(already_drawn)
 * - 참여자 0명     → ok:false(no_participants)
 * - DB 오류        → ok:false(error)
 */
export async function drawBoardPollPrize(
  params: DrawPollPrizeParams,
): Promise<DrawPollPrizeResult> {
  const { postId, poll, pollVotes, actorId, actorName } = params;

  // 1. 사전 조건 검사
  if (!poll.prize) {
    return { ok: false, reason: 'no_prize', message: '이 투표에는 추첨 설정이 없습니다.' };
  }
  if (poll.prizeWinners && poll.prizeWinners.length > 0) {
    return { ok: false, reason: 'already_drawn', message: '이미 추첨이 완료된 투표입니다.' };
  }

  const participantIds = collectParticipantIds(pollVotes);
  if (participantIds.length === 0) {
    return { ok: false, reason: 'no_participants', message: '투표 참여자가 없어 추첨할 수 없습니다.' };
  }

  try {
    // 2. Fisher-Yates 셔플 후 당첨자 선정
    const shuffled = fisherYatesShuffle(participantIds);
    const selectedIds = shuffled.slice(0, Math.min(poll.prize.winnerCount, shuffled.length));

    // 3. staff_members 에서 이름 조회 (단일 쿼리)
    const { data: staffRows, error: staffError } = await supabase
      .from('staff_members')
      .select('id, name')
      .in('id', selectedIds);

    if (staffError) {
      logger.error('[board-poll-prize] staff 조회 실패', staffError);
      throw staffError;
    }

    const staffList = (Array.isArray(staffRows) ? staffRows : []) as PrizeStaffRow[];
    const winners: BoardPollPrizeWinner[] = selectedIds.map((id) => {
      const found = staffList.find((s) => String(s.id) === id);
      return { id, name: String(found?.name ?? '알 수 없음') };
    });

    // 4. board_posts.poll 에 prizeWinners 추가 업데이트
    const updatedPoll: BoardPoll = { ...poll, prizeWinners: winners };
    const { error: updateError } = await supabase
      .from('board_posts')
      .update({ poll: updatedPoll })
      .eq('id', postId);

    if (updateError) {
      logger.error('[board-poll-prize] poll update 실패', updateError);
      throw updateError;
    }

    // 5. 추첨 결과 댓글 자동 삽입 (실패해도 추첨 자체는 성공 처리)
    const winnerNames = winners.map((w) => w.name).join(', ');
    const commentContent =
      `🎉 추첨 결과\n🎁 상품: ${poll.prize.name}\n🏆 당첨: ${winnerNames}`;

    const { error: commentError } = await supabase
      .from('board_post_comments')
      .insert([{
        post_id: postId,
        author_id: actorId,
        author_name: actorName,
        content: commentContent,
        parent_comment_id: null,
      }]);

    if (commentError) {
      // 추첨 성공·댓글 실패는 경고 수준으로만 처리
      logger.warn('[board-poll-prize] 추첨 결과 댓글 삽입 실패', commentError);
    }

    return { ok: true, winners };
  } catch (err) {
    logger.error('[board-poll-prize] 추첨 실패', err);
    return { ok: false, reason: 'error', message: '추첨 중 오류가 발생했습니다.' };
  }
}
