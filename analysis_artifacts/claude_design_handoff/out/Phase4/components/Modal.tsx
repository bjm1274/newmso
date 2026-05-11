'use client';

/**
 * Modal.tsx — Phase 4 모달 / 모바일 바텀시트
 *
 * responsive prop: 600px 미만에서 바텀시트로 렌더링
 * JM6: role="dialog", aria-modal, aria-labelledby, focus trap (첫 포커스)
 * JM2: useEffect는 키보드 트랩과 스크롤 락 최소 용도만 사용
 */

import React, { useEffect, useRef, useId } from 'react';
import { X } from 'lucide-react';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  footer?: React.ReactNode;
  responsive?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'full';
  hideCloseButton?: boolean;
  children: React.ReactNode;
}

// ── 사이즈 맵 ────────────────────────────────────────────────────────────────

const SIZE_MAX: Record<string, string> = {
  sm: '400px',
  md: '560px',
  lg: '720px',
  full: '100%',
};

// ── 오버레이 ─────────────────────────────────────────────────────────────────

function Overlay({ onClick }: { onClick: () => void }) {
  return (
    <div
      aria-hidden="true"
      onClick={onClick}
      className="fixed inset-0 z-40"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }}
    />
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export default function Modal({
  open,
  onClose,
  title,
  description,
  footer,
  responsive = false,
  size = 'md',
  hideCloseButton = false,
  children,
}: ModalProps) {
  const titleId = useId();
  const descId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  // 스크롤 락 + ESC 핸들러
  useEffect(() => {
    if (!open) return;

    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }

    document.addEventListener('keydown', handleKeyDown);

    // 첫 포커스 가능 요소로 이동
    const focusable = dialogRef.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    focusable?.focus();

    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const isBottomSheet = responsive;

  return (
    <>
      <Overlay onClick={onClose} />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        className={[
          'fixed z-50 flex flex-col',
          'bg-[var(--card)] shadow-[var(--shadow-lg)]',
          isBottomSheet
            ? [
                'bottom-0 left-0 right-0 rounded-t-[var(--radius-2xl)]',
                'sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2',
                'sm:rounded-[var(--radius-xl)] sm:w-full',
              ].join(' ')
            : 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full mx-4 rounded-[var(--radius-xl)]',
        ].join(' ')}
        style={{
          maxWidth: isBottomSheet ? undefined : SIZE_MAX[size],
          maxHeight: isBottomSheet ? '85vh' : '90vh',
        }}
      >
        {/* 드래그 핸들 (바텀시트 모드) */}
        {isBottomSheet && (
          <div aria-hidden="true" className="flex justify-center pt-3 pb-1 sm:hidden">
            <div className="w-8 h-1 rounded-full bg-[var(--border)]" />
          </div>
        )}

        {/* 헤더 */}
        {(title || !hideCloseButton) && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] shrink-0">
            {title && (
              <h2 id={titleId} className="text-base font-semibold text-[var(--foreground)]">
                {title}
              </h2>
            )}
            {!hideCloseButton && (
              <button
                type="button"
                onClick={onClose}
                aria-label="모달 닫기"
                className="ml-auto p-1.5 rounded-[var(--radius-md)] hover:bg-[var(--muted)] focus-visible:outline-2 focus-visible:outline-[var(--accent)] text-[var(--toss-gray-4)]"
              >
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </div>
        )}

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {description && (
            <p id={descId} className="text-sm text-[var(--toss-gray-4)] mb-3">
              {description}
            </p>
          )}
          {children}
        </div>

        {/* 푸터 */}
        {footer && (
          <div className="shrink-0 flex items-center justify-end gap-2 px-5 py-4 border-t border-[var(--border)]"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
            {footer}
          </div>
        )}
      </div>
    </>
  );
}
