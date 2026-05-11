'use client';

/**
 * Input.tsx — Phase 4 텍스트 입력 컴포넌트
 *
 * type: text | email | password | number
 * label, error, helperText 지원
 *
 * JM6: label for-id 연결, aria-invalid, aria-describedby
 * JM4: forwardRef, 명시적 타입
 */

import React, { forwardRef, useId } from 'react';

export type InputType = 'text' | 'email' | 'password' | 'number' | 'tel' | 'search';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  type?: InputType;
  label?: string;
  error?: string;
  helperText?: string;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
  fullWidth?: boolean;
}

const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    type = 'text',
    label,
    error,
    helperText,
    iconLeft,
    iconRight,
    fullWidth = true,
    id,
    className = '',
    disabled,
    ...rest
  },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;
  const helperId = `${inputId}-helper`;

  const describedBy = [error ? errorId : null, helperText ? helperId : null]
    .filter(Boolean)
    .join(' ') || undefined;

  return (
    <div className={['flex flex-col gap-1', fullWidth ? 'w-full' : '', className].filter(Boolean).join(' ')}>
      {label && (
        <label
          htmlFor={inputId}
          className="text-xs font-medium text-[var(--foreground)]"
          style={{ letterSpacing: '-0.01em' }}
        >
          {label}
        </label>
      )}

      <div className="relative flex items-center">
        {iconLeft && (
          <span
            aria-hidden="true"
            className="absolute left-2.5 flex items-center pointer-events-none text-[var(--toss-gray-4)]"
            style={{ lineHeight: 0 }}
          >
            {iconLeft}
          </span>
        )}

        <input
          ref={ref}
          id={inputId}
          type={type}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={[
            'w-full h-9 px-3 text-sm rounded-[var(--radius-md)]',
            'bg-[var(--card)] text-[var(--foreground)]',
            'border transition-colors duration-[var(--transition-fast)]',
            'placeholder:text-[var(--toss-gray-4)]',
            'focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-0',
            'disabled:opacity-50 disabled:pointer-events-none',
            error
              ? 'border-[var(--danger)] focus:ring-[var(--danger)]'
              : 'border-[var(--border)] focus:border-[var(--accent)]',
            iconLeft ? 'pl-8' : '',
            iconRight ? 'pr-8' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          {...rest}
        />

        {iconRight && (
          <span
            aria-hidden="true"
            className="absolute right-2.5 flex items-center pointer-events-none text-[var(--toss-gray-4)]"
            style={{ lineHeight: 0 }}
          >
            {iconRight}
          </span>
        )}
      </div>

      {error && (
        <p id={errorId} role="alert" className="text-xs text-[var(--danger)]">
          {error}
        </p>
      )}

      {!error && helperText && (
        <p id={helperId} className="text-xs text-[var(--toss-gray-4)]">
          {helperText}
        </p>
      )}
    </div>
  );
});

Input.displayName = 'Input';

export default Input;
