'use client';

/**
 * MBtn — 모바일 버튼.
 * variant: default | primary | danger | warning | ghost
 * size: default(44px) | lg(52px)
 * block: 100% 폭
 * JM: 단일 책임, ~60줄
 * JM6: button 시맨틱 + aria-label 지원 + 비활성 처리
 */

import { memo, type ReactNode } from 'react';
import MIcon from './MIcon';

export type MBtnVariant = 'default' | 'primary' | 'danger' | 'warning' | 'ghost';

export type MBtnProps = {
  variant?: MBtnVariant;
  block?: boolean;
  lg?: boolean;
  disabled?: boolean;
  icon?: string;
  iconRight?: string;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
  ariaLabel?: string;
  children?: ReactNode;
  className?: string;
};

function MBtnBase({
  variant = 'default',
  block = false,
  lg = false,
  disabled = false,
  icon,
  iconRight,
  onClick,
  type = 'button',
  ariaLabel,
  children,
  className,
}: MBtnProps) {
  const classes = [
    'm-btn',
    variant === 'default' ? '' : variant,
    block ? 'block' : '',
    lg ? 'lg' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type={type}
      className={classes}
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
    >
      {icon && <MIcon name={icon} size={lg ? 18 : 16} />}
      {children}
      {iconRight && <MIcon name={iconRight} size={lg ? 18 : 16} />}
    </button>
  );
}

const MBtn = memo(MBtnBase);
export default MBtn;
