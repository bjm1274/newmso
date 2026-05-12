'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

export type BottomSheetMode = 'full' | 'auto';

export type BottomSheetProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  mode?: BottomSheetMode;
  children: ReactNode;
  footer?: ReactNode;
};

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
}

export function BottomSheet({
  open,
  onClose,
  title,
  mode = 'auto',
  children,
  footer,
}: BottomSheetProps) {
  const titleId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<Element | null>(null);

  // 열릴 때 이전 포커스 저장 + 첫 focusable 요소로 이동
  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement;

    const timer = window.setTimeout(() => {
      const sheet = sheetRef.current;
      if (!sheet) return;
      const focusable = getFocusableElements(sheet);
      focusable[0]?.focus();
    }, 50);

    return () => window.clearTimeout(timer);
  }, [open]);

  // 닫힐 때 포커스 복원
  useEffect(() => {
    if (open) return;

    const el = previousFocusRef.current;
    if (el instanceof HTMLElement) {
      el.focus();
    }
    previousFocusRef.current = null;
  }, [open]);

  // ESC 닫기 + focus trap
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === 'Tab') {
        const sheet = sheetRef.current;
        if (!sheet) return;
        const focusable = getFocusableElements(sheet);
        if (focusable.length === 0) {
          event.preventDefault();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey) {
          if (document.activeElement === first) {
            event.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // 스크롤 잠금
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  if (!open) return null;

  const sheetHeightClass =
    mode === 'full' ? 'h-full md:h-auto md:max-h-[90vh]' : 'max-h-[90vh]';

  return (
    <div
      className="fixed inset-0 z-[500] flex items-end justify-center md:items-center"
      aria-modal="true"
      role="dialog"
      aria-labelledby={title ? titleId : undefined}
    >
      {/* 배경 오버레이 */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet 본체 */}
      <div
        ref={sheetRef}
        className={[
          'relative z-10 flex w-full flex-col',
          'bg-[var(--card)] shadow-lg',
          // 모바일: 하단에서 올라옴, 상단 radius만
          'rounded-t-[var(--radius-xl)]',
          // 데스크탑: 중앙 모달, 전체 radius
          'md:w-auto md:min-w-[400px] md:max-w-lg md:rounded-[var(--radius-xl)]',
          sheetHeightClass,
          'transition-transform duration-200',
        ].join(' ')}
      >
        {/* 드래그 핸들 — 모바일 전용 시각 요소 */}
        <div className="flex shrink-0 justify-center pt-3 pb-1 md:hidden" aria-hidden="true">
          <div className="h-1 w-10 rounded-full bg-[var(--toss-gray-3)]" />
        </div>

        {/* 헤더 */}
        {title ? (
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-5 py-4">
            <h2
              id={titleId}
              className="text-base font-black tracking-tight text-[var(--foreground)]"
            >
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-[var(--toss-gray-4)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <path
                  d="M14 4L4 14M4 4l10 10"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        ) : null}

        {/* 콘텐츠 */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {/* 푸터 */}
        {footer ? (
          <div className="shrink-0 border-t border-[var(--border)] px-5 py-4">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
