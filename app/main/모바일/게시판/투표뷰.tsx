'use client';

/**
 * 투표뷰 — 게시글 상세의 투표/설문 + 상품 추첨 영역.
 * PC `게시판.tsx`의 투표 표시·handlePostPollVote·handleDrawPrize를 모바일로 압축.
 *   - poll(JSONB) 옵션별 득표/퍼센트 막대 + 내 투표 ✓
 *   - 단일/복수 선택 토글 (togglePollVote → board_posts.poll_votes JSONB)
 *   - 상품 추첨: 작성자만 '추첨하기' → drawBoardPollPrize (board_posts.poll.prizeWinners)
 * 미러: board_posts.poll / poll_votes, drawBoardPollPrize(게시판서브/board-poll-prize.ts)
 * JM: 단일 책임(투표 UI), JM3(toast), JM4(any 금지), JM6(button·aria)
 */

import { useCallback, useState } from 'react';
import {
  drawBoardPollPrize,
  type BoardPoll,
  type BoardPollPrizeWinner } from '@/app/main/기능부품/게시판서브/board-poll-prize';
import { togglePollVote, type PollVotes } from './게시판변경';
import { toast } from '@/lib/toast';

export type BoardPollViewProps = {
  postId: string;
  poll: BoardPoll;
  pollVotes: PollVotes;
  postTitle: string;
  currentUserId: string | null;
  /** 작성자 본인 여부 — 추첨 버튼 게이트 */
  isAuthor: boolean;
  currentUserName: string | null;
  /** 낙관적 갱신 — 부모 post 상태 동기화 */
  onVotesChange: (votes: PollVotes) => void;
  onPollChange: (poll: BoardPoll) => void;
  /** 추첨 후 댓글(결과) 새로고침 */
  onRefetchComments: () => Promise<void>;
};

function parsePollVotes(value: unknown): PollVotes {
  if (!value || typeof value !== 'object') return {};
  const out: PollVotes = {};
  Object.entries(value as Record<string, unknown>).forEach(([k, v]) => {
    if (Array.isArray(v)) out[k] = v.map((id) => String(id ?? '')).filter(Boolean);
  });
  return out;
}

/** board_posts.poll(JSONB) 안전 파싱 — 옵션 2개 미만이면 null */
export function extractPoll(raw: unknown): BoardPoll | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const options = Array.isArray(obj.options)
    ? obj.options.map((o) => String(o ?? '').trim()).filter(Boolean)
    : [];
  if (options.length < 2) return null;
  const poll: BoardPoll = {
    question: String(obj.question ?? ''),
    options,
    anonymous: Boolean(obj.anonymous),
    multiple: Boolean(obj.multiple) };
  const prize = obj.prize as { winnerCount?: unknown; name?: unknown } | undefined;
  if (prize && typeof prize === 'object' && String(prize.name ?? '').trim()) {
    poll.prize = {
      winnerCount: Number(prize.winnerCount) >= 1 ? Number(prize.winnerCount) : 1,
      name: String(prize.name).trim() };
  }
  if (Array.isArray(obj.prizeWinners)) {
    poll.prizeWinners = obj.prizeWinners
      .map((w) => {
        const ww = w as { id?: unknown; name?: unknown };
        return { id: String(ww.id ?? ''), name: String(ww.name ?? '') };
      })
      .filter((w) => w.id);
  }
  return poll;
}

export { parsePollVotes };

export default function BoardPollView({
  postId,
  poll,
  pollVotes,
  postTitle,
  currentUserId,
  isAuthor,
  currentUserName,
  onVotesChange,
  onPollChange,
  onRefetchComments }: BoardPollViewProps) {
  const [voting, setVoting] = useState(false);
  const [drawing, setDrawing] = useState(false);

  const votes = pollVotes || {};
  const totalVotes = Object.values(votes).reduce(
    (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0),
    0,
  );
  const prizeWinners: BoardPollPrizeWinner[] = Array.isArray(poll.prizeWinners) ? poll.prizeWinners : [];
  const alreadyDrawn = prizeWinners.length > 0;
  const hasPrize = Boolean(poll.prize);

  const handleVote = useCallback(
    async (optIdx: number) => {
      if (!currentUserId) {
        toast('로그인한 후 투표할 수 있습니다.', 'error');
        return;
      }
      if (voting) return;
      setVoting(true);
      const next = await togglePollVote(postId, optIdx, currentUserId, votes, Boolean(poll.multiple));
      if (next) onVotesChange(next);
      setVoting(false);
    },
    [currentUserId, voting, postId, votes, poll.multiple, onVotesChange],
  );

  const handleDraw = useCallback(async () => {
    if (!isAuthor || !currentUserId || drawing) return;
    setDrawing(true);
    try {
      const result = await drawBoardPollPrize({
        postId,
        poll,
        pollVotes: votes,
        actorId: currentUserId,
        actorName: currentUserName ?? '관리자' });
      if (!result.ok) {
        toast(result.message, 'warning');
        return;
      }
      onPollChange({ ...poll, prizeWinners: result.winners });
      await onRefetchComments();
      toast(`🎉 추첨 완료! 당첨자: ${result.winners.map((w) => w.name).join(', ')}`, 'success');
    } finally {
      setDrawing(false);
    }
  }, [isAuthor, currentUserId, drawing, postId, poll, votes, currentUserName, onPollChange, onRefetchComments]);

  return (
    <div
      style={{
        border: '1px solid var(--m-accent)',
        background: 'var(--m-accent-soft)',
        borderRadius: 14,
        padding: 14,
        marginBottom: 16 }}
    >
      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--z-900)' }}>
        {poll.question || postTitle}
      </div>
      {poll.anonymous && (
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--z-500)', marginTop: 2 }}>익명 투표</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
        {(poll.options || []).map((opt, i) => {
          const optVotes = Array.isArray(votes[String(i)]) ? votes[String(i)].length : 0;
          const pct = totalVotes > 0 ? Math.round((optVotes / totalVotes) * 100) : 0;
          const myVote = Array.isArray(votes[String(i)]) && votes[String(i)].includes(String(currentUserId));
          return (
            <button
              key={`${opt}-${i}`}
              type="button"
              onClick={() => void handleVote(i)}
              disabled={voting}
              aria-pressed={myVote}
              aria-label={`${opt} 투표 ${optVotes}표 ${pct}퍼센트`}
              style={{
                position: 'relative',
                overflow: 'hidden',
                width: '100%',
                textAlign: 'left',
                borderRadius: 10,
                border: myVote ? '1px solid var(--m-accent)' : '1px solid var(--m-border)',
                background: 'var(--m-card)',
                padding: '12px',
                opacity: voting ? 0.7 : 1 }}
            >
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: `${pct}%`,
                  background: 'var(--m-accent-soft)',
                  transition: 'width .2s' }}
              />
              <span
                style={{
                  position: 'relative',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 8 }}
              >
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--z-900)' }}>
                  {myVote ? '✓ ' : ''}
                  {opt}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--z-500)' }}>
                  {optVotes}표 ({pct}%)
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--z-500)', marginTop: 8 }}>
        총 {totalVotes}표 · {poll.multiple ? '복수 선택' : '단일 선택'}
      </div>

      {hasPrize && poll.prize && (
        <div style={{ borderTop: '1px solid var(--m-border)', marginTop: 12, paddingTop: 12 }}>
          {alreadyDrawn ? (
            <div
              style={{
                background: 'var(--m-warning-soft, #fff7ed)',
                borderRadius: 10,
                padding: '8px 10px' }}
            >
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--m-warning, #b45309)' }}>
                🎁 상품: {poll.prize.name}
              </div>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--z-800)', marginTop: 2 }}>
                🏆 당첨: {prizeWinners.map((w) => w.name).join(', ')}
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--z-600)', marginBottom: 6 }}>
                🎁 상품: {poll.prize.name} (당첨 {poll.prize.winnerCount}명)
              </div>
              {isAuthor && (
                <button
                  type="button"
                  onClick={() => void handleDraw()}
                  disabled={drawing}
                  aria-label="투표 참여자 중 상품 당첨자 추첨"
                  style={{
                    padding: '10px 16px',
                    borderRadius: 10,
                    background: 'var(--m-warning, #f59e0b)',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 800,
                    opacity: drawing ? 0.5 : 1 }}
                >
                  {drawing ? '추첨 중…' : '🎁 추첨하기'}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
