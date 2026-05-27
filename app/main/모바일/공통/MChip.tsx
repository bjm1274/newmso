'use client';

/**
 * MChip — 22px pill 칩
 * tone: '' | 'accent' | 'success' | 'warning' | 'danger'
 * dot: 좌측 6px 색상 점
 * JM: 단일 책임, ~30줄
 */

import { memo, type ReactNode } from 'react';

export type MChipTone = '' | 'accent' | 'success' | 'warning' | 'danger';

export type MChipProps = {
  tone?: MChipTone;
  dot?: boolean;
  children: ReactNode;
  className?: string;
};

function MChipBase({ tone = '', dot = false, children, className }: MChipProps) {
  const classes = ['m-chip', tone, dot ? 'dot' : '', className]
    .filter(Boolean)
    .join(' ');
  return <span className={classes}>{children}</span>;
}

const MChip = memo(MChipBase);
export default MChip;
