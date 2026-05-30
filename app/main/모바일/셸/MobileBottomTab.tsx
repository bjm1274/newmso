'use client';

/**
 * MobileBottomTab — 9탭 가로 스크롤 바텀 네비게이션
 * (알림·내정보·추가기능·채팅·게시판·전자결재·인사관리·재고관리·관리자)
 *
 * PC 사이드바(조직도측면창.tsx MAIN_MENUS / ICON_PATHS)와 동일한 아이콘 사용.
 * JM: 단일 책임, ~130줄
 * JM6: 모든 탭 button 시맨틱 + aria-current
 */

import { memo } from 'react';
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
  ),
};

const TABS: { id: MTab; label: string; hasDot?: boolean }[] = [
  { id: 'notif',    label: '알림',     hasDot: true },
  { id: 'mypage',   label: '내정보' },
  { id: 'addon',    label: '추가기능' },
  { id: 'chat',     label: '채팅' },
  { id: 'board',    label: '게시판' },
  { id: 'approval', label: '전자결재' },
  { id: 'hr',       label: '인사관리' },
  { id: 'stock',    label: '재고관리' },
  { id: 'admin',    label: '관리자' },
];

export type MobileBottomTabProps = {
  active: MTab;
  onChange: (tab: MTab) => void;
  badges?: Partial<Record<MTab, number>>;
  dots?: Partial<Record<MTab, boolean>>;
};

function MobileBottomTabBase({ active, onChange, badges, dots }: MobileBottomTabProps) {
  return (
    <nav className="m-bottom-tab" aria-label="주 네비게이션">
      {TABS.map((t) => {
        const on = t.id === active;
        const badgeCount = badges?.[t.id];
        const showDot = dots?.[t.id] ?? (t.hasDot && t.id === 'notif');
        return (
          <button
            key={t.id}
            type="button"
            className={on ? 'on' : ''}
            onClick={() => onChange(t.id)}
            aria-current={on ? 'page' : undefined}
            aria-label={t.label}
          >
            <div className="ico-wrap">
              <svg
                width={22}
                height={22}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={on ? 2.2 : 1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {TAB_ICONS[t.id]}
              </svg>
              {showDot && <span className="dot" />}
              {typeof badgeCount === 'number' && badgeCount > 0 && (
                <span className="badge">{badgeCount > 99 ? '99+' : badgeCount}</span>
              )}
            </div>
            <span className="lab">{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

const MobileBottomTab = memo(MobileBottomTabBase);
export default MobileBottomTab;
