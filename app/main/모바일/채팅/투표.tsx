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
    padding: '11px 14px',
    fontSize: 14,
    fontFamily: 'inherit',
    background: 'rgba(120, 120, 128, 0.08)',
    border: '1px solid rgba(120, 120, 128, 0.15)',
    outline: 'none',
    color: 'var(--z-900)',
    transition: 'all 0.2s',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 700,
    color: 'var(--z-600)',
    letterSpacing: '-0.01em',
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
            className="macos-squircle-sm"
            disabled={submitting}
            onFocus={(e) => {
              e.target.style.borderColor = '#007AFF';
              e.target.style.background = 'rgba(255, 255, 255, 0.85)';
            }}
            onBlur={(e) => {
              e.target.style.borderColor = 'rgba(120, 120, 128, 0.15)';
              e.target.style.background = 'rgba(120, 120, 128, 0.08)';
            }}
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
            className="macos-squircle-sm"
            disabled={submitting}
            onFocus={(e) => {
              e.target.style.borderColor = '#007AFF';
              e.target.style.background = 'rgba(255, 255, 255, 0.85)';
            }}
            onBlur={(e) => {
              e.target.style.borderColor = 'rgba(120, 120, 128, 0.15)';
              e.target.style.background = 'rgba(120, 120, 128, 0.08)';
            }}
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
                  className="macos-squircle-sm"
                  disabled={submitting}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#007AFF';
                    e.target.style.background = 'rgba(255, 255, 255, 0.85)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = 'rgba(120, 120, 128, 0.15)';
                    e.target.style.background = 'rgba(120, 120, 128, 0.08)';
                  }}
                />
                {options.length > MIN_OPTIONS && (
                  <button
                    type="button"
                    aria-label={`선택지 ${index + 1} 삭제`}
                    onClick={() => setOptions((prev) => prev.filter((_, i) => i !== index))}
                    disabled={submitting}
                    className="macos-squircle-sm"
                    style={{
                      width: 44,
                      background: 'rgba(255, 59, 48, 0.12)',
                      color: '#FF3B30',
                      border: 'none',
                      display: 'grid',
                      placeItems: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
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
                className="macos-squircle-sm"
                style={{
                  width: '100%',
                  padding: '11px',
                  border: '1px dashed rgba(120, 120, 128, 0.3)',
                  borderRadius: 10,
                  background: 'rgba(120, 120, 128, 0.04)',
                  color: 'var(--z-500)',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                + 항목 추가
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, paddingTop: 6 }}>
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className="macos-squircle-sm"
            style={{
              flex: 1,
              padding: '13px',
              background: 'rgba(120, 120, 128, 0.16)',
              color: 'var(--z-800)',
              fontSize: 14,
              fontWeight: 600,
              border: 'none',
              cursor: submitting ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s',
            }}
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => onSubmit({ question, options, deadlineAt })}
            disabled={submitting || !question.trim() || options.filter(o => o.trim()).length < 2}
            className="macos-squircle-sm"
            style={{
              flex: 1,
              padding: '13px',
              background: (question.trim() && options.filter(o => o.trim()).length >= 2)
                ? 'linear-gradient(135deg, #007AFF, #0A55E1)'
                : 'rgba(120, 120, 128, 0.08)',
              color: (question.trim() && options.filter(o => o.trim()).length >= 2)
                ? '#fff'
                : 'rgba(120, 120, 128, 0.35)',
              fontSize: 14,
              fontWeight: 600,
              border: 'none',
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.7 : 1,
              boxShadow: (question.trim() && options.filter(o => o.trim()).length >= 2)
                ? '0 4px 12px rgba(0, 122, 255, 0.3)'
                : 'none',
              transition: 'all 0.2s',
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
      className="macos-glass macos-squircle"
      style={{
        background: 'rgba(255, 255, 255, 0.65)',
        padding: '16px',
        margin: '12px 0',
        border: '1px solid rgba(255, 255, 255, 0.4)',
        boxShadow: '0 4px 24px rgba(0, 0, 0, 0.03)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <MIcon name="list" size={15} color="#007AFF" />
        <span style={{ fontSize: 12, fontWeight: 800, color: '#007AFF', letterSpacing: '0.02em' }}>
          투표 진행중
        </span>
        {deadlinePassed && (
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--z-500)', marginLeft: 'auto', background: 'rgba(120, 120, 128, 0.1)', padding: '2px 6px', borderRadius: 4 }}>
            마감됨
          </span>
        )}
      </div>
      <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--z-900)', marginBottom: 14, lineHeight: 1.45 }}>
        {displayQuestion || '(질문 없음)'}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
              className="macos-glass macos-squircle-sm"
              style={{
                position: 'relative',
                width: '100%',
                padding: '12px 14px',
                border: mine ? '1.5px solid #007AFF' : '1px solid rgba(120, 120, 128, 0.15)',
                background: mine ? 'rgba(0, 122, 255, 0.03)' : 'rgba(255, 255, 255, 0.45)',
                overflow: 'hidden',
                cursor: voting || deadlinePassed ? 'not-allowed' : 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s',
                boxShadow: mine ? '0 2px 8px rgba(0, 122, 255, 0.08)' : 'none',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: `${pct}%`,
                  background: mine ? 'rgba(0, 122, 255, 0.12)' : 'rgba(120, 120, 128, 0.06)',
                  transition: 'width 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
              />
              <span style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--z-900)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  {mine && <MIcon name="check" size={14} color="#007AFF" />}
                  {option}
                </span>
                <span style={{ fontSize: 12, fontWeight: 800, color: mine ? '#007AFF' : 'var(--z-500)', whiteSpace: 'nowrap' }}>
                  {count}표 ({pct}%)
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 12, color: 'var(--z-500)', fontWeight: 600, marginTop: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
        <MIcon name="users" size={13} color="var(--z-400)" />
        총 {totalVotes}명 참여
      </div>
    </div>
  );
}
