'use client';

// 메신저.tsx에서 추출한 "날짜로 이동" 모달. 순수 프레젠테이션.

import SmartDatePicker from '../공통/SmartDatePicker';

interface DateJumpModalProps {
  open: boolean;
  value: string;
  error: string;
  onValueChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (value: string) => void;
}

export function DateJumpModal({ open, value, error, onValueChange, onClose, onSubmit }: DateJumpModalProps) {
  if (!open) return null;
  return (
    <div
      data-testid="chat-date-jump-modal"
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
    >
      <form
        className="w-full max-w-sm rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(value);
        }}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-[var(--foreground)]">날짜로 이동</h3>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-[var(--toss-gray-3)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
            aria-label="닫기"
          >
            ×
          </button>
        </div>
        <SmartDatePicker
          data-testid="chat-date-jump-input"
          value={value}
          onChange={onValueChange}
          className="w-full"
          inputClassName="h-11 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-3 text-sm font-bold text-[var(--foreground)] focus:border-[var(--accent)]"
        />
        {error ? (
          <p className="mt-2 text-[11px] font-semibold text-red-500">{error}</p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-[var(--radius-md)] border border-[var(--border)] px-3 text-xs font-bold text-[var(--toss-gray-4)] transition-colors hover:bg-[var(--muted)]"
          >
            취소
          </button>
          <button
            type="submit"
            className="h-9 rounded-[var(--radius-md)] bg-[var(--accent)] px-3 text-xs font-bold text-white transition-opacity hover:opacity-90"
          >
            이동
          </button>
        </div>
      </form>
    </div>
  );
}
