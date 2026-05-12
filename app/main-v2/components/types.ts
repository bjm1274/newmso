/**
 * Phase 2 공통 타입 정의
 * - MenuId: 5개 최상위 메뉴 식별자 (판별 가능한 유니온)
 * - BottomTabId: 모바일 바텀탭 5개 식별자
 * - UserRole: 사용자 역할
 */

// ── 최상위 메뉴 ──────────────────────────────────────────────────────────────

export type MenuId =
  | '업무'
  | '인사·근태·급여'
  | '운영'
  | '경영'
  | '설정';

export const MENU_IDS = ['업무', '인사·근태·급여', '운영', '경영', '설정'] as const satisfies readonly MenuId[];

const MENU_ID_SET = new Set<string>(MENU_IDS);

export function isMenuId(value: unknown): value is MenuId {
  return typeof value === 'string' && MENU_ID_SET.has(value);
}

// ── 바텀탭 ───────────────────────────────────────────────────────────────────
// BottomTabId / BOTTOM_TAB_IDS / isBottomTabId / BottomTabProps → @/app/components/BottomTab

// ── 사용자 역할 ───────────────────────────────────────────────────────────────

export type UserRole = 'staff' | 'manager' | 'director';

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  staff: '직원',
  manager: '관리자',
  director: '원장',
};

// ── 사이드바 props ────────────────────────────────────────────────────────────

export interface SidebarUser {
  name: string;
  role: UserRole;
  /** 아바타 이미지 URL (없으면 이니셜 표시) */
  avatarUrl?: string;
}

export interface SidebarProps {
  currentMenuId: MenuId;
  onMenuChange: (id: MenuId) => void;
  user: SidebarUser;
}

// ── MoreSheet props ───────────────────────────────────────────────────────────

export interface MoreSheetScreen {
  /** 화면 고유 ID */
  id: string;
  /** 화면 표시 이름 */
  label: string;
  /** 검색용 키워드 (label 포함 추가 키워드) */
  keywords?: readonly string[];
  /** 소속 메뉴 (그룹핑용) */
  menuId: MenuId;
}

export interface MoreSheetProps {
  isOpen: boolean;
  onClose: () => void;
  screens: readonly MoreSheetScreen[];
  onScreenSelect: (screen: MoreSheetScreen) => void;
}
