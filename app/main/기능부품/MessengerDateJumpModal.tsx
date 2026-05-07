'use client';

import { useEffect, useRef } from 'react';
import { CalendarDays, Search, X } from './lucide-shim';

type MessengerDateJumpModalProps = {
  open: boolean;
  value: string;
  loading: boolean;
  error?: string;
  onValueChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (dateKey: string) => void | Promise<void>;
};

export function MessengerDateJumpModal({
  open,
  value,
  loading,
  error,
  onValueChange,
  onClose,
  onSubmit,
}: MessengerDateJumpModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const frameId = window.requestAnimationFrame(() => inputRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      data-testid="chat-date-jump-modal"
      className="fixed inset-0 z-[210] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <form
        className="w-full max-w-sm rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          void onSubmit(value);
        }}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--toss-blue-light)] text-[var(--accent)]">
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
            </span>
            <h3 className="truncate text-sm font-bold text-[var(--foreground)]">날짜로 이동</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[var(--toss-gray-3)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
            aria-label="닫기"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <label className="mb-1.5 block text-[11px] font-bold text-[var(--toss-gray-3)]" htmlFor="chat-date-jump-input">
          날짜
        </label>
        <input
          ref={inputRef}
          id="chat-date-jump-input"
          data-testid="chat-date-jump-input"
          type="date"
          value={value}
          disabled={loading}
          onChange={(event) => onValueChange(event.target.value)}
          className="h-11 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-3 text-sm font-bold text-[var(--foreground)] outline-none transition-colors focus:border-[var(--accent)] disabled:cursor-wait disabled:opacity-60"
        />
        {error ? (
          <p className="mt-2 text-[11px] font-semibold text-red-500">{error}</p>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="h-9 rounded-[var(--radius-md)] border border-[var(--border)] px-3 text-xs font-bold text-[var(--toss-gray-4)] transition-colors hover:bg-[var(--muted)] disabled:cursor-wait disabled:opacity-60"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={loading || !value}
            className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--accent)] px-3 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
          >
            <Search className="h-3.5 w-3.5" aria-hidden="true" />
            {loading ? '이동 중' : '이동'}
          </button>
        </div>
      </form>
    </div>
  );
}
