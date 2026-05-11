'use client';

/**
 * TodoClient.tsx — 할 일 화면 (메인 조합)
 *
 * 구조:
 *   - 필터 탭: 전체 / 진행 중 / 완료 / 높은 우선순위
 *   - PC(≥600px): 칸반 컬럼 (진행 중 / 완료)
 *   - 모바일(<600px): 리스트 뷰
 *   - FAB (fixed bottom-20 right-4) → AddTodoSheet
 *
 * JM2: useMemo 필터, useCallback 핸들러
 * JM4: any 금지, 타입 명시
 * JM6: role="tablist", role="progressbar", FAB aria-label
 */

import React, { useState, useMemo, useCallback } from 'react';
import { Plus } from 'lucide-react';
import type { Todo, FilterTab } from './todo-types';
import { FILTER_TABS, INITIAL_TODOS } from './todo-types';
import { TodoItem } from './TodoItem';
import { AddTodoSheet } from './AddTodoSheet';

// ── 칸반 컬럼 ─────────────────────────────────────────────────────────────────

interface KanbanColumnProps {
  title: string;
  todos: readonly Todo[];
  onToggle: (id: string) => void;
}

function KanbanColumn({ title, todos, onToggle }: KanbanColumnProps) {
  return (
    <section
      aria-label={`${title} (${todos.length}건)`}
      style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      <h3
        className="text-sm font-bold"
        style={{
          color: 'var(--foreground)',
          margin: 0,
          padding: '0 4px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {title}
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            background: 'var(--muted)',
            color: 'var(--toss-gray-4)',
            padding: '1px 6px',
            borderRadius: 'var(--radius-xl)',
          }}
        >
          {todos.length}
        </span>
      </h3>

      {todos.length === 0 ? (
        <div className="empty-state py-8">
          <p className="text-xs" style={{ color: 'var(--toss-gray-4)' }}>없음</p>
        </div>
      ) : (
        <ul
          role="list"
          aria-label={`${title} 목록`}
          style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}
        >
          {todos.map((todo) => (
            <li key={todo.id}>
              <TodoItem todo={todo} onToggle={onToggle} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── TodoClient 본체 ───────────────────────────────────────────────────────────

export function TodoClient() {
  const [todos, setTodos] = useState<Todo[]>(INITIAL_TODOS);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const filtered = useMemo<Todo[]>(() => {
    switch (activeTab) {
      case 'active': return todos.filter((t) => !t.done);
      case 'done':   return todos.filter((t) => t.done);
      case 'high':   return todos.filter((t) => t.priority === 'high');
      default:       return todos;
    }
  }, [todos, activeTab]);

  const activeTodos = useMemo(() => filtered.filter((t) => !t.done), [filtered]);
  const doneTodos   = useMemo(() => filtered.filter((t) => t.done),  [filtered]);

  const handleToggle = useCallback((id: string) => {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  }, []);

  const handleAdd = useCallback((newTodo: Omit<Todo, 'id' | 'done'>) => {
    setTodos((prev) => [{ ...newTodo, id: `t${Date.now()}`, done: false }, ...prev]);
  }, []);

  const totalDone = todos.filter((t) => t.done).length;
  const progress = todos.length > 0 ? Math.round((totalDone / todos.length) * 100) : 0;

  return (
    <>
      <style>{`
        .todo-kanban { display: none; }
        .todo-list   { display: flex; flex-direction: column; gap: 8px; }
        @media (min-width: 600px) {
          .todo-kanban { display: flex; gap: 16px; }
          .todo-list   { display: none; }
        }
      `}</style>

      <div
        style={{
          maxWidth: 800,
          margin: '0 auto',
          padding: '16px 16px 100px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {/* 빵부스러기 */}
        <nav aria-label="현재 위치">
          <ol style={{ display: 'flex', gap: 4, listStyle: 'none', margin: 0, padding: 0, fontSize: 12, color: 'var(--toss-gray-4)' }}>
            <li>내정보</li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" style={{ color: 'var(--foreground)' }}>할 일</li>
          </ol>
        </nav>

        {/* 헤더 + 진행률 */}
        <div className="app-card" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h1 className="text-base font-bold" style={{ color: 'var(--foreground)', margin: 0 }}>할 일</h1>
            <span className="text-xs" style={{ color: 'var(--toss-gray-4)' }}>
              {totalDone} / {todos.length} 완료
            </span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`전체 진행률 ${progress}%`}
            style={{ height: 6, borderRadius: 3, background: 'var(--muted)', overflow: 'hidden' }}
          >
            <div
              style={{
                height: '100%',
                width: `${progress}%`,
                background: 'var(--accent)',
                borderRadius: 3,
                transition: 'width var(--transition-slow)',
              }}
            />
          </div>
        </div>

        {/* 필터 탭 */}
        <div
          role="tablist"
          aria-label="할 일 필터"
          style={{
            display: 'flex',
            gap: 4,
            background: 'var(--tab-bg)',
            borderRadius: 'var(--radius-lg)',
            padding: 4,
          }}
        >
          {FILTER_TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.id)}
                className="flex-1 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                style={{
                  padding: '6px 4px',
                  borderRadius: 'var(--radius-md)',
                  border: 'none',
                  cursor: 'pointer',
                  background: isActive ? 'var(--accent)' : 'transparent',
                  color: isActive ? '#fff' : 'var(--toss-gray-4)',
                  whiteSpace: 'nowrap',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* PC 칸반 */}
        <div className="todo-kanban">
          <KanbanColumn title="진행 중" todos={activeTodos} onToggle={handleToggle} />
          <KanbanColumn title="완료" todos={doneTodos} onToggle={handleToggle} />
        </div>

        {/* 모바일 리스트 */}
        <div className="todo-list">
          {filtered.length === 0 ? (
            <div className="empty-state py-12">
              <p className="text-sm" style={{ color: 'var(--toss-gray-4)' }}>할 일이 없습니다.</p>
            </div>
          ) : (
            <ul
              role="list"
              aria-label="할 일 목록"
              style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}
            >
              {filtered.map((todo) => (
                <li key={todo.id}>
                  <TodoItem todo={todo} onToggle={handleToggle} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* FAB */}
      <button
        type="button"
        aria-label="할 일 추가 — 새 할 일 입력창 열기"
        onClick={() => setIsSheetOpen(true)}
        style={{
          position: 'fixed',
          bottom: 80,
          right: 16,
          width: 52,
          height: 52,
          borderRadius: 9999,
          background: 'var(--accent)',
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: 'var(--shadow-md)',
          zIndex: 30,
          transition: 'transform var(--transition-fast)',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.08)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
        className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      >
        <Plus size={24} aria-hidden="true" />
      </button>

      {/* 바텀시트 */}
      <AddTodoSheet
        isOpen={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
        onAdd={handleAdd}
      />
    </>
  );
}
