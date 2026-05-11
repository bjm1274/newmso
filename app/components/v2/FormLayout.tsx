'use client';

/**
 * FormLayout.tsx — Phase 4 폼 레이아웃
 *
 * label-input 정렬, error 영역, 반응형 컬럼
 * JM6: fieldset/legend, role 연결
 * JM4: any 금지
 */

import React from 'react';

// ── FormField ─────────────────────────────────────────────────────────────────

export interface FormFieldProps {
  label?: string;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  helperText?: string;
  children: React.ReactNode;
  className?: string;
}

export function FormField({
  label,
  htmlFor,
  required = false,
  error,
  helperText,
  children,
  className = '',
}: FormFieldProps) {
  return (
    <div className={['flex flex-col gap-1', className].join(' ')}>
      {label && (
        <label
          htmlFor={htmlFor}
          className="text-xs font-medium text-[var(--foreground)]"
          style={{ letterSpacing: '-0.01em' }}
        >
          {label}
          {required && (
            <span aria-hidden="true" className="text-[var(--danger)] ml-0.5">*</span>
          )}
          {required && <span className="sr-only">(필수)</span>}
        </label>
      )}

      {children}

      {error && (
        <p role="alert" className="text-xs text-[var(--danger)]">{error}</p>
      )}
      {!error && helperText && (
        <p className="text-xs text-[var(--toss-gray-4)]">{helperText}</p>
      )}
    </div>
  );
}

// ── FormSection ───────────────────────────────────────────────────────────────

export interface FormSectionProps {
  legend?: string;
  description?: string;
  columns?: 1 | 2 | 3;
  children: React.ReactNode;
  className?: string;
}

export function FormSection({
  legend,
  description,
  columns = 1,
  children,
  className = '',
}: FormSectionProps) {
  const colClass: Record<number, string> = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  };

  const inner = (
    <div className={['grid gap-4', colClass[columns]].join(' ')}>
      {children}
    </div>
  );

  if (!legend) {
    return <div className={className}>{inner}</div>;
  }

  return (
    <fieldset
      className={['border-0 p-0 m-0 flex flex-col gap-3', className].join(' ')}
    >
      <div>
        <legend className="text-sm font-semibold text-[var(--foreground)]">{legend}</legend>
        {description && (
          <p className="text-xs text-[var(--toss-gray-4)] mt-0.5">{description}</p>
        )}
      </div>
      {inner}
    </fieldset>
  );
}

// ── FormActions ───────────────────────────────────────────────────────────────

export interface FormActionsProps {
  align?: 'left' | 'right' | 'center' | 'between';
  children: React.ReactNode;
  className?: string;
  sticky?: boolean;
}

const ALIGN_CLASSES: Record<string, string> = {
  left:    'justify-start',
  right:   'justify-end',
  center:  'justify-center',
  between: 'justify-between',
};

export function FormActions({
  align = 'right',
  children,
  className = '',
  sticky = false,
}: FormActionsProps) {
  return (
    <div
      className={[
        'flex items-center gap-2 pt-4',
        ALIGN_CLASSES[align],
        sticky
          ? 'sticky bottom-0 bg-[var(--card)] border-t border-[var(--border)] py-3 -mx-4 px-4'
          : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  );
}

// ── FormLayout 래퍼 ──────────────────────────────────────────────────────────

export interface FormLayoutProps {
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void;
  noValidate?: boolean;
  ariaLabel?: string;
  gap?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  className?: string;
}

const GAP_CLASSES: Record<string, string> = {
  sm: 'gap-3',
  md: 'gap-5',
  lg: 'gap-6',
};

export default function FormLayout({
  onSubmit,
  noValidate = true,
  ariaLabel,
  gap = 'md',
  children,
  className = '',
}: FormLayoutProps) {
  return (
    <form
      onSubmit={onSubmit}
      noValidate={noValidate}
      aria-label={ariaLabel}
      className={['flex flex-col', GAP_CLASSES[gap], className].join(' ')}
    >
      {children}
    </form>
  );
}
