'use client';

/**
 * MobileBottomTab — 5탭 바텀 네비게이션 (홈·채팅·게시판·결재·더보기)
 * JM: 단일 책임, ~60줄
 * JM6: 모든 탭 button 시맨틱 + aria-current
 */

import { memo } from 'react';
import MIcon from '../공통/MIcon';
import type { MTab } from './m-routes';

const TABS: { id: MTab; icon: string; label: string }[] = [
  { id: 'home', icon: 'home', label: '홈' },
  { id: 'chat', icon: 'chat', label: '채팅' },
  { id: 'board', icon: 'board', label: '게시판' },
  { id: 'approval', icon: 'approval', label: '결재' },
  { id: 'more', icon: 'more', label: '더보기' },
];

export type MobileBottomTabProps = {
  active: MTab;
  onChange: (tab: MTab) => void;
  dots?: Partial<Record<MTab, boolean>>;
};

function MobileBottomTabBase({ active, onChange, dots }: MobileBottomTabProps) {
  return (
    <nav className="m-bottom-tab" aria-label="주 네비게이션">
      {TABS.map((t) => {
        const on = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            className={on ? 'on' : ''}
            onClick={() => onChange(t.id)}
            aria-current={on ? 'page' : undefined}
            aria-label={t.label}
          >
            <div className="ico-wrap">
              <MIcon name={t.icon} size={22} strokeWidth={on ? 2.4 : 2} />
              {dots?.[t.id] && <span className="dot" />}
            </div>
            <span className="lab">{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

const MobileBottomTab = memo(MobileBottomTabBase);
export default MobileBottomTab;
