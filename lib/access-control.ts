import { isNamedSystemMasterAccount } from '@/lib/system-master';
import { isActiveStaff } from '@/lib/active-staff';

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
  | '공유캘린더'
  | '전자결재'
  | '인사관리'
  | '재고관리'
  | '관리자'
  | '재무회계';

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
  Gemini비서: 'extra_Gemini비서',
  조직도: 'extra_조직도',
  부서별재고: 'extra_부서별재고',
  근무현황: 'extra_근무현황',
  인계노트: 'extra_인계노트',
  퇴원심사: 'extra_퇴원심사',
  마감보고: 'extra_마감보고',
  직원평가: 'extra_직원평가',
  입금실시간조회: 'extra_입금실시간조회',
  수술상담: 'extra_수술상담',
  OP체크: 'extra_OP체크',
  ESL관리: 'extra_ESL관리' };

const STRICT_EXTRA_FEATURE_PERMISSION_KEYS = new Set([
  'extra_입금실시간조회',
  'extra_수술상담',
  'extra_OP체크',
]);

/** 공유캘린더 세부 기능 id → permissions 키 */
const CALENDAR_PERMISSION_KEYS: Record<string, string> = {
  근무표조회: 'calendar_근무표조회',
  게시판일정: 'calendar_게시판일정',
  외부동기화: 'calendar_외부동기화',
  전체직원근무표: 'calendar_전체직원근무표',
};

export type CalendarFeatureId =
  | '근무표조회'
  | '게시판일정'
  | '외부동기화'
  | '전체직원근무표'
  | string;

const BOARD_PERMISSION_KEYS: Record<string, { read: string; write: string }> = {
  공지사항: { read: 'board_공지사항_read', write: 'board_공지사항_write' },
  자유게시판: { read: 'board_자유게시판_read', write: 'board_자유게시판_write' },
  경조사: { read: 'board_경조사_read', write: 'board_경조사_write' },
  MRI일정: { read: 'board_MRI일정_read', write: 'board_MRI일정_write' },
  수술일정: { read: 'board_수술일정_read', write: 'board_수술일정_write' },
  업무가이드: { read: 'board_업무가이드_read', write: 'board_업무가이드_write' },
};

const APPROVAL_PERMISSION_KEYS: Record<string, string> = {
  기안함: 'approval_기안함',
  결재함: 'approval_결재함',
  '참조 문서함': 'approval_참조문서함',
  작성하기: 'approval_작성하기' };

const HR_PERMISSION_KEYS: Record<string, string> = {
  '직원등록': 'hr_직원등록',
  구성원: 'hr_구성원',
  인사발령: 'hr_인사발령',
  '포상/징계': 'hr_포상징계',
  교육: 'hr_교육',
  오프보딩: 'hr_오프보딩',
  근태: 'hr_근태',
  교대근무: 'hr_교대근무',
  근무표생성: 'hr_근무표생성',
  '연차/휴가': 'hr_연차휴가',
  '연차·휴가': 'hr_연차휴가',
  급여: 'hr_급여',
  건강검진: 'hr_건강검진',
  경조사: 'hr_경조사',
  '면허/자격증': 'hr_면허자격증',
  의료기기점검: 'hr_의료기기점검',
  사고보고서: 'hr_사고보고서',
  계약: 'hr_계약',
  문서보관함: 'hr_문서보관함',
  증명서: 'hr_증명서',
  서류제출: 'hr_서류제출',
  // 인사 워크센터 영문 id (인사관리.tsx HR_MENUS)
  member: 'hr_구성원',
  attend: 'hr_근태',
  leave: 'hr_연차휴가',
  payroll: 'hr_급여',
  welfare: 'hr_경조사',
  docs: 'hr_계약',
  abnormal: 'hr_근태' };

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
  비품대여설정: 'admin_비품대여설정',
  거래처: 'inventory_거래처',
  카테고리: 'inventory_카테고리',
  AS반품: 'inventory_AS반품',
  소모품통계: 'inventory_소모품통계',
  월마감: 'inventory_월마감',
  내부서재고: 'inventory_내부서재고',
  명세서: 'inventory_거래처',
  유통기한: 'inventory_현황',
  status: 'inventory_현황',
  io: 'inventory_등록',
  item: 'inventory_자산',
  analyze: 'inventory_월마감',
  audit: 'inventory_재고실사',
  udi: 'inventory_UDI',
  inout: 'inventory_등록',
  order: 'inventory_발주',
  master: 'inventory_자산' };

const FINANCE_PERMISSION_KEYS: Record<string, string> = {
  복식부기: 'finance_복식부기',
  부가세: 'finance_부가세',
  결산: 'finance_결산',
  자금흐름: 'finance_자금흐름',
  감가상각: 'finance_감가상각',
  매입원장: 'finance_매입원장',
  경비청구: 'finance_경비청구',
  지출결의: 'finance_지출결의',
  급여연동: 'finance_급여연동',
  세무신고: 'finance_세무신고',
  'double-entry': 'finance_복식부기',
  vat: 'finance_부가세',
  closing: 'finance_결산',
  'cash-flow': 'finance_자금흐름',
  depreciation: 'finance_감가상각',
  'purchase-ledger': 'finance_매입원장',
  expense: 'finance_경비청구',
  disbursement: 'finance_지출결의',
  'payroll-link': 'finance_급여연동',
  'tax-reporting': 'finance_세무신고' };

const ADMIN_PERMISSION_KEYS: Record<string, string> = {
  경영분석: 'admin_경영분석',
  감사센터: 'admin_감사센터',
  접근감사로그: 'admin_감사센터',
  감사로그: 'admin_감사센터',
  시스템마스터센터: 'admin_시스템마스터센터',
  알림자동화: 'admin_알림자동화',
  운영설정: 'admin_운영설정',
  회사관리: 'admin_회사관리',
  직원권한: 'admin_직원권한',
  수술검사템플릿: 'admin_수술검사템플릿',
  팝업관리: 'admin_팝업관리',
  데이터백업: 'admin_데이터백업',
  데이터초기화: 'admin_데이터초기화',
  문서양식: 'admin_문서양식',
  급여이상치: 'admin_급여이상치',
  공문서대장: 'admin_공문서대장',
  비품대여설정: 'admin_비품대여설정',
  // 관리자 사이드바 영문 워크센터 id (admin-menu-config ADMIN_SIDEBAR_ITEMS)
  exec: 'admin_경영분석',
  company: 'admin_회사관리',
  roles: 'admin_직원권한',
  ops: 'admin_운영설정',
  forms: 'admin_문서양식',
  audit: 'admin_감사센터',
  // 사이드바 표시 라벨 호환
  '경영 대시보드': 'admin_경영분석',
  '회사 관리': 'admin_회사관리',
  '권한 관리': 'admin_직원권한',
  '운영 설정': 'admin_운영설정',
  '결재 양식': 'admin_문서양식',
  '감사·백업': 'admin_감사센터' };

/** 관리자 영문 워크센터 → 한글 섹션 id (권한 판정/콘텐츠 진입 공통) */
const ADMIN_WORKCENTER_TO_SECTION: Record<string, string> = {
  exec: '경영분석',
  company: '회사관리',
  roles: '직원권한',
  ops: '운영설정',
  forms: '문서양식',
  audit: '감사센터' };

const LEGACY_PERMISSION_ALIASES: Record<string, string[]> = {
  // board 권한을 하나라도 가지면 게시판 메뉴 노출 (결정: board read = 메뉴 노출)
  menu_게시판: [
    'board_공지사항_read', 'board_공지사항_write',
    'board_자유게시판_read', 'board_자유게시판_write',
    'board_경조사_read', 'board_경조사_write',
    'board_MRI일정_read', 'board_MRI일정_write',
    'board_수술일정_read', 'board_수술일정_write',
    'board_업무가이드_read', 'board_업무가이드_write',
  ],
  menu_전자결재: ['approval', ...Object.values(APPROVAL_PERMISSION_KEYS), 'admin_공문서대장'],
  menu_인사관리: ['hr', ...Object.values(HR_PERMISSION_KEYS)],
  menu_재고관리: ['inventory', ...Object.values(INVENTORY_PERMISSION_KEYS)],
  menu_관리자: ['admin', ...Object.values(ADMIN_PERMISSION_KEYS)],
  menu_재무회계: ['finance', ...Object.values(FINANCE_PERMISSION_KEYS)],
  finance_복식부기: ['finance'],
  finance_부가세: ['finance'],
  finance_결산: ['finance'],
  finance_자금흐름: ['finance'],
  finance_감가상각: ['finance'],
  finance_매입원장: ['finance'],
  finance_경비청구: ['finance'],
  finance_지출결의: ['finance'],
  finance_급여연동: ['finance'],
  finance_세무신고: ['finance'],
  extra_조직도: ['menu_조직도'],
  extra_인계노트: ['handover_read'],
  approval_기안함: ['approval', 'admin_공문서대장'],
  approval_결재함: ['approval'],
  approval_참조문서함: ['approval'],
  approval_작성하기: ['approval', 'admin_공문서대장'],
  hr_구성원: ['hr', 'hr_구성원_열람', 'hr_구성원_관리'],
  hr_인사발령: ['hr_구성원', 'hr'],
  hr_포상징계: ['hr_구성원', 'hr'],
  hr_교육: ['hr_구성원', 'hr'],
  hr_오프보딩: ['hr_구성원', 'hr'],
  hr_근태: ['hr', 'hr_근태_열람', 'hr_근태_수정'],
  hr_교대근무: ['hr'],
  hr_근무표생성: ['hr_교대근무', 'hr_근태', 'hr'],
  hr_연차휴가: ['hr_근태', 'hr'],
  hr_급여: ['hr'],
  hr_건강검진: ['hr_구성원', 'hr'],
  hr_경조사: ['hr_구성원', 'hr'],
  hr_면허자격증: ['hr_구성원', 'hr'],
  hr_의료기기점검: ['hr_구성원', 'hr'],
  hr_사고보고서: ['hr_구성원', 'hr'],
  hr_계약: ['hr'],
  hr_문서보관함: ['hr'],
  hr_증명서: ['hr'],
  hr_서류제출: ['hr_구성원', 'hr'],
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
  inventory_월마감: ['inventory'],
  inventory_내부서재고: ['inventory'],
  admin_경영분석: ['admin'],
  admin_감사센터: ['admin'],
  admin_시스템마스터센터: ['admin'],
  admin_알림자동화: ['admin'],
  admin_운영설정: ['admin'],
  admin_회사관리: ['admin'],
  admin_직원권한: ['admin'],
  admin_수술검사템플릿: ['admin'],
  admin_팝업관리: ['admin'],
  admin_데이터백업: ['admin'],
  admin_데이터초기화: ['admin'],
  admin_문서양식: ['admin'],
  admin_급여이상치: ['admin'],
  admin_공문서대장: ['admin'],
  admin_비품대여설정: ['admin'],
  board_공지사항_read: ['board_공지사항_write'],
  board_자유게시판_read: ['board_자유게시판_write'],
  board_경조사_read: ['board_경조사_write'],
  board_MRI일정_read: ['board_MRI일정_write'],
  board_수술일정_read: ['board_수술일정_write'],
  board_업무가이드_read: ['board_업무가이드_write', 'board_자유게시판_read'],
  board_업무가이드_write: ['board_자유게시판_write'] };

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
  if (isPrivilegedUser(user)) return true;
  if (!canAccessMainMenu(user, menuId)) return false;
  const resolvedPermissionKey = resolvePermissionKey(sectionIdOrPermissionKey, map);
  const explicitPermission = getExplicitPermissionState(user, resolvedPermissionKey);
  if (explicitPermission !== null) {
    return explicitPermission;
  }
  if (isAdminUser(user)) return true;
  return hasPermission(user, resolvedPermissionKey);
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
  if (!isActiveStaff(user ?? {})) {
    return menuId === '내정보' || menuId === '알림';
  }
  if (isPrivilegedUser(user)) {
    return true;
  }
  /*
  const explicitMenuPermissionKeyByMenu: Partial<Record<MainMenuId, string>> = {
    '추가기능': 'menu_추가기능',
    '게시판': 'menu_게시판',
    '전자결재': 'menu_전자결재',
    '인사관리': 'menu_인사관리',
    '재고관리': 'menu_재고관리',
    '관리자': 'menu_관리자' };
  const explicitMenuPermissionKey = explicitMenuPermissionKeyByMenu[menuId as MainMenuId];
  if (explicitMenuPermissionKey) {
    const explicitPermission = getExplicitPermissionState(user, explicitMenuPermissionKey);
    if (explicitPermission !== null) {
      return explicitPermission;
    }
    if (isAdminUser(user)) {
      return true;
    }
  }
  }
  */
  const resolveExplicitMenuAccess = (permissionKey: string) => {
    const explicitPermission = getExplicitPermissionState(user, permissionKey);
    if (explicitPermission !== null) {
      return explicitPermission;
    }
    return isAdminUser(user) || hasPermission(user, permissionKey);
  };
  const explicitMenuAccess =
    menuId === '추가기능'
      ? resolveExplicitMenuAccess('menu_추가기능')
      : menuId === '게시판'
        ? resolveExplicitMenuAccess('menu_게시판')
        : menuId === '공유캘린더'
          ? resolveExplicitMenuAccess('menu_공유캘린더')
          : menuId === '전자결재'
            ? resolveExplicitMenuAccess('menu_전자결재')
            : menuId === '인사관리'
              ? resolveExplicitMenuAccess('menu_인사관리')
              : menuId === '재고관리'
                ? resolveExplicitMenuAccess('menu_재고관리')
                : menuId === '관리자'
                  ? resolveExplicitMenuAccess('menu_관리자')
                  : menuId === '채팅'
                    ? resolveExplicitMenuAccess('menu_채팅')
                    : menuId === '내정보'
                      ? resolveExplicitMenuAccess('menu_내정보')
                      : menuId === '재무회계'
                        ? resolveExplicitMenuAccess('menu_재무회계')
                        : null;
  if (explicitMenuAccess !== null) {
    return explicitMenuAccess;
  }
  switch (menuId as MainMenuId) {
    case '내정보':
    case '채팅':
      return true; // fallback
    case '알림':
      return true;
    case '조직도':
      return isPrivilegedUser(user) || canAccessExtraFeature(user, '조직도');
    case '추가기능':
      return isPrivilegedUser(user) || hasPermission(user, 'menu_추가기능');
    case '게시판':
      return isPrivilegedUser(user) || hasPermission(user, 'menu_게시판');
    case '공유캘린더':
      return isPrivilegedUser(user) || hasPermission(user, 'menu_공유캘린더');
    case '전자결재':
      return isPrivilegedUser(user) || hasPermission(user, 'menu_전자결재');
    case '인사관리':
      return isPrivilegedUser(user) || hasPermission(user, 'menu_인사관리');
    case '재고관리':
      return isPrivilegedUser(user) || hasPermission(user, 'menu_재고관리');
    case '관리자':
      return isPrivilegedUser(user) || hasPermission(user, 'menu_관리자');
    case '재무회계':
      return isPrivilegedUser(user) || hasPermission(user, 'menu_재무회계');
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
    case 'certificates': {
      // 본인 결재 승인·발급 증명서 조회.
      // hr_증명서 는 인사관리에서 타인 증명서를 발급하는 HR 권한이라
      // 일반 직원 본인 조회에 쓰면 안 된다 (급여의 mypage_급여조회 패턴과 동일).
      const own = getExplicitPermissionState(user, 'mypage_증명서조회');
      if (own !== null) return own;
      // 명시적으로 끄지 않은 직원은 본인 증명서 조회 허용
      // (데이터는 staff_id / sender_id 본인 건만 조회됨)
      return true;
    }
    case 'salary': {
      const own = getExplicitPermissionState(user, 'mypage_급여조회');
      if (own !== null) return own;
      return isPrivilegedUser(user) || hasPermission(user, 'hr_급여');
    }
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
  // 업무가이드 읽기는 게시판 메뉴 권한과 무관하게 공개 (게이트 순서 교정)
  if (boardId === '업무가이드' && action === 'read') return true;
  if (!canAccessMainMenu(user, '게시판')) return false;

  const permissionKeys = BOARD_PERMISSION_KEYS[boardId];
  const targetKey = permissionKeys ? (action === 'write' ? permissionKeys.write : permissionKeys.read) : `board_${boardId}_${action}`;

  const explicit = getExplicitPermissionState(user, targetKey);
  if (explicit !== null) return explicit;

  if (action === 'read') {
    // 게시판 메인 메뉴 접근 권한이 있고 명시적 false가 아니라면 읽기 기본 허용
    return true;
  }

  return isAdminUser(user) || hasPermission(user, targetKey);
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
  if (sectionIdOrPermissionKey === '인사변동') {
    return canAccessHrSection(user, 'hr_인사발령') || canAccessHrSection(user, 'hr_포상징계');
  }
  if (sectionIdOrPermissionKey === '입퇴사·교육센터' || sectionIdOrPermissionKey === '인력생애주기센터') {
    return canAccessHrSection(user, 'hr_교육') || canAccessHrSection(user, 'hr_오프보딩');
  }
  if (sectionIdOrPermissionKey === '자격·안전센터' || sectionIdOrPermissionKey === '규정준수센터') {
    return (
      canAccessHrSection(user, 'hr_건강검진') ||
      canAccessHrSection(user, 'hr_면허자격증') ||
      canAccessHrSection(user, 'hr_의료기기점검') ||
      canAccessHrSection(user, 'hr_사고보고서')
    );
  }
  if (sectionIdOrPermissionKey === '문서센터') {
    return (
      canAccessHrSection(user, 'hr_문서보관함') ||
      canAccessHrSection(user, 'hr_증명서') ||
      canAccessHrSection(user, 'hr_서류제출')
    );
  }
  // 워크센터 합집합 — 세부 키 중 하나라도 있으면 워크센터 진입 허용
  const HR_WORKCENTER_UNIONS: Record<string, string[]> = {
    member: ['hr_구성원', 'hr_구성원_열람', 'hr_구성원_관리', 'hr_직원등록', 'hr_인사발령', 'hr_포상징계', 'hr_교육', 'hr_오프보딩'],
    attend: ['hr_근태', 'hr_근태_열람', 'hr_근태_수정', 'hr_근무표생성', 'hr_교대근무'],
    leave: ['hr_연차휴가', 'hr_근태', 'hr_근태_열람'],
    payroll: ['hr_급여', 'hr_급여_승인'],
    welfare: ['hr_경조사', 'hr_건강검진', 'hr_면허자격증', 'hr_의료기기점검', 'hr_사고보고서'],
    docs: ['hr_계약', 'hr_문서보관함', 'hr_증명서', 'hr_서류제출'],
    abnormal: ['hr_근태', 'hr_근태_열람', 'hr_근태_수정'] };
  const hrGroup = HR_WORKCENTER_UNIONS[sectionIdOrPermissionKey];
  if (hrGroup) {
    return hrGroup.some((key) => canAccessDetailedSection(user, '인사관리', key, HR_PERMISSION_KEYS));
  }
  return canAccessDetailedSection(user, '인사관리', sectionIdOrPermissionKey, HR_PERMISSION_KEYS);
}

export function canAccessInventorySection(
  user: UserLike | null | undefined,
  sectionIdOrPermissionKey: string
): boolean {
  // 워크센터 id → 소속 세분키 OR 합집합 (어느 하나라도 있으면 워크센터 진입 허용)
  const WORKCENTER_UNIONS: Record<string, string[]> = {
    status:  ['inventory_현황', 'inventory_이력', 'inventory_내부서재고'],
    io:      ['inventory_등록', 'inventory_발주', 'inventory_거래처', 'inventory_납품확인서', 'inventory_이관'],
    item:    ['inventory_자산', 'inventory_스캔', 'inventory_카테고리', 'inventory_UDI'],
    analyze: ['inventory_월마감', 'inventory_수요예측', 'inventory_재고실사', 'inventory_소모품통계', 'inventory_AS반품'],
    audit:   ['inventory_재고실사', 'inventory_이관', 'inventory_월마감'],
    udi:     ['inventory_UDI', 'inventory_자산', 'inventory_스캔'],
    inout:   ['inventory_등록', 'inventory_이력'],
    order:   ['inventory_발주', 'inventory_납품확인서', 'inventory_거래처'],
    master:  ['inventory_자산', 'inventory_카테고리', 'inventory_스캔'],
  };
  const group = WORKCENTER_UNIONS[sectionIdOrPermissionKey];
  if (group) {
    return group.some((key) => canAccessDetailedSection(user, '재고관리', key, INVENTORY_PERMISSION_KEYS));
  }
  return canAccessDetailedSection(user, '재고관리', sectionIdOrPermissionKey, INVENTORY_PERMISSION_KEYS);
}

export function canAccessFinanceSection(
  user: UserLike | null | undefined,
  sectionIdOrPermissionKey: string
): boolean {
  return canAccessDetailedSection(user, '재무회계', sectionIdOrPermissionKey, FINANCE_PERMISSION_KEYS);
}

export function canAccessAdminSection(
  user: UserLike | null | undefined,
  sectionIdOrPermissionKey: string
): boolean {
  // 사이드바 영문 id → 한글 섹션으로 정규화 (page.tsx 필터 / 콘텐츠 진입 공통)
  const sectionId =
    ADMIN_WORKCENTER_TO_SECTION[sectionIdOrPermissionKey] || sectionIdOrPermissionKey;

  if (sectionId === '운영설정' || sectionId === 'ops') {
    return (
      canAccessDetailedSection(user, '관리자', '운영설정', ADMIN_PERMISSION_KEYS) ||
      canAccessDetailedSection(user, '관리자', 'ops', ADMIN_PERMISSION_KEYS) ||
      canAccessDetailedSection(user, '관리자', '알림자동화', ADMIN_PERMISSION_KEYS) ||
      canAccessDetailedSection(user, '관리자', '수술검사템플릿', ADMIN_PERMISSION_KEYS) ||
      canAccessDetailedSection(user, '관리자', '팝업관리', ADMIN_PERMISSION_KEYS)
    );
  }

  if (sectionId === '감사센터' || sectionId === 'audit') {
    return (
      canAccessDetailedSection(user, '관리자', '감사센터', ADMIN_PERMISSION_KEYS) ||
      canAccessDetailedSection(user, '관리자', 'audit', ADMIN_PERMISSION_KEYS) ||
      canAccessDetailedSection(user, '관리자', '접근감사로그', ADMIN_PERMISSION_KEYS) ||
      canAccessDetailedSection(user, '관리자', '감사로그', ADMIN_PERMISSION_KEYS) ||
      canAccessDetailedSection(user, '관리자', '급여이상치', ADMIN_PERMISSION_KEYS) ||
      canAccessDetailedSection(user, '관리자', '데이터백업', ADMIN_PERMISSION_KEYS) ||
      canAccessDetailedSection(user, '관리자', '데이터초기화', ADMIN_PERMISSION_KEYS)
    );
  }

  // 감사 센터 내부 탭 id → 상위 권한으로 흡수
  if (sectionId === '접근감사로그' || sectionId === '감사로그') {
    return canAccessAdminSection(user, '감사센터');
  }

  return canAccessDetailedSection(user, '관리자', sectionId, ADMIN_PERMISSION_KEYS);
}

export function canAccessExtraFeature(
  user: UserLike | null | undefined,
  featureIdOrPermissionKey: string
): boolean {
  if (featureIdOrPermissionKey === '조직도') return true;
  if (isPrivilegedUser(user)) return true;
  if (!canAccessMainMenu(user, '추가기능')) return false;
  const permissionKey = resolvePermissionKey(featureIdOrPermissionKey, EXTRA_FEATURE_PERMISSION_KEYS);

  if (permissionKey === 'extra_마감보고' && isAdminUser(user)) {
    return true;
  }

  // Gemini: 추가기능 접근 가능 시 기본 허용, 명시 false 만 차단
  if (permissionKey === 'extra_Gemini비서') {
    const explicitGemini = getExplicitPermissionState(user, 'extra_Gemini비서');
    if (explicitGemini !== null) return explicitGemini;
    return true;
  }

  if (permissionKey === 'extra_ESL관리') {
    const explicitESL = getExplicitPermissionState(user, 'extra_ESL관리');
    if (explicitESL !== null) return explicitESL;
    return isAdminUser(user);
  }

  if (STRICT_EXTRA_FEATURE_PERMISSION_KEYS.has(permissionKey)) {
    const explicitPermission = getExplicitPermissionState(user, permissionKey);
    if (explicitPermission !== null) {
      return explicitPermission;
    }
    return isAdminUser(user);
  }

  // 일반 추가기능: 명시 true/false 우선, 관리자 또는 부여된 세부 키
  const explicit = getExplicitPermissionState(user, permissionKey);
  if (explicit !== null) return explicit;
  return isAdminUser(user) || hasPermission(user, permissionKey);
}

/**
 * 공유캘린더 세부 권한.
 * - 메인 메뉴 menu_공유캘린더 가 꺼져 있으면 전부 false
 * - 세부 키 미설정(undefined) → 허용 (기존 사용자 차단 방지)
 * - 명시 false 만 차단
 */
export function canAccessCalendarFeature(
  user: UserLike | null | undefined,
  featureIdOrPermissionKey: CalendarFeatureId
): boolean {
  if (isPrivilegedUser(user)) return true;
  if (!canAccessMainMenu(user, '공유캘린더')) return false;

  const permissionKey = resolvePermissionKey(
    String(featureIdOrPermissionKey),
    CALENDAR_PERMISSION_KEYS,
  );
  const explicit = getExplicitPermissionState(user, permissionKey);
  if (explicit !== null) return explicit;
  // 미설정 = 허용 (menu_공유캘린더 통과 전제)
  return true;
}

export function hasUserPayloadChanged(currentUser: any, nextUser: any): boolean {
  return JSON.stringify(normalizeValue(currentUser ?? null)) !== JSON.stringify(normalizeValue(nextUser ?? null));
}
