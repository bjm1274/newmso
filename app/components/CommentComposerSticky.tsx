'use client';

/**
 * CommentComposerSticky.tsx — 모바일 댓글/답글 입력 하단 고정 컴포저
 *
 * StickyFormFooter와 유사한 sticky 메커니즘을 재사용하되, 댓글 입력 특화 UX를 갖춘다.
 *  - 모바일(<768px): position: fixed, 바텀탭 위 고정. IME가 뜨면 visualViewport 보정.
 *  - 데스크톱(≥768px): position: static, 일반 흐름.
 *  - Enter(Shift 미동반) 키로 즉시 제출, Shift+Enter는 줄바꿈.
 *  - 첨부 추가/미리보기 슬롯 제공.
 *
 * 사용 예시:
 * ```tsx
 * <CommentComposerSticky
 *   value={text}
 *   onChange={setText}
 *   onSubmit={handleSubmit}
 *   placeholder="댓글 작성…"
 *   attachmentsButton={<AttachButton />}
 *   attachments={<AttachPreview />}
 * />
 * ```
 *
 * 보안(JM5):
 *  - 입력값은 React의 텍스트 렌더링을 통해서만 사용해야 한다.
 *  - dangerouslySetInnerHTML 사용 금지. 이 컴포넌트는 onChange로 raw value만 노출하고
 *    XSS는 사용처(저장·표시 측)에서 추가 검증해야 한다(주석으로 명시).
 *  - 길이 상한(MAX_LEN)을 자체 적용해 폭주 입력 차단.
 *
 * 접근성(JM6):
 *  - <textarea>에 명시적 aria-label 부여.
 *  - 등록 버튼은 빈 입력/disabled 시 aria-disabled 적용.
 *  - 폼은 <form> 래핑 + aria-label 부여.
 *
 * JM: 단일 책임 — 댓글 입력 + 제출 UI. 데이터 fetch/저장 없음.
 * JM2: 이펙트 0개(키보드 보정 훅은 useVisualViewportOffset 1개), 순수 controlled component.
 * JM3: onSubmit 호출자 책임. 내부 try/catch로 비동기 제출 실패 시 토스트 위임.
 * JM4: any 금지, props 타입 export.
 */

import React, { useCallback, useId, useRef } from 'react';
import { useVisualViewportOffset } from '../hooks/useVisualViewportOffset';

// ── Props ──────────────────────────────────────────────────────────────────────

export interface CommentComposerStickyProps {
  /** 현재 입력값 (controlled) */
  value: string;
  /** 입력 변경 콜백 */
  onChange: (next: string) => void;
  /** 등록 버튼 또는 Enter 키 입력 시 호출. 비동기 가능. */
  onSubmit: () => void | Promise<void>;
  /** placeholder. default: "댓글 작성…" */
  placeholder?: string;
  /** 입력/제출 비활성화 */
  disabled?: boolean;
  /** 첨부 미리보기 영역 (입력창 위에 표시) */
  attachments?: React.ReactNode;
  /** 첨부 추가 버튼 (입력창 좌측에 표시) */
  attachmentsButton?: React.ReactNode;
  /** 등록 버튼 라벨. default: "등록" */
  submitLabel?: string;
  /** 폼 aria-label. default: "댓글 작성" */
  ariaLabel?: string;
  /** 최대 입력 길이(글자수). default: 4000 */
  maxLength?: number;
  /** spacer 자동 렌더 여부(default: true). 부모가 이미 하단 padding을 갖고 있으면 false. */
  withSpacer?: boolean;
  /** 추가 className */
  className?: string;
}

// ── 컴포넌트 ───────────────────────────────────────────────────────────────────

const DEFAULT_MAX_LENGTH = 4000;

export default function CommentComposerSticky({
  value,
  onChange,
  onSubmit,
  placeholder = '댓글 작성…',
  disabled = false,
  attachments,
  attachmentsButton,
  submitLabel = '등록',
  ariaLabel = '댓글 작성',
  maxLength = DEFAULT_MAX_LENGTH,
  withSpacer = true,
  className }: CommentComposerStickyProps) {
  const inputId = useId();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // 키보드 보정 (모바일 IME)
  const kbOffset = useVisualViewportOffset();
  const footerStyle: React.CSSProperties | undefined =
    kbOffset > 0 ? { transform: `translateY(-${kbOffset}px)` } : undefined;

  // 트림된 값으로 제출 가능 여부 판단
  const trimmed = value.trim();
  const canSubmit = !disabled && trimmed.length > 0;

  const handleSubmit = useCallback(
    async (event?: React.FormEvent) => {
      event?.preventDefault();
      if (!canSubmit) return;
      // JM3: 호출자가 비동기 실패 처리를 책임지지만, 컴포넌트 내부에서도 안전망.
      try {
        await onSubmit();
      } catch {
        // 사용처가 토스트로 노출하도록 위임. 여기선 다시 throw하지 않음.
      }
    },
    [canSubmit, onSubmit]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter(Shift 미동반) → 즉시 제출. IME 조합 중에는 무시.
      if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
        event.preventDefault();
        void handleSubmit();
      }
    },
    [handleSubmit]
  );

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      // 길이 상한 강제 적용 (JM5: 폭주 입력 차단)
      const next = event.target.value;
      if (next.length > maxLength) {
        onChange(next.slice(0, maxLength));
        return;
      }
      onChange(next);
    },
    [maxLength, onChange]
  );

  const footerClass = ['sticky-form-footer comment-composer-sticky', className]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      {withSpacer && <div className="sticky-form-footer-spacer" aria-hidden="true" />}

      <footer
        className={footerClass}
        style={footerStyle}
        aria-label={ariaLabel}
      >
        {/* 첨부 미리보기 (있을 때만) */}
        {attachments ? (
          <div className="mb-2 flex flex-wrap gap-2">{attachments}</div>
        ) : null}

        <form
          className="flex items-end gap-2"
          onSubmit={handleSubmit}
          aria-label={ariaLabel}
        >
          {/* 첨부 추가 버튼 (좌측, 있을 때만) */}
          {attachmentsButton ? (
            <div className="flex-shrink-0">{attachmentsButton}</div>
          ) : null}

          {/* 입력 영역 */}
          <label htmlFor={inputId} className="sr-only">
            {ariaLabel}
          </label>
          <textarea
            id={inputId}
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            maxLength={maxLength}
            aria-label={ariaLabel}
            className="flex-1 min-h-[36px] max-h-[120px] resize-none px-3 py-2 text-[13px] border border-[var(--border)] rounded-[var(--radius-md)] bg-[var(--card)] text-[var(--foreground)] placeholder:text-[var(--toss-gray-3)] focus:outline-none focus:border-[var(--accent)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          />

          {/* 등록 버튼 */}
          <button
            type="submit"
            disabled={!canSubmit}
            aria-disabled={!canSubmit}
            aria-label={submitLabel}
            className="flex-shrink-0 h-9 px-4 text-[13px] font-medium bg-[var(--accent)] text-white rounded-[var(--radius-md)] hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {submitLabel}
          </button>
        </form>
      </footer>
    </>
  );
}
