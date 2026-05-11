'use client';

/**
 * Tabs.tsx — Phase 4 탭 컴포넌트
 *
 * JM6: role="tablist"/"tab"/"tabpanel", aria-selected, aria-controls,
 *       키보드 ArrowLeft/ArrowRight/Home/End
 * JM4: 제네릭 TabId extends string
 */

import React, { useId, useRef } from 'react';

export interface TabItem<T extends string = string> {
  id: T;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  badge?: number | string;
}

export interface TabsProps<T extends string = string> {
  tabs: TabItem<T>[];
  activeId: T;
  onChange: (id: T) => void;
  children?: React.ReactNode;
  variant?: 'line' | 'pill';
  size?: 'sm' | 'md';
  fullWidth?: boolean;
  className?: string;
}

// ── 탭 패널은 호출자가 조건부 렌더링으로 처리하거나 TabPanel helper 사용 ────────

export function TabPanel({
  id,
  activeId,
  children,
}: {
  id: string;
  activeId: string;
  children: React.ReactNode;
}) {
  if (id !== activeId) return null;
  return (
    <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`}>
      {children}
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export default function Tabs<T extends string = string>({
  tabs,
  activeId,
  onChange,
  variant = 'line',
  size = 'md',
  fullWidth = false,
  className = '',
}: TabsProps<T>) {
  const baseId = useId();
  const listRef = useRef<HTMLDivElement>(null);

  function handleKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, currentIndex: number) {
    const enabledTabs = tabs.filter((t) => !t.disabled);
    const enabledIndex = enabledTabs.findIndex((t) => t.id === tabs[currentIndex].id);

    let nextEnabled: TabItem<T> | undefined;

    if (e.key === 'ArrowRight') {
      nextEnabled = enabledTabs[(enabledIndex + 1) % enabledTabs.length];
    } else if (e.key === 'ArrowLeft') {
      nextEnabled = enabledTabs[(enabledIndex - 1 + enabledTabs.length) % enabledTabs.length];
    } else if (e.key === 'Home') {
      nextEnabled = enabledTabs[0];
    } else if (e.key === 'End') {
      nextEnabled = enabledTabs[enabledTabs.length - 1];
    }

    if (nextEnabled) {
      e.preventDefault();
      onChange(nextEnabled.id);
      // 포커스 이동
      const btn = listRef.current?.querySelector<HTMLButtonElement>(
        `[id="tab-${baseId}-${nextEnabled.id}"]`,
      );
      btn?.focus();
    }
  }

  const isLine = variant === 'line';
  const isSm = size === 'sm';

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label="탭 목록"
      className={[
        'flex',
        isLine
          ? 'border-b border-[var(--border)] gap-0'
          : 'bg-[var(--tab-bg)] p-0.5 rounded-[var(--radius-md)] gap-0.5',
        fullWidth ? 'w-full' : '',
        className,
      ].join(' ')}
    >
      {tabs.map((tab, index) => {
        const isActive = tab.id === activeId;
        const tabId = `tab-${baseId}-${tab.id}`;
        const panelId = `panel-${tab.id}`;

        return (
          <button
            key={tab.id}
            id={tabId}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={panelId}
            aria-disabled={tab.disabled}
            disabled={tab.disabled}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={[
              'inline-flex items-center gap-1.5 font-medium transition-colors',
              'focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-1',
              'disabled:opacity-40 disabled:pointer-events-none',
              isSm ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-sm',
              fullWidth ? 'flex-1 justify-center' : '',
              isLine
                ? isActive
                  ? 'border-b-2 border-[var(--accent)] text-[var(--accent)] -mb-px rounded-t-[var(--radius-sm)]'
                  : 'border-b-2 border-transparent text-[var(--toss-gray-4)] hover:text-[var(--foreground)]'
                : isActive
                  ? 'bg-[var(--card)] text-[var(--foreground)] shadow-[var(--shadow-xs)] rounded-[var(--radius-sm)]'
                  : 'bg-transparent text-[var(--toss-gray-4)] hover:text-[var(--foreground)] rounded-[var(--radius-sm)]',
            ].join(' ')}
          >
            {tab.icon && (
              <span aria-hidden="true" style={{ lineHeight: 0, flexShrink: 0 }}>
                {tab.icon}
              </span>
            )}
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span
                aria-label={`${tab.badge}건`}
                className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full bg-[var(--accent)] text-white"
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
