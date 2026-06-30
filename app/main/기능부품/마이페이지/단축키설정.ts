// 직원별 Alt+키 단축키 매핑 — FavoriteEntry로 메뉴 진입 자동화
// JM: 데이터/저장 책임만 (UI/리스너는 별도)
// JM5: 외부 입력은 화이트리스트(SHORTCUT_KEYS)만 허용

import {
  buildMenuEntry,
  buildMypageEntry,
  buildSubMenuEntry,
  getInnerTabPendingKey,
  type FavoriteEntry,
  type MainMenuId,
  type MypageTabId } from './즐겨찾기설정';
import {
  ADMIN_SUBVIEW_KEY,
  APPROVAL_VIEW_KEY,
  HR_TAB_KEY,
  INV_VIEW_KEY,
  MYPAGE_TAB_KEY,
  FINANCE_VIEW_KEY } from '../../navigation-state';

export const SHORTCUTS_KEY = 'erp_mypage_shortcuts';

export const SHORTCUT_DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'] as const;
export const SHORTCUT_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J',
                                 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T',
                                 'U', 'V', 'W', 'X', 'Y', 'Z'] as const;

export type ShortcutKey = (typeof SHORTCUT_DIGITS)[number] | (typeof SHORTCUT_LETTERS)[number];

export const ALL_SHORTCUT_KEYS: ShortcutKey[] = [...SHORTCUT_DIGITS, ...SHORTCUT_LETTERS] as ShortcutKey[];

export type ShortcutMap = Partial<Record<ShortcutKey, FavoriteEntry>>;

export function normalizeShortcutKey(raw: string): ShortcutKey | null {
  const upper = String(raw || '').trim().toUpperCase();
  if (!upper) return null;
  if ((SHORTCUT_DIGITS as readonly string[]).includes(upper)) return upper as ShortcutKey;
  if ((SHORTCUT_LETTERS as readonly string[]).includes(upper)) return upper as ShortcutKey;
  return null;
}

export function buildShortcutsKey(userId: string | null | undefined): string {
  const trimmed = String(userId || '').trim();
  return trimmed ? `${SHORTCUTS_KEY}:${trimmed}` : SHORTCUTS_KEY;
}

function normalizeStoredEntry(value: unknown): FavoriteEntry | null {
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  const kind = String(obj.kind || '').trim();
  if (kind === 'mypage') {
    return buildMypageEntry(String(obj.tab || '').trim() as MypageTabId);
  }
  if (kind === 'menu') {
    return buildMenuEntry(String(obj.mainMenu || '').trim() as MainMenuId);
  }
  if (kind === 'submenu') {
    const main = String(obj.mainMenu || '').trim() as MainMenuId;
    const sub = String(obj.subView || '').trim();
    const inner = String(obj.innerTab || '').trim();
    return buildSubMenuEntry(main, sub, inner || undefined);
  }
  return null;
}

export function loadShortcuts(storageKey: string): ShortcutMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const result: ShortcutMap = {};
    for (const [rawKey, rawValue] of Object.entries(parsed)) {
      const key = normalizeShortcutKey(rawKey);
      if (!key) continue;
      const entry = normalizeStoredEntry(rawValue);
      if (!entry) continue;
      result[key] = entry;
    }
    return result;
  } catch {
    return {};
  }
}

export function saveShortcuts(storageKey: string, map: ShortcutMap): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(map));
  } catch {
    // ignore
  }
}

// 마이페이지 records_view 분기를 위한 별도 키
export const MYPAGE_RECORDS_VIEW_KEY = 'erp_mypage_records_view';

function safeWrite(key: string, value: string) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(key, value); } catch { /* ignore */ }
}

// FavoriteEntry를 전역 네비게이션으로 적용 — 마이페이지 외부에서도 호출 가능
export function applyFavoriteEntry(
  entry: FavoriteEntry,
  setMainMenu: (menu: string) => void,
  setSubView: (view: string | null) => void,
): void {
  if (entry.kind === 'mypage') {
    if (entry.tab === 'records_certificates') {
      safeWrite(MYPAGE_TAB_KEY, 'records');
      safeWrite(MYPAGE_RECORDS_VIEW_KEY, 'certificates');
    } else if (entry.tab === 'records_salary') {
      safeWrite(MYPAGE_TAB_KEY, 'records');
      safeWrite(MYPAGE_RECORDS_VIEW_KEY, 'salary');
    } else {
      safeWrite(MYPAGE_TAB_KEY, entry.tab);
    }
    setMainMenu('내정보');
    return;
  }

  if (entry.kind === 'menu') {
    setMainMenu(entry.mainMenu);
    return;
  }

  // submenu — sub-view localStorage 키 동기화
  if (entry.subView) {
    if (entry.mainMenu === '인사관리') safeWrite(HR_TAB_KEY, entry.subView);
    else if (entry.mainMenu === '재고관리') safeWrite(INV_VIEW_KEY, entry.subView);
    else if (entry.mainMenu === '전자결재') safeWrite(APPROVAL_VIEW_KEY, entry.subView);
    else if (entry.mainMenu === '관리자') safeWrite(ADMIN_SUBVIEW_KEY, entry.subView);
    else if (entry.mainMenu === '재무회계') safeWrite(FINANCE_VIEW_KEY, entry.subView);
  }
  if (entry.innerTab && entry.subView) {
    const pendingKey = getInnerTabPendingKey(entry.mainMenu, entry.subView);
    if (pendingKey) safeWrite(pendingKey, entry.innerTab);
  }
  setSubView(entry.subView || null);
  setMainMenu(entry.mainMenu);
}

// Alt+? 키 입력에서 ShortcutKey 추출 — Mac은 Option키도 함께 처리
export function extractShortcutKeyFromEvent(event: KeyboardEvent): ShortcutKey | null {
  if (!event.altKey) return null;
  if (event.ctrlKey || event.metaKey) return null;

  // event.key는 alt 조합 시 특수 문자가 될 수 있으므로 event.code 우선
  const code = String(event.code || '');
  if (code.startsWith('Digit')) {
    const digit = code.slice('Digit'.length);
    return normalizeShortcutKey(digit);
  }
  if (code.startsWith('Key')) {
    const letter = code.slice('Key'.length);
    return normalizeShortcutKey(letter);
  }
  // 폴백: event.key
  return normalizeShortcutKey(String(event.key || ''));
}
