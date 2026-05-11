'use client';

/**
 * TodoItem.tsx — 개별 할 일 아이템 + PriorityBadge
 *
 * JM2: React.memo로 불필요 렌더 방지
 * JM6: 체크박스 ≥24px, label 연결, aria-label
 */

import React from 'react';
import { Flag } from 'lucide-react';
import type { Todo, TodoPriority } from './todo-types';
import { PRIORITY_CONFIG } from './todo-types';

// ── 우선순위 뱃지 ─────────────────────────────────────────────────────────────

export function PriorityBadge({ priority }: { priority: TodoPriority }) {
  const cfg = PRIORITY_CONFIG[priority];
  return (
    <span
      aria-label={`우선순위: ${cfg.label}`}
      style={{
        fontSize: 10,
        fontWeight: 700,
        color: cfg.color,
        background: cfg.bg,
        padding: '2px 6px',
        borderRadius: 'var(--radius-xs)',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
        flexShrink: 0,
      }}
    >
      <Flag size={9} aria-hidden="true" />
      {cfg.label}
    </span>
  );
}

// ── TodoItem ──────────────────────────────────────────────────────────────────

interface TodoItemProps {
  todo: Todo;
  onToggle: (id: string) => void;
}

export const TodoItem = React.memo(function TodoItem({ todo, onToggle }: TodoItemProps) {
  const checkboxId = `todo-${todo.id}`;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '10px 12px',
        borderRadius: 'var(--radius-md)',
        background: 'var(--card)',
        border: '1px solid var(--border)',
        transition: 'opacity var(--transition-fast)',
        opacity: todo.done ? 0.6 : 1,
      }}
    >
      {/* 체크박스 ≥ 24px */}
      <input
        type="checkbox"
        id={checkboxId}
        checked={todo.done}
        onChange={() => onToggle(todo.id)}
        aria-label={`${todo.text} — ${todo.done ? '완료됨, 클릭하면 미완료로 변경' : '미완료, 클릭하면 완료로 변경'}`}
        style={{
          width: 24,
          height: 24,
          flexShrink: 0,
          marginTop: 1,
          accentColor: 'var(--accent)',
          cursor: 'pointer',
        }}
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        <label
          htmlFor={checkboxId}
          style={{
            display: 'block',
            fontSize: 14,
            fontWeight: 500,
            color: 'var(--foreground)',
            textDecoration: todo.done ? 'line-through' : 'none',
            cursor: 'pointer',
            wordBreak: 'break-word',
            marginBottom: 4,
          }}
        >
          {todo.text}
        </label>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <PriorityBadge priority={todo.priority} />
          <span className="text-[11px]" style={{ color: 'var(--toss-gray-4)' }}>
            {todo.category}
          </span>
          {todo.dueDate && (
            <span
              className="text-[11px]"
              aria-label={`마감일 ${todo.dueDate}`}
              style={{ color: 'var(--toss-gray-4)' }}
            >
              · {todo.dueDate.slice(5).replace('-', '/')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});
