'use client';

/**
 * MobileHeader — 모바일 상단 헤더.
 * 뒤로가기·제목·서브타이틀·우상단 액션 버튼 슬롯.
 * JM: 단일 책임, ~60줄
 * JM6: back은 aria-label="뒤로", 버튼 시맨틱
 */

import type { ReactNode } from 'react';
import MIcon from '../공통/MIcon';

export type MobileHeaderProps = {
  title: string;
  sub?: ReactNode;
  /** 제목 위에 표시되는 작은 회색 라벨(모듈 카테고리). 허브 화면에서 사용. */
  eyebrow?: ReactNode;
  back?: () => void;
  actions?: ReactNode;
};

export default function MobileHeader({ title, sub, eyebrow, back, actions }: MobileHeaderProps) {
  return (
    <div className="m-header">
      {back && (
        <button
          type="button"
          className="back"
          onClick={back}
          aria-label="뒤로"
        >
          <MIcon name="chevL" size={22} />
        </button>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <div className="title">{title}</div>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}
