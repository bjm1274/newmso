'use client';

/**
 * MCard — 기본 카드 컨테이너.
 * flush: padding 0 + overflow hidden (리스트 행을 감쌀 때)
 * JM: 단일 책임, ~30줄
 */

import { memo, type CSSProperties, type ReactNode } from 'react';

export type MCardProps = {
  flush?: boolean;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
};

function MCardBase({ flush = false, children, className, style, onClick }: MCardProps) {
  const classes = ['m-card', flush ? 'flush' : '', className].filter(Boolean).join(' ');
  return (
    <div className={classes} style={style} onClick={onClick}>
      {children}
    </div>
  );
}

const MCard = memo(MCardBase);
export default MCard;
