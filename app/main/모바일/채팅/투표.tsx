'use client';

/**
 * 모바일 채팅 투표 UI.
 *  - PollComposerSheet: 새 투표 만들기 (질문 + 선택지 + 마감시간)
 *  - PollCard: 메시지 영역 상단에 투표 카드 렌더 + 즉시 투표
 *
 * PC 메신저투표모달.PollComposerModal / 메신저타임라인 poll 카드의 모바일 버전.
 * 데이터 모델은 메시지액션.ts(createMobilePoll/voteMobilePoll/fetchRoomPolls)에서
 * PC 메신저입력워크플로훅과 동일하게 처리한다(polls / poll_votes).
 *
 * 제약: JM(단일 책임 + 500줄 이내), JM4(any 금지), JM6(button/label + aria).
 */

import { useState } from 'react';
import MSheet from '../공통/MSheet';
import MIcon from '../공통/MIcon';
import { extractPollMetaFromQuestion, toChatDate } from '@/app/main/기능부품/메신저유틸';
import type { MobilePoll } from './메시지액션';

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 8;

export type PollComposerSheetProps = {
  open: boolean;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (input: { question: string; options: string[]; deadlineAt: string }) => void;
};

export function PollComposerSheet({ open, submitting, onClose, onSubmit }: PollComposerSheetProps) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [deadlineAt, setDeadlineAt] = useState('');

  const reset = () => {
    setQuestion('');
    setOptions(['', '']);
    setDeadlineAt('');
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    fontSize: 14,
    fontFamily: 'inherit',
    background: 'var(--m-bg)',
    border: '1px solid var(--m-border)',
    borderRadius: 10,
    outline: 'none',
    color: 'var(--z-900)',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 800,
    color: 'var(--z-600)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    marginBottom: 6,
    display: 'block',
  };

  return (
    <MSheet open={open} onClose={handleClose} title="새 투표 만들기">
      <div style={{ padding: '8px 20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={labelStyle} htmlFor="m-poll-question">질문</label>
          <input
            id="m-poll-question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="예: 이번 주 회의 시간은 언제가 좋을까요?"
            style={inputStyle}
            disabled={submitting}
          />
        </div>

        <div>
          <label style={labelStyle} htmlFor="m-poll-deadline">마감시간 (선택)</label>
          <input
            id="m-poll-deadline"
            type="datetime-local"
            value={deadlineAt}
            onChange={(e) => setDeadlineAt(e.target.value)}
            style={inputStyle}
            disabled={submitting}
          />
        </div>

        <div>
          <label style={labelStyle}>선택지</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {options.map((option, index) => (
              <div key={index} style={{ display: 'flex', gap: 8 }}>
                <input
                  value={option}
                  aria-label={`선택지 ${index + 1}`}
                  onChange={(e) =>
                    setOptions((prev) => prev.map((o, i) => (i === index ? e.target.value : o)))
                  }
                  placeholder={`선택지 ${index + 1}`}
                  style={{ ...inputStyle, flex: 1 }}
                  disabled={submitting}
                />
                {options.length > MIN_OPTIONS && (
                  <button
                    type="button"
                    aria-label={`선택지 ${index + 1} 삭제`}
                    onClick={() => setOptions((prev) => prev.filter((_, i) => i !== index))}
                    disabled={submitting}
                    style={{
                      width: 44,
                      borderRadius: 10,
                      background: 'var(--m-accent-soft)',
                      color: 'var(--m-danger, #ef4444)',
                      border: 'none',
                      display: 'grid',
                      placeItems: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <MIcon name="x" size={16} />
                  </button>
                )}
              </div>
            ))}
            {options.length < MAX_OPTIONS && (
              <button
                type="button"
                onClick={() => setOptions((prev) => [...prev, ''])}
                disabled={submitting}
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '2px dashed var(--m-border)',
                  borderRadius: 10,
                  background: 'transparent',
                  color: 'var(--z-500)',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                + 항목 추가
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            style={{
              flex: 1,
              padding: '12px',
              borderRadius: 10,
              background: 'var(--m-bg)',
              color: 'var(--z-700)',
              fontSize: 13,
              fontWeight: 800,
              border: 'none',
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => onSubmit({ question, options, deadlineAt })}
            disabled={submitting}
            style={{
              flex: 1,
              padding: '12px',
              borderRadius: 10,
              background: 'var(--m-accent)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 800,
              border: 'none',
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? '생성 중…' : '투표 생성'}
          </button>
        </div>
      </div>
    </MSheet>
  );
}

export type PollCardProps = {
  poll: MobilePoll;
  voteCounts: Record<number, number>;
  myVote: number | undefined;
  voting: boolean;
  onVote: (pollId: string, optionIndex: number) => void;
};

export function PollCard({ poll, voteCounts, myVote, voting, onVote }: PollCardProps) {
  const { displayQuestion, deadlineAt } = extractPollMetaFromQuestion(poll.question);
  const totalVotes = Object.values(voteCounts).reduce((sum, n) => sum + n, 0);
  const deadlinePassed = (() => {
    if (!deadlineAt) return false;
    const dt = toChatDate(deadlineAt);
    return !Number.isNaN(dt.getTime()) && dt.getTime() < Date.now();
  })();

  return (
    <div
      style={{
        background: 'var(--m-card)',
        border: '1px solid var(--m-border)',
        borderRadius: 14,
        padding: '14px 16px',
        margin: '8px 0',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <MIcon name="list" size={16} color="var(--m-accent)" />
        <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--m-accent)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          투표
        </span>
        {deadlinePassed && (
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--z-500)', marginLeft: 'auto' }}>마감됨</span>
        )}
      </div>
      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--z-900)', marginBottom: 12, lineHeight: 1.4 }}>
        {displayQuestion || '(질문 없음)'}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {poll.options.map((option, index) => {
          const count = voteCounts[index] || 0;
          const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
          const mine = myVote === index;
          return (
            <button
              key={index}
              type="button"
              aria-label={`${option} — ${count}표${mine ? ' (내 선택)' : ''}`}
              aria-pressed={mine}
              onClick={() => onVote(poll.id, index)}
              disabled={voting || deadlinePassed}
              style={{
                position: 'relative',
                width: '100%',
                padding: '10px 12px',
                borderRadius: 10,
                border: mine ? '1px solid var(--m-accent)' : '1px solid var(--m-border)',
                background: 'var(--m-bg)',
                overflow: 'hidden',
                cursor: voting || deadlinePassed ? 'not-allowed' : 'pointer',
                textAlign: 'left',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: `${pct}%`,
                  background: mine ? 'var(--m-accent-soft)' : 'var(--accent-tint)',
                  transition: 'width 0.3s ease',
                }}
              />
              <span style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--z-900)' }}>
                  {mine && '✓ '}
                  {option}
                </span>
                <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--m-accent)', whiteSpace: 'nowrap' }}>
                  {count}표 · {pct}%
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 600, marginTop: 10 }}>
        총 {totalVotes}명 참여
      </div>
    </div>
  );
}
