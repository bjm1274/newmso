'use client';

/**
 * 글작성옵션 — 게시글 작성 시 옵션 섹션 (고정/중요도/익명/예약발행).
 * 글작성.tsx에서 분리 (JM 500줄 이내 유지).
 * JM6: label·button 시맨틱, aria-pressed
 */

import MIcon from '../공통/MIcon';
import type { BoardCatId } from './data-hooks';

const ANONYMOUS_ALLOWED_CATS = new Set<BoardCatId>(['free']);

export type PostOptionsProps = {
  cat: BoardCatId;
  canAdmin: boolean;
  pin: boolean;
  importance: 'normal' | 'urgent';
  anonymous: boolean;
  scheduledPublishAt: string;
  onTogglePin: () => void;
  onImportance: (v: 'normal' | 'urgent') => void;
  onAnonymous: (v: boolean) => void;
  onScheduled: (v: string) => void;
};

export function PostOptions({
  cat,
  canAdmin,
  pin,
  importance,
  anonymous,
  scheduledPublishAt,
  onTogglePin,
  onImportance,
  onAnonymous,
  onScheduled,
}: PostOptionsProps) {
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
      </div>
    </div>
  );
}
