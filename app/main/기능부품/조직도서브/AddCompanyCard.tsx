'use client';

import { useEffect, useRef } from 'react';

type AddCompanyCardProps = {
  onClick: () => void;
};

type AddCompanyHintModalProps = {
  open: boolean;
  onClose: () => void;
};

// 마지막 회사 카드 뒤에 노출되는 dashed 영역.
// 클릭하면 부모가 안내 모달을 띄운다. (실제 회사 추가는 인사관리 > 회사관리에서)
export function AddCompanyCard({ onClick }: AddCompanyCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="새 회사·병원 추가"
      data-testid="org-add-company-card"
      className={[
        'flex w-full flex-col items-center justify-center gap-2',
        'rounded-[var(--radius-lg)] border-2 border-dashed border-[var(--border)]',
        'bg-[var(--card)]/40 px-5 py-10 text-center',
        'text-[var(--toss-gray-4)] transition',
        'hover:border-[var(--accent)]/60 hover:bg-[var(--card)] hover:text-[var(--accent)]',
        'focus-visible:border-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30',
        'active:scale-[0.995]',
      ].join(' ')}
    >
      <span
        aria-hidden
        className="flex h-9 w-9 items-center justify-center rounded-full border border-current/30 text-lg font-bold"
      >
        +
      </span>
      <span className="text-sm font-bold">새 회사·병원 추가</span>
      <span className="text-[11px] font-medium text-[var(--toss-gray-3)]">
        인사관리 &gt; 회사관리 메뉴에서 등록할 수 있습니다
      </span>
    </button>
  );
}

// 안내 모달 — 별도 라이브러리 없이 가벼운 dialog 패턴.
// ESC 닫기, 배경 클릭 닫기, 포커스 트랩(간단형) 포함.
export function AddCompanyHintModal({ open, onClose }: AddCompanyHintModalProps) {
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="org-add-company-hint-title"
      data-testid="org-add-company-hint"
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 backdrop-blur-sm md:items-center md:p-6"
    >
      <div
        className="w-full max-w-sm rounded-t-3xl bg-[var(--card)] p-6 shadow-2xl md:rounded-[var(--radius-xl)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/10 text-lg font-black text-[var(--accent)]"
          >
            i
          </span>
          <div className="min-w-0">
            <h3
              id="org-add-company-hint-title"
              className="text-base font-black text-[var(--foreground)]"
            >
              새 회사·병원 추가
            </h3>
            <p className="mt-1 text-sm font-medium text-[var(--toss-gray-4)]">
              회사·병원 등록과 직원 배정은{' '}
              <strong className="font-bold text-[var(--foreground)]">
                인사관리 &gt; 회사관리
              </strong>{' '}
              메뉴에서 진행할 수 있습니다. 권한이 필요한 경우 관리자에게 문의해 주세요.
            </p>
          </div>
        </div>
        <button
          ref={confirmRef}
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-2xl bg-[var(--accent)] py-3 text-sm font-bold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30"
        >
          확인
        </button>
      </div>
    </div>
  );
}
