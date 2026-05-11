'use client';

/**
 * Sidebar.tsx — Phase 2 데스크톱 사이드바
 *
 * - 5개 최상위 메뉴 (업무 / 인사·근태·급여 / 운영 / 경영 / 설정)
 * - 활성 메뉴: --accent 배경 + white 텍스트
 * - 하단 사용자 아바타 + 역할 배지
 * - JM6: aria-current="page", aria-label 한국어, nav/ul/li 시맨틱 구조
 * - JM2: useMemo로 메뉴 렌더 안정화
 * - JM4: any 금지, SidebarProps 명시
 */

import React, { useMemo } from 'react';
import { MENU_CONFIG, MENU_ICONS } from './menu-config';
import { USER_ROLE_LABELS } from './types';
import type { MenuId, SidebarProps } from './types';

// ── 사용자 아바타 ─────────────────────────────────────────────────────────────

interface AvatarProps {
  name: string;
  avatarUrl?: string;
}

function Avatar({ name, avatarUrl }: AvatarProps) {
  const initials = name.slice(0, 2);

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={`${name} 프로필 사진`}
        width={36}
        height={36}
        className="rounded-full object-cover"
        style={{ width: 36, height: 36 }}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className="flex items-center justify-center rounded-full text-white text-xs font-semibold select-none"
      style={{
        width: 36,
        height: 36,
        background: 'var(--accent)',
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
}

// ── 메뉴 아이템 ───────────────────────────────────────────────────────────────

interface MenuItemProps {
  id: MenuId;
  label: string;
  ariaLabel: string;
  isActive: boolean;
  onClick: (id: MenuId) => void;
}

function MenuItem({ id, label, ariaLabel, isActive, onClick }: MenuItemProps) {
  const Icon = MENU_ICONS[id];

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
    <li role="none">
      <button
        type="button"
        role="menuitem"
        aria-current={isActive ? 'page' : undefined}
        aria-label={ariaLabel}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className="group flex flex-col items-center gap-1 w-full px-2 py-3 rounded-[var(--radius-md)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{
          background: isActive ? 'var(--accent)' : 'transparent',
          color: isActive ? '#ffffff' : 'var(--toss-gray-4)',
          outlineColor: 'var(--accent)',
        }}
      >
        <Icon
          size={22}
          aria-hidden={true}
          className="shrink-0 transition-colors"
        />
        <span
          className="text-[10px] font-medium leading-tight text-center"
          style={{ letterSpacing: '-0.01em' }}
        >
          {label}
        </span>
      </button>
    </li>
  );
}

// ── 사이드바 본체 ─────────────────────────────────────────────────────────────

export default function Sidebar({ currentMenuId, onMenuChange, user }: SidebarProps) {
  const menuItems = useMemo(
    () =>
      MENU_CONFIG.map((menu) => ({
        id: menu.id,
        label: menu.label,
        ariaLabel: menu.ariaLabel,
        isActive: menu.id === currentMenuId,
      })),
    [currentMenuId],
  );

  const roleLabel = USER_ROLE_LABELS[user.role];

  return (
    <aside
      aria-label="주 메뉴 사이드바"
      style={{
        width: 'var(--sidebar-width, 64px)',
        background: 'var(--card)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        height: '100dvh',
        position: 'sticky',
        top: 0,
        flexShrink: 0,
        zIndex: 40,
      }}
    >
      {/* 로고 영역 */}
      <div
        className="flex items-center justify-center"
        style={{
          height: 56,
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}
        aria-label="서비스 로고"
      >
        <div
          aria-hidden="true"
          className="rounded-[var(--radius-md)] flex items-center justify-center text-white text-xs font-bold"
          style={{ width: 32, height: 32, background: 'var(--accent)' }}
        >
          M
        </div>
      </div>

      {/* 메뉴 목록 */}
      <nav aria-label="주 탐색 메뉴" className="flex-1 overflow-y-auto py-3 px-2">
        <ul
          role="menu"
          aria-label="메인 메뉴"
          className="flex flex-col gap-1"
        >
          {menuItems.map((item) => (
            <MenuItem
              key={item.id}
              id={item.id}
              label={item.label}
              ariaLabel={item.ariaLabel}
              isActive={item.isActive}
              onClick={onMenuChange}
            />
          ))}
        </ul>
      </nav>

      {/* 사용자 정보 */}
      <div
        className="flex flex-col items-center gap-1 py-4 px-2"
        style={{
          borderTop: '1px solid var(--border)',
          flexShrink: 0,
        }}
        aria-label={`로그인 사용자: ${user.name}, 역할: ${roleLabel}`}
      >
        <Avatar name={user.name} avatarUrl={user.avatarUrl} />
        <span
          className="text-[9px] font-medium text-center truncate w-full"
          style={{ color: 'var(--toss-gray-4)', maxWidth: 52 }}
          title={user.name}
        >
          {user.name}
        </span>
        <span
          className="badge badge-blue"
          style={{ fontSize: 9, padding: '1px 5px' }}
          aria-label={`역할: ${roleLabel}`}
        >
          {roleLabel}
        </span>
      </div>
    </aside>
  );
}
