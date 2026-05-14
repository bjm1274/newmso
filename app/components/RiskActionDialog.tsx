'use client';

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { BottomSheet } from './BottomSheet';
import { useIsMobile } from './useIsMobile';

export type RiskActionSeverity = 'warning' | 'danger' | 'critical';
export type RiskActionMobileVariant = 'sheet' | 'modal';
export type RiskActionTone = 'neutral' | 'info' | 'warning' | 'danger' | 'success';

export type RiskActionSummaryItem = {
  label: string;
  value: ReactNode;
  tone?: RiskActionTone;
};

export type RiskActionChangeItem = {
  label: string;
  before?: ReactNode;
  after?: ReactNode;
};

type RiskActionDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  severity?: RiskActionSeverity;
  targetLabel?: string;
  targetValue?: ReactNode;
  impacts?: RiskActionSummaryItem[];
  changes?: RiskActionChangeItem[];
  warnings?: ReactNode[];
  confirmationPhrase?: string;
  confirmationLabel?: string;
  confirmText?: string;
  cancelText?: string;
  busy?: boolean;
  children?: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
  mobileVariant?: RiskActionMobileVariant;
};

const severityConfig: Record<RiskActionSeverity, { label: string; className: string; button: string }> = {
  warning: {
    label: '주의',
    className: 'border-amber-200 bg-amber-50 text-amber-800',
    button: 'bg-amber-600 text-white hover:bg-amber-700',
  },
  danger: {
    label: '위험',
    className: 'border-red-200 bg-red-50 text-red-700',
    button: 'bg-red-600 text-white hover:bg-red-700',
  },
  critical: {
    label: '중대 위험',
    className: 'border-red-300 bg-red-600 text-white',
    button: 'bg-red-700 text-white hover:bg-red-800',
  },
};

const toneClassName: Record<RiskActionTone, string> = {
  neutral: 'border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--foreground)]',
  info: 'border-blue-200 bg-blue-50 text-blue-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  danger: 'border-red-200 bg-red-50 text-red-700',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
};

export function RiskActionDialog({
  open,
  title,
  description,
  severity = 'danger',
  targetLabel = '대상',
  targetValue,
  impacts = [],
  changes = [],
  warnings = [],
  confirmationPhrase,
  confirmationLabel = '확인 문구',
  confirmText = '실행',
  cancelText = '취소',
  busy = false,
  children,
  onCancel,
  onConfirm,
  mobileVariant = 'sheet',
}: RiskActionDialogProps) {
  const isMobile = useIsMobile();
  const [typedPhrase, setTypedPhrase] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const config = severityConfig[severity];

  useEffect(() => {
    if (!open) return;
    setTypedPhrase('');
    const timer = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        event.preventDefault();
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [busy, onCancel, open]);

  const canConfirm = useMemo(() => {
    if (busy) return false;
    if (!confirmationPhrase) return true;
    return typedPhrase.trim() === confirmationPhrase;
  }, [busy, confirmationPhrase, typedPhrase]);

  if (!open) return null;

  const bodyContent = (
    <div className="space-y-5">
      {targetValue ? (
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-subtle)] p-4">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--muted-foreground)]">{targetLabel}</p>
          <div className="mt-2 text-sm font-bold text-[var(--foreground)]">{targetValue}</div>
        </div>
      ) : null}

      {impacts.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-black text-[var(--foreground)]">영향 범위</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {impacts.map((item) => (
              <div
                key={item.label}
                className={`rounded-[var(--radius-lg)] border px-3 py-3 ${toneClassName[item.tone ?? 'neutral']}`}
              >
                <p className="text-[11px] font-bold opacity-75">{item.label}</p>
                <div className="mt-1 text-sm font-black">{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {changes.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-black text-[var(--foreground)]">변경 전후</h3>
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)]">
            {changes.map((item) => (
              <div key={item.label} className="grid gap-2 border-b border-[var(--border)] p-3 last:border-b-0 sm:grid-cols-[140px_1fr_1fr]">
                <p className="text-xs font-black text-[var(--muted-foreground)]">{item.label}</p>
                <div className="rounded-[var(--radius-md)] bg-[var(--surface-subtle)] px-3 py-2 text-sm text-[var(--muted-foreground)]">
                  {item.before ?? '-'}
                </div>
                <div className="rounded-[var(--radius-md)] bg-[var(--accent-light)] px-3 py-2 text-sm font-bold text-[var(--accent)]">
                  {item.after ?? '-'}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-black text-[var(--foreground)]">확인 필요</h3>
          <ul className="space-y-2">
            {warnings.map((warning, index) => (
              <li key={index} className="rounded-[var(--radius-lg)] border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold leading-relaxed text-red-700">
                {warning}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {children}

      {confirmationPhrase ? (
        <div className="space-y-2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-subtle)] p-4">
          <label htmlFor={`${titleId}-confirmation`} className="text-sm font-black text-[var(--foreground)]">
            {confirmationLabel}
          </label>
          <p className="text-xs font-semibold leading-relaxed text-[var(--muted-foreground)]">
            계속하려면 아래 입력창에 <span className="font-black text-[var(--danger)]">{confirmationPhrase}</span> 를 정확히 입력하세요.
          </p>
          <input
            ref={inputRef}
            id={`${titleId}-confirmation`}
            value={typedPhrase}
            onChange={(event) => setTypedPhrase(event.target.value)}
            disabled={busy}
            className="h-11 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-3 text-sm font-bold text-[var(--foreground)] outline-none transition-colors focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>
      ) : null}
    </div>
  );

  const actionButtons = (
    <>
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-4 text-sm font-black text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {cancelText}
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={!canConfirm}
        className={`min-h-11 rounded-[var(--radius-md)] px-4 text-sm font-black transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${config.button}`}
      >
        {busy ? '처리 중...' : confirmText}
      </button>
    </>
  );

  if (mobileVariant === 'sheet' && isMobile) {
    const severityBadge = (
      <div className={`mb-3 inline-flex min-h-8 items-center rounded-full border px-3 text-xs font-black ${config.className}`}>
        {config.label}
      </div>
    );

    const sheetFooter = (
      <div className="flex flex-col gap-2">
        {/* 위험 액션 버튼은 시트 하단 sticky 영역에 배치 */}
        <button
          type="button"
          onClick={onConfirm}
          disabled={!canConfirm}
          className={`w-full min-h-12 rounded-[var(--radius-md)] px-4 text-sm font-black transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${config.button}`}
        >
          {busy ? '처리 중...' : confirmText}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="w-full min-h-11 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-4 text-sm font-black text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {cancelText}
        </button>
      </div>
    );

    return (
      <BottomSheet
        open={open}
        onClose={() => { if (!busy) onCancel(); }}
        title={title}
        mode="full"
        footer={sheetFooter}
      >
        {description ? (
          <p
            id={descriptionId}
            className="mb-4 whitespace-pre-line text-sm leading-relaxed text-[var(--muted-foreground)]"
          >
            {description}
          </p>
        ) : null}
        {severityBadge}
        {bodyContent}
      </BottomSheet>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-lg)]"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="space-y-4 border-b border-[var(--border)] px-5 py-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <div className={`inline-flex min-h-8 items-center rounded-full border px-3 text-xs font-black ${config.className}`}>
                {config.label}
              </div>
              <h2 id={titleId} className="text-xl font-black leading-tight text-[var(--foreground)]">
                {title}
              </h2>
            </div>
          </div>
          {description ? (
            <p id={descriptionId} className="whitespace-pre-line text-sm leading-relaxed text-[var(--muted-foreground)]">
              {description}
            </p>
          ) : null}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {bodyContent}
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t border-[var(--border)] bg-[var(--surface-subtle)] px-5 py-4 sm:flex-row sm:justify-end">
          {actionButtons}
        </footer>
      </section>
    </div>
  );
}
