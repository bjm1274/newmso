'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { BottomSheet } from './BottomSheet';
import { useIsMobile } from './useIsMobile';
import { useSheetHistory } from '../hooks/useSheetHistory';

export type ActionDialogTone = 'default' | 'accent' | 'danger';
export type ActionDialogMode = 'confirm' | 'prompt';
export type ActionDialogInputType = 'text' | 'password' | 'textarea';
export type ActionDialogMobileVariant = 'sheet' | 'modal';

export type ActionDialogState = {
  open: boolean;
  mode: ActionDialogMode;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  tone?: ActionDialogTone;
  placeholder?: string;
  initialValue?: string;
  inputType?: ActionDialogInputType;
  required?: boolean;
  maxLength?: number;
  helperText?: string;
  busy?: boolean;
  centerText?: boolean;
  largeText?: boolean;
};

type Props = ActionDialogState & {
  onCancel: () => void;
  onConfirm: (value?: string) => void;
  mobileVariant?: ActionDialogMobileVariant;
};

const toneClassNameMap: Record<ActionDialogTone, string> = {
  default: 'bg-[var(--foreground)] text-white hover:opacity-95',
  accent: 'bg-[var(--accent)] text-white hover:opacity-95',
  danger: 'bg-red-600 text-white hover:bg-red-700',
};

export default function ActionDialog({
  open,
  mode,
  title,
  description,
  confirmText = '확인',
  cancelText = '취소',
  tone = 'accent',
  placeholder,
  initialValue = '',
  inputType = 'text',
  required = false,
  maxLength,
  helperText,
  busy = false,
  centerText = false,
  largeText = false,
  onCancel,
  onConfirm,
  mobileVariant = 'sheet',
}: Props) {
  const isMobile = useIsMobile();
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const valueRef = useRef(initialValue);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;
    setValue(initialValue);
  }, [initialValue, open]);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    if (!open) return;

    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      if (mode === 'prompt' && inputType !== 'textarea') {
        inputRef.current?.select?.();
      }
    }, 10);

    return () => {
      window.clearTimeout(timer);
    };
  }, [inputType, mode, open]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!busy) onCancel();
      }
      if (event.key === 'Enter' && mode === 'confirm' && !busy) {
        event.preventDefault();
        onConfirm();
      }
      if (
        event.key === 'Enter' &&
        mode === 'prompt' &&
        inputType !== 'textarea' &&
        !event.shiftKey &&
        !busy
      ) {
        event.preventDefault();
        onConfirm(valueRef.current);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [busy, inputType, mode, onCancel, onConfirm, open]);

  const canConfirm = useMemo(() => {
    if (busy) return false;
    if (mode !== 'prompt') return true;
    if (!required) return true;
    return value.trim().length > 0;
  }, [busy, mode, required, value]);

  // 모바일 시트일 때만 뒤로가기로 닫히도록 history entry push
  const isMobileSheet = mobileVariant === 'sheet' && isMobile;
  const handleSheetClose = useCallback(() => {
    if (!busy) onCancel();
  }, [busy, onCancel]);
  useSheetHistory(open && isMobileSheet, handleSheetClose);

  if (!open) return null;

  const promptInput = mode === 'prompt' ? (
    <div className="mt-3 space-y-2">
      {inputType === 'textarea' ? (
        <textarea
          ref={inputRef as React.MutableRefObject<HTMLTextAreaElement | null>}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          rows={5}
          className="min-h-[132px] w-full resize-y rounded-[18px] border border-[var(--border)] bg-[var(--input-bg)] px-4 py-3 text-sm font-medium text-[var(--foreground)] outline-none transition-colors focus:border-[var(--accent)] focus:bg-[var(--card)]"
        />
      ) : (
        <input
          ref={inputRef as React.MutableRefObject<HTMLInputElement | null>}
          type={inputType}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          className="h-12 w-full rounded-[18px] border border-[var(--border)] bg-[var(--input-bg)] px-4 text-sm font-semibold text-[var(--foreground)] outline-none transition-colors focus:border-[var(--accent)] focus:bg-[var(--card)]"
        />
      )}
      {helperText ? (
        <p className="text-[11px] font-semibold leading-relaxed text-[var(--toss-gray-3)]">
          {helperText}
        </p>
      ) : null}
    </div>
  ) : null;

  const footerContent = (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className="flex-1 rounded-[16px] border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm font-bold text-[var(--toss-gray-4)] transition-colors hover:bg-[var(--muted)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {cancelText}
      </button>
      <button
        type="button"
        onClick={() => onConfirm(mode === 'prompt' ? value : undefined)}
        disabled={!canConfirm}
        className={`flex-1 rounded-[16px] px-4 py-3 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${toneClassNameMap[tone]}`}
      >
        {busy ? '처리 중...' : confirmText}
      </button>
    </div>
  );

  if (mobileVariant === 'sheet' && isMobile) {
    return (
      <BottomSheet
        open={open}
        onClose={() => { if (!busy) onCancel(); }}
        title={title}
        footer={footerContent}
      >
        {description ? (
          <p
            id={descriptionId}
            className={`whitespace-pre-line leading-relaxed text-[var(--toss-gray-4)] ${largeText ? 'text-2xl font-bold' : 'text-sm'} ${centerText ? 'text-center' : ''}`}
          >
            {description}
          </p>
        ) : null}
        {promptInput}
      </BottomSheet>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className="w-full max-w-md overflow-hidden rounded-[28px] border border-[var(--border)] bg-[var(--card)] shadow-sm"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={`space-y-3 px-5 py-5 ${centerText ? 'text-center' : ''}`}>
          <div className={`space-y-1.5 ${centerText ? 'flex flex-col items-center justify-center' : ''}`}>
            <h2 id={titleId} className={`font-black tracking-tight text-[var(--foreground)] ${largeText ? 'text-3xl sm:text-4xl leading-tight' : 'text-lg'} ${centerText ? 'text-center w-full' : ''}`}>
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className={`whitespace-pre-line leading-relaxed text-[var(--toss-gray-4)] ${largeText ? 'text-xl sm:text-2xl font-bold' : 'text-sm'} ${centerText ? 'text-center w-full' : ''}`}>
                {description}
              </p>
            ) : null}
          </div>
          {promptInput}
        </div>

        <div className="border-t border-[var(--border)] bg-[var(--background)]/40 px-5 py-4">
          {footerContent}
        </div>
      </div>
    </div>
  );
}
