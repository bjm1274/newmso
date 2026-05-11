'use client';

/**
 * FullScreenModal.tsx — Phase 4 모바일 풀스크린 모달
 *
 * 모바일에서 화면 전체를 덮는 navigation 대체 뷰
 * 데스크톱에서는 일반 모달로 자동 축소 (sm breakpoint)
 *
 * JM6: role="dialog", aria-modal, aria-labelledby, ESC, Back 버튼
 */

import React, { useEffect, useRef, useId } from 'react';
import { ArrowLeft, X } from 'lucide-react';

export interface FullScreenModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  headerRight?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  backLabel?: string;
}

export default function FullScreenModal({
  open,
  onClose,
  title,
  subtitle,
  headerRight,
  footer,
  children,
  backLabel = '뒤로',
}: FullScreenModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);

    const focusable = dialogRef.current?.querySelector<HTMLElement>(
      'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])',
    );
    focusable?.focus();

    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* 데스크톱 오버레이 */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className="hidden sm:block fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.45)' }}
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={[
          /* 모바일: 풀스크린 */
          'fixed inset-0 z-50 flex flex-col bg-[var(--card)]',
          /* 데스크톱: 중앙 모달 */
          'sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2',
          'sm:w-full sm:max-w-lg sm:max-h-[85vh] sm:rounded-[var(--radius-xl)] sm:shadow-[var(--shadow-lg)]',
        ].join(' ')}
      >
        {/* 상단 헤더 */}
        <header
          className="flex items-center gap-2 px-4 border-b border-[var(--border)] shrink-0"
          style={{ height: 56, paddingTop: 'env(safe-area-inset-top, 0px)' }}
        >
          {/* 뒤로 버튼 (모바일) / 닫기 X (데스크톱) */}
          <button
            type="button"
            onClick={onClose}
            aria-label={`${backLabel} — ${title} 닫기`}
            className={[
              'flex items-center gap-1 text-sm text-[var(--accent)] font-medium shrink-0',
              'focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-1',
              'rounded-[var(--radius-sm)] px-1 -ml-1',
            ].join(' ')}
          >
            <ArrowLeft size={18} aria-hidden="true" className="sm:hidden" />
            <X size={16} aria-hidden="true" className="hidden sm:block" />
            <span className="sm:hidden">{backLabel}</span>
          </button>

          <div className="flex-1 min-w-0 text-center">
            <h1
              id={titleId}
              className="text-sm font-semibold text-[var(--foreground)] truncate"
            >
              {title}
            </h1>
            {subtitle && (
              <p className="text-xs text-[var(--toss-gray-4)] truncate">{subtitle}</p>
            )}
          </div>

          {/* 우측 슬롯 */}
          <div className="shrink-0 min-w-[56px] flex justify-end">
            {headerRight}
          </div>
        </header>

        {/* 본문 */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>

        {/* 푸터 */}
        {footer && (
          <footer
            className="shrink-0 border-t border-[var(--border)] px-4 py-3 flex items-center gap-2"
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          >
            {footer}
          </footer>
        )}
      </div>
    </>
  );
}
