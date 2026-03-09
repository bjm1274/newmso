type UserLike = {
  role?: string | null;
  company?: string | null;
  permissions?: Record<string, any> | null;
};

export type MainMenuId =
  | '내정보'
  | '조직도'
  | '추가기능'
  | '채팅'
  | '게시판'
  | '전자결재'
  | '인사관리'
  | '재고관리'
  | '관리자';

export type MyPageTabId =
  | 'profile'
  | 'commute'
  | 'todo'
  | 'certificates'
  | 'salary'
  | 'documents'
  | 'notifications';

const VOLATILE_USER_FIELDS = new Set([
  'password',
  'passwd',
  'updated_at',
  'last_seen_at',
  'presence_status',
  'force_logout_at',
]);

function getPermissions(user?: UserLike | null) {
  if (!user?.permissions || typeof user.permissions !== 'object') return {};
  return user.permissions;
}

function normalizeValue(value: any): any {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item));
  }

  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce<Record<string, any>>((acc, key) => {
        if (VOLATILE_USER_FIELDS.has(key)) return acc;
        acc[key] = normalizeValue(value[key]);
        return acc;
      }, {});
  }

  return value;
}

export function hasPermission(user: UserLike | null | undefined, permissionKey: string): boolean {
  return getPermissions(user)[permissionKey] === true;
}

export function isMsoUser(user: UserLike | null | undefined): boolean {
  return user?.company === 'SY INC.' || hasPermission(user, 'mso');
}

export function isAdminUser(user: UserLike | null | undefined): boolean {
  return user?.role === 'admin' || hasPermission(user, 'admin');
}

export function canAccessMainMenu(user: UserLike | null | undefined, menuId: string): boolean {
  switch (menuId as MainMenuId) {
    case '내정보':
      return true;
    case '조직도':
      return isMsoUser(user) || isAdminUser(user) || hasPermission(user, 'menu_조직도');
    case '추가기능':
      return isMsoUser(user) || isAdminUser(user) || hasPermission(user, 'menu_추가기능');
    case '채팅':
      return isMsoUser(user) || isAdminUser(user) || hasPermission(user, 'menu_채팅');
    case '게시판':
      return isMsoUser(user) || isAdminUser(user) || hasPermission(user, 'menu_게시판');
    case '전자결재':
      return (
        isMsoUser(user) ||
        isAdminUser(user) ||
        hasPermission(user, 'approval') ||
        hasPermission(user, 'menu_전자결재')
      );
    case '인사관리':
      return (
        isMsoUser(user) ||
        isAdminUser(user) ||
        hasPermission(user, 'hr') ||
        hasPermission(user, 'menu_인사관리')
      );
    case '재고관리':
      return (
        isMsoUser(user) ||
        isAdminUser(user) ||
        hasPermission(user, 'inventory') ||
        hasPermission(user, 'menu_재고관리')
      );
    case '관리자':
      return isMsoUser(user) || hasPermission(user, 'menu_관리자');
    default:
      return false;
  }
}

export function normalizeMainMenuForUser(
  user: UserLike | null | undefined,
  requestedMenu: string | null | undefined
): MainMenuId {
  if (requestedMenu && canAccessMainMenu(user, requestedMenu)) {
    return requestedMenu as MainMenuId;
  }

  return '내정보';
}

export function canAccessMyPageTab(user: UserLike | null | undefined, tabId: string): boolean {
  switch (tabId as MyPageTabId) {
    case 'profile':
    case 'commute':
    case 'todo':
      return true;
    case 'certificates':
      return isMsoUser(user) || isAdminUser(user) || hasPermission(user, 'hr_증명서');
    case 'salary':
      return isMsoUser(user) || isAdminUser(user) || hasPermission(user, 'hr_급여');
    case 'documents':
      return isMsoUser(user) || isAdminUser(user) || hasPermission(user, 'hr_문서보관함');
    case 'notifications':
      return true;
    default:
      return false;
  }
}

export function canAccessHrSection(
  user: UserLike | null | undefined,
  permissionKey: string
): boolean {
  return (
    isMsoUser(user) ||
    isAdminUser(user) ||
    hasPermission(user, 'hr') ||
    hasPermission(user, 'menu_인사관리') ||
    hasPermission(user, permissionKey)
  );
}

export function hasUserPayloadChanged(currentUser: any, nextUser: any): boolean {
  return JSON.stringify(normalizeValue(currentUser ?? null)) !== JSON.stringify(normalizeValue(nextUser ?? null));
}
