'use client';

/**
 * SettingsTabs.tsx — 설정 화면 공통 탭 컴포넌트
 *
 * JM : 단일 책임 — 탭 네비게이션 + 키보드 핸들링만
 * JM4: any 금지, 제네릭 TabId
 * JM6: role="tablist"/"tab"/"tabpanel", ArrowLeft/Right, Home/End, Enter/Space
 */

import React, { useRef, useCallback, useId } from 'react';

// ── 타입 ──────────────────────────────────────────────────────────────────────

export interface TabDef<T extends string> {
  id: T;
  label: string;
}

interface SettingsTabsProps<T extends string> {
  tabs: readonly TabDef<T>[];
  activeTab: T;
  onTabChange: (id: T) => void;
  'aria-label'?: string;
}

// ── 컴포넌트 ──────────────────────────────────────────────────────────────────

export function SettingsTabs<T extends string>({
  tabs,
  activeTab,
  onTabChange,
  'aria-label': ariaLabel = '설정 탭',
}: SettingsTabsProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);
  const baseId = useId();

  const getTabId = useCallback((id: T) => `${baseId}-tab-${id}`, [baseId]);
  const getPanelId = useCallback((id: T) => `${baseId}-panel-${id}`, [baseId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, idx: number) => {
      const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
      if (!buttons) return;

      let nextIdx = idx;

      switch (e.key) {
        case 'ArrowRight':
          nextIdx = (idx + 1) % tabs.length;
          break;
        case 'ArrowLeft':
          nextIdx = (idx - 1 + tabs.length) % tabs.length;
          break;
        case 'Home':
          nextIdx = 0;
          break;
        case 'End':
          nextIdx = tabs.length - 1;
          break;
        default:
          return;
      }

      e.preventDefault();
      buttons[nextIdx]?.focus();
      onTabChange(tabs[nextIdx].id);
    },
    [tabs, onTabChange],
  );

  return {
    tabListProps: {
      ref: listRef,
      role: 'tablist' as const,
      'aria-label': ariaLabel,
    },
    getTabButtonProps: (tab: TabDef<T>, idx: number) => ({
      id: getTabId(tab.id),
      role: 'tab' as const,
      'aria-selected': tab.id === activeTab,
      'aria-controls': getPanelId(tab.id),
      tabIndex: tab.id === activeTab ? 0 : -1,
      onClick: () => onTabChange(tab.id),
      onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => handleKeyDown(e, idx),
    }),
    getPanelProps: (id: T) => ({
      id: getPanelId(id),
      role: 'tabpanel' as const,
      'aria-labelledby': getTabId(id),
      hidden: id !== activeTab,
      tabIndex: 0,
    }),
  };
}

// ── 탭 바 UI 컴포넌트 ─────────────────────────────────────────────────────────

interface TabBarProps<T extends string> {
  tabs: readonly TabDef<T>[];
  activeTab: T;
  onTabChange: (id: T) => void;
  ariaLabel?: string;
}

export function TabBar<T extends string>({
  tabs,
  activeTab,
  onTabChange,
  ariaLabel = '설정 탭',
}: TabBarProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);
  const baseId = useId();

  const getTabId  = (id: T) => `${baseId}-tab-${id}`;
  const getPanelId = (id: T) => `${baseId}-panel-${id}`;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, idx: number) => {
    const btns = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    if (!btns) return;
    let next = idx;
    if (e.key === 'ArrowRight') next = (idx + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End')  next = tabs.length - 1;
    else return;
    e.preventDefault();
    btns[next]?.focus();
    onTabChange(tabs[next].id);
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      className="flex gap-1 overflow-x-auto border-b border-[var(--border)] bg-[var(--card)] px-4 pb-0 pt-1 scrollbar-hide"
    >
      {tabs.map((tab, idx) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            id={getTabId(tab.id)}
            role="tab"
            aria-selected={isActive}
            aria-controls={getPanelId(tab.id)}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onTabChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            className={[
              'inline-flex shrink-0 items-center px-4 py-3 text-sm font-medium',
              'border-b-2 -mb-px transition-colors rounded-t-[var(--radius-md)]',
              'focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-[-2px]',
              'min-h-[44px]',
              isActive
                ? 'border-[var(--accent)] text-[var(--accent)] font-semibold'
                : 'border-transparent text-[var(--toss-gray-4)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]',
            ].join(' ')}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

// ── 탭 패널 렌더 헬퍼 ─────────────────────────────────────────────────────────

interface TabPanelProps {
  id: string;
  labelledBy: string;
  isActive: boolean;
  children: React.ReactNode;
}

export function TabPanel({ id, labelledBy, isActive, children }: TabPanelProps) {
  return (
    <div
      id={id}
      role="tabpanel"
      aria-labelledby={labelledBy}
      hidden={!isActive}
      tabIndex={0}
      className="outline-none"
    >
      {isActive && children}
    </div>
  );
}
