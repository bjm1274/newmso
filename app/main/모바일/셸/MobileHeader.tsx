import type { ReactNode } from 'react';
import MIcon from '../공통/MIcon';

export type MobileHeaderProps = {
  title: string;
  sub?: ReactNode;
  /** 제목 위에 표시되는 작은 회색 라벨(모듈 카테고리). 허브 화면에서 사용. */
  eyebrow?: ReactNode;
  back?: () => void;
  backIcon?: string;
  actions?: ReactNode;
};

export default function MobileHeader({ title, sub, eyebrow, back, backIcon, actions }: MobileHeaderProps) {
  return (
    <div
      className="m-header"
      style={{
        /* 상태바 침범은 .mso-mobile top:sat 가 원천 차단 — 헤더는 이중 sat 패딩 금지 */
        paddingTop: 14,
        paddingRight: 20,
        paddingBottom: 12,
        paddingLeft: 20,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        borderBottom: '1px solid var(--m-border)',
        position: 'sticky',
        top: 0,
        zIndex: 99,
        // 반투명 유리는 스크롤되는 콘텐츠에 따라 제목 대비가 바뀐다. 카드 배경 고정.
        background: 'var(--m-card)' }}
    >


      {back && (
        <button
          type="button"
          onClick={back}
          aria-label="뒤로"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            borderRadius: 8,
            background: 'rgba(0, 0, 0, 0.03)',
            border: '1px solid rgba(0, 0, 0, 0.05)',
            cursor: 'pointer',
            flexShrink: 0 }}
        >
          <MIcon name={backIcon || 'chevL'} size={18} color="var(--z-600)" />
        </button>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        {eyebrow && (
          <div
            className="eyebrow"
            style={{
              fontSize: 10,
              fontWeight: 800,
              color: 'var(--z-500)',
              letterSpacing: 0.5,
              textTransform: 'uppercase',
              marginBottom: 1 }}
          >
            {eyebrow}
          </div>
        )}
        <div
          className="title"
          style={{
            fontSize: 16.5,
            fontWeight: 800,
            color: 'var(--foreground)',
            letterSpacing: '-0.02em',
            lineHeight: 1.25 }}
        >
          {title}
        </div>
        {sub && (
          <div
            className="sub"
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--z-500)',
              marginTop: 2 }}
          >
            {sub}
          </div>
        )}
      </div>

      {actions && (
        <div
          className="actions"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexShrink: 0 }}
        >
          {actions}
        </div>
      )}
    </div>
  );
}
