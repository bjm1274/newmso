import React from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'sm' | 'md';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: React.ReactNode;
  loading?: boolean;
}

const VARIANT_CLASS: Record<Variant, string> = {
  primary: 'btn-premium-primary',
  secondary: 'btn-premium-secondary',
  danger: 'btn-premium-danger',
  ghost: 'icon-btn',
};

const SIZE_OVERRIDE: Record<Size, string> = {
  sm: '!min-h-7 !px-2.5 !py-1 !text-[11px]',
  md: '',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  loading = false,
  children,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  const base = VARIANT_CLASS[variant];
  const sizeClass = SIZE_OVERRIDE[size];

  return (
    <button
      className={`${base} ${sizeClass} ${className}`.trim()}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="spinner-sm" aria-hidden="true" />
      ) : (
        icon
      )}
      {children}
    </button>
  );
}
