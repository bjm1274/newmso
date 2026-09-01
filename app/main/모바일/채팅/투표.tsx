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
  onSubmit: (input: { question: string; options: string[]; deadlineAt: string; anonymous: boolean }) => void;
};

export function PollComposerSheet({ open, submitting, onClose, onSubmit }: PollComposerSheetProps) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [deadlineAt, setDeadlineAt] = useState('');
  const [anonymous, setAnonymous] = useState(false);

  const reset = () => {
    setQuestion('');
    setOptions(['', '']);
    setDeadlineAt('');
    setAnonymous(false);
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
    background: 'var(--z-200)',
    border: '1px solid rgba(120, 120, 128, 0.15)',
    outline: 'none',
    color: 'var(--z-900)',
    transition: 'all 0.2s' };

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 700,
    color: 'var(--z-600)',
    letterSpacing: '-0.01em',
    marginBottom: 6,
    display: 'block' };

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
              e.target.style.borderColor = 'var(--m-accent)';
              e.target.style.background = 'var(--m-card)';
            }}
            onBlur={(e) => {
              e.target.style.borderColor = 'rgba(120, 120, 128, 0.15)';
              e.target.style.background = 'var(--z-200)';
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
              e.target.style.borderColor = 'var(--m-accent)';
              e.target.style.background = 'var(--m-card)';
            }}
            onBlur={(e) => {
              e.target.style.borderColor = 'rgba(120, 120, 128, 0.15)';
              e.target.style.background = 'var(--z-200)';
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
                    e.target.style.borderColor = 'var(--m-accent)';
                    e.target.style.background = 'var(--m-card)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = 'rgba(120, 120, 128, 0.15)';
                    e.target.style.background = 'var(--z-200)';
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
                      transition: 'all 0.2s' }}
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
                  transition: 'all 0.2s' }}
              >
                + 항목 추가
              </button>
            )}
          </div>
        </div>

        {/*
          익명 투표 — 서버가 poll_votes 의 user_id 를 응답에서 빼는 것이 본체다.
          체크만으로 화면에서 이름을 안 그리는 방식이면, 개발자도구로 그대로 보인다.
        */}
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 14px',
            borderRadius: 10,
            background: 'var(--z-100)',
            cursor: submitting ? 'not-allowed' : 'pointer' }}
        >
          <input
            type="checkbox"
            checked={anonymous}
            onChange={(e) => setAnonymous(e.target.checked)}
            disabled={submitting}
            style={{ width: 18, height: 18, accentColor: 'var(--m-accent)', flexShrink: 0 }}
          />
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 13.5, fontWeight: 800, color: 'var(--z-900)' }}>
              익명 투표
            </span>
            <span style={{ display: 'block', fontSize: 11.5, color: 'var(--z-500)', fontWeight: 600, marginTop: 2 }}>
              {anonymous
                ? '누가 무엇을 골랐는지 아무도 볼 수 없습니다'
                : '선택지를 누르면 투표한 사람이 보입니다'}
            </span>
          </span>
        </label>

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
              transition: 'background 0.2s' }}
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => onSubmit({ question, options, deadlineAt, anonymous })}
            disabled={submitting || !question.trim() || options.filter(o => o.trim()).length < 2}
            className="macos-squircle-sm"
            style={{
              flex: 1,
              padding: '13px',
              background: (question.trim() && options.filter(o => o.trim()).length >= 2)
                ? 'var(--m-accent)'
                : 'var(--z-200)',
              color: (question.trim() && options.filter(o => o.trim()).length >= 2)
                ? '#fff'
                : 'rgba(120, 120, 128, 0.35)',
              fontSize: 14,
              fontWeight: 600,
              border: 'none',
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.7 : 1,
              boxShadow: (question.trim() && options.filter(o => o.trim()).length >= 2)
                ? 'none'
                : 'none',
              transition: 'all 0.2s' }}
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
  /** 선택지 index → 투표자 이름. 익명 투표면 서버가 비워서 보낸다. */
  voters?: Record<number, string[]>;
  voting: boolean;
  onVote: (pollId: string, optionIndex: number) => void;
};

export function PollCard({ poll, voteCounts, myVote, voters, voting, onVote }: PollCardProps) {
  const { displayQuestion, deadlineAt, anonymous } = extractPollMetaFromQuestion(poll.question, poll.poll_meta);
  const totalVotes = Object.values(voteCounts).reduce((sum, n) => sum + n, 0);
  const hasVoterNames = Object.values(voters ?? {}).some((names) => names.length > 0);
  const deadlinePassed = (() => {
    if (!deadlineAt) return false;
    const dt = toChatDate(deadlineAt);
    return !Number.isNaN(dt.getTime()) && dt.getTime() < Date.now();
  })();

  return (
    <div
      className="macos-squircle"
      style={{
        background: 'var(--m-card)',
        padding: '16px',
        margin: '12px 0',
        border: '1px solid var(--m-border)',
        boxShadow: '0 4px 24px var(--z-100)' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <MIcon name="list" size={15} color="var(--m-accent)" />
        <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--m-accent)', letterSpacing: '0.02em' }}>
          투표 진행중
        </span>
        {anonymous && (
          <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--z-600)', background: 'var(--z-100)', padding: '2px 7px', borderRadius: 999 }}>
            익명
          </span>
        )}
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
              className="macos-squircle-sm"
              style={{
                position: 'relative',
                width: '100%',
                padding: '12px 14px',
                border: mine ? '1.5px solid var(--m-accent)' : '1px solid var(--m-border)',
                background: mine ? 'var(--m-accent-soft)' : 'var(--m-card)',
                overflow: 'hidden',
                cursor: voting || deadlinePassed ? 'not-allowed' : 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s',
                boxShadow: mine ? '0 2px 8px var(--m-accent-soft)' : 'none' }}
            >
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: `${pct}%`,
                  background: mine ? 'var(--m-accent-soft)' : 'rgba(120, 120, 128, 0.06)',
                  transition: 'width 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}
              />
              <span style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--z-900)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  {mine && <MIcon name="check" size={14} color="var(--m-accent)" />}
                  {option}
                </span>
                <span style={{ fontSize: 12, fontWeight: 800, color: mine ? 'var(--m-accent)' : 'var(--z-500)', whiteSpace: 'nowrap' }}>
                  {count}표 ({pct}%)
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {/*
        기명 투표만 투표자를 보여준다. 익명 투표는 서버가 이름을 보내지 않으므로
        이 목록은 애초에 비어 있다 — 화면에서 가리는 방식이 아니다.
      */}
      {!anonymous && hasVoterNames && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {poll.options.map((option, index) => {
            const names = voters?.[index] ?? [];
            if (names.length === 0) return null;
            return (
              <div key={`voters-${index}`} style={{ fontSize: 11.5, color: 'var(--z-500)', fontWeight: 600, lineHeight: 1.5 }}>
                <span style={{ fontWeight: 800, color: 'var(--z-600)' }}>{option}</span>
                <span style={{ margin: '0 4px' }}>·</span>
                {names.join(', ')}
              </div>
            );
          })}
        </div>
      )}
      <div style={{ fontSize: 12, color: 'var(--z-500)', fontWeight: 600, marginTop: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
        <MIcon name="users" size={13} color="var(--z-400)" />
        총 {totalVotes}명 참여
        {anonymous && <span style={{ marginLeft: 6 }}>· 누가 골랐는지는 공개되지 않습니다</span>}
      </div>
    </div>
  );
}
