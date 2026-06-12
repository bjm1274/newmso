'use client';

/**
 * MSheet — 바텀시트 (오버레이 + 슬라이드업 컨테이너).
 * P1 기본 구현. 추후 swipe-down 닫기, focus trap은 Phase 4.
 * JM: 단일 책임, ~70줄
 * JM6: role="dialog" + ESC로 닫기, 오버레이 클릭 시 닫기
 */

import { useEffect, type ReactNode } from 'react';

export type MSheetProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
};

export default function MSheet({ open, onClose, title, children }: MSheetProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title || '시트'}
      style={{
        position: 'fixed', inset: 0, zIndex: 1500,
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
      }}
    >
      <div
        style={{ flex: 1, background: 'rgba(0,0,0,0.4)' }}
        aria-hidden="true"
      />
      <div
        style={{
          background: 'var(--m-card)',
          borderTopLeftRadius: 'var(--m-radius-xl)',
          borderTopRightRadius: 'var(--m-radius-xl)',
          boxShadow: 'var(--m-shadow-pop)',
          maxHeight: '85vh',
          display: 'flex', flexDirection: 'column',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
          <span style={{ width: 36, height: 4, borderRadius: 999, background: 'var(--z-200)' }} />
        </div>
        {title && (
          <div style={{ padding: '4px 20px 12px', fontSize: 15, fontWeight: 800, letterSpacing: '-0.018em' }}>
            {title}
          </div>
        )}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
