'use client';

/**
 * Input.tsx — MSO 표준 텍스트 입력 컴포넌트
 *
 * 모바일 표준화(MSO_Mobile_Advanced.md §2)에 따라 `kind` prop 하나로
 * type/inputMode/autoComplete/autoCapitalize/autoCorrect/maxLength 를 일괄 지정한다.
 *
 * - 한글 IME 가드 핸들러 자동 부착 (useKoreanImeGuard) → 사용처에서 isComposing() 활용 가능
 * - label htmlFor ↔ input id 자동 연결 (id 미지정 시 useId)
 * - error 메시지 영역 (aria-invalid / aria-describedby 자동 연결)
 *
 * 기존 input 사용처 영향 없도록 `kind`는 옵션 (미지정 시 type='text').
 *
 * JM: 단일 책임 — 텍스트 입력 1개의 표준 어댑터 (mask/format 별도)
 * JM3: 외부에서 던진 onChange 그대로 호출, 내부에서 swallow 하지 않음
 * JM4: any 금지, Omit<InputHTMLAttributes, 'type'> 확장
 * JM6: <label htmlFor> 자동 연결, aria-invalid/aria-describedby 명시
 */

import React, { forwardRef, useId } from 'react';
import type { InputHTMLAttributes } from 'react';
import { useKoreanImeGuard } from '../hooks/useKoreanImeGuard';

// ── kind → HTML 속성 매핑 ─────────────────────────────────────────────────────

export type InputKind =
  | 'text'
  | 'name'
  | 'phone'
  | 'tel'
  | 'email'
  | 'number'
  | 'decimal'
  | 'password'
  | 'rrn'
  | 'biz-no'
  | 'search'
  | 'url';

interface KindAttrs {
  type: 'text' | 'tel' | 'email' | 'number' | 'password' | 'search' | 'url';
  inputMode?: InputHTMLAttributes<HTMLInputElement>['inputMode'];
  autoComplete?: string;
  autoCapitalize?: 'off' | 'none' | 'on' | 'sentences' | 'words' | 'characters';
  autoCorrect?: 'on' | 'off';
  spellCheck?: boolean;
  maxLength?: number;
}

const KIND_TABLE: Record<InputKind, KindAttrs> = {
  text: { type: 'text' },
  name: {
    type: 'text',
    inputMode: 'text',
    autoComplete: 'name',
    autoCapitalize: 'words',
    autoCorrect: 'off',
    spellCheck: false,
  },
  phone: {
    type: 'tel',
    inputMode: 'tel',
    autoComplete: 'tel',
    autoCorrect: 'off',
    spellCheck: false,
    maxLength: 13, // 010-0000-0000
  },
  tel: {
    type: 'tel',
    inputMode: 'tel',
    autoComplete: 'tel',
    autoCorrect: 'off',
    spellCheck: false,
  },
  email: {
    type: 'email',
    inputMode: 'email',
    autoComplete: 'email',
    autoCapitalize: 'none',
    autoCorrect: 'off',
    spellCheck: false,
  },
  number: {
    type: 'text', // type='number' 의 휠/화살표 부작용 회피, inputMode로 숫자 키보드
    inputMode: 'numeric',
    autoComplete: 'off',
    autoCorrect: 'off',
    spellCheck: false,
  },
  decimal: {
    type: 'text',
    inputMode: 'decimal',
    autoComplete: 'off',
    autoCorrect: 'off',
    spellCheck: false,
  },
  password: {
    type: 'password',
    autoComplete: 'current-password',
    autoCapitalize: 'off',
    autoCorrect: 'off',
    spellCheck: false,
  },
  rrn: {
    type: 'text',
    inputMode: 'numeric',
    autoComplete: 'off',
    autoCorrect: 'off',
    spellCheck: false,
    maxLength: 14, // 000000-0000000
  },
  'biz-no': {
    type: 'text',
    inputMode: 'numeric',
    autoComplete: 'off',
    autoCorrect: 'off',
    spellCheck: false,
    maxLength: 12, // 000-00-00000
  },
  search: {
    type: 'search',
    inputMode: 'search',
    autoComplete: 'off',
  },
  url: {
    type: 'url',
    inputMode: 'url',
    autoComplete: 'url',
    autoCapitalize: 'none',
    autoCorrect: 'off',
    spellCheck: false,
  },
};

// ── Props ─────────────────────────────────────────────────────────────────────

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  /** 입력 종류 — type/inputMode/autoComplete 등을 일괄 설정 */
  kind?: InputKind;
  /** 라벨 텍스트 (지정 시 <label htmlFor> 자동 연결) */
  label?: string;
  /** 에러 메시지 (지정 시 aria-invalid + 메시지 노출) */
  error?: string;
  /** label 영역 추가 className */
  labelClassName?: string;
  /** 래퍼 영역 추가 className */
  wrapperClassName?: string;
};

// ── 컴포넌트 ──────────────────────────────────────────────────────────────────

const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    kind = 'text',
    label,
    error,
    labelClassName,
    wrapperClassName,
    id: idProp,
    className,
    onCompositionStart,
    onCompositionEnd,
    ...rest
  },
  ref,
) {
  const reactId = useId();
  const inputId = idProp ?? `input-${reactId}`;
  const errorId = error ? `${inputId}-error` : undefined;

  const ime = useKoreanImeGuard();
  const attrs = KIND_TABLE[kind];

  // 외부에서 composition 이벤트를 같이 쓰는 경우도 허용
  const handleCompositionStart: React.CompositionEventHandler<HTMLInputElement> = (e) => {
    ime.handlers.onCompositionStart(e);
    onCompositionStart?.(e);
  };
  const handleCompositionEnd: React.CompositionEventHandler<HTMLInputElement> = (e) => {
    ime.handlers.onCompositionEnd(e);
    onCompositionEnd?.(e);
  };

  return (
    <div className={wrapperClassName}>
      {label ? (
        <label htmlFor={inputId} className={labelClassName ?? 'block text-xs text-[var(--toss-gray-4)] mb-1'}>
          {label}
        </label>
      ) : null}

      <input
        {...attrs}
        {...rest}
        ref={ref}
        id={inputId}
        className={className}
        aria-invalid={error ? true : rest['aria-invalid']}
        aria-describedby={errorId ?? rest['aria-describedby']}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
      />

      {error ? (
        <p id={errorId} role="alert" className="text-xs text-red-500 mt-1">
          {error}
        </p>
      ) : null}
    </div>
  );
});

export default Input;
