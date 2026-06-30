'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

// 라이브 reference: handoff/04-board-게시판 §3-4 BoardMoreMenu
// 별표 토글 / 북마크 / 수정 / 채팅 공유 / 삭제 드롭다운

export type PostMoreMenuProps = {
  postId: string;
  isFavorite: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onToggleFavorite: (postId: string) => void;
  onBookmark?: (postId: string) => void;
  onEdit?: (postId: string) => void;
  onShareToChat?: (postId: string) => void;
  onDelete?: (postId: string) => void;
};

export default function PostMoreMenu({
  postId,
  isFavorite,
  canEdit,
  canDelete,
  onToggleFavorite,
  onBookmark,
  onEdit,
  onShareToChat,
  onDelete }: PostMoreMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const handleKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const handleItem = (action: (() => void) | undefined) => () => {
    setOpen(false);
    action?.();
  };

  const handleButtonKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setOpen((prev) => !prev);
    }
  };

  return (
    <div className="board-more-wrap" ref={ref}>
      <button
        type="button"
        className="board-more"
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={handleButtonKey}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="게시물 메뉴"
        data-testid={`board-post-more-${postId}`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="5" cy="12" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="19" cy="12" r="1.5" />
        </svg>
      </button>
      {open && (
        <div className="board-more-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            className="board-more-item"
            onClick={handleItem(() => onToggleFavorite(postId))}
            data-testid={`board-post-toggle-favorite-${postId}`}
          >
            <svg width="13" height="13" viewBox="0 0 24 24"
              fill={isFavorite ? '#F59E0B' : 'none'}
              stroke={isFavorite ? '#F59E0B' : '#A1A1AA'}
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
            >
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            <span>{isFavorite ? '별표 해제' : '별표 추가'}</span>
          </button>
          {onBookmark ? (
            <button
              type="button"
              role="menuitem"
              className="board-more-item"
              onClick={handleItem(() => onBookmark(postId))}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
              <span>북마크</span>
            </button>
          ) : null}
          {(canEdit || onShareToChat || (canDelete && onDelete)) ? <div className="board-more-sep" /> : null}
          {canEdit && onEdit ? (
            <button
              type="button"
              role="menuitem"
              className="board-more-item"
              onClick={handleItem(() => onEdit(postId))}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              <span>수정</span>
            </button>
          ) : null}
          {onShareToChat ? (
            <button
              type="button"
              role="menuitem"
              className="board-more-item"
              onClick={handleItem(() => onShareToChat(postId))}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
              <span>채팅으로 공유</span>
            </button>
          ) : null}
          {canDelete && onDelete ? (
            <button
              type="button"
              role="menuitem"
              className="board-more-item danger"
              onClick={handleItem(() => onDelete(postId))}
              data-testid={`board-post-delete-${postId}`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6M14 11v6" />
              </svg>
              <span>삭제</span>
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
