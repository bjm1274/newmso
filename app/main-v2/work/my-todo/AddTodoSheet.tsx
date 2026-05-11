'use client';

/**
 * AddTodoSheet.tsx — 할 일 추가 바텀시트
 *
 * JM6: role="dialog", aria-modal, Escape 닫기, 포커스 트랩(첫 입력 자동 포커스)
 * JM4: any 금지, 타입 명시
 */

import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { Todo, TodoPriority } from './todo-types';
import { PRIORITY_CONFIG } from './todo-types';

// ── 타입 ──────────────────────────────────────────────────────────────────────

interface AddTodoSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (todo: Omit<Todo, 'id' | 'done'>) => void;
}

// ── AddTodoSheet ──────────────────────────────────────────────────────────────

export function AddTodoSheet({ isOpen, onClose, onAdd }: AddTodoSheetProps) {
  const [text, setText] = useState('');
  const [priority, setPriority] = useState<TodoPriority>('medium');
  const [dueDate, setDueDate] = useState('');
  const [category, setCategory] = useState('업무');
  const inputRef = useRef<HTMLInputElement>(null);

  // 열릴 때 첫 입력에 포커스, 닫힐 때 초기화
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setText('');
      setPriority('medium');
      setDueDate('');
      setCategory('업무');
    }
  }, [isOpen]);

  // Escape로 닫기
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    onAdd({ text: text.trim(), priority, dueDate: dueDate || null, category });
    onClose();
  }

  if (!isOpen) return null;

  return (
    <>
      {/* 오버레이 */}
      <div
        aria-hidden="true"
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.4)',
          zIndex: 40,
        }}
      />

      {/* 시트 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="할 일 추가"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          background: 'var(--card)',
          borderRadius: 'var(--radius-2xl) var(--radius-2xl) 0 0',
          padding: '20px 20px 32px',
          paddingBottom: 'max(32px, env(safe-area-inset-bottom, 0px))',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        {/* 손잡이 */}
        <div
          aria-hidden="true"
          style={{
            width: 36,
            height: 4,
            background: 'var(--border)',
            borderRadius: 2,
            margin: '0 auto 16px',
          }}
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 className="text-base font-bold" style={{ color: 'var(--foreground)', margin: 0 }}>
            할 일 추가
          </h2>
          <button
            type="button"
            aria-label="닫기"
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: 'none',
              background: 'var(--muted)',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              color: 'var(--foreground)',
            }}
            className="focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* 내용 */}
          <div>
            <label
              htmlFor="todo-text"
              className="text-xs font-semibold"
              style={{ color: 'var(--foreground)', display: 'block', marginBottom: 4 }}
            >
              내용 <span aria-hidden="true" style={{ color: '#EF4444' }}>*</span>
            </label>
            <input
              ref={inputRef}
              id="todo-text"
              type="text"
              required
              placeholder="할 일을 입력하세요"
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-required="true"
              style={{
                width: '100%',
                padding: '9px 12px',
                fontSize: 14,
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                background: 'var(--input-bg)',
                color: 'var(--foreground)',
                outline: 'none',
                boxSizing: 'border-box',
              }}
              onFocus={(e) => { e.target.style.borderColor = 'var(--accent)'; }}
              onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; }}
            />
          </div>

          {/* 우선순위 */}
          <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
            <legend className="text-xs font-semibold" style={{ color: 'var(--foreground)', marginBottom: 6 }}>
              우선순위
            </legend>
            <div style={{ display: 'flex', gap: 8 }}>
              {(Object.keys(PRIORITY_CONFIG) as TodoPriority[]).map((p) => {
                const cfg = PRIORITY_CONFIG[p];
                const isSelected = priority === p;
                return (
                  <label
                    key={p}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                      padding: '7px 0',
                      borderRadius: 'var(--radius-md)',
                      border: `1px solid ${isSelected ? cfg.color : 'var(--border)'}`,
                      background: isSelected ? cfg.bg : 'transparent',
                      color: isSelected ? cfg.color : 'var(--toss-gray-4)',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: isSelected ? 700 : 400,
                      transition: 'all var(--transition-fast)',
                    }}
                  >
                    <input
                      type="radio"
                      name="priority"
                      value={p}
                      checked={isSelected}
                      onChange={() => setPriority(p)}
                      style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
                      aria-label={`우선순위 ${cfg.label}`}
                    />
                    {cfg.label}
                  </label>
                );
              })}
            </div>
          </fieldset>

          {/* 마감일 */}
          <div>
            <label
              htmlFor="todo-due"
              className="text-xs font-semibold"
              style={{ color: 'var(--foreground)', display: 'block', marginBottom: 4 }}
            >
              마감일 (선택)
            </label>
            <input
              id="todo-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px',
                fontSize: 14,
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                background: 'var(--input-bg)',
                color: 'var(--foreground)',
                outline: 'none',
                boxSizing: 'border-box',
              }}
              onFocus={(e) => { e.target.style.borderColor = 'var(--accent)'; }}
              onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; }}
            />
          </div>

          {/* 제출 */}
          <button
            type="submit"
            disabled={!text.trim()}
            style={{
              height: 48,
              borderRadius: 'var(--radius-md)',
              background: text.trim() ? 'var(--accent)' : 'var(--muted)',
              color: text.trim() ? '#fff' : 'var(--toss-gray-4)',
              fontSize: 15,
              fontWeight: 700,
              border: 'none',
              cursor: text.trim() ? 'pointer' : 'not-allowed',
              transition: 'background var(--transition-fast)',
              marginTop: 4,
            }}
            className="focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          >
            추가하기
          </button>
        </form>
      </div>
    </>
  );
}
