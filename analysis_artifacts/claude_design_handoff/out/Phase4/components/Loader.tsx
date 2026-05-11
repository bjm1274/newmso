'use client';

/**
 * Loader.tsx — Phase 4 로딩 인디케이터
 *
 * variant: spinner | skeleton
 * JM6: aria-busy, aria-label, role="status"
 * JM2: CSS 애니메이션만 사용 (JS 없음)
 */

import React from 'react';

// ── Spinner ───────────────────────────────────────────────────────────────────

export type SpinnerSize = 'xs' | 'sm' | 'md' | 'lg';

export interface SpinnerProps {
  size?: SpinnerSize;
  label?: string;
  color?: string;
}

const SPINNER_SIZE: Record<SpinnerSize, number> = { xs: 14, sm: 18, md: 24, lg: 32 };
const SPINNER_STROKE: Record<SpinnerSize, number> = { xs: 2, sm: 2, md: 2.5, lg: 3 };

export function Spinner({ size = 'md', label = '로딩 중', color }: SpinnerProps) {
  const px = SPINNER_SIZE[size];
  const stroke = SPINNER_STROKE[size];

  return (
    <span
      role="status"
      aria-label={label}
      aria-busy="true"
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <svg
        aria-hidden="true"
        width={px}
        height={px}
        viewBox="0 0 24 24"
        fill="none"
        style={{ animation: 'loader-spin 0.75s linear infinite', display: 'block' }}
      >
        <circle
          cx="12" cy="12" r="10"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeOpacity={0.15}
        />
        <path
          d="M12 2a10 10 0 0 1 10 10"
          stroke={color ?? 'var(--accent)'}
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        <style>{`@keyframes loader-spin { to { transform: rotate(360deg); } }`}</style>
      </svg>
    </span>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

export interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  rounded?: boolean;
  className?: string;
}

export function Skeleton({
  width = '100%',
  height = 16,
  rounded = false,
  className = '',
}: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={[
        'block bg-[var(--muted)]',
        rounded ? 'rounded-full' : 'rounded-[var(--radius-sm)]',
        'skeleton-pulse',
        className,
      ].join(' ')}
      style={{ width, height, display: 'block' }}
    >
      <style>{`
        .skeleton-pulse {
          background: linear-gradient(90deg, var(--muted) 25%, var(--tab-bg) 50%, var(--muted) 75%);
          background-size: 200% 100%;
          animation: skeleton-wave 1.4s ease infinite;
        }
        @keyframes skeleton-wave {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </span>
  );
}

// ── 카드 스켈레톤 프리셋 ──────────────────────────────────────────────────────

export function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <div
      role="status"
      aria-label="콘텐츠 로딩 중"
      aria-busy="true"
      className="rounded-[var(--radius-lg)] border border-[var(--border)] p-4 flex flex-col gap-3"
    >
      <Skeleton height={20} width="60%" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} height={14} width={i === rows - 1 ? '40%' : '100%'} />
      ))}
    </div>
  );
}

// ── 기본 export (Spinner) ─────────────────────────────────────────────────────

export default Spinner;
