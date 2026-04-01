export const CHAT_ROOM_KEY = 'erp_chat_last_room';
export const CHAT_ACTIVE_ROOM_KEY = 'erp_chat_active_room';
export const CHAT_FOCUS_KEY = 'erp_chat_focus_keyword';
export const LAST_MENU_KEY = 'erp_last_menu';
export const LAST_SUBVIEW_KEY = 'erp_last_subview';
export const LAST_COMPANY_KEY = 'erp_last_co';
export const MYPAGE_TAB_KEY = 'erp_mypage_tab';
export const HR_TAB_KEY = 'erp_hr_tab';
export const HR_COMPANY_KEY = 'erp_hr_company';
export const HR_STATUS_KEY = 'erp_hr_status';
export const HR_WORKSPACE_KEY = 'erp_hr_workspace';
export const INV_VIEW_KEY = 'erp_inventory_view';
export const APPROVAL_VIEW_KEY = 'erp_approval_view';
export const ADMIN_SUBVIEW_KEY = 'erp_admin_subview';

type SupportedMenuId = '내정보' | '채팅' | '전자결재' | '관리자' | '인사관리' | '재고관리';

export type StoredMainNavigationState = {
  savedMenu: string | null;
  savedSubView: string | null;
  savedCo: string | null;
};

const SUBVIEW_STORAGE_KEY_BY_MENU: Partial<Record<SupportedMenuId, string>> = {
  내정보: MYPAGE_TAB_KEY,
  인사관리: HR_TAB_KEY,
  재고관리: INV_VIEW_KEY,
  전자결재: APPROVAL_VIEW_KEY,
  관리자: ADMIN_SUBVIEW_KEY,
};

function readLocalStorage(key: string) {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocalStorage(key: string, value: string) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore storage failures
  }
}

function removeLocalStorage(key: string) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore storage failures
  }
}

function removeSessionStorage(key: string) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // ignore storage failures
  }
}

export function readStoredMainNavigationState(): StoredMainNavigationState {
  return {
    savedMenu: readLocalStorage(LAST_MENU_KEY),
    savedSubView: readLocalStorage(LAST_SUBVIEW_KEY),
    savedCo: readLocalStorage(LAST_COMPANY_KEY),
  };
}

export function persistTopLevelNavigationState(mainMenu: string, subView: string, selectedCo: string) {
  writeLocalStorage(LAST_MENU_KEY, mainMenu);
  writeLocalStorage(LAST_SUBVIEW_KEY, subView);
  writeLocalStorage(LAST_COMPANY_KEY, selectedCo);

  if (mainMenu === '관리자') {
    writeLocalStorage(ADMIN_SUBVIEW_KEY, subView);
  }
}

export function getSavedSubViewForMenu(targetMenu?: string | null) {
  if (!targetMenu) {
    return null;
  }

  const genericSubView = readLocalStorage(LAST_SUBVIEW_KEY);
  const scopedKey = SUBVIEW_STORAGE_KEY_BY_MENU[targetMenu as SupportedMenuId];

  if (!scopedKey) {
    return genericSubView;
  }

  return readLocalStorage(scopedKey) || genericSubView;
}

export function resetPersistedMenuState(menu: string) {
  switch (menu) {
    case '내정보':
      removeLocalStorage(MYPAGE_TAB_KEY);
      break;
    case '채팅':
      removeLocalStorage(CHAT_ROOM_KEY);
      removeLocalStorage(CHAT_FOCUS_KEY);
      removeSessionStorage(CHAT_ACTIVE_ROOM_KEY);
      break;
    case '전자결재':
      removeLocalStorage(APPROVAL_VIEW_KEY);
      break;
    case '관리자':
      removeLocalStorage(ADMIN_SUBVIEW_KEY);
      break;
    case '인사관리':
      removeLocalStorage(HR_TAB_KEY);
      removeLocalStorage(HR_COMPANY_KEY);
      removeLocalStorage(HR_STATUS_KEY);
      removeLocalStorage(HR_WORKSPACE_KEY);
      break;
    case '재고관리':
      removeLocalStorage(INV_VIEW_KEY);
      break;
    default:
      break;
  }
}

export function getNavigationEntryType(): PerformanceNavigationTiming['type'] | 'navigate' {
  if (typeof window === 'undefined' || typeof window.performance?.getEntriesByType !== 'function') {
    return 'navigate';
  }

  const navigationEntry = window.performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  return navigationEntry?.type ?? 'navigate';
}
