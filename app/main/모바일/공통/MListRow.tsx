'use client';

/**
 * MListRow — 40px / 1fr / auto 그리드 리스트 행.
 * icon + label + sub + value(또는 chevR)
 * JM: 단일 책임, ~70줄
 * JM6: 클릭 가능 시 button 시맨틱 사용
 */

import { memo, type ReactNode } from 'react';
import MIcon from './MIcon';

export type MListRowTone = '' | 'accent' | 'success' | 'warning' | 'danger';

export type MListRowProps = {
  icon?: string;
  iconTone?: MListRowTone;
  label: ReactNode;
  sub?: ReactNode;
  val?: ReactNode;
  valUnit?: string;
  onClick?: () => void;
  ariaLabel?: string;
  rightSlot?: ReactNode;
};

function MListRowBase({
  icon,
  iconTone = '',
  label,
  sub,
  val,
  valUnit,
  onClick,
  ariaLabel,
  rightSlot,
}: MListRowProps) {
  const content = (
    <>
      <div className={'ico-tile' + (iconTone ? ' tone-' + iconTone : '')}>
        {icon && <MIcon name={icon} size={18} />}
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="lbl">{label}</div>
        {sub && <div className="sub">{sub}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {val !== undefined && val !== null && val !== '' && (
          <span className="val m-tnum">
            {val}
            {valUnit && <span className="u">{valUnit}</span>}
          </span>
        )}
        {rightSlot}
        {onClick && val === undefined && !rightSlot && (
          <MIcon name="chevR" size={18} color="var(--z-400)" />
        )}
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className="m-list-row"
        onClick={onClick}
        aria-label={ariaLabel}
        style={{ textAlign: 'left', width: '100%' }}
      >
        {content}
      </button>
    );
  }
  return <div className="m-list-row">{content}</div>;
}

const MListRow = memo(MListRowBase);
export default MListRow;
