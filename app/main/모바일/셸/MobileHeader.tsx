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
      className="m-header macos-glass"
      style={{
        padding: '16px 20px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        borderBottom: '1px solid rgba(0, 0, 0, 0.05)',
        position: 'sticky',
        top: 0,
        zIndex: 99,
        background: 'rgba(255, 255, 255, 0.65)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
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
            flexShrink: 0,
          }}
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
              marginBottom: 1,
            }}
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
            lineHeight: 1.25,
          }}
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
              marginTop: 2,
            }}
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
            flexShrink: 0,
          }}
        >
          {actions}
        </div>
      )}
    </div>
  );
}
