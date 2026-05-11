'use client';

/**
 * MessageInput.tsx — 채팅 메시지 입력창
 *
 * JM6: aria-label, role="form", Enter 전송 / Shift+Enter 줄바꿈
 * JM4: 타입 명시
 * JM2: 불필요 리렌더 방지 (React.memo)
 */

import React, { useState, useRef, useCallback } from 'react';
import { Smile, Paperclip, Send } from 'lucide-react';

// ── 타입 ──────────────────────────────────────────────────────────────────────

interface MessageInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
}

// ── MessageInput ──────────────────────────────────────────────────────────────

export const MessageInput = React.memo(function MessageInput({ onSend, disabled = false }: MessageInputProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canSend = text.trim().length > 0 && !disabled;

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
    textareaRef.current?.focus();
  }, [text, onSend]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value);
    // 높이 자동 조정
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  return (
    <div
      role="form"
      aria-label="메시지 입력"
      style={{
        borderTop: '1px solid var(--border)',
        padding: '8px 12px',
        background: 'var(--card)',
        display: 'flex',
        alignItems: 'flex-end',
        gap: 8,
      }}
    >
      {/* 이모지 버튼 */}
      <button
        type="button"
        aria-label="이모지 삽입"
        disabled={disabled}
        style={{
          flexShrink: 0,
          width: 36,
          height: 36,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 'var(--radius-md)',
          border: 'none',
          background: 'transparent',
          color: 'var(--toss-gray-4)',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
        className="transition-colors hover:bg-[var(--muted)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
      >
        <Smile size={20} aria-hidden="true" />
      </button>

      {/* 파일 첨부 버튼 */}
      <button
        type="button"
        aria-label="파일 첨부"
        disabled={disabled}
        style={{
          flexShrink: 0,
          width: 36,
          height: 36,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 'var(--radius-md)',
          border: 'none',
          background: 'transparent',
          color: 'var(--toss-gray-4)',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
        className="transition-colors hover:bg-[var(--muted)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
      >
        <Paperclip size={20} aria-hidden="true" />
      </button>

      {/* 텍스트 입력 */}
      <textarea
        ref={textareaRef}
        aria-label="메시지 내용 입력 (Enter 전송, Shift+Enter 줄바꿈)"
        placeholder="메시지를 입력하세요"
        value={text}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        rows={1}
        style={{
          flex: 1,
          resize: 'none',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '8px 12px',
          fontSize: 14,
          lineHeight: 1.5,
          color: 'var(--foreground)',
          background: 'var(--input-bg)',
          outline: 'none',
          minHeight: 36,
          maxHeight: 120,
          fontFamily: 'inherit',
          transition: 'border-color var(--transition-fast)',
        }}
        onFocus={(e) => { e.target.style.borderColor = 'var(--accent)'; }}
        onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; }}
      />

      {/* 전송 버튼 */}
      <button
        type="button"
        aria-label="메시지 전송"
        onClick={handleSend}
        disabled={!canSend}
        style={{
          flexShrink: 0,
          width: 36,
          height: 36,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 'var(--radius-md)',
          border: 'none',
          background: canSend ? 'var(--accent)' : 'var(--muted)',
          color: canSend ? '#fff' : 'var(--toss-gray-4)',
          cursor: canSend ? 'pointer' : 'not-allowed',
          transition: 'background var(--transition-fast)',
        }}
        className="focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
      >
        <Send size={18} aria-hidden="true" />
      </button>
    </div>
  );
});
