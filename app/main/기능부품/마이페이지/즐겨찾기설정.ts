// 마이페이지 즐겨찾기 설정 — FavoriteEntry 모델, 마이그레이션, 권한 필터링
// JM: 즐겨찾기 데이터 모델과 권한 카탈로그만 담당 (UI 분리)
// JM2: 클라이언트 전용 — server-only 모듈 import 금지

import { SUB_MENUS } from '../조직도서브/조직도측면창';
import {
  canAccessAdminSection,
  canAccessApprovalSection,
  canAccessBoard,
  canAccessExtraFeature,
  canAccessHrSection,
  canAccessInventorySection,
  canAccessMainMenu,
  canAccessMyPageTab,
  canAccessFinanceSection } from '@/lib/access-control';

export const FAVORITES_KEY = 'erp_mypage_favorites';

// 즐겨찾기에서 inner tab을 지정했을 때 호스트가 일회성으로 읽고 지우는 localStorage 키
export const PENDING_INNER_TAB_KEYS = {
  payroll: 'erp_payroll_pending_initial_tab',
  attendance: 'erp_attendance_pending_initial_tab',
  contract: 'erp_contract_pending_initial_tab',
  inventory: 'erp_inventory_pending_initial_tab',
  approval: 'erp_approval_pending_initial_tab',
  board: 'erp_board_pending_initial_tab' } as const;

export type MypageTabId =
  | 'profile' | 'commute' | 'todo' | 'leave'
  | 'records' | 'records_certificates' | 'records_salary'
  | 'documents' | 'notifications';

export type MainMenuId = '내정보' | '조직도' | '추가기능' | '채팅' | '게시판' | '전자결재' | '인사관리' | '재고관리' | '관리자' | '재무회계';

export type FavoriteEntry =
  | { id: string; kind: 'mypage'; tab: MypageTabId; label: string; icon: string }
  | { id: string; kind: 'menu'; mainMenu: MainMenuId; label: string; icon: string }
  | { id: string; kind: 'submenu'; mainMenu: MainMenuId; subView: string; innerTab?: string; label: string; icon: string };

// ─── 옵션 카탈로그 ─────────────────────────────────────────

export const MYPAGE_TAB_PRESETS: { tab: MypageTabId; label: string; icon: string; permKey?: string }[] = [
  { tab: 'profile', label: '내 정보', icon: 'User', permKey: 'profile' },
  { tab: 'commute', label: '출퇴근', icon: 'Clock', permKey: 'commute' },
  { tab: 'todo', label: '할일', icon: 'CheckSquare', permKey: 'todo' },
  { tab: 'leave', label: '연차휴가', icon: 'Briefcase', permKey: 'profile' },
  { tab: 'records', label: '급여·증명서', icon: 'FileCheck', permKey: 'salary' },
  { tab: 'records_certificates', label: '증명서', icon: 'FileCheck', permKey: 'certificates' },
  { tab: 'records_salary', label: '급여명세서', icon: 'FileCheck', permKey: 'salary' },
  { tab: 'documents', label: '서류제출', icon: 'Upload', permKey: 'documents' },
  { tab: 'notifications', label: '알림', icon: 'Bell', permKey: 'notifications' },
];

export const MAIN_MENU_PRESETS: { mainMenu: MainMenuId; label: string; icon: string }[] = [
  { mainMenu: '내정보', label: '메인 · 내 정보', icon: 'User' },
  { mainMenu: '조직도', label: '조직도', icon: 'Building2' },
  { mainMenu: '추가기능', label: '추가기능', icon: 'Plus' },
  { mainMenu: '채팅', label: '채팅', icon: 'MessageSquare' },
  { mainMenu: '게시판', label: '게시판', icon: 'ClipboardList' },
  { mainMenu: '전자결재', label: '전자결재', icon: 'FileCheck' },
  { mainMenu: '인사관리', label: '인사관리(전체)', icon: 'Users' },
  { mainMenu: '재고관리', label: '재고관리(전체)', icon: 'Package' },
  { mainMenu: '관리자', label: '관리자', icon: 'Settings' },
  { mainMenu: '재무회계', label: '재무회계(전체)', icon: 'Landmark' },
];

export const SUB_MENU_BEARERS: MainMenuId[] = ['게시판', '전자결재', '인사관리', '재고관리', '관리자', '재무회계'];

// 호스트별 inner tab 카탈로그 — 사용자가 특정 sub-view 깊이 안의 탭을 즐겨찾기할 수 있게.
// pendingKey: 호스트 컴포넌트가 마운트 시 일회성으로 읽고 지우는 localStorage 키
export type InnerTabCatalogEntry = {
  pendingKey: keyof typeof PENDING_INNER_TAB_KEYS;
  tabs: { id: string; label: string }[];
};

export const INNER_TAB_CATALOG: Record<string, InnerTabCatalogEntry> = {
  '인사관리/급여': {
    pendingKey: 'payroll',
    tabs: [
      { id: '대시보드', label: '대시보드' },
      { id: '급여정산', label: '급여정산' },
      { id: '급여대장', label: '급여대장' },
      { id: '연말퇴직정산', label: '연말퇴직정산' },
      { id: '원천징수파일', label: '원천징수파일' },
      { id: '4대보험EDI', label: '4대보험 / EDI' },
      { id: '급여시뮬레이터', label: '급여 시뮬레이터' },
      { id: '퇴직연금', label: '퇴직연금' },
      { id: '임금피크제', label: '임금피크제' },
      { id: '통상임금', label: '통상임금 계산기' },
      { id: '미지급수당', label: '미지급 수당 알림' },
      { id: '무급결근차감', label: '무급 결근 차감' },
    ] },
  '인사관리/근태': {
    pendingKey: 'attendance',
    tabs: [
      { id: '근태관리', label: '근태관리' },
      { id: '연차휴가', label: '연차/휴가' },
      { id: '간호근무표', label: '근무표 자동편성' },
      { id: '근태이상차감', label: '지각·조퇴 / 근태이상' },
      { id: '근태이상분석', label: '근태이상 분석' },
      { id: '근태차감시뮬레이터', label: '근태 차감 시뮬레이터' },
      { id: '근무형태이력', label: '근무형태 이력' },
    ] },
  '인사관리/계약': {
    pendingKey: 'contract',
    tabs: [
      { id: '기본', label: '계약서 관리' },
      { id: '계약서생성기', label: '계약서 생성기' },
    ] },
  '재고관리/발주': {
    pendingKey: 'inventory',
    tabs: [
      { id: '발주', label: '구매/발주' },
      { id: '거래처', label: '거래처/명세서' },
      { id: '납품확인서', label: '납품확인서' },
    ] },
  '재고관리/자산': {
    pendingKey: 'inventory',
    tabs: [
      { id: '자산', label: '품목/자산' },
      { id: '카테고리', label: '카테고리' },
      { id: 'UDI', label: 'UDI' },
    ] } };

export function getSubMenuOptions(mainMenu: MainMenuId): { subView: string; label: string; icon?: string }[] {
  const items = (SUB_MENUS as Record<string, { id: string; label: string; icon?: string; hidden?: boolean }[]>)[mainMenu];
  if (!Array.isArray(items)) return [];
  return items
    .filter((item) => !item.hidden && item.id)
    .map((item) => ({ subView: item.id, label: item.label || item.id, icon: item.icon || '' }));
}

export function getInnerTabsFor(mainMenu: MainMenuId, subView: string): { id: string; label: string }[] {
  const entry = INNER_TAB_CATALOG[`${mainMenu}/${subView}`];
  return entry ? entry.tabs : [];
}

export function getInnerTabPendingKey(mainMenu: MainMenuId, subView: string): string | null {
  const entry = INNER_TAB_CATALOG[`${mainMenu}/${subView}`];
  return entry ? PENDING_INNER_TAB_KEYS[entry.pendingKey] : null;
}

// ─── 엔트리 빌더 ───────────────────────────────────────────

type FavoriteEntryBody =
  | { kind: 'mypage'; tab: MypageTabId; label: string; icon: string }
  | { kind: 'menu'; mainMenu: MainMenuId; label: string; icon: string }
  | { kind: 'submenu'; mainMenu: MainMenuId; subView: string; innerTab?: string; label: string; icon: string };

export function buildEntryId(entry: FavoriteEntryBody): string {
  if (entry.kind === 'mypage') return `mypage:${entry.tab}`;
  if (entry.kind === 'menu') return `menu:${entry.mainMenu}`;
  return entry.innerTab
    ? `submenu:${entry.mainMenu}:${entry.subView}:${entry.innerTab}`
    : `submenu:${entry.mainMenu}:${entry.subView}`;
}

const MAIN_MENU_ICON_FALLBACK: Record<MainMenuId, string> = {
  내정보: 'User',
  조직도: 'Building2',
  추가기능: 'Plus',
  채팅: 'MessageSquare',
  게시판: 'ClipboardList',
  전자결재: 'FileCheck',
  인사관리: 'Users',
  재고관리: 'Package',
  관리자: 'Settings',
  재무회계: 'Landmark' };

export function buildSubMenuEntry(mainMenu: MainMenuId, subView: string, innerTab?: string): FavoriteEntry | null {
  const options = getSubMenuOptions(mainMenu);
  const matched = options.find((o) => o.subView === subView);
  if (!matched) return null;
  const icon = matched.icon || MAIN_MENU_ICON_FALLBACK[mainMenu] || 'Star';

  if (innerTab) {
    const innerOptions = getInnerTabsFor(mainMenu, subView);
    const innerMatched = innerOptions.find((t) => t.id === innerTab);
    if (!innerMatched) return null;
    const body: FavoriteEntryBody = {
      kind: 'submenu',
      mainMenu,
      subView,
      innerTab,
      label: `${mainMenu} · ${matched.label} · ${innerMatched.label}`,
      icon };
    return { ...body, id: buildEntryId(body) } as FavoriteEntry;
  }

  const body: FavoriteEntryBody = {
    kind: 'submenu',
    mainMenu,
    subView,
    label: `${mainMenu} · ${matched.label}`,
    icon };
  return { ...body, id: buildEntryId(body) } as FavoriteEntry;
}

export function buildMypageEntry(tab: MypageTabId): FavoriteEntry | null {
  const preset = MYPAGE_TAB_PRESETS.find((p) => p.tab === tab);
  if (!preset) return null;
  const body: FavoriteEntryBody = { kind: 'mypage', tab, label: preset.label, icon: preset.icon };
  return { ...body, id: buildEntryId(body) } as FavoriteEntry;
}

export function buildMenuEntry(mainMenu: MainMenuId): FavoriteEntry | null {
  const preset = MAIN_MENU_PRESETS.find((p) => p.mainMenu === mainMenu);
  if (!preset) return null;
  const body: FavoriteEntryBody = { kind: 'menu', mainMenu, label: preset.label, icon: preset.icon };
  return { ...body, id: buildEntryId(body) } as FavoriteEntry;
}

// ─── 레거시 마이그레이션 ──────────────────────────────────

const LEGACY_FAVORITE_ID_TO_ENTRY: Record<string, () => FavoriteEntry | null> = {
  mypage_profile: () => buildMypageEntry('profile'),
  mypage_commute: () => buildMypageEntry('commute'),
  mypage_todo: () => buildMypageEntry('todo'),
  mypage_leave: () => buildMypageEntry('leave'),
  mypage_records: () => buildMypageEntry('records'),
  mypage_certificates: () => buildMypageEntry('records_certificates'),
  mypage_salary: () => buildMypageEntry('records_salary'),
  mypage_documents: () => buildMypageEntry('documents'),
  hr_payroll: () => buildSubMenuEntry('인사관리', '급여'),
  inv_purchase: () => buildSubMenuEntry('재고관리', '발주'),
  menu_home: () => buildMenuEntry('내정보'),
  menu_org: () => buildMenuEntry('조직도'),
  menu_extra: () => buildMenuEntry('추가기능'),
  menu_chat: () => buildMenuEntry('채팅'),
  menu_board: () => buildSubMenuEntry('게시판', '공지사항'),
  menu_approval: () => buildSubMenuEntry('전자결재', '기안함'),
  menu_hr: () => buildSubMenuEntry('인사관리', '구성원'),
  menu_inventory: () => buildSubMenuEntry('재고관리', '현황'),
  menu_admin: () => buildMenuEntry('관리자') };

function normalizeStoredEntry(value: unknown): FavoriteEntry | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const factory = LEGACY_FAVORITE_ID_TO_ENTRY[value];
    return factory ? factory() : null;
  }
  if (typeof value !== 'object') return null;
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

export function migrateStoredFavorites(raw: unknown): FavoriteEntry[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const result: FavoriteEntry[] = [];
  for (const value of raw) {
    const entry = normalizeStoredEntry(value);
    if (!entry) continue;
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    result.push(entry);
  }
  return result;
}

// ─── 권한 필터링 ──────────────────────────────────────────

type UserLike = Parameters<typeof canAccessMainMenu>[0];

const HR_SUBVIEW_TO_PERM: Record<string, string> = {
  구성원: 'hr_구성원',
  인사변동: '인사변동',
  '입퇴사·교육센터': '입퇴사·교육센터',
  근태: 'hr_근태',
  급여: 'hr_급여',
  경조사: 'hr_경조사',
  '자격·안전센터': '자격·안전센터',
  계약: 'hr_계약',
  문서센터: '문서센터' };

const APPROVAL_SUBVIEW_TO_PERM: Record<string, string> = {
  기안함: 'approval_기안함',
  결재함: 'approval_결재함',
  '참조 문서함': 'approval_참조문서함',
  작성하기: 'approval_작성하기' };

const INVENTORY_SUBVIEW_TO_PERM: Record<string, string> = {
  현황: 'inventory_현황',
  등록: 'inventory_등록',
  발주: 'inventory_발주',
  자산: 'inventory_자산',
  월마감: 'inventory_월마감' };

const FINANCE_SUBVIEW_TO_PERM: Record<string, string> = {
  복식부기: 'finance_복식부기',
  부가세: 'finance_부가세',
  결산: 'finance_결산',
  자금흐름: 'finance_자금흐름',
  감가상각: 'finance_감가상각',
  매입원장: 'finance_매입원장',
  'double-entry': 'finance_복식부기',
  vat: 'finance_부가세',
  closing: 'finance_결산',
  'cash-flow': 'finance_자금흐름',
  depreciation: 'finance_감가상각',
  'purchase-ledger': 'finance_매입원장' };

export function canAccessFavoriteEntry(user: UserLike, entry: FavoriteEntry): boolean {
  if (entry.kind === 'mypage') {
    if (!user) return true;
    const preset = MYPAGE_TAB_PRESETS.find((p) => p.tab === entry.tab);
    const permKey = preset?.permKey;
    if (!permKey) return true;
    return canAccessMyPageTab(user, permKey);
  }

  if (entry.kind === 'menu') {
    return canAccessMainMenu(user, entry.mainMenu);
  }

  // submenu
  if (!canAccessMainMenu(user, entry.mainMenu)) return false;
  const { mainMenu, subView } = entry;
  if (mainMenu === '인사관리') {
    const key = HR_SUBVIEW_TO_PERM[subView];
    return key ? canAccessHrSection(user, key) : canAccessMainMenu(user, '인사관리');
  }
  if (mainMenu === '재고관리') {
    const key = INVENTORY_SUBVIEW_TO_PERM[subView];
    return key ? canAccessInventorySection(user, key) : canAccessMainMenu(user, '재고관리');
  }
  if (mainMenu === '전자결재') {
    const key = APPROVAL_SUBVIEW_TO_PERM[subView] || subView;
    return canAccessApprovalSection(user, key);
  }
  if (mainMenu === '게시판') {
    return canAccessBoard(user, subView, 'read');
  }
  if (mainMenu === '관리자') {
    return canAccessAdminSection(user, subView);
  }
  if (mainMenu === '재무회계') {
    const key = FINANCE_SUBVIEW_TO_PERM[subView] || subView;
    return canAccessFinanceSection(user, key);
  }
  if (mainMenu === '추가기능') {
    return canAccessExtraFeature(user, subView);
  }
  return true;
}

export function getPermittedMypageTabs(user: UserLike): typeof MYPAGE_TAB_PRESETS {
  return MYPAGE_TAB_PRESETS.filter((preset) => {
    if (!preset.permKey) return true;
    return canAccessMyPageTab(user, preset.permKey);
  });
}

export function getPermittedMainMenus(user: UserLike): typeof MAIN_MENU_PRESETS {
  return MAIN_MENU_PRESETS.filter((preset) => canAccessMainMenu(user, preset.mainMenu));
}

export function getPermittedSubMenuBearers(user: UserLike): MainMenuId[] {
  return SUB_MENU_BEARERS.filter((id) => canAccessMainMenu(user, id));
}

export function getPermittedSubMenuOptions(user: UserLike, mainMenu: MainMenuId) {
  return getSubMenuOptions(mainMenu).filter((option) => {
    const entry = buildSubMenuEntry(mainMenu, option.subView);
    return entry ? canAccessFavoriteEntry(user, entry) : false;
  });
}
