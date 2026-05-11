'use client';

/**
 * Badge.tsx — Phase 4 뱃지 컴포넌트
 *
 * color: blue | green | red | yellow | gray
 * JM6: 시맨틱 span, 상태 전달용 aria-label
 */

import React from 'react';

export type BadgeColor = 'blue' | 'green' | 'red' | 'yellow' | 'gray';
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps {
  color?: BadgeColor;
  size?: BadgeSize;
  dot?: boolean;
  ariaLabel?: string;
  children: React.ReactNode;
  className?: string;
}

// ── 색상 맵 ──────────────────────────────────────────────────────────────────

const COLOR_STYLES: Record<BadgeColor, { bg: string; text: string; dot: string }> = {
  blue:   { bg: 'bg-[var(--accent-light)]',    text: 'text-[var(--accent)]',    dot: 'bg-[var(--accent)]' },
  green:  { bg: 'bg-[var(--success-light)]',   text: 'text-[var(--success)]',   dot: 'bg-[var(--success)]' },
  red:    { bg: 'bg-[var(--danger-light)]',    text: 'text-[var(--danger)]',    dot: 'bg-[var(--danger)]' },
  yellow: { bg: 'bg-[var(--warning-light)]',   text: 'text-[var(--warning)]',   dot: 'bg-[var(--warning)]' },
  gray:   { bg: 'bg-[var(--muted)]',           text: 'text-[var(--toss-gray-4)]', dot: 'bg-[var(--toss-gray-4)]' },
};

const SIZE_STYLES: Record<BadgeSize, string> = {
  sm: 'px-1.5 py-0.5 text-[10px]',
  md: 'px-2 py-0.5 text-xs',
};

// ── 컴포넌트 ─────────────────────────────────────────────────────────────────

export default function Badge({
  color = 'gray',
  size = 'md',
  dot = false,
  ariaLabel,
  children,
  className = '',
}: BadgeProps) {
  const { bg, text, dot: dotColor } = COLOR_STYLES[color];

  return (
    <span
      aria-label={ariaLabel}
      className={[
        'inline-flex items-center gap-1 font-medium rounded-full',
        bg,
        text,
        SIZE_STYLES[size],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {dot && (
        <span
          aria-hidden="true"
          className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColor}`}
        />
      )}
      {children}
    </span>
  );
}
