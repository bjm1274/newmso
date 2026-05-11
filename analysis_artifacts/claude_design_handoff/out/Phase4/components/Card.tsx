'use client';

/**
 * Card.tsx — Phase 4 카드 컴포넌트
 *
 * variant: default | premium
 * padding: sm | md | lg | none
 * hover: hover 효과 활성화
 *
 * JM6: 클릭 가능할 때 role="button"/tabIndex, aria-label
 * JM4: 명시적 타입
 */

import React from 'react';

export type CardVariant = 'default' | 'premium';
export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

export interface CardProps {
  variant?: CardVariant;
  padding?: CardPadding;
  hover?: boolean;
  onClick?: () => void;
  ariaLabel?: string;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  as?: 'div' | 'article' | 'section' | 'li';
}

// ── 스타일 맵 ────────────────────────────────────────────────────────────────

const PADDING_STYLES: Record<CardPadding, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-5',
};

const VARIANT_STYLES: Record<CardVariant, string> = {
  default: 'border border-[var(--border)] shadow-[var(--shadow-xs)]',
  premium: 'border border-[var(--border)] shadow-[var(--shadow-premium)]',
};

// ── 컴포넌트 ─────────────────────────────────────────────────────────────────

export default function Card({
  variant = 'default',
  padding = 'md',
  hover = false,
  onClick,
  ariaLabel,
  header,
  footer,
  children,
  className = '',
  as: Tag = 'div',
}: CardProps) {
  const isInteractive = Boolean(onClick);

  const interactiveProps = isInteractive
    ? {
        role: 'button' as const,
        tabIndex: 0,
        onClick,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick?.();
          }
        },
        'aria-label': ariaLabel,
      }
    : {};

  return (
    <Tag
      {...interactiveProps}
      className={[
        'rounded-[var(--radius-lg)] bg-[var(--card)] overflow-hidden',
        VARIANT_STYLES[variant],
        hover || isInteractive
          ? 'transition-shadow duration-[var(--transition-base)] hover:shadow-[var(--shadow-md)] cursor-pointer'
          : '',
        isInteractive
          ? 'focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2'
          : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {header && (
        <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--muted)]">
          {header}
        </div>
      )}

      <div className={PADDING_STYLES[padding]}>{children}</div>

      {footer && (
        <div className="px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]">
          {footer}
        </div>
      )}
    </Tag>
  );
}
