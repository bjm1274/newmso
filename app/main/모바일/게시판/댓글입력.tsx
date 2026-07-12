'use client';

/**
 * 댓글입력 — 상세 하단 sticky 댓글/답글 입력 바.
 * 게시판상세.tsx에서 분리 (JM 500줄 이내 유지). 상태는 부모가 소유, 표시·이벤트만 위임.
 * JM: 단일 책임(입력 UI), JM6(label·button·aria)
 */

import { forwardRef } from 'react';
import MIcon from '../공통/MIcon';
import { isImeComposing } from '../공통/useKeyboardLift';
import type { BoardComment } from './data-hooks';

export type CommentComposerProps = {
  draft: string;
  sending: boolean;
  replyTo: BoardComment | null;
  currentUserName?: string | null;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
  onReplyCancel: () => void;
};

const CommentComposer = forwardRef<HTMLInputElement, CommentComposerProps>(function CommentComposer(
  { draft, sending, replyTo, currentUserName, onDraftChange, onSubmit, onReplyCancel },
  ref,
) {
  // 키보드 상승은 MobileShell --m-kb-offset + tokens .m-sticky-foot 전역 처리
  return (
    <div
      className="m-sticky-foot macos-glass"
      style={{
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: 6,
        background: 'rgba(255, 255, 255, 0.72)',
        backdropFilter: 'blur(30px)',
        WebkitBackdropFilter: 'blur(30px)',
        borderTop: '1px solid rgba(0, 0, 0, 0.05)',
        padding: '10px 16px calc(10px + env(safe-area-inset-bottom, 12px) + var(--m-sticky-foot-pb, 0px))' }}
    >
      {replyTo && (
        <div
          role="status"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            background: 'rgba(0, 122, 255, 0.08)',
            color: '#007AFF',
            borderRadius: 10,
            fontSize: 12,
            fontWeight: 800 }}
        >
          <span aria-hidden>↳</span>
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {String(replyTo.author_name ?? '익명')}에게 답글
          </span>
          <button
            type="button"
            onClick={onReplyCancel}
            aria-label="답글 취소"
            style={{
              width: 20,
              height: 20,
              borderRadius: '50%',
              background: 'rgba(0, 122, 255, 0.15)',
              color: '#007AFF',
              display: 'grid',
              placeItems: 'center',
              border: 'none',
              cursor: 'pointer' }}
          >
            <MIcon name="x" size={10} />
          </button>
        </div>
      )}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'rgba(0, 0, 0, 0.04)',
          borderRadius: 22,
          padding: '4px 6px 4px 12px' }}
      >
        <label htmlFor="board-comment-input" style={{ position: 'absolute', left: -9999 }}>
          댓글 입력
        </label>
        <input
          id="board-comment-input"
          ref={ref}
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              if (isImeComposing(e)) return;
              e.preventDefault();
              onSubmit();
            }
          }}
          placeholder={
            replyTo
              ? `${String(replyTo.author_name ?? '익명')}에게 답글…`
              : currentUserName
                ? `${currentUserName}님, 댓글 입력`
                : '댓글 입력'
          }
          style={{ flex: 1, padding: '8px 0', fontSize: 13.5, fontFamily: 'inherit', background: 'transparent', border: 'none', outline: 'none', color: 'var(--z-900)' }}
          disabled={sending}
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={!draft.trim() || sending}
          aria-label={replyTo ? '답글 등록' : '댓글 등록'}
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: draft.trim() ? '#007AFF' : 'rgba(0, 0, 0, 0.08)',
            color: draft.trim() ? '#fff' : 'var(--z-400)',
            display: 'grid',
            placeItems: 'center',
            opacity: sending ? 0.5 : 1,
            border: 'none',
            cursor: 'pointer',
            boxShadow: draft.trim() ? '0 2px 8px rgba(0, 122, 255, 0.25)' : 'none' }}
        >
          <MIcon name="send" size={14} />
        </button>
      </div>
    </div>
  );
});

export default CommentComposer;
