'use client';

/**
 * Select.tsx — Phase 4 선택 컴포넌트
 *
 * 데스크톱: 네이티브 <select>
 * 모바일(responsive prop): 풀스크린 sheet로 전환
 *
 * JM4: 제네릭 SelectOption<T>
 * JM6: label for-id, aria-invalid, aria-describedby
 */

import React, { forwardRef, useId, useState } from 'react';
import { ChevronDown, Check, X } from 'lucide-react';

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface SelectProps<T extends string = string> {
  options: SelectOption<T>[];
  value?: T;
  onChange?: (value: T) => void;
  placeholder?: string;
  label?: string;
  error?: string;
  helperText?: string;
  disabled?: boolean;
  responsive?: boolean;
  id?: string;
  className?: string;
}

// ── 모바일 풀스크린 sheet ─────────────────────────────────────────────────────

interface MobileSheetProps<T extends string> {
  options: SelectOption<T>[];
  value?: T;
  onSelect: (v: T) => void;
  onClose: () => void;
  label?: string;
}

function MobileSheet<T extends string>({ options, value, onSelect, onClose, label }: MobileSheetProps<T>) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label ?? '항목 선택'}
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="mt-auto w-full rounded-t-[var(--radius-2xl)] overflow-hidden"
        style={{ background: 'var(--card)', maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <span className="text-sm font-semibold text-[var(--foreground)]">{label ?? '선택'}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="p-1.5 rounded-[var(--radius-md)] hover:bg-[var(--muted)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {/* 옵션 목록 */}
        <ul role="listbox" aria-label={label ?? '항목 목록'} className="overflow-y-auto py-1">
          {options.map((opt) => (
            <li key={opt.value} role="none">
              <button
                type="button"
                role="option"
                aria-selected={value === opt.value}
                disabled={opt.disabled}
                onClick={() => { onSelect(opt.value); onClose(); }}
                className="w-full flex items-center justify-between px-4 py-3 text-sm text-left hover:bg-[var(--muted)] disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
              >
                <span>{opt.label}</span>
                {value === opt.value && (
                  <Check size={16} aria-hidden="true" className="text-[var(--accent)]" />
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

function SelectInner<T extends string = string>(
  {
    options,
    value,
    onChange,
    placeholder,
    label,
    error,
    helperText,
    disabled = false,
    responsive = false,
    id,
    className = '',
  }: SelectProps<T>,
  ref: React.ForwardedRef<HTMLSelectElement>,
) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const errorId = `${selectId}-error`;
  const helperId = `${selectId}-helper`;
  const [sheetOpen, setSheetOpen] = useState(false);

  const describedBy = [error ? errorId : null, helperText ? helperId : null]
    .filter(Boolean)
    .join(' ') || undefined;

  const selectedLabel = options.find((o) => o.value === value)?.label ?? placeholder ?? '선택';

  return (
    <div className={['flex flex-col gap-1', className].filter(Boolean).join(' ')}>
      {label && (
        <label htmlFor={responsive ? undefined : selectId} className="text-xs font-medium text-[var(--foreground)]">
          {label}
        </label>
      )}

      {/* 모바일 responsive: 버튼 + sheet */}
      {responsive ? (
        <>
          <button
            type="button"
            id={selectId}
            disabled={disabled}
            aria-haspopup="listbox"
            aria-expanded={sheetOpen}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            onClick={() => setSheetOpen(true)}
            className={[
              'flex items-center justify-between w-full h-9 px-3 text-sm rounded-[var(--radius-md)]',
              'bg-[var(--card)] border transition-colors text-left',
              'focus-visible:outline-2 focus-visible:outline-[var(--accent)]',
              'disabled:opacity-50 disabled:pointer-events-none',
              error ? 'border-[var(--danger)]' : 'border-[var(--border)]',
            ].join(' ')}
          >
            <span className={value ? 'text-[var(--foreground)]' : 'text-[var(--toss-gray-4)]'}>
              {selectedLabel}
            </span>
            <ChevronDown size={14} aria-hidden="true" className="text-[var(--toss-gray-4)] flex-shrink-0" />
          </button>

          {sheetOpen && (
            <MobileSheet
              options={options}
              value={value}
              label={label}
              onSelect={(v) => onChange?.(v)}
              onClose={() => setSheetOpen(false)}
            />
          )}
        </>
      ) : (
        /* 데스크톱: 네이티브 select */
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            value={value ?? ''}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            onChange={(e) => onChange?.(e.target.value as T)}
            className={[
              'w-full h-9 pl-3 pr-8 text-sm rounded-[var(--radius-md)] appearance-none',
              'bg-[var(--card)] border transition-colors',
              'focus:outline-none focus:ring-2 focus:ring-[var(--accent)]',
              'disabled:opacity-50 disabled:pointer-events-none',
              error ? 'border-[var(--danger)]' : 'border-[var(--border)]',
              !value ? 'text-[var(--toss-gray-4)]' : 'text-[var(--foreground)]',
            ].join(' ')}
          >
            {placeholder && <option value="" disabled>{placeholder}</option>}
            {options.map((opt) => (
              <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown
            size={14}
            aria-hidden="true"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--toss-gray-4)] pointer-events-none"
          />
        </div>
      )}

      {error && (
        <p id={errorId} role="alert" className="text-xs text-[var(--danger)]">{error}</p>
      )}
      {!error && helperText && (
        <p id={helperId} className="text-xs text-[var(--toss-gray-4)]">{helperText}</p>
      )}
    </div>
  );
}

const Select = forwardRef(SelectInner) as <T extends string = string>(
  props: SelectProps<T> & { ref?: React.ForwardedRef<HTMLSelectElement> },
) => React.ReactElement;

export default Select;
