'use client';

/**
 * 글작성옵션 — 게시글 작성 시 옵션 섹션 (고정/중요도/익명/예약발행).
 * 글작성.tsx에서 분리 (JM 500줄 이내 유지).
 * JM6: label·button 시맨틱, aria-pressed
 */

import MIcon from '../공통/MIcon';
import type { BoardCatId } from './data-hooks';

const ANONYMOUS_ALLOWED_CATS = new Set<BoardCatId>(['free']);
// 투표/설문은 일정 게시판(op/mri)에는 부적합 → 그 외 카테고리에서만 노출
const POLL_ALLOWED_CATS = new Set<BoardCatId>(['notice', 'free', 'event', 'share']);

/** 투표 작성 상태 — 글작성.tsx가 소유, 옵션 패널은 표시·편집만 */
export type PollDraft = {
  enabled: boolean;
  question: string;
  options: string[];
  multiple: boolean;
  anonymous: boolean;
  prizeEnabled: boolean;
  prizeName: string;
  prizeWinnerCount: number;
};

export const EMPTY_POLL_DRAFT: PollDraft = {
  enabled: false,
  question: '',
  options: ['', ''],
  multiple: false,
  anonymous: false,
  prizeEnabled: false,
  prizeName: '',
  prizeWinnerCount: 1,
};

export type PostOptionsProps = {
  cat: BoardCatId;
  canAdmin: boolean;
  pin: boolean;
  importance: 'normal' | 'urgent';
  anonymous: boolean;
  scheduledPublishAt: string;
  poll: PollDraft;
  onTogglePin: () => void;
  onImportance: (v: 'normal' | 'urgent') => void;
  onAnonymous: (v: boolean) => void;
  onScheduled: (v: string) => void;
  onPoll: (next: PollDraft) => void;
};

export function PostOptions({
  cat,
  canAdmin,
  pin,
  importance,
  anonymous,
  scheduledPublishAt,
  poll,
  onTogglePin,
  onImportance,
  onAnonymous,
  onScheduled,
  onPoll,
}: PostOptionsProps) {
  const setPoll = (patch: Partial<PollDraft>) => onPoll({ ...poll, ...patch });
  const setOption = (idx: number, value: string) => {
    const next = poll.options.slice();
    next[idx] = value;
    setPoll({ options: next });
  };
  const addOption = () => {
    if (poll.options.length >= 10) return;
    setPoll({ options: [...poll.options, ''] });
  };
  const removeOption = (idx: number) => {
    if (poll.options.length <= 2) return;
    setPoll({ options: poll.options.filter((_, i) => i !== idx) });
  };

  return (
    <div className="m-section">
      <div className="m-section-h"><div className="lbl">옵션</div></div>
      <div className="m-card flush">
        {/* 상단 고정 — 관리자만 (JM5: 권한 게이트) */}
        {canAdmin && (
          <div className="m-list-row">
            <div className="ico-tile tone-accent"><MIcon name="pin" size={18} /></div>
            <div>
              <div className="lbl">상단 고정</div>
              <div className="sub">목록 최상단에 노출 (관리자)</div>
            </div>
            <button
              type="button"
              onClick={onTogglePin}
              aria-label="상단 고정 토글"
              aria-pressed={pin}
              style={{
                width: 44, height: 24, borderRadius: 999,
                background: pin ? 'var(--m-accent)' : 'var(--z-200)',
                position: 'relative',
              }}
            >
              <span style={{
                position: 'absolute', top: 2, left: pin ? 22 : 2,
                width: 20, height: 20, borderRadius: 999,
                background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                transition: 'left .15s',
              }} />
            </button>
          </div>
        )}

        {/* 중요도 */}
        <div className="m-list-row">
          <div className="ico-tile tone-warning"><MIcon name="alertTri" size={18} /></div>
          <div><div className="lbl">중요도</div><div className="sub">일반 / 긴급</div></div>
          <div className="m-seg" style={{ width: 120 }}>
            <button
              type="button"
              className={importance === 'normal' ? 'on' : ''}
              onClick={() => onImportance('normal')}
              aria-pressed={importance === 'normal'}
            >
              일반
            </button>
            <button
              type="button"
              className={importance === 'urgent' ? 'on' : ''}
              onClick={() => onImportance('urgent')}
              aria-pressed={importance === 'urgent'}
            >
              긴급
            </button>
          </div>
        </div>

        {/* 익명 — 자유게시판만 (JM5: PII 노출 방지) */}
        {ANONYMOUS_ALLOWED_CATS.has(cat) && (
          <div className="m-list-row">
            <div className="ico-tile tone-success"><MIcon name="user" size={18} /></div>
            <div>
              <label htmlFor="board-anonymous-toggle" className="lbl">익명으로 작성</label>
              <div className="sub">작성자 이름이 &lsquo;익명&rsquo;으로 표시됩니다</div>
            </div>
            <input
              id="board-anonymous-toggle"
              type="checkbox"
              checked={anonymous}
              onChange={(e) => onAnonymous(e.target.checked)}
              style={{ width: 22, height: 22, accentColor: 'var(--m-accent)' }}
            />
          </div>
        )}

        {/* 예약 발행 — 관리자만 (JM6: label + datetime-local) */}
        {canAdmin && (
          <div className="m-list-row" style={{ alignItems: 'flex-start' }}>
            <div className="ico-tile tone-warning"><MIcon name="calendar" size={18} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <label htmlFor="board-schedule-input" className="lbl">예약 발행</label>
              <div className="sub" style={{ marginBottom: 6 }}>
                선택한 시각 이후 목록에 노출됩니다 (비워두면 즉시 발행)
              </div>
              <input
                id="board-schedule-input"
                type="datetime-local"
                value={scheduledPublishAt}
                onChange={(e) => onScheduled(e.target.value)}
                style={{
                  width: '100%', padding: '8px 10px', fontSize: 13,
                  border: '1px solid var(--m-border)', borderRadius: 8,
                  background: 'var(--m-bg)', color: 'var(--z-800)',
                }}
              />
            </div>
          </div>
        )}

        {/* 투표/설문 — 일정 게시판 제외 (JM4: 옵션 2개 미만이면 저장 측에서 무시) */}
        {POLL_ALLOWED_CATS.has(cat) && (
          <div className="m-list-row">
            <div className="ico-tile tone-accent"><MIcon name="check" size={18} /></div>
            <div>
              <label htmlFor="board-poll-toggle" className="lbl">투표·설문 추가</label>
              <div className="sub">옵션 2개 이상 입력 시 게시글에 투표가 표시됩니다</div>
            </div>
            <input
              id="board-poll-toggle"
              type="checkbox"
              checked={poll.enabled}
              onChange={(e) => setPoll({ enabled: e.target.checked })}
              style={{ width: 22, height: 22, accentColor: 'var(--m-accent)' }}
            />
          </div>
        )}
      </div>

      {/* 투표 상세 입력 — enabled일 때만 별도 카드 */}
      {POLL_ALLOWED_CATS.has(cat) && poll.enabled && (
        <div className="m-card flush" style={{ marginTop: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label htmlFor="board-poll-question" className="lbl" style={{ display: 'block', marginBottom: 6 }}>
              질문 (비우면 제목 사용)
            </label>
            <input
              id="board-poll-question"
              value={poll.question}
              onChange={(e) => setPoll({ question: e.target.value })}
              placeholder="예: 회식 장소를 골라주세요"
              style={{ width: '100%', padding: '8px 10px', fontSize: 14, border: '1px solid var(--m-border)', borderRadius: 8, background: 'var(--m-bg)' }}
            />
          </div>

          <div>
            <div className="lbl" style={{ marginBottom: 6 }}>선택지</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {poll.options.map((opt, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <label htmlFor={`board-poll-opt-${i}`} style={{ position: 'absolute', left: -9999 }}>
                    선택지 {i + 1}
                  </label>
                  <input
                    id={`board-poll-opt-${i}`}
                    value={opt}
                    onChange={(e) => setOption(i, e.target.value)}
                    placeholder={`선택지 ${i + 1}`}
                    style={{ flex: 1, padding: '8px 10px', fontSize: 14, border: '1px solid var(--m-border)', borderRadius: 8, background: 'var(--m-bg)' }}
                  />
                  {poll.options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeOption(i)}
                      aria-label={`선택지 ${i + 1} 제거`}
                      style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--m-bg)', color: 'var(--z-500)', display: 'grid', placeItems: 'center', flexShrink: 0 }}
                    >
                      <MIcon name="x" size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {poll.options.length < 10 && (
              <button
                type="button"
                onClick={addOption}
                style={{ marginTop: 8, fontSize: 12, fontWeight: 800, color: 'var(--m-accent)', display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                <MIcon name="plus" size={14} /> 선택지 추가
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: 16 }}>
            <label htmlFor="board-poll-multiple" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700 }}>
              <input
                id="board-poll-multiple"
                type="checkbox"
                checked={poll.multiple}
                onChange={(e) => setPoll({ multiple: e.target.checked })}
                style={{ width: 20, height: 20, accentColor: 'var(--m-accent)' }}
              />
              복수 선택
            </label>
            <label htmlFor="board-poll-anon" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700 }}>
              <input
                id="board-poll-anon"
                type="checkbox"
                checked={poll.anonymous}
                onChange={(e) => setPoll({ anonymous: e.target.checked })}
                style={{ width: 20, height: 20, accentColor: 'var(--m-accent)' }}
              />
              익명 투표
            </label>
          </div>

          {/* 상품 추첨 */}
          <div style={{ borderTop: '1px solid var(--m-border)', paddingTop: 12 }}>
            <label htmlFor="board-poll-prize" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 800 }}>
              <input
                id="board-poll-prize"
                type="checkbox"
                checked={poll.prizeEnabled}
                onChange={(e) => setPoll({ prizeEnabled: e.target.checked })}
                style={{ width: 20, height: 20, accentColor: 'var(--m-accent)' }}
              />
              🎁 상품 추첨 사용
            </label>
            {poll.prizeEnabled && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <div style={{ flex: 1 }}>
                  <label htmlFor="board-poll-prize-name" style={{ position: 'absolute', left: -9999 }}>상품명</label>
                  <input
                    id="board-poll-prize-name"
                    value={poll.prizeName}
                    onChange={(e) => setPoll({ prizeName: e.target.value })}
                    placeholder="상품명 (예: 스타벅스 기프티콘)"
                    style={{ width: '100%', padding: '8px 10px', fontSize: 14, border: '1px solid var(--m-border)', borderRadius: 8, background: 'var(--m-bg)' }}
                  />
                </div>
                <div style={{ width: 96 }}>
                  <label htmlFor="board-poll-prize-count" style={{ position: 'absolute', left: -9999 }}>당첨 인원</label>
                  <input
                    id="board-poll-prize-count"
                    type="number"
                    min={1}
                    value={poll.prizeWinnerCount}
                    onChange={(e) => setPoll({ prizeWinnerCount: Math.max(1, Number(e.target.value) || 1) })}
                    aria-label="당첨 인원"
                    style={{ width: '100%', padding: '8px 10px', fontSize: 14, border: '1px solid var(--m-border)', borderRadius: 8, background: 'var(--m-bg)' }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
