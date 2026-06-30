'use client';

/**
 * 모바일 인사관리 폼 공용 헬퍼.
 * handoff/m-screens-forms.jsx 의 FormHeader / Field / Input / SegRow / StepDots 1:1 이식.
 *
 * 토큰 클래스(`.m-*`)를 그대로 사용해 인라인 색상/픽셀 하드코딩을 최소화한다.
 *
 * JM: 단일 책임 (폼 빌딩 블록), ~150줄
 * JM4: any 금지, props 타입 명시
 * JM6: label·input 연결, button 시맨틱, aria-label
 */

import { useId, type ChangeEvent, type CSSProperties, type ReactNode } from 'react';

// ─── 폼 헤더 (취소 / 제목 / 저장) ────────────────────────────
export type MFormHeaderProps = {
  onCancel: () => void;
  onSave?: () => void;
  title: string;
  sub?: string;
  saveLabel?: string;
  saveDisabled?: boolean;
};

export function MFormHeader({
  onCancel,
  onSave,
  title,
  sub,
  saveLabel = '저장',
  saveDisabled = false }: MFormHeaderProps) {
  return (
    <div 
      className="m-header" 
      style={{ 
        paddingTop: 18, 
        paddingBottom: 14, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        width: '100%',
        boxSizing: 'border-box'
      }}
    >
      <button
        type="button"
        onClick={onCancel}
        style={{
          color: 'var(--z-700)',
          fontSize: 14,
          fontWeight: 700,
          padding: '8px 12px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          flexShrink: 0,
          minWidth: 60,
          textAlign: 'left'
        }}
        aria-label="취소"
      >
        취소
      </button>
      <div style={{ flex: 1, textAlign: 'center', minWidth: 0, padding: '0 8px' }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--z-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}
        </div>
        {sub && (
          <div style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 600, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {sub}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onSave}
        disabled={saveDisabled || !onSave}
        style={{
          color: saveDisabled ? 'var(--z-400)' : 'var(--m-accent)',
          fontSize: 14,
          fontWeight: 800,
          padding: '8px 12px',
          background: 'none',
          border: 'none',
          cursor: saveDisabled ? 'default' : 'pointer',
          flexShrink: 0,
          minWidth: 60,
          textAlign: 'right'
        }}
      >
        {saveLabel}
      </button>
    </div>
  );
}

// ─── 필드 (label + 내용 + 보조설명) ──────────────────────────
export type MFieldProps = {
  label: string;
  required?: boolean;
  htmlFor?: string;
  sub?: ReactNode;
  children: ReactNode;
};

export function MField({ label, required, htmlFor, sub, children }: MFieldProps) {
  return (
    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--m-border)' }}>
      <label
        htmlFor={htmlFor}
        style={{
          display: 'block',
          fontSize: 11,
          color: 'var(--z-500)',
          fontWeight: 800,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          marginBottom: 6 }}
      >
        {label}{' '}
        {required && <span style={{ color: 'var(--m-danger)' }}>*</span>}
      </label>
      {children}
      {sub && (
        <div
          style={{
            fontSize: 11,
            color: 'var(--z-500)',
            fontWeight: 600,
            marginTop: 4 }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

// ─── 텍스트 인풋 ─────────────────────────────────────────────
export type MInputKind = 'text' | 'tel' | 'email' | 'numeric' | 'decimal' | 'date';

export type MInputProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  kind?: MInputKind;
  autoFocus?: boolean;
  ariaLabel?: string;
};

export function MInput({
  id,
  value,
  onChange,
  placeholder,
  kind = 'text',
  autoFocus,
  ariaLabel }: MInputProps) {
  const handle = (event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value);
  return (
    <input
      id={id}
      type={kind === 'tel' ? 'tel' : kind === 'email' ? 'email' : kind === 'date' ? 'date' : 'text'}
      inputMode={
        kind === 'tel'
          ? 'tel'
          : kind === 'numeric'
            ? 'numeric'
            : kind === 'decimal'
              ? 'decimal'
              : 'text'
      }
      value={value}
      onChange={handle}
      placeholder={placeholder}
      autoFocus={autoFocus}
      aria-label={ariaLabel}
      style={{
        width: '100%',
        boxSizing: 'border-box',
        padding: '10px 12px',
        fontSize: 15,
        fontFamily: 'inherit',
        color: 'var(--z-900)',
        background: 'var(--m-bg)',
        border: '1px solid var(--m-border)',
        borderRadius: 10,
        outline: 'none',
        marginTop: 4 }}
    />
  );
}

// ─── Seg 라인 (옵션 가로 분할) ────────────────────────────────
export type MSegOption<T extends string> = { id: T; label: string };

export type MSegRowProps<T extends string> = {
  options: ReadonlyArray<MSegOption<T>>;
  value: T;
  onPick: (id: T) => void;
  ariaLabel?: string;
};

export function MSegRow<T extends string>({ options, value, onPick, ariaLabel }: MSegRowProps<T>) {
  return (
    <div className="m-seg" style={{ marginTop: 4 }} role="tablist" aria-label={ariaLabel}>
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          className={value === opt.id ? 'on' : ''}
          onClick={() => onPick(opt.id)}
          role="tab"
          aria-selected={value === opt.id}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ─── 단계 점 (wizard) ────────────────────────────────────────
export function MStepDots({ total, cur }: { total: number; cur: number }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 6,
        justifyContent: 'center',
        padding: '14px 16px',
        background: 'var(--m-card)',
        borderBottom: '1px solid var(--m-border)' }}
      aria-label={`${cur + 1}/${total} 단계`}
    >
      {Array.from({ length: total }).map((_, i) => {
        const style: CSSProperties = {
          flex: i === cur ? '0 0 36px' : '0 0 8px',
          height: 8,
          borderRadius: 999,
          background: i <= cur ? 'var(--m-accent)' : 'var(--z-200)',
          transition: 'flex .2s' };
        return <div key={i} style={style} />;
      })}
    </div>
  );
}

// 한 줄짜리 React state setter 유틸
export function useFieldIdPrefix(base: string): (key: string) => string {
  const id = useId();
  return (key: string) => `${base}-${id}-${key}`;
}
