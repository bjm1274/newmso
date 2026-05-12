'use client';

/**
 * BottomTab.tsx — 모바일 바텀탭 공통 컴포넌트
 *
 * - 5개 탭: 홈 / 업무 / 내정보 / 알림 / 더보기
 * - max-width 600px 미만에서만 표시
 * - safe-area-inset-bottom 대응
 * - JM6: role="tablist"/role="tab", aria-selected, aria-label
 */

import React, { useMemo } from 'react';
import { Home, Briefcase, User, Bell, Menu } from 'lucide-react';

// ── 타입 ──────────────────────────────────────────────────────────────────────

export type BottomTabId = '홈' | '업무' | '내정보' | '알림' | '더보기';

export const BOTTOM_TAB_IDS = ['홈', '업무', '내정보', '알림', '더보기'] as const satisfies readonly BottomTabId[];

const BOTTOM_TAB_ID_SET = new Set<string>(BOTTOM_TAB_IDS);

export function isBottomTabId(value: unknown): value is BottomTabId {
  return typeof value === 'string' && BOTTOM_TAB_ID_SET.has(value);
}

export interface BottomTabProps {
  currentTabId: BottomTabId;
  onTabChange: (id: BottomTabId) => void;
  /** 알림 뱃지 개수 (0이면 미표시) */
  notificationCount?: number;
}

// ── 탭 정의 ───────────────────────────────────────────────────────────────────

interface TabDef {
  id: BottomTabId;
  label: string;
  icon: React.ComponentType<{ size?: number; 'aria-hidden'?: boolean; className?: string }>;
  ariaLabel: string;
}

const TAB_DEFS: readonly TabDef[] = [
  { id: '홈', label: '홈', icon: Home, ariaLabel: '홈 탭' },
  { id: '업무', label: '업무', icon: Briefcase, ariaLabel: '업무 탭' },
  { id: '내정보', label: '내정보', icon: User, ariaLabel: '내 정보 탭' },
  { id: '알림', label: '알림', icon: Bell, ariaLabel: '알림 탭' },
  { id: '더보기', label: '더보기', icon: Menu, ariaLabel: '더보기 탭 — 전체 메뉴 열기' },
];

// ── 알림 뱃지 ─────────────────────────────────────────────────────────────────

interface BadgeProps {
  count: number;
}

function NotificationBadge({ count }: BadgeProps) {
  if (count <= 0) return null;

  const display = count > 99 ? '99+' : String(count);

  return (
    <span
      aria-label={`읽지 않은 알림 ${count}개`}
      role="status"
      style={{
        position: 'absolute',
        top: 2,
        right: '50%',
        transform: 'translateX(calc(50% + 6px))',
        background: '#EF4444',
        color: '#fff',
        fontSize: 9,
        fontWeight: 700,
        lineHeight: 1,
        minWidth: 16,
        height: 16,
        borderRadius: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 4px',
        pointerEvents: 'none',
      }}
    >
      {display}
    </span>
  );
}

// ── 개별 탭 버튼 ─────────────────────────────────────────────────────────────

interface TabButtonProps {
  tab: TabDef;
  isActive: boolean;
  badge?: number;
  onClick: (id: BottomTabId) => void;
}

function TabButton({ tab, isActive, badge, onClick }: TabButtonProps) {
  const { id, label, icon: Icon, ariaLabel } = tab;

  function handleClick() {
    onClick(id);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick(id);
    }
  }

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      aria-label={ariaLabel}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className="relative flex flex-col items-center gap-0.5 flex-1 py-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 rounded-[var(--radius-md)]"
      style={{
        color: isActive ? 'var(--accent)' : 'var(--toss-gray-4)',
        outlineColor: 'var(--accent)',
        minWidth: 0,
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
      }}
    >
      {isActive && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 0,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 24,
            height: 2,
            borderRadius: 1,
            background: 'var(--accent)',
          }}
        />
      )}

      <div style={{ position: 'relative' }}>
        <Icon size={22} aria-hidden={true} />
        {id === '알림' && badge !== undefined && <NotificationBadge count={badge} />}
      </div>

      <span
        className="text-[10px] font-medium leading-tight"
        style={{ letterSpacing: '-0.01em' }}
      >
        {label}
      </span>
    </button>
  );
}

// ── 바텀탭 본체 ───────────────────────────────────────────────────────────────

export default function BottomTab({ currentTabId, onTabChange, notificationCount = 0 }: BottomTabProps) {
  const tabs = useMemo(
    () =>
      TAB_DEFS.map((tab) => ({
        ...tab,
        isActive: tab.id === currentTabId,
      })),
    [currentTabId],
  );

  return (
    <>
      <style>{`
        @media (min-width: 600px) {
          .erp-bottom-tab { display: none !important; }
        }
      `}</style>

      <nav
        className="erp-bottom-tab"
        aria-label="모바일 하단 탭 네비게이션"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          background: 'var(--card)',
          borderTop: '1px solid var(--border)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <div
          role="tablist"
          aria-label="메인 탭 목록"
          className="flex items-stretch px-1"
          style={{ height: 56 }}
        >
          {tabs.map((tab) => (
            <TabButton
              key={tab.id}
              tab={tab}
              isActive={tab.isActive}
              badge={tab.id === '알림' ? notificationCount : undefined}
              onClick={onTabChange}
            />
          ))}
        </div>
      </nav>
    </>
  );
}
