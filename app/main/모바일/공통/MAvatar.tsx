'use client';

/**
 * MAvatar — 정사각 라운드 아바타.
 * size: sm(32) | default(44) | lg(56)
 * tone: blue | violet | pink | green | orange | cyan | gray
 * JM: 단일 책임, ~40줄
 */

import { memo, type ReactNode } from 'react';

export type MAvatarTone = 'blue' | 'violet' | 'pink' | 'green' | 'orange' | 'cyan' | 'gray';
export type MAvatarSize = 'sm' | 'default' | 'lg';

export type MAvatarProps = {
  tone?: MAvatarTone;
  size?: MAvatarSize;
  children: ReactNode;
  className?: string;
};

function MAvatarBase({ tone = 'blue', size = 'default', children, className }: MAvatarProps) {
  const classes = [
    'm-avatar',
    size !== 'default' ? size : '',
    `tone-${tone}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return <div className={classes} aria-hidden="true" style={{ overflow: 'hidden' }}>{children}</div>;
}

const MAvatar = memo(MAvatarBase);
export default MAvatar;
