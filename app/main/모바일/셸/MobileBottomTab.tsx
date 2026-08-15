'use client';

/**
 * MobileBottomTab — 9탭 가로 스크롤 바텀 네비게이션
 * (알림·내정보·추가기능·채팅·게시판·전자결재·인사관리·재고관리·관리자)
 *
 * PC 사이드바(조직도측면창.tsx MAIN_MENUS / ICON_PATHS)와 동일한 아이콘 사용.
 * JM: 단일 책임, ~130줄
 * JM6: 모든 탭 button 시맨틱 + aria-current
 */

import { memo, useMemo } from 'react';
import type { ErpUser } from '@/types';
import { canAccessMainMenu } from '@/lib/access-control';
import type { MTab } from './m-routes';

/* ─── PC 사이드바와 동일한 SVG path ────────────────────────── */
const TAB_ICONS: Record<string, React.ReactNode> = {
  /* 알림: Bell — PC 사이드바의 bell path */
  notif: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </>
  ),
  /* 내정보: User — PC MAIN_MENUS[0] User */
  mypage: (
    <>
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="7" r="4" />
    </>
  ),
  /* 추가기능: LayoutGrid — PC MAIN_MENUS[1] LayoutGrid (board path) */
  addon: (
    <>
      <rect x="4" y="4" width="6" height="6" rx="1.5" />
      <rect x="14" y="4" width="6" height="6" rx="1.5" />
      <rect x="4" y="14" width="6" height="6" rx="1.5" />
      <rect x="14" y="14" width="6" height="6" rx="1.5" />
    </>
  ),
  /* 채팅: MessageSquare — PC MAIN_MENUS[2] */
  chat: (
    <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
  ),
  /* 게시판: ClipboardList — PC MAIN_MENUS[3] */
  board: (
    <>
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M8 12h8M8 16h5" />
    </>
  ),
  /* 전자결재: FileCheck — PC MAIN_MENUS[4] */
  approval: (
    <>
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M14 3v5h5" />
      <path d="m9 15 2 2 4-5" />
    </>
  ),
  /* 인사관리: Briefcase (명함카드) — PC MAIN_MENUS[5] */
  hr: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <circle cx="9" cy="11" r="2.4" />
      <path d="M6.5 16c1.2-2 3.8-2 5 0" />
      <path d="M14 10h4" />
      <path d="M14 14h3" />
    </>
  ),
  /* 재고관리: Package — PC MAIN_MENUS[6] */
  stock: (
    <>
      <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" />
      <path d="m4 7.5 8 4.5 8-4.5" />
      <path d="M12 12v9" />
    </>
  ),
  /* 관리자: Shield — PC MAIN_MENUS[7] */
  admin: (
    <>
      <path d="M12 3 19 6v5c0 4.5-2.8 8.2-7 10-4.2-1.8-7-5.5-7-10V6z" />
      <path d="M9.5 12.5 11 14l3.5-4" />
    </>
  ) };

const TABS: { id: MTab; label: string; menuId: string }[] = [
  { id: 'notif',    label: '알림',   menuId: '알림' },
  { id: 'mypage',   label: '내정보', menuId: '내정보' },
  { id: 'addon',    label: '추가기능', menuId: '추가기능' },
  { id: 'chat',     label: '채팅',   menuId: '채팅' },
  { id: 'board',    label: '게시판', menuId: '게시판' },
  { id: 'approval', label: '전자결재', menuId: '전자결재' },
  { id: 'hr',       label: '인사관리', menuId: '인사관리' },
  { id: 'stock',    label: '재고관리', menuId: '재고관리' },
  { id: 'admin',    label: '관리자', menuId: '관리자' },
];

export type MobileBottomTabProps = {
  active: MTab;
  onChange: (tab: MTab) => void;
  user?: ErpUser | null;
  badges?: Partial<Record<MTab, number>>;
  dots?: Partial<Record<MTab, boolean>>;
};

function MobileBottomTabBase({
  active,
  onChange,
  user,
  badges,
  dots }: MobileBottomTabProps) {
  const visibleTabs = useMemo(() => {
    if (!user) return TABS;
    return TABS.filter((t) => canAccessMainMenu(user, t.menuId));
  }, [user]);

  return (
    <nav
      className="m-bottom-tab"
      aria-label="주 네비게이션"
      data-testid="mobile-tabbar"
      style={{
        position: 'fixed',
        bottom: 'max(16px, env(safe-area-inset-bottom, 0px))',
        left: '16px',
        right: '16px',
        height: '64px',
        borderRadius: '22px',
        // 유리 대신 카드 배경 — 반투명은 스크롤 콘텐츠에 따라 대비가 무너진다.
        background: 'var(--m-card)',
        border: '1px solid var(--m-border)',
        boxShadow: '0 8px 28px rgba(24, 24, 27, 0.14)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 10px',
        overflowX: 'auto',
        overflowY: 'hidden',
        scrollbarWidth: 'none',
        WebkitOverflowScrolling: 'touch',
        zIndex: 999,
        maskImage: 'linear-gradient(to right, transparent, white 6%, white 94%, transparent)',
        WebkitMaskImage: 'linear-gradient(to right, transparent, white 6%, white 94%, transparent)' }}
    >
      <style>{`
        .m-bottom-tab::-webkit-scrollbar {
          display: none !important;
        }
      `}</style>

      {visibleTabs.map((t) => {
        const on = t.id === active;
        const badgeCount = badges?.[t.id];
        const showDot = dots?.[t.id] ?? false;
        
        // E2E test-id mapping for mobile menu items
        let testId = `sidebar-menu-${t.id}-mobile`;
        if (t.id === 'mypage') testId = 'sidebar-menu-home-mobile';
        if (t.id === 'addon') testId = 'sidebar-menu-extra-mobile';
        if (t.id === 'stock') testId = 'sidebar-menu-inventory-mobile';

        return (
          <button
            key={t.id}
            type="button"
            className={on ? 'on' : ''}
            onClick={() => onChange(t.id)}
            aria-current={on ? 'page' : undefined}
            aria-label={t.label}
            data-testid={testId}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: 0,
              padding: '6px 12px',
              minWidth: '58px',
              flexShrink: 0,
              cursor: 'pointer',
              outline: 'none',
              position: 'relative',
              // scale 은 탭 폭을 흔들어 가로 스크롤 위치가 튄다 — transform 을 쓰지 않는다.
              transition: 'color 0.2s ease' }}
          >
            <div
              className="ico-wrap"
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: on ? 'var(--m-accent)' : 'var(--z-500)',
                transition: 'color 0.2s ease' }}
            >
              <svg
                width={22}
                height={22}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={on ? 2.4 : 1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                style={{
                  filter: on ? 'drop-shadow(0 2px 8px rgba(37, 99, 235, 0.35))' : 'none' }}
              >
                {TAB_ICONS[t.id]}
              </svg>
              {showDot && (
                <span
                  className="dot"
                  style={{
                    position: 'absolute',
                    top: -2,
                    right: -2,
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: 'var(--m-accent)' }}
                />
              )}
              {typeof badgeCount === 'number' && badgeCount > 0 && (
                <span
                  className="badge"
                  style={{
                    position: 'absolute',
                    top: -6,
                    right: -10,
                    minWidth: 16,
                    height: 16,
                    padding: '0 4px',
                    borderRadius: 8,
                    background: 'var(--m-danger)',
                    color: '#ffffff',
                    fontSize: 9,
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    lineHeight: 1,
                    border: '2px solid var(--m-card)' }}
                >
                  {badgeCount > 99 ? '99+' : badgeCount}
                </span>
              )}
            </div>
            
            {/* 활성 탭도 라벨을 유지한다 — 점으로 바뀌면 무슨 탭인지 알 수 없다. */}
            <span
              className="lab"
              style={{
                fontSize: on ? 10 : 9.5,
                fontWeight: on ? 800 : 700,
                color: on ? 'var(--m-accent)' : 'var(--z-500)',
                marginTop: 4,
                letterSpacing: '-0.02em' }}
            >
              {t.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

const MobileBottomTab = memo(MobileBottomTabBase);
export default MobileBottomTab;
