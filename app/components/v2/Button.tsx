'use client';

/**
 * Button.tsx — Phase 4 기본 버튼 컴포넌트
 *
 * variant: primary | secondary | danger | ghost
 * size: sm | md | lg
 * icon: ReactNode (좌측 또는 우측)
 *
 * JM6: button 시맨틱, aria-disabled, focus-visible
 * JM4: any 금지, forwardRef
 */

import React, { forwardRef } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
}

// ── 스타일 맵 ────────────────────────────────────────────────────────────────

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] active:opacity-90 border border-transparent',
  secondary:
    'bg-[var(--card)] text-[var(--foreground)] border border-[var(--border)] hover:bg-[var(--muted)] active:opacity-80',
  danger:
    'bg-[var(--danger)] text-white hover:bg-[var(--danger-hover)] active:opacity-90 border border-transparent',
  ghost:
    'bg-transparent text-[var(--foreground)] border border-transparent hover:bg-[var(--muted)] active:opacity-80',
};

const SIZE_STYLES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
  lg: 'h-10 px-5 text-sm gap-2',
};

const SIZE_ICON: Record<ButtonSize, number> = { sm: 14, md: 16, lg: 16 };

// ── 로딩 스피너 ──────────────────────────────────────────────────────────────

function Spinner({ size }: { size: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      style={{ animation: 'btn-spin 0.7s linear infinite', flexShrink: 0 }}
    >
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
      <style>{`@keyframes btn-spin { to { transform: rotate(360deg); } }`}</style>
    </svg>
  );
}

// ── 컴포넌트 ─────────────────────────────────────────────────────────────────

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    iconLeft,
    iconRight,
    loading = false,
    fullWidth = false,
    disabled,
    children,
    className = '',
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading;
  const iconSize = SIZE_ICON[size];

  return (
    <button
      ref={ref}
      type="button"
      disabled={isDisabled}
      aria-disabled={isDisabled}
      aria-busy={loading}
      className={[
        'inline-flex items-center justify-center font-medium rounded-[var(--radius-md)]',
        'transition-colors duration-[var(--transition-fast)]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]',
        'disabled:opacity-50 disabled:pointer-events-none',
        VARIANT_STYLES[variant],
        SIZE_STYLES[size],
        fullWidth ? 'w-full' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {loading ? (
        <Spinner size={iconSize} />
      ) : (
        iconLeft && (
          <span aria-hidden="true" style={{ flexShrink: 0, lineHeight: 0 }}>
            {iconLeft}
          </span>
        )
      )}
      {children && <span>{children}</span>}
      {!loading && iconRight && (
        <span aria-hidden="true" style={{ flexShrink: 0, lineHeight: 0 }}>
          {iconRight}
        </span>
      )}
    </button>
  );
});

Button.displayName = 'Button';

export default Button;
