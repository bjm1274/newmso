'use client';

import type { CSSProperties, ReactNode } from 'react';

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 900,
        color: 'var(--z-500)',
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        margin: '4px 0 6px',
      }}
    >
      {children}
    </div>
  );
}

type IconBtnProps = {
  ariaLabel: string;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
  tone?: 'default' | 'danger';
  /** 기본 26(결재선), 참조 chip 은 22 */
  size?: number;
};

export function IconBtn({
  ariaLabel,
  onClick,
  children,
  disabled,
  tone = 'default',
  size = 26,
}: IconBtnProps) {
  const color =
    tone === 'danger' ? 'var(--m-danger)' : disabled ? 'var(--z-400)' : 'var(--z-700)';
  return (
    <button
      type="button"
      className="transition-all active:scale-90 duration-100"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      style={{
        width: size,
        height: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 8,
        background: 'rgba(0, 0, 0, 0.03)',
        border: '1px solid rgba(0, 0, 0, 0.05)',
        color,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

export const memberRowStyle: CSSProperties = {
  display: 'flex',
  width: '100%',
  alignItems: 'center',
  padding: '10px 8px',
  background: 'transparent',
  border: 'none',
  borderBottom: '1px solid rgba(0, 0, 0, 0.04)',
  cursor: 'pointer',
};

export const emptyStyle: CSSProperties = {
  textAlign: 'center',
  padding: '20px 0',
  fontSize: 12,
  color: 'var(--z-500)',
  fontWeight: 800,
};

export function actionStyle(kind: 'primary' | 'ghost'): CSSProperties {
  const base: CSSProperties = {
    flex: 1,
    height: 44,
    fontSize: 14,
    fontWeight: 900,
    cursor: 'pointer',
    border: '1px solid rgba(0, 0, 0, 0.06)',
  };
  if (kind === 'primary') {
    return {
      ...base,
      background: '#007AFF',
      color: '#fff',
      border: 'none',
      boxShadow: '0 2px 8px rgba(0, 122, 255, 0.2)',
    };
  }
  return { ...base, background: 'rgba(255, 255, 255, 0.6)', color: 'var(--z-700)' };
}
