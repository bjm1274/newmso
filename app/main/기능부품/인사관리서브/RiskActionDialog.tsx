'use client';

import type { ReactNode } from 'react';

export interface RiskActionDialogItem {
  label: string;
  value: ReactNode;
  tone?: 'default' | 'warning' | 'danger' | 'success';
}

export interface RiskActionDialogChange {
  label: string;
  before?: ReactNode;
  after?: ReactNode;
}

interface RiskActionDialogProps {
  open: boolean;
  title: string;
  description?: string;
  targetLabel?: string;
  items?: RiskActionDialogItem[];
  changes?: RiskActionDialogChange[];
  impacts?: string[];
  warnings?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  tone?: 'warning' | 'danger' | 'success';
  onCancel: () => void;
  onConfirm: () => void;
}

const toneClasses: Record<NonNullable<RiskActionDialogProps['tone']>, string> = {
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
  danger: 'border-rose-200 bg-rose-50 text-rose-700',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700' };

const itemToneClasses: Record<NonNullable<RiskActionDialogItem['tone']>, string> = {
  default: 'border-[var(--border)] bg-[var(--card)] text-[var(--foreground)]',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
  danger: 'border-rose-200 bg-rose-50 text-rose-700',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700' };

export default function RiskActionDialog({
  open,
  title,
  description,
  targetLabel,
  items = [],
  changes = [],
  impacts = [],
  warnings = [],
  confirmLabel = '확인 후 실행',
  cancelLabel = '취소',
  loading = false,
  tone = 'warning',
  onCancel,
  onConfirm }: RiskActionDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[150] flex min-h-screen items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--page-bg)] shadow-sm"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="border-b border-[var(--border)] bg-[var(--card)] px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--accent)]">Risk review</p>
              <h3 className="mt-1 text-lg font-bold text-[var(--foreground)]">{title}</h3>
              {description && <p className="mt-1 text-xs font-medium leading-5 text-[var(--toss-gray-4)]">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="min-h-[36px] rounded-[var(--radius-md)] px-3 text-xl font-bold text-[var(--toss-gray-3)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
              aria-label="닫기"
            >
              x
            </button>
          </div>
        </div>

        <div className="custom-scrollbar flex-1 space-y-4 overflow-y-auto p-5">
          {targetLabel && (
            <div className={`rounded-[var(--radius-lg)] border px-4 py-3 ${toneClasses[tone]}`}>
              <p className="text-[11px] font-bold uppercase tracking-wide">대상</p>
              <p className="mt-1 text-sm font-bold">{targetLabel}</p>
            </div>
          )}

          {items.length > 0 && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {items.map((item) => (
                <div key={item.label} className={`rounded-[var(--radius-md)] border px-3 py-2.5 ${itemToneClasses[item.tone || 'default']}`}>
                  <p className="text-[10px] font-bold uppercase tracking-wide opacity-70">{item.label}</p>
                  <div className="mt-1 text-sm font-bold break-words">{item.value}</div>
                </div>
              ))}
            </div>
          )}

          {changes.length > 0 && (
            <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4">
              <p className="text-sm font-bold text-[var(--foreground)]">변경 전후</p>
              <div className="mt-3 space-y-2">
                {changes.map((change) => (
                  <div key={change.label} className="grid grid-cols-1 gap-2 rounded-[var(--radius-md)] bg-[var(--muted)] p-3 md:grid-cols-[120px_1fr]">
                    <p className="text-[11px] font-bold text-[var(--accent)]">{change.label}</p>
                    <div className="text-xs font-semibold text-[var(--foreground)]">
                      <span className="block text-[var(--toss-gray-3)] line-through">{change.before ?? '(빈 값)'}</span>
                      <span className="mt-0.5 block text-emerald-700">→ {change.after ?? '(빈 값)'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {impacts.length > 0 && (
            <div className="rounded-[var(--radius-lg)] border border-sky-200 bg-sky-50 p-4 text-sky-800">
              <p className="text-sm font-bold">영향 범위</p>
              <ul className="mt-2 space-y-1.5 text-xs font-semibold leading-5">
                {impacts.map((impact) => (
                  <li key={impact}>- {impact}</li>
                ))}
              </ul>
            </div>
          )}

          {warnings.length > 0 && (
            <div className="rounded-[var(--radius-lg)] border border-amber-200 bg-amber-50 p-4 text-amber-800">
              <p className="text-sm font-bold">확인 필요</p>
              <ul className="mt-2 space-y-1.5 text-xs font-semibold leading-5">
                {warnings.map((warning) => (
                  <li key={warning}>- {warning}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex gap-3 border-t border-[var(--border)] bg-[var(--card)] px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm font-semibold text-[var(--toss-gray-4)] transition-colors hover:bg-[var(--muted)] disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            data-testid="risk-action-dialog-confirm"
            onClick={onConfirm}
            disabled={loading}
            className={`flex-[1.5] rounded-[var(--radius-md)] px-4 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50 ${
              tone === 'danger' ? 'bg-rose-600' : tone === 'success' ? 'bg-emerald-600' : 'bg-[var(--accent)]'
            }`}
          >
            {loading ? '처리 중...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
