import { isNamedSystemMasterAccount } from '@/lib/system-master';

type UserLike = {
  role?: string | null;
  company?: string | null;
  status?: string | null;
  permissions?: Record<string, any> | null;
};

export type MainMenuId =
  | '내정보'
  | '알림'
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

export type BoardPermissionAction = 'read' | 'write';

const VOLATILE_USER_FIELDS = new Set([
  'password',
  'passwd',
  'updated_at',
  'last_seen_at',
  'presence_status',
  'force_logout_at',
]);

const EXTRA_FEATURE_PERMISSION_KEYS: Record<string, string> = {
  조직도: 'extra_조직도',
  부서별재고: 'extra_부서별재고',
  근무현황: 'extra_근무현황',
  인계노트: 'extra_인계노트',
  퇴원심사: 'extra_퇴원심사',
  마감보고: 'extra_마감보고',
  직원평가: 'extra_직원평가',
  입금실시간조회: 'extra_입금실시간조회',
  수술상담: 'extra_수술상담',
};

const BOARD_PERMISSION_KEYS: Record<string, { read: string; write: string }> = {
  공지사항: { read: 'board_공지사항_read', write: 'board_공지사항_write' },
  자유게시판: { read: 'board_자유게시판_read', write: 'board_자유게시판_write' },
  경조사: { read: 'board_경조사_read', write: 'board_경조사_write' },
  MRI일정: { read: 'board_MRI일정_read', write: 'board_MRI일정_write' },
  수술일정: { read: 'board_수술일정_read', write: 'board_수술일정_write' },
};

const APPROVAL_PERMISSION_KEYS: Record<string, string> = {
  기안함: 'approval_기안함',
  결재함: 'approval_결재함',
  '참조 문서함': 'approval_참조문서함',
  작성하기: 'approval_작성하기',
};

const HR_PERMISSION_KEYS: Record<string, string> = {
  '직원등록': 'hr_직원등록',
  구성원: 'hr_구성원',
  인사발령: 'hr_인사발령',
  '포상/징계': 'hr_포상징계',
  교육: 'hr_교육',
  오프보딩: 'hr_오프보딩',
  근태: 'hr_근태',
  교대근무: 'hr_교대근무',
  '연차/휴가': 'hr_연차휴가',
  급여: 'hr_급여',
  건강검진: 'hr_건강검진',
  경조사: 'hr_경조사',
  '면허/자격증': 'hr_면허자격증',
  의료기기점검: 'hr_의료기기점검',
  비품대여: 'hr_비품대여',
  사고보고서: 'hr_사고보고서',
  계약: 'hr_계약',
  문서보관함: 'hr_문서보관함',
  증명서: 'hr_증명서',
  서류제출: 'hr_서류제출',
  캘린더: 'hr_캘린더',
};

const INVENTORY_PERMISSION_KEYS: Record<string, string> = {
  현황: 'inventory_현황',
  이력: 'inventory_이력',
  수요예측: 'inventory_수요예측',
  등록: 'inventory_등록',
  스캔: 'inventory_스캔',
  발주: 'inventory_발주',
  재고실사: 'inventory_재고실사',
  이관: 'inventory_이관',
  납품확인서: 'inventory_납품확인서',
  UDI: 'inventory_UDI',
  자산: 'inventory_자산',
  거래처: 'inventory_거래처',
  카테고리: 'inventory_카테고리',
  AS반품: 'inventory_AS반품',
  소모품통계: 'inventory_소모품통계',
  명세서: 'inventory_거래처',
  유통기한: 'inventory_현황',
};

const ADMIN_PERMISSION_KEYS: Record<string, string> = {
  경영분석: 'admin_경영분석',
  감사센터: 'admin_감사센터',
  시스템마스터센터: 'admin_시스템마스터센터',
  엑셀등록: 'admin_엑셀등록',
  알림자동화: 'admin_알림자동화',
  회사관리: 'admin_회사관리',
  직원권한: 'admin_직원권한',
  수술검사템플릿: 'admin_수술검사템플릿',
  팝업관리: 'admin_팝업관리',
  데이터백업: 'admin_데이터백업',
  데이터초기화: 'admin_데이터초기화',
  문서양식: 'admin_문서양식',
  급여이상치: 'admin_급여이상치',
  공문서대장: 'admin_공문서대장',
};

const LEGACY_PERMISSION_ALIASES: Record<string, string[]> = {
  menu_전자결재: ['approval'],
  menu_인사관리: ['hr'],
  menu_재고관리: ['inventory'],
  menu_관리자: ['admin'],
  extra_조직도: ['menu_조직도'],
  extra_입금실시간조회: ['menu_추가기능'],
  extra_수술상담: ['menu_추가기능'],
  extra_인계노트: ['handover_read'],
  approval_기안함: ['approval'],
  approval_결재함: ['approval'],
  approval_참조문서함: ['approval'],
  approval_작성하기: ['approval'],
  hr_구성원: ['hr'],
  hr_인사발령: ['hr_구성원', 'hr'],
  hr_포상징계: ['hr_구성원', 'hr'],
  hr_교육: ['hr_구성원', 'hr'],
  hr_오프보딩: ['hr_구성원', 'hr'],
  hr_근태: ['hr'],
  hr_교대근무: ['hr'],
  hr_연차휴가: ['hr_근태', 'hr'],
  hr_급여: ['hr'],
  hr_건강검진: ['hr_구성원', 'hr'],
  hr_경조사: ['hr_구성원', 'hr'],
  hr_면허자격증: ['hr_구성원', 'hr'],
  hr_의료기기점검: ['hr_구성원', 'hr'],
  hr_비품대여: ['hr'],
  hr_사고보고서: ['hr_구성원', 'hr'],
  hr_계약: ['hr'],
  hr_문서보관함: ['hr'],
  hr_증명서: ['hr'],
  hr_서류제출: ['hr_구성원', 'hr'],
  hr_캘린더: ['hr'],
  hr_근무형태이력: ['hr_근무형태', 'hr_근태', 'hr'],
  hr_연차소멸알림: ['hr_연차휴가', 'hr_근태', 'hr'],
  hr_지각조퇴분석: ['hr_근태', 'hr'],
  hr_조기퇴근감지: ['hr_근태', 'hr'],
  inventory_현황: ['inventory'],
  inventory_이력: ['inventory'],
  inventory_수요예측: ['inventory'],
  inventory_등록: ['inventory'],
  inventory_스캔: ['inventory'],
  inventory_발주: ['inventory'],
  inventory_재고실사: ['inventory'],
  inventory_이관: ['inventory'],
  inventory_납품확인서: ['inventory'],
  inventory_UDI: ['inventory'],
  inventory_자산: ['inventory'],
  inventory_거래처: ['inventory'],
  inventory_카테고리: ['inventory'],
  inventory_AS반품: ['inventory'],
  inventory_소모품통계: ['inventory'],
  admin_경영분석: ['admin'],
  admin_감사센터: ['admin'],
  admin_시스템마스터센터: ['admin'],
  admin_엑셀등록: ['admin'],
  admin_알림자동화: ['admin'],
  admin_회사관리: ['admin'],
  admin_직원권한: ['admin'],
  admin_수술검사템플릿: ['admin'],
  admin_팝업관리: ['admin'],
  admin_데이터백업: ['admin'],
  admin_데이터초기화: ['admin'],
  admin_문서양식: ['admin'],
  admin_급여이상치: ['admin'],
  admin_공문서대장: ['admin'],
  board_공지사항_read: ['board_공지사항_write'],
  board_자유게시판_read: ['board_자유게시판_write'],
  board_경조사_read: ['board_경조사_write'],
  board_MRI일정_read: ['board_MRI일정_write'],
  board_수술일정_read: ['board_수술일정_write'],
};

function getPermissions(user?: UserLike | null) {
  if (!user?.permissions || typeof user.permissions !== 'object') return {};
  return user.permissions;
}

function getExplicitPermissionState(
  user: UserLike | null | undefined,
  permissionKey: string
): boolean | null {
  const permissions = getPermissions(user);
  if (!Object.prototype.hasOwnProperty.call(permissions, permissionKey)) {
    return null;
  }
  return permissions[permissionKey] === true;
}

function expandPermissionKeys(permissionKey: string) {
  const visited = new Set<string>();
  const queue = [permissionKey];

  while (queue.length > 0) {
    const currentKey = queue.shift();
    if (!currentKey || visited.has(currentKey)) continue;

    visited.add(currentKey);
    (LEGACY_PERMISSION_ALIASES[currentKey] || []).forEach((alias) => {
      if (!visited.has(alias)) {
        queue.push(alias);
      }
    });
  }

  return Array.from(visited);
}

function resolvePermissionKey(input: string, map: Record<string, string>) {
  return map[input] || input;
}

function canAccessDetailedSection(
  user: UserLike | null | undefined,
  menuId: MainMenuId,
  sectionIdOrPermissionKey: string,
  map: Record<string, string>
) {
  if (isPrivilegedUser(user) || isAdminUser(user)) return true;
  if (!canAccessMainMenu(user, menuId)) return false;
  return hasPermission(user, resolvePermissionKey(sectionIdOrPermissionKey, map));
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
  const explicitPermission = getExplicitPermissionState(user, permissionKey);
  if (explicitPermission !== null) {
    return explicitPermission;
  }

  const permissions = getPermissions(user);
  return expandPermissionKeys(permissionKey)
    .filter((key) => key !== permissionKey)
    .some((key) => permissions[key] === true);
}

export function isMsoUser(user: UserLike | null | undefined): boolean {
  return user?.company === 'SY INC.' || hasPermission(user, 'mso');
}

export function isAdminUser(user: UserLike | null | undefined): boolean {
  return user?.role === 'admin' || hasPermission(user, 'admin');
}

export function isPrivilegedUser(user: UserLike | null | undefined): boolean {
  return isNamedSystemMasterAccount(user as Record<string, any> | null | undefined);
}

export function canAccessMainMenu(user: UserLike | null | undefined, menuId: string): boolean {
  // 퇴사자는 내정보/알림만 접근 가능 (급여명세서 확인 등)
  if (user?.status === '퇴사') {
    return menuId === '내정보' || menuId === '알림';
  }
  if (isPrivilegedUser(user) || isAdminUser(user)) {
    return true;
  }
  switch (menuId as MainMenuId) {
    case '내정보':
    case '알림':
    case '채팅':
      return true;
    case '조직도':
      return isPrivilegedUser(user) || canAccessExtraFeature(user, '조직도');
    case '추가기능':
      return isPrivilegedUser(user) || hasPermission(user, 'menu_추가기능');
    case '게시판':
      return isPrivilegedUser(user) || hasPermission(user, 'menu_게시판');
    case '전자결재':
      return isPrivilegedUser(user) || hasPermission(user, 'menu_전자결재');
    case '인사관리':
      return isPrivilegedUser(user) || hasPermission(user, 'menu_인사관리');
    case '재고관리':
      return isPrivilegedUser(user) || hasPermission(user, 'menu_재고관리');
    case '관리자':
      return isPrivilegedUser(user) || hasPermission(user, 'menu_관리자');
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
    case 'notifications':
      return true;
    case 'certificates':
      return isPrivilegedUser(user) || hasPermission(user, 'hr_증명서');
    case 'salary':
      return isPrivilegedUser(user) || hasPermission(user, 'hr_급여');
    case 'documents':
      return isPrivilegedUser(user) || hasPermission(user, 'hr_문서보관함');
    default:
      return false;
  }
}

export function canAccessBoard(
  user: UserLike | null | undefined,
  boardId: string,
  action: BoardPermissionAction = 'read'
): boolean {
  if (isPrivilegedUser(user)) return true;
  if (!canAccessMainMenu(user, '게시판')) return false;

  const permissionKeys = BOARD_PERMISSION_KEYS[boardId];
  if (!permissionKeys) return false;

  return hasPermission(user, action === 'write' ? permissionKeys.write : permissionKeys.read);
}

export function canAccessApprovalSection(
  user: UserLike | null | undefined,
  sectionIdOrPermissionKey: string
): boolean {
  return canAccessDetailedSection(user, '전자결재', sectionIdOrPermissionKey, APPROVAL_PERMISSION_KEYS);
}

export function canAccessHrSection(
  user: UserLike | null | undefined,
  sectionIdOrPermissionKey: string
): boolean {
  return canAccessDetailedSection(user, '인사관리', sectionIdOrPermissionKey, HR_PERMISSION_KEYS);
}

export function canAccessInventorySection(
  user: UserLike | null | undefined,
  sectionIdOrPermissionKey: string
): boolean {
  return canAccessDetailedSection(user, '재고관리', sectionIdOrPermissionKey, INVENTORY_PERMISSION_KEYS);
}

export function canAccessAdminSection(
  user: UserLike | null | undefined,
  sectionIdOrPermissionKey: string
): boolean {
  return canAccessDetailedSection(user, '관리자', sectionIdOrPermissionKey, ADMIN_PERMISSION_KEYS);
}

export function canAccessExtraFeature(
  user: UserLike | null | undefined,
  featureIdOrPermissionKey: string
): boolean {
  if (featureIdOrPermissionKey === '조직도') return true;
  if (isPrivilegedUser(user)) return true;
  if (!canAccessMainMenu(user, '추가기능')) return false;
  return hasPermission(user, resolvePermissionKey(featureIdOrPermissionKey, EXTRA_FEATURE_PERMISSION_KEYS));
}

export function hasUserPayloadChanged(currentUser: any, nextUser: any): boolean {
  return JSON.stringify(normalizeValue(currentUser ?? null)) !== JSON.stringify(normalizeValue(nextUser ?? null));
}
