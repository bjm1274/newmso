'use client';

/**
 * EmptyState.tsx — Phase 4 빈 상태 컴포넌트
 *
 * icon + title + description + action button
 * JM6: aria-label, 시맨틱 구조
 */

import React from 'react';

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
}

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

// ── 기본 아이콘 (InboxIcon) ───────────────────────────────────────────────────

function DefaultIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="21 8 21 21 3 21 3 8" />
      <rect width="22" height="5" x="1" y="3" />
      <line x1="10" x2="14" y1="12" y2="12" />
    </svg>
  );
}

// ── 액션 버튼 ─────────────────────────────────────────────────────────────────

function ActionButton({ action }: { action: EmptyStateAction }) {
  const isPrimary = (action.variant ?? 'primary') === 'primary';
  return (
    <button
      type="button"
      onClick={action.onClick}
      className={[
        'inline-flex items-center justify-center h-9 px-4 text-sm font-medium rounded-[var(--radius-md)]',
        'transition-colors focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2',
        isPrimary
          ? 'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]'
          : 'bg-[var(--card)] border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--muted)]',
      ].join(' ')}
    >
      {action.label}
    </button>
  );
}

// ── 사이즈 맵 ────────────────────────────────────────────────────────────────

const SIZE_CONFIG = {
  sm: { wrapper: 'py-8',  iconSize: 'w-8 h-8',  titleClass: 'text-sm',  descClass: 'text-xs' },
  md: { wrapper: 'py-12', iconSize: 'w-10 h-10', titleClass: 'text-base', descClass: 'text-sm' },
  lg: { wrapper: 'py-16', iconSize: 'w-12 h-12', titleClass: 'text-lg',  descClass: 'text-sm' },
};

// ── 컴포넌트 ─────────────────────────────────────────────────────────────────

export default function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  size = 'md',
  className = '',
}: EmptyStateProps) {
  const { wrapper, iconSize, titleClass, descClass } = SIZE_CONFIG[size];

  return (
    <div
      role="region"
      aria-label={title}
      className={[
        'flex flex-col items-center justify-center text-center gap-3',
        wrapper,
        className,
      ].join(' ')}
    >
      {/* 아이콘 */}
      <div
        aria-hidden="true"
        className={[
          iconSize,
          'text-[var(--toss-gray-3)] flex items-center justify-center',
        ].join(' ')}
      >
        {icon ?? <DefaultIcon />}
      </div>

      {/* 텍스트 */}
      <div className="flex flex-col gap-1 max-w-xs">
        <p className={`font-semibold text-[var(--foreground)] ${titleClass}`}>{title}</p>
        {description && (
          <p className={`text-[var(--toss-gray-4)] ${descClass}`}>{description}</p>
        )}
      </div>

      {/* 액션 */}
      {(action || secondaryAction) && (
        <div className="flex items-center gap-2 mt-1">
          {secondaryAction && <ActionButton action={secondaryAction} />}
          {action && <ActionButton action={action} />}
        </div>
      )}
    </div>
  );
}
