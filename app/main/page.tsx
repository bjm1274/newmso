'use client';
import { logger } from '@/lib/logger';
import { useGlobalShortcuts } from './기능부품/마이페이지/useGlobalShortcuts';

import { toast } from '@/lib/toast';
import { Suspense, startTransition, useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { setSelectedCompanyId as persistSelectedCompanyId, getSelectedCompanyId } from '@/lib/useCompany';
import { normalizeProfileUser } from '@/lib/profile-photo';
import { getStaffsCached } from '@/lib/use-staff-cache';
import { getStoredSessionLoginAt, isForceLogoutAfterLogin, normalizeSessionLoginAt } from '@/lib/session-force-logout';
import { performClientLogout, unsubscribePushOnLogout } from '@/lib/client-logout';
import { useIsMobile } from '@/app/components/useIsMobile';
import dynamic from 'next/dynamic';

const MobileShell = dynamic(() => import('./모바일/셸/MobileShell'), { ssr: false });
import {
  canAccessAdminSection,
  canAccessApprovalSection,
  canAccessBoard,
  canAccessInventorySection,
  canAccessMainMenu,
  hasUserPayloadChanged,
  normalizeMainMenuForUser,
} from '@/lib/access-control';
import { hasSystemMasterPermission } from '@/lib/system-master';
import { getDisplayedAdminSubView } from './admin-menu-config';
import {
  getNavigationEntryType,
  getSavedSubViewForMenu,
  persistTopLevelNavigationState,
  readStoredMainNavigationState,
  resetPersistedMenuState,
} from './navigation-state';

import Sidebar, { MenuIcon, SUB_MENUS } from './기능부품/조직도서브/조직도측면창';
import { STORAGE_KEYS } from '@/lib/storage-keys';
import MainContent from './기능부품/조직도서브/조직도본문';
import NotificationSystem from './기능부품/알림시스템';
import ChatAlertBanner from './기능부품/채팅알림배너';
import PermissionPromptModal from './기능부품/권한요청모달';
import OfflineStatusBanner from '@/app/components/OfflineStatusBanner';
import { ChevronDown } from 'lucide-react';
import { NavigationProvider } from './contexts/NavigationContext';
import { CompanyProvider } from './contexts/CompanyContext';
import { AppDataProvider } from './contexts/AppDataContext';
import type { ErpUser, ERPData, StaffMember } from '@/types';

function canAccessAdminSubMenu(user: ErpUser | null, subMenuId: string) {
  if (!canAccessMainMenu(user, '관리자')) {
    return false;
  }

  return canAccessAdminSection(user, subMenuId);
}

function isLegacyOfficialDocumentAdminTarget(menuId?: string | null, subViewId?: string | null) {
  return menuId === '관리자' && subViewId === '공문서대장';
}

function getDisplayedSubView(mainMenuId: string, subViewId: string) {
  if (mainMenuId !== '관리자') {
    return subViewId;
  }

  return getDisplayedAdminSubView(subViewId);
}

function buildSubMenuTestId(mainMenuId: string, subMenuId: string) {
  const slug = `${mainMenuId}-${subMenuId}`
    .split('')
    .map((char) => {
      const code = char.charCodeAt(0);
      const isAsciiLetter = (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
      return isAsciiLetter ? char.toLowerCase() : `u${code.toString(16)}`;
    })
    .join('-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return `submenu-${slug}`;
}

const SIDEBAR_NAV_LABELS = [
  { testId: 'sidebar-menu-home', label: '내정보' },
  { testId: 'sidebar-menu-extra', label: '추가기능' },
  { testId: 'sidebar-menu-chat', label: '채팅' },
  { testId: 'sidebar-menu-board', label: '게시판' },
  { testId: 'sidebar-menu-approval', label: '전자결재' },
  { testId: 'sidebar-menu-hr', label: '인사관리' },
  { testId: 'sidebar-menu-inventory', label: '재고관리' },
  { testId: 'sidebar-menu-admin', label: '관리자' },
];

function MainPageFallback() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--background)] p-6 text-center">
      <div className="relative w-20 h-20 mb-8">
        <div className="absolute inset-0 border-4 border-[var(--toss-blue-light)] rounded-full" />
        <div className="absolute inset-0 border-4 border-[var(--accent)] rounded-full border-t-transparent animate-spin" />
      </div>
      <h2 className="text-xl font-bold text-[var(--foreground)] mb-2">SY INC. 통합 시스템</h2>
      <p className="text-xs font-medium text-[var(--toss-gray-3)] animate-pulse">접속 중...</p>
    </div>
  );
}

function MainPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isMobile = useIsMobile();
  const [user, setUser] = useState<ErpUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasLoadedInitialData, setHasLoadedInitialData] = useState(false);
  const [companies, setCompanies] = useState<{ id: string; name: string; type: string }[]>([]);
  const [selectedCompanyId, setSelectedCompanyIdState] = useState<string | null>(null);
  const [menuResetVersion, setMenuResetVersion] = useState(0);

  // 초기 상태를 로컬 스토리지에서 시도 (기본: 내 정보)
  const [mainMenu, setMainMenu] = useState('내정보');
  const [subView, setSubView] = useState('전체');
  // 모바일 2차 서브메뉴 칩바 접기/펼치기 (데스크톱 사이드바는 항상 표시)
  const [subNavCollapsed, setSubNavCollapsed] = useState(false);
  const [selectedCo, setSelectedCo] = useState('전체');
  const [initialMyPageTab, setInitialMyPageTab] = useState<string | null>(null);
  const [initialBoardView, setInitialBoardView] = useState<string | null>(null);
  const [chatListResetToken, setChatListResetToken] = useState(0);
  const [initialOpenChatRoomId, setInitialOpenChatRoomId] = useState<string | null>(null);
  const [initialOpenMessageId, setInitialOpenMessageId] = useState<string | null>(null);
  const [initialOpenChatRequestToken, setInitialOpenChatRequestToken] = useState(0);
  const [shareTarget, setShareTarget] = useState<{ id: string; fileCount: number; text: string | null; url: string | null; title: string | null } | null>(null);
  const [initialOpenPostId, setInitialOpenPostId] = useState<string | null>(null);
  const [initialApprovalIntent, setInitialApprovalIntent] = useState<any>(null);
  const [initialInventoryWorkflowApprovalId, setInitialInventoryWorkflowApprovalId] = useState<string | null>(null);

  const [data, setData] = useState<ERPData>({
    staffs: [],
    depts: [],
    posts: [],
    tasks: [],
    surgeries: [],
    mris: []
  });
  const [loginAt, setLoginAt] = useState<string>(() => getStoredSessionLoginAt());
  const isMsoUser = user?.company === 'SY INC.' || user?.permissions?.mso === true;
  const companyById = useMemo(
    () => new Map(companies.map((company) => [company.id, company])),
    [companies]
  );
  const companyIdByName = useMemo(
    () => new Map(companies.map((company) => [company.name, company.id])),
    [companies]
  );
  const navigationIntent = useMemo(
    () => ({
      openChatRoom: searchParams.get('open_chat_room')?.trim() || null,
      openMessage: searchParams.get('open_msg')?.trim() || null,
      openMenu: searchParams.get('open_menu')?.trim() || null,
      openSubView: searchParams.get('open_subview')?.trim() || null,
      openMyPageTab: searchParams.get('open_mypage_tab')?.trim() || null,
      openPost: searchParams.get('open_post')?.trim() || null,
      openBoard: searchParams.get('open_board')?.trim() || null,
      openApprovalId: searchParams.get('open_approval_id')?.trim() || null,
      openInventoryView: searchParams.get('open_inventory_view')?.trim() || null,
      openInventoryApproval: searchParams.get('open_inventory_approval')?.trim() || null,
      shareId: searchParams.get('share_id')?.trim() || null,
      shareFileCount: Number(searchParams.get('share_file_count') || '0'),
      shareText: searchParams.get('share_text')?.trim() || null,
      shareUrl: searchParams.get('share_url')?.trim() || null,
      shareTitle: searchParams.get('share_title')?.trim() || null,
    }),
    [searchParams]
  );

  const handleSelectedCompanyIdChange = useCallback(
    (id: string | null) => {
      persistSelectedCompanyId(id);
      startTransition(() => {
        setSelectedCompanyIdState(id);
        if (!isMsoUser) return;
        if (!id) {
          setSelectedCo('전체');
          return;
        }
        const matchedCompany = companyById.get(id);
        if (matchedCompany?.name) {
          setSelectedCo(matchedCompany.name);
        }
      });
    },
    [companyById, isMsoUser]
  );

  const handleSelectedCoChange = useCallback(
    (nextCo: string | null) => {
      if (!isMsoUser) return;
      if (!nextCo || nextCo === '전체') {
        persistSelectedCompanyId(null);
        startTransition(() => {
          setSelectedCo('전체');
          setSelectedCompanyIdState(null);
        });
        return;
      }
      const nextCompanyId = companyIdByName.get(nextCo) ?? null;
      persistSelectedCompanyId(nextCompanyId);
      startTransition(() => {
        setSelectedCo(nextCo);
        setSelectedCompanyIdState(nextCompanyId);
      });
    },
    [companyIdByName, isMsoUser]
  );

  const handleOpenApproval = useCallback((intent?: Record<string, unknown>) => {
    setMainMenu('전자결재');
    if (!intent) return;

    const nextView = typeof intent?.viewMode === 'string' && intent.viewMode.trim()
      ? intent.viewMode
      : '작성하기';

    setSubView(nextView);
    setInitialApprovalIntent(intent);
  }, []);

  const clearNavigationQuery = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.history.replaceState(window.history.state, '', '/main');
      return;
    }
    router.replace('/main', { scroll: false });
  }, [router]);

  const resolveLegacyNavigation = useCallback(
    (menuId?: string | null, subViewId?: string | null, candidateUser?: ErpUser | null) => {
      const canOpenAdmin =
        candidateUser?.company === 'SY INC.' ||
        candidateUser?.permissions?.mso === true ||
        candidateUser?.role === 'admin' ||
        candidateUser?.permissions?.menu_관리자 === true;
      const inventoryViewAliases: Record<string, string> = {
        재고현황: '현황',
        입출고관리: '등록',
        '구매/발주': '발주',
        '품목/자산': '자산',
        '분석/마감': '월마감',
        // 레거시 한글 id → 워크센터 id 매핑
        현황: 'status',
        이력: 'io',
        수요예측: 'analyze',
        등록: 'item',
        스캔: 'item',
        발주: 'io',
        재고실사: 'analyze',
        이관: 'io',
        납품확인서: 'io',
        UDI: 'item',
        자산: 'item',
        거래처: 'io',
        카테고리: 'item',
        AS반품: 'analyze',
        소모품통계: 'analyze',
        월마감: 'analyze',
      };

      if (menuId === '재고관리' && subViewId && inventoryViewAliases[subViewId]) {
        return { menuId: '재고관리', subViewId: inventoryViewAliases[subViewId] };
      }

      if (menuId === '인사관리' && subViewId === '조직도') {
        return canOpenAdmin
          ? { menuId: '관리자', subViewId: '회사관리' }
          : { menuId: '인사관리', subViewId: '구성원' };
      }

      if (
        menuId === '인사관리' &&
        (
          subViewId === '교육' ||
          subViewId === '오프보딩' ||
          subViewId === '입퇴사·교육센터' ||
          subViewId === '인력생애주기센터'
        )
      ) {
        return {
          menuId: '인사관리',
          subViewId:
            subViewId === '교육' || subViewId === '오프보딩' ? subViewId : '입퇴사·교육센터',
        };
      }

      if (
        menuId === '인사관리' &&
        (subViewId === '건강검진' ||
          subViewId === '면허/자격증' ||
          subViewId === '의료기기점검' ||
          subViewId === '사고보고서' ||
          subViewId === '자격·안전센터' ||
          subViewId === '규정준수센터')
      ) {
        return {
          menuId: '인사관리',
          subViewId:
            subViewId === '건강검진' ||
            subViewId === '면허/자격증' ||
            subViewId === '의료기기점검' ||
            subViewId === '사고보고서'
              ? subViewId
              : '자격·안전센터',
        };
      }

      if (
        menuId === '인사관리' &&
        (subViewId === '문서보관함' || subViewId === '증명서' || subViewId === '서류제출')
      ) {
        return {
          menuId: '인사관리',
          subViewId:
            subViewId === '문서보관함' || subViewId === '증명서' || subViewId === '서류제출'
              ? subViewId
              : '문서센터',
        };
      }

      if (menuId === '관리자' && subViewId === '비품대여설정') {
        return { menuId: '재고관리', subViewId: '비품대여설정' };
      }

      if (isLegacyOfficialDocumentAdminTarget(menuId, subViewId)) {
        return { menuId: '전자결재', subViewId: '작성하기' };
      }

      if (menuId === '인사관리' && subViewId === '비품대여') {
        return { menuId: '재고관리', subViewId: '비품대여설정' };
      }

      return { menuId, subViewId };
    },
    [],
  );

  const clearClientSession = useCallback(async () => {
    // 푸시 구독 해제 (실패해도 세션 정리는 계속)
    await unsubscribePushOnLogout();

    try {
      await fetch('/api/auth/session', { method: 'DELETE' });
    } catch {
      // ignore
    }
    try {
      localStorage.removeItem(STORAGE_KEYS.USER);
      localStorage.removeItem(STORAGE_KEYS.LOGIN_AT);
      persistSelectedCompanyId(null);
    } catch {
      // ignore
    }
  }, []);

  const persistClientUser = useCallback((nextUser: ErpUser | null) => {
    if (!nextUser) return;

    const safeUser = { ...nextUser };
    delete safeUser.password;
    delete safeUser.passwd;

    const normalizedUser = normalizeProfileUser(safeUser);
    setUser(normalizedUser);

    try {
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(normalizedUser));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleProfileUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ user?: ErpUser }>;
      const nextUser = normalizeProfileUser(customEvent.detail?.user);
      if (!nextUser?.id) return;

      persistClientUser(nextUser);
      setData((prev) => ({
        ...prev,
        staffs: prev.staffs.map((staff: StaffMember) =>
          staff?.id === nextUser.id
            ? normalizeProfileUser({
                ...staff,
                ...nextUser,
                permissions: nextUser.permissions || staff.permissions,
              })
            : staff
        ),
      }));
    };

    window.addEventListener('erp-profile-updated', handleProfileUpdated as EventListener);
    return () => {
      window.removeEventListener('erp-profile-updated', handleProfileUpdated as EventListener);
    };
  }, [persistClientUser]);

  // 1. 초기 로드 시 사용자 정보 및 이전 상태 복구
  useEffect(() => {
    let ignore = false;

    const bootstrap = async () => {
      // outer catch에서도 참조 가능하도록 hoist.
      let sessionUser: ErpUser | null = null;
      let payload: { user?: unknown; issuedAt?: string; authenticated?: boolean } | null = null;
      let mustLogout = false;

      try {
        const navigationQuery =
          typeof window !== 'undefined'
            ? (() => {
                const params = new URLSearchParams(window.location.search);
                return {
                  openChatRoom: params.get('open_chat_room')?.trim() || null,
                  openMessage: params.get('open_msg')?.trim() || null,
                  openMenu: params.get('open_menu')?.trim() || null,
                  openSubView: params.get('open_subview')?.trim() || null,
                  openPost: params.get('open_post')?.trim() || null,
                };
              })()
            : null;

        // /api/auth/session — 401·{authenticated:false}만 로그아웃 처리하고,
        // 5xx/네트워크 오류는 캐시된 세션을 유지한다(모바일 네트워크 블립으로
        // 인한 부당 로그아웃 방지).
        try {
          const response = await fetch('/api/auth/session', {
            method: 'GET',
            cache: 'no-store',
          });
          if (response.status === 401) {
            mustLogout = true;
          } else if (response.ok) {
            payload = await response.json().catch(() => null);
            if (payload?.authenticated === false) {
              mustLogout = true;
            } else {
              sessionUser = (normalizeProfileUser(payload?.user) ?? null) as ErpUser | null;
            }
          }
          // 5xx 등 일시 오류 → fall through → 캐시 fallback
        } catch {
          // 네트워크 오류 → 캐시 fallback
        }

        if (mustLogout) {
          await clearClientSession();
          router.replace('/');
          return;
        }

        if (!sessionUser) {
          // 일시 오류 시 localStorage 캐시 fallback
          try {
            const cachedRaw = localStorage.getItem(STORAGE_KEYS.USER);
            if (cachedRaw) sessionUser = (normalizeProfileUser(JSON.parse(cachedRaw)) ?? null) as ErpUser | null;
          } catch {
            // ignore
          }
        }

        if (!sessionUser) {
          // 캐시도 없으면 로그인 필요
          await clearClientSession();
          router.replace('/');
          return;
        }

        const sessionLoginAt = normalizeSessionLoginAt(payload?.issuedAt, getStoredSessionLoginAt());
        if (!ignore) setLoginAt(sessionLoginAt);

        if (isForceLogoutAfterLogin(sessionUser.force_logout_at, sessionLoginAt)) {
          toast('관리자에 의해 강제 로그아웃 되었습니다. 다시 로그인해 주세요.');
          await clearClientSession();
          router.replace('/');
          return;
        }

        if (!ignore) {
          persistClientUser(sessionUser);
        }

        try {
          localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(sessionUser));
          localStorage.setItem(STORAGE_KEYS.LOGIN_AT, sessionLoginAt);
        } catch {
          // ignore
        }

        const { savedCo, savedMenu, savedSubView } = readStoredMainNavigationState();
        const navigationType = getNavigationEntryType();
        const shouldRestoreSavedMenuState =
          navigationType === 'reload' || navigationType === 'back_forward';
        const shouldHonorNavigationIntent = !(
          navigationQuery?.openChatRoom ||
          navigationQuery?.openMessage ||
          navigationQuery?.openMenu ||
          navigationQuery?.openPost
        );
        const shouldHonorSubViewIntent = !(
          navigationQuery?.openChatRoom ||
          navigationQuery?.openMessage ||
          navigationQuery?.openPost ||
          navigationQuery?.openSubView
        );

        const restoredNavigation = resolveLegacyNavigation(savedMenu, savedSubView, sessionUser);
        const preferredInitialMenu = shouldRestoreSavedMenuState
          ? normalizeMainMenuForUser(sessionUser, restoredNavigation.menuId || '내정보')
          : normalizeMainMenuForUser(sessionUser, '내정보');
        const preferredInitialSubView = shouldRestoreSavedMenuState
          ? restoredNavigation.subViewId || '전체'
          : '전체';

        if (!ignore) {
          if (shouldHonorNavigationIntent) {
            setMainMenu(preferredInitialMenu);
          }
          if (shouldHonorSubViewIntent) {
            setSubView(preferredInitialSubView);
          }
          if (isLegacyOfficialDocumentAdminTarget(savedMenu, savedSubView)) {
            setInitialApprovalIntent({
              viewMode: '작성하기',
              formType: '공문발송',
            });
          }
        }

        const canSelectCompany = sessionUser.company === 'SY INC.' || sessionUser.permissions?.mso;
        if (!canSelectCompany) {
          persistSelectedCompanyId(null);
          if (!ignore) {
            setSelectedCo(sessionUser.company);
            setSelectedCompanyIdState(null);
          }
        } else {
          if (savedCo && !ignore) {
            setSelectedCo(savedCo);
          }
          supabase
            .from('companies')
            .select('id, name, type')
            .eq('is_active', true)
            .returns<any[]>()
            .then(({ data: list, error }) => {
              if (error) {
                logger.error('companies 조회 오류:', error);
                return;
              }
              const sorted = (list || []).sort((a: { id: string; name: string; type: string }, b: { id: string; name: string; type: string }) => {
                const order = ['박철홍정형외과', '수연의원', 'SY INC.'];
                const ia = order.indexOf(a.name);
                const ib = order.indexOf(b.name);
                if (ia >= 0 && ib >= 0) return ia - ib;
                if (ia >= 0) return -1;
                if (ib >= 0) return 1;
                return (a.name || '').localeCompare(b.name || '');
              });
              if (!ignore) setCompanies(sorted);
            });
          const savedId = getSelectedCompanyId();
          if (!ignore) setSelectedCompanyIdState(savedId);
        }
      } catch (err) {
        // 예상 못 한 오류 — 로그아웃하지 않음(부당 로그아웃 방지).
        // sessionUser가 결정됐는데 persistClientUser 전에 throw된 경우 보강.
        console.error('[main bootstrap] unexpected error:', err);
        if (sessionUser && !ignore) {
          try { persistClientUser(sessionUser); } catch { /* ignore */ }
        }
      }
    };

    void bootstrap();
    return () => {
      ignore = true;
    };
  }, [clearClientSession, persistClientUser, resolveLegacyNavigation, router]); // 마운트 시 1회만 실행

  useEffect(() => {
    if (!user) return;
    const normalizedNavigation = resolveLegacyNavigation(mainMenu, subView, user);
    const normalizedMenu = normalizeMainMenuForUser(user, normalizedNavigation.menuId || mainMenu);

    if (normalizedMenu !== mainMenu) {
      setMainMenu(normalizedMenu);
      return;
    }

    if (
      normalizedNavigation.subViewId &&
      normalizedNavigation.menuId === normalizedMenu &&
      normalizedNavigation.subViewId !== subView
    ) {
      setSubView(normalizedNavigation.subViewId);
    }
  }, [mainMenu, resolveLegacyNavigation, subView, user]);

  // 강제 로그아웃 폴링은 제거됨. 효과는 다음 경로로 유지:
  //  - 초기 페이지 진입 시 1회 (isForceLogoutAfterLogin 체크)
  //  - 30분 세션 갱신 시 (/api/auth/session 응답에서 체크)
  // 클라이언트당 초당 폴링이 발생하던 무한 루프를 정리하고, 로그인 유지가 기본 동작이 되도록 변경.

  // 1-1. 강제 로그아웃(세션 만료) 체크 — 마운트 시 1회만 실행
  useEffect(() => {
    const checkForcedLogout = async () => {
      try {
        const { data: config } = await supabase
          .from('system_configs')
          .select('value')
          .eq('key', 'min_auth_time')
          .single()
          .returns<any>();

        if (config?.value) {
          const minAuthTime = new Date(config.value).getTime();
          const loginAtStr = localStorage.getItem(STORAGE_KEYS.LOGIN_AT);
          const loginAtMs = loginAtStr ? new Date(loginAtStr).getTime() : 0;

          if (loginAtMs < minAuthTime) {
            toast("보안 정책 또는 시스템 업데이트로 인해 모든 세션이 만료되었습니다. 다시 로그인해 주세요.");
            await clearClientSession();
            router.replace('/');
          }
        }
      } catch {
        // 테이블이 없거나 설정이 없으면 무시
      }
    };
    checkForcedLogout();
  }, [clearClientSession, router]);

  // 세션 자동 갱신 — 30분마다 GET /api/auth/session 호출 (남은 시간 < 6h이면 서버가 12h로 연장)
  useEffect(() => {
    if (!user) return;
    const refreshSession = async () => {
      try {
        const response = await fetch('/api/auth/session', { method: 'GET', cache: 'no-store' });
        if (response.status === 401) {
          // 명시적 인증 실패만 로그아웃
          await clearClientSession();
          router.replace('/');
          return;
        }
        if (!response.ok) {
          // 5xx 등 일시 오류 — 세션 유지, 다음 30분 주기에 재시도
          return;
        }
        const payload = await response.json();
        if (payload?.authenticated === false) {
          // 서버가 명시적으로 비인증 응답 — 로그아웃
          await clearClientSession();
          router.replace('/');
          return;
        }
        if (!payload?.user) {
          // 사용자 정보 누락 — 세션 유지, 다음 주기 재시도
          return;
        }

        const refreshedLoginAt = normalizeSessionLoginAt(payload?.issuedAt, loginAt);
        setLoginAt(refreshedLoginAt);
        try {
          localStorage.setItem(STORAGE_KEYS.LOGIN_AT, refreshedLoginAt);
        } catch {
          // ignore
        }

        if (isForceLogoutAfterLogin(payload.user.force_logout_at, refreshedLoginAt)) {
          toast('관리자에 의해 강제 로그아웃 되었습니다. 다시 로그인해 주세요.');
          await clearClientSession();
          router.replace('/');
          return;
        }

      } catch {
        // 갱신 실패 시 무시 (다음 주기에 재시도)
      }
    };
    const interval = setInterval(refreshSession, 30 * 60 * 1000); // 30분마다
    return () => clearInterval(interval);
  }, [user, clearClientSession, loginAt, router]);

  // Web Share Target: 다른 앱에서 공유하기로 파일/텍스트 수신
  useEffect(() => {
    if (!navigationIntent.shareId) return;
    setMainMenu('채팅');
    setShareTarget({
      id: navigationIntent.shareId,
      fileCount: navigationIntent.shareFileCount,
      text: navigationIntent.shareText,
      url: navigationIntent.shareUrl,
      title: navigationIntent.shareTitle,
    });
    clearNavigationQuery();
  }, [clearNavigationQuery, navigationIntent.shareFileCount, navigationIntent.shareId, navigationIntent.shareText, navigationIntent.shareTitle, navigationIntent.shareUrl]);

  // 알림 클릭 시 open_chat_room 쿼리 처리 → 채팅 메뉴 + 해당 채팅방 연동 (웹/모바일 동일)
  useEffect(() => {
    const roomId = navigationIntent.openChatRoom;
    const msgId = navigationIntent.openMessage;
    if (roomId || msgId) {
      setMainMenu('채팅');
      if (roomId) setInitialOpenChatRoomId(roomId);
      if (msgId) setInitialOpenMessageId(msgId);
      setInitialOpenChatRequestToken((value) => value + 1);
      clearNavigationQuery();
    }
  }, [clearNavigationQuery, navigationIntent.openChatRoom, navigationIntent.openMessage]);

  // 페이지 이동 처리 (알림 인박스에서 메뉴 오픈용)
  useEffect(() => {
    const targetMenu = navigationIntent.openMenu;
    const targetSubView = navigationIntent.openSubView;
    const openMyPageTab = navigationIntent.openMyPageTab;
    const openPost = navigationIntent.openPost;
    const openApprovalId = navigationIntent.openApprovalId;
    const openInventoryView = navigationIntent.openInventoryView;
    const openInventoryApproval = navigationIntent.openInventoryApproval;
    if (!user) return;
    if (targetMenu || targetSubView || openMyPageTab || openPost || openApprovalId || openInventoryView || openInventoryApproval) {
      const savedSubView = getSavedSubViewForMenu(targetMenu);
      const resolvedNavigation = targetMenu
        ? resolveLegacyNavigation(targetMenu, targetSubView ?? savedSubView, user)
        : null;
      const resolvedMenu = resolvedNavigation?.menuId
        ? normalizeMainMenuForUser(user, resolvedNavigation.menuId)
        : targetMenu;
      const resolvedSubView = resolvedNavigation?.subViewId ?? targetSubView ?? null;

      if (resolvedMenu) setMainMenu(resolvedMenu);
      if (resolvedSubView) setSubView(resolvedSubView);
      if (isLegacyOfficialDocumentAdminTarget(targetMenu, targetSubView ?? savedSubView)) {
        setInitialApprovalIntent({
          viewMode: '작성하기',
          formType: '공문발송',
        });
      }
      if (openApprovalId) {
        setInitialApprovalIntent({
          approvalId: openApprovalId,
          ...(resolvedSubView ? { viewMode: resolvedSubView } : {}),
        });
      }
      if (openMyPageTab) {
        setMainMenu('내정보');
        setInitialMyPageTab(openMyPageTab);
      }
      if (targetMenu === '재고관리' || openInventoryView || openInventoryApproval) {
        setMainMenu('재고관리');
        if (openInventoryView) {
          setSubView(openInventoryView);
        }
        if (openInventoryApproval) {
          setInitialInventoryWorkflowApprovalId(openInventoryApproval);
        }
      }
      const openBoard = navigationIntent.openBoard;
      if (openBoard) {
        setInitialBoardView(openBoard);
      }
      if (openPost) {
        setMainMenu('게시판'); // open_post가 있으면 무조건 게시판으로 이동
        setInitialOpenPostId(openPost);
      }
      clearNavigationQuery();
    }
  }, [
    clearNavigationQuery,
    navigationIntent.openBoard,
    navigationIntent.openApprovalId,
    navigationIntent.openInventoryApproval,
    navigationIntent.openInventoryView,
    navigationIntent.openMenu,
    navigationIntent.openMyPageTab,
    navigationIntent.openPost,
    navigationIntent.openSubView,
    resolveLegacyNavigation,
    user,
  ]);

  // 온라인 상태(Presence) 업데이트: 일정 주기로 last_seen_at 갱신
  useEffect(() => {
    if (!user?.id) return;
    let isCancelled = false;

    const updatePresence = async (status: 'online' | 'away') => {
      try {
        await supabase
          .from('staff_members')
          .update({
            last_seen_at: new Date().toISOString(),
            presence_status: status,
          })
          .eq('id', user.id);
      } catch {
        // presence 업데이트 실패는 무시 (주요 기능과 무관)
      }
    };

    updatePresence('online');

    const intervalId = window.setInterval(() => {
      if (!isCancelled) updatePresence('online');
    }, 120_000);

    const handleFocus = () => updatePresence('online');
    const handleBlur = () => updatePresence('away');

    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
      updatePresence('away');
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    fetchERPData(user);
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isMsoUser) return;

    if (!selectedCo || selectedCo === '전체') {
      if (selectedCompanyId) {
        persistSelectedCompanyId(null);
        setSelectedCompanyIdState(null);
      }
      return;
    }

    const matchedCompany = selectedCo ? companyById.get(companyIdByName.get(selectedCo) || '') : null;
    if (!matchedCompany) return;

    if (selectedCompanyId !== matchedCompany.id) {
      persistSelectedCompanyId(matchedCompany.id);
      setSelectedCompanyIdState(matchedCompany.id);
    }
  }, [companyById, companyIdByName, isMsoUser, selectedCo, selectedCompanyId]);

  // 2. 상태 변경 시마다 로컬 스토리지 업데이트
  useEffect(() => {
    if (user) {
      persistTopLevelNavigationState(mainMenu, subView, selectedCo);
    }
  }, [mainMenu, subView, selectedCo, user]);

  const fetchERPData = useCallback(async (currentUser?: ErpUser | null) => {
    setLoading(true);
    const u = currentUser ?? user;
    try {
      const staffData = await getStaffsCached(true);

      const normalizedStaffData = Array.isArray(staffData)
        ? staffData.map((staff: StaffMember) => normalizeProfileUser(staff))
        : [];

      // 현재 사용자의 변경된 정보(팀/부서 등)가 있으면 세션 동기화
      if (normalizedStaffData.length > 0 && u?.id) {
        const updatedSelf = normalizedStaffData.find((s: StaffMember) => s.id === u.id);
        if (updatedSelf) {
          const safeSelf = { ...updatedSelf };
          delete safeSelf.password;
          delete safeSelf.passwd;
          const normalizedSelf = normalizeProfileUser(safeSelf);
          if (hasUserPayloadChanged(u, normalizedSelf)) {
            persistClientUser(normalizedSelf);
          }
        }
      }

      const uniqueDepts = Array.from(
        new Set(normalizedStaffData.map((s: StaffMember) => String(s.department || '').trim()))
      ).filter(Boolean);

      setData({
        staffs: normalizedStaffData,
        depts: uniqueDepts || [],
        posts: [],
        tasks: [],
        surgeries: [],
        mris: []
      });
    } catch (error) {
      logger.error("데이터 로딩 실패:", error);
    } finally {
      setHasLoadedInitialData(true);
      setLoading(false);
    }
  }, [persistClientUser, user]);

  // 현재 메인 메뉴에 해당하는 서브메뉴 목록
  const isSystemMaster = hasSystemMasterPermission(user);
  const currentSubMenus = useMemo(
    () =>
      (mainMenu === '인사관리' ? [] : (SUB_MENUS[mainMenu] || []))
        .filter((subMenu) => {
          if (mainMenu === '게시판') {
            return canAccessBoard(user, subMenu.id, 'read');
          }

          if (mainMenu === '전자결재') {
            return canAccessApprovalSection(user, subMenu.id);
          }

          if (mainMenu === '재고관리') {
            return canAccessInventorySection(user, subMenu.id);
          }

          if (mainMenu === '관리자') {
            if (subMenu.id === '시스템마스터센터' && !isSystemMaster) return false;
            return canAccessAdminSubMenu(user, subMenu.id);
          }

          return true;
        }),
    [isSystemMaster, mainMenu, user],
  );
  const selectableSubMenus = useMemo(
    () => currentSubMenus.filter((subMenu) => !subMenu.hidden),
    [currentSubMenus]
  );
  const currentSubMenuGroups = useMemo(
    () =>
      mainMenu === '관리자' || mainMenu === '재고관리' || mainMenu === '게시판'
        ? Array.from(new Set(selectableSubMenus.map((subMenu) => subMenu.group))).filter(Boolean)
        : [],
    [mainMenu, selectableSubMenus]
  );
  // 결정 #24: 게시판 사이드바 row 우측 카운트 chip — board_id별 게시물 수 집계
  const boardCounts = useMemo<Record<string, number>>(() => {
    if (mainMenu !== '게시판') return {};
    const counts: Record<string, number> = {};
    for (const post of data.posts as Array<{ board_id?: string | null }>) {
      const key = post.board_id;
      if (typeof key === 'string' && key) {
        counts[key] = (counts[key] ?? 0) + 1;
      }
    }
    return counts;
  }, [mainMenu, data.posts]);
  const displayedSubView = getDisplayedSubView(mainMenu, subView);
  const subgroupLabels: Record<string, string> = {
    운영: '운영',
    기준: '· 기준',
    마감: '· 마감',
    '재고 대시보드': '재고 대시보드',
    '입출고 운영': '입출고 운영',
    '문서 · 자산': '문서 · 자산',
    '기준 정보': '기준 정보',
    '경영 분석': '경영 분석',
    '조직 · 권한': '조직 · 권한',
    '시스템 설정': '설정',
    '데이터 관리': '관리',
    '감사 센터': '센터',
    '시스템 마스터': '시스템 마스터',
    인력관리: '인력관리',
    '근태 · 급여': '근태 · 급여',
    '복무 · 복지': '복무 · 복지',
    '문서 · 기타': '문서 · 기타',
    게시판: '게시판',
    참고: '참고',
  };

  // 메인 메뉴가 바뀌었는데 현재 subView가 해당 메뉴의 서브메뉴에 없다면, 첫 번째 서브메뉴로 보정
  useEffect(() => {
    if (!currentSubMenus.length) return;
    const normalizedNavigation = resolveLegacyNavigation(mainMenu, subView, user);
    const persistedSubView = (() => {
      if (navigationIntent.openMenu !== mainMenu || navigationIntent.openSubView) {
        return null;
      }

      const savedSubView = getSavedSubViewForMenu(mainMenu);
      if (!savedSubView) {
        return null;
      }

      const restoredNavigation = resolveLegacyNavigation(mainMenu, savedSubView, user);
      return restoredNavigation.menuId === mainMenu ? restoredNavigation.subViewId : null;
    })();
    const preferredSubView =
      [normalizedNavigation.menuId === mainMenu ? normalizedNavigation.subViewId : null, persistedSubView, subView]
        .find((candidate) => candidate && currentSubMenus.some((menu) => menu.id === candidate)) ?? null;

    if (preferredSubView) {
      if (preferredSubView !== subView) {
        setSubView(preferredSubView);
      }
      return;
    }

    if (!currentSubMenus.some((s) => s.id === subView) && selectableSubMenus.length > 0) {
      setSubView(selectableSubMenus[0].id);
    }
  }, [
    currentSubMenus,
    mainMenu,
    navigationIntent.openMenu,
    navigationIntent.openSubView,
    resolveLegacyNavigation,
    selectableSubMenus,
    subView,
    user,
  ]);

  const clearMenuNavigationTargets = useCallback(() => {
    setInitialMyPageTab(null);
    setInitialBoardView(null);
    setInitialOpenChatRoomId(null);
    setInitialOpenMessageId(null);
    setShareTarget(null);
    setInitialOpenPostId(null);
    setInitialApprovalIntent(null);
    setInitialInventoryWorkflowApprovalId(null);
  }, []);

  const handleMenuChange = useCallback((menu: string, sub?: string) => {
    const isSameMenu = menu === mainMenu;

    if (isSameMenu) {
      clearMenuNavigationTargets();
      resetPersistedMenuState(menu);
      startTransition(() => {
        if (menu === '채팅') {
          setChatListResetToken((prev) => prev + 1);
        }
        setMenuResetVersion((prev) => prev + 1);

        if (sub !== undefined) {
          setSubView(sub);
          return;
        }

        if (selectableSubMenus.length > 0) {
          setSubView(selectableSubMenus[0].id);
        }
      });
      return;
    }

    if (menu === '채팅') {
      clearMenuNavigationTargets();
      resetPersistedMenuState(menu);
      startTransition(() => {
        setChatListResetToken((prev) => prev + 1);
        setMainMenu(menu);
        if (sub !== undefined) setSubView(sub);
      });
      return;
    }

    startTransition(() => {
      setMainMenu(menu);
      if (sub !== undefined) setSubView(sub);
    });
  }, [clearMenuNavigationTargets, mainMenu, resetPersistedMenuState, selectableSubMenus]);

  const handleSubViewChange = useCallback((nextSubView: string) => {
    startTransition(() => {
      setSubView(nextSubView);
    });
  }, []);

  // 전역 Alt+키 단축키 — 직원별 매핑된 메뉴로 즉시 이동
  const shortcutSetMainMenu = useCallback((menu: string) => {
    startTransition(() => { setMainMenu(menu); });
  }, []);
  const shortcutSetSubView = useCallback((view: string | null) => {
    startTransition(() => { setSubView(view ?? '전체'); });
  }, []);
  useGlobalShortcuts({
    user,
    setMainMenu: shortcutSetMainMenu,
    setSubView: shortcutSetSubView,
  });

  const handleRefresh = useCallback(() => {
    void fetchERPData(user);
  }, [fetchERPData, user]);

  // ── 안정 콜백: NotificationSystem / ChatAlertBanner re-render 방지 ──
  const handleOpenChatRoom = useCallback((roomId: string) => {
    setMainMenu('채팅');
    setInitialOpenChatRoomId(roomId);
    setInitialOpenMessageId(null);
    setInitialOpenChatRequestToken((value) => value + 1);
  }, []);

  const handleOpenChatMessage = useCallback((roomId: string, messageId: string) => {
    setMainMenu('채팅');
    setInitialOpenChatRoomId(roomId);
    setInitialOpenMessageId(messageId);
    setInitialOpenChatRequestToken((value) => value + 1);
  }, []);

  const handleOpenAdmin = useCallback((nextSubView?: string) => {
    setMainMenu('관리자');
    setSubView(nextSubView || '감사센터');
  }, []);

  const handleOpenInventory = useCallback((intent: { view?: string | null; approvalId?: string | null } | undefined) => {
    setMainMenu('재고관리');
    setSubView(intent?.view || '현황');
    setInitialInventoryWorkflowApprovalId(intent?.approvalId || null);
  }, []);

  const handleOpenBoard = useCallback((boardId?: string) => {
    setMainMenu('게시판');
    if (boardId) setInitialBoardView(boardId);
  }, []);

  const handleOpenPost = useCallback((boardId: string, postId: string) => {
    setMainMenu('게시판');
    if (boardId) setInitialBoardView(boardId);
    setInitialOpenPostId(postId);
  }, []);

  const navigationContextValue = useMemo(
    () => ({ mainMenu, setMainMenu, subView, setSubView: setSubView as (v: string | null) => void }),
    [mainMenu, subView],
  );
  const companyContextValue = useMemo(
    () => ({
      selectedCo,
      setSelectedCo: handleSelectedCoChange as (v: string | null) => void,
      companies: companies as unknown as { id: string; name: string; type: string }[],
      selectedCompanyId,
      setSelectedCompanyId: handleSelectedCompanyIdChange as (v: string | null) => void,
    }),
    [companies, handleSelectedCoChange, handleSelectedCompanyIdChange, selectedCo, selectedCompanyId],
  );
  const appDataContextValue = useMemo(
    () => ({ user, data, onRefresh: handleRefresh }),
    [data, handleRefresh, user],
  );

  useEffect(() => {
    if (!user?.id || typeof document === 'undefined') return;

    const setNavLabel = (element: Element | null, label: string) => {
      if (!(element instanceof HTMLElement)) return;
      element.setAttribute('title', label);
      element.setAttribute('aria-label', label);
      element.setAttribute('data-nav-label', label);
    };

    const applySidebarNavLabels = () => {
      const desktopSidebar = document.querySelector('[data-testid="desktop-sidebar"]');
      if (!desktopSidebar) return;

      setNavLabel(desktopSidebar.querySelector('.app-shell-logo'), '내정보');
      SIDEBAR_NAV_LABELS.forEach(({ testId, label }) => {
        setNavLabel(desktopSidebar.querySelector(`[data-testid="${testId}"]`), label);
      });
    };

    applySidebarNavLabels();

    if (typeof MutationObserver === 'undefined') return;
    const desktopSidebar = document.querySelector('[data-testid="desktop-sidebar"]');
    if (!desktopSidebar) return;

    const observer = new MutationObserver(applySidebarNavLabels);
    observer.observe(desktopSidebar, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [mainMenu, user?.id]);

  // user 없으면 로그인 페이지로 리다이렉트 (초기 로드 시)
  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--background)] p-6 text-center">
        <div className="relative w-20 h-20 mb-8">
          <div className="absolute inset-0 border-4 border-[var(--toss-blue-light)] rounded-full"></div>
          <div className="absolute inset-0 border-4 border-[var(--accent)] rounded-full border-t-transparent animate-spin"></div>
        </div>
        <h2 className="text-xl font-bold text-[var(--foreground)] mb-2">SY INC. 통합 시스템</h2>
        <p className="text-xs font-medium text-[var(--toss-gray-3)] animate-pulse">접속 중...</p>
      </div>
    );
  }

  if (isMobile) {
    return (
      <NavigationProvider value={navigationContextValue}>
        <CompanyProvider value={companyContextValue}>
          <AppDataProvider value={appDataContextValue}>
            <PermissionPromptModal />
            <ChatAlertBanner
              onOpenChat={handleOpenChatRoom}
              onOpenMessage={handleOpenChatMessage}
            />
            <NotificationSystem
              user={user as Parameters<typeof NotificationSystem>[0]['user']}
              onOpenChatRoom={handleOpenChatRoom}
              onOpenMessage={handleOpenChatMessage}
              onOpenApproval={handleOpenApproval}
              onOpenAdmin={handleOpenAdmin}
              onOpenInventory={handleOpenInventory}
              onOpenBoard={handleOpenBoard}
              onOpenPost={handleOpenPost}
            />
            <MobileShell
              user={user}
              onLogout={async () => {
                await performClientLogout();
                window.location.replace('/');
              }}
            />
          </AppDataProvider>
        </CompanyProvider>
      </NavigationProvider>
    );
  }

  return (
    <div
      className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-[var(--page-bg)] pt-[env(safe-area-inset-top)] md:flex-row md:pt-0"
      data-testid="main-shell"
      data-main-menu={mainMenu}
    >
      <style>{`
        @media (min-width: 768px) {
          [data-testid="desktop-sidebar"] .app-shell-menu-item[data-nav-label],
          [data-testid="desktop-sidebar"] .app-shell-logo[data-nav-label] {
            position: relative;
          }

          [data-testid="desktop-sidebar"] .app-shell-menu-item[data-nav-label]::after,
          [data-testid="desktop-sidebar"] .app-shell-logo[data-nav-label]::after {
            position: absolute;
            left: calc(100% + 10px);
            top: 50%;
            z-index: calc(var(--z-modal) + 1);
            max-width: 11rem;
            overflow: hidden;
            border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
            border-radius: var(--radius-md);
            background: color-mix(in srgb, var(--foreground) 94%, transparent);
            box-shadow: 0 12px 30px rgba(15, 23, 42, 0.18);
            color: var(--card);
            content: attr(data-nav-label);
            font-size: 11px;
            font-weight: 800;
            line-height: 1;
            opacity: 0;
            padding: 8px 10px;
            pointer-events: none;
            text-overflow: ellipsis;
            transform: translate(-4px, -50%);
            transition: opacity var(--transition-fast), transform var(--transition-fast);
            white-space: nowrap;
          }

          [data-testid="desktop-sidebar"] .app-shell-menu-item[data-nav-label]::before,
          [data-testid="desktop-sidebar"] .app-shell-logo[data-nav-label]::before {
            position: absolute;
            left: calc(100% + 4px);
            top: 50%;
            z-index: calc(var(--z-modal) + 2);
            border-bottom: 5px solid transparent;
            border-right: 6px solid color-mix(in srgb, var(--foreground) 94%, transparent);
            border-top: 5px solid transparent;
            content: '';
            opacity: 0;
            pointer-events: none;
            transform: translate(-4px, -50%);
            transition: opacity var(--transition-fast), transform var(--transition-fast);
          }

          [data-testid="desktop-sidebar"] .app-shell-menu-item[data-nav-label]:hover::after,
          [data-testid="desktop-sidebar"] .app-shell-menu-item[data-nav-label]:focus-visible::after,
          [data-testid="desktop-sidebar"] .app-shell-menu-item[data-nav-label]:hover::before,
          [data-testid="desktop-sidebar"] .app-shell-menu-item[data-nav-label]:focus-visible::before,
          [data-testid="desktop-sidebar"] .app-shell-logo[data-nav-label]:hover::after,
          [data-testid="desktop-sidebar"] .app-shell-logo[data-nav-label]:focus-visible::after,
          [data-testid="desktop-sidebar"] .app-shell-logo[data-nav-label]:hover::before,
          [data-testid="desktop-sidebar"] .app-shell-logo[data-nav-label]:focus-visible::before {
            opacity: 1;
            transform: translate(0, -50%);
          }
        }
      `}</style>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[var(--z-sticky)] p-2 md:p-3">
        <OfflineStatusBanner />
      </div>
      <Sidebar
        user={user}
        mainMenu={mainMenu}
        onMenuChange={handleMenuChange}
      />

      {selectableSubMenus.length > 0 && (
        <aside className="app-subnav flex w-full shrink-0 flex-col border-b md:sticky md:top-0 md:max-h-[100dvh] md:w-[var(--submenu-width)] md:overflow-y-auto md:border-r md:border-b-0">
          <button
            type="button"
            onClick={() => setSubNavCollapsed((v) => !v)}
            aria-expanded={!subNavCollapsed}
            aria-controls="app-subnav-items"
            className="flex min-h-11 w-full shrink-0 touch-manipulation items-center justify-between gap-2 px-3 py-2 text-[12px] font-semibold text-[var(--foreground)] md:hidden"
          >
            <span className="truncate">
              {selectableSubMenus.find((s) => s.id === displayedSubView)?.label || '서브메뉴'}
            </span>
            <ChevronDown
              size={16}
              aria-hidden="true"
              className={`shrink-0 transition-transform duration-150 ${subNavCollapsed ? '' : 'rotate-180'}`}
            />
          </button>
          <div
            id="app-subnav-items"
            className={`${subNavCollapsed ? 'hidden md:flex' : 'flex'} no-scrollbar scroll-smooth snap-x snap-mandatory flex-row gap-0.5 overflow-x-auto px-2 py-1.5 md:flex-col md:snap-none md:overflow-x-visible md:px-2 md:py-3`}
          >
          {(() => {
            if (mainMenu === '관리자' || mainMenu === '재고관리' || mainMenu === '게시판') {
              const groups = currentSubMenuGroups;

              return groups.map(groupName => (
                <div key={groupName!} className="flex shrink-0 flex-row gap-0.5 md:mb-5 md:flex-col">
                  <div className="app-subnav-group-label flex min-h-11 items-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] px-3 text-[11px] font-black select-none md:hidden">
                    {subgroupLabels[groupName!] || groupName}
                  </div>
                  <div className="app-subnav-group-label hidden px-2 pb-1 select-none md:block">
                    {subgroupLabels[groupName!] || groupName}
                  </div>
                  {selectableSubMenus.filter(s => s.group === groupName).map(sub => {
                    const boardCount = mainMenu === '게시판' ? boardCounts[sub.id] : undefined;
                    return (
                    <button type="button"
                      key={sub.id}
                      onClick={() => handleSubViewChange(sub.id)}
                      data-testid={buildSubMenuTestId(mainMenu, sub.id)}
                      aria-current={displayedSubView === sub.id ? 'page' : undefined}
                      className={`app-subnav-item touch-manipulation flex min-h-11 flex-none items-center justify-center px-3 py-2.5 text-center text-[12px] font-semibold tracking-normal whitespace-nowrap md:min-h-[36px] md:w-full md:justify-start md:gap-2 md:px-3 md:py-2 md:text-left ${displayedSubView === sub.id ? 'is-active' : ''}`}
                    >
                      <span className="hidden shrink-0 md:inline-flex" style={{ opacity: displayedSubView === sub.id ? 1 : 0.65 }}>
                        <MenuIcon name={sub.icon} className="h-[14px] w-[14px]" />
                      </span>
                      <span className="truncate">{sub.label}</span>
                      {typeof boardCount === 'number' && boardCount > 0 ? (
                        <span
                          className="ml-auto hidden shrink-0 rounded-full bg-[var(--muted)] px-1.5 text-[10px] font-bold tabular-nums text-[var(--toss-gray-4)] md:inline-flex md:items-center md:min-w-[20px] md:justify-center md:h-[18px]"
                          aria-label={`${sub.label} ${boardCount}건`}
                        >
                          {boardCount > 99 ? '99+' : boardCount}
                        </span>
                      ) : null}
                    </button>
                  );
                  })}
                </div>
              ));
            }

            return selectableSubMenus.map((sub) => (
              <button type="button"
                key={sub.id}
                onClick={() => handleSubViewChange(sub.id)}
                data-testid={buildSubMenuTestId(mainMenu, sub.id)}
                aria-current={displayedSubView === sub.id ? 'page' : undefined}
                className={`app-subnav-item touch-manipulation flex min-h-11 flex-none items-center justify-center px-3 py-2.5 text-center text-[12px] font-semibold tracking-normal whitespace-nowrap md:min-h-[36px] md:w-full md:justify-start md:gap-2 md:px-3 md:py-2 md:text-left ${displayedSubView === sub.id ? 'is-active' : ''}`}
              >
                <span className="hidden shrink-0 md:inline-flex" style={{ opacity: displayedSubView === sub.id ? 1 : 0.65 }}>
                  <MenuIcon name={sub.icon} className="h-[14px] w-[14px]" />
                </span>
                <span className="truncate">{sub.label}</span>
              </button>
            ));
          })()}
          </div>
        </aside>
      )}

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* 접속 시 한 번 알림·GPS 권한 요청 모달 */}
        <PermissionPromptModal />
        {/* 채팅·전자결재·연차촉진·출퇴근 실시간 알림 통합 배너 (웹·모바일 즉시 표시) */}
        <ChatAlertBanner
          onOpenChat={handleOpenChatRoom}
          onOpenMessage={handleOpenChatMessage}
        />
        {/* 전역 알림 및 푸시 처리 (채팅 탭을 열지 않아도 작동) */}
        <NotificationSystem
          user={user as Parameters<typeof NotificationSystem>[0]['user']}
          onOpenChatRoom={handleOpenChatRoom}
          onOpenMessage={handleOpenChatMessage}
          onOpenApproval={handleOpenApproval}
          onOpenAdmin={handleOpenAdmin}
          onOpenInventory={handleOpenInventory}
          onOpenBoard={handleOpenBoard}
          onOpenPost={handleOpenPost}
        />

        {loading && !hasLoadedInitialData && (
          <div
            className="absolute inset-0 bg-[var(--toss-card)]/60 z-40 flex items-center justify-center"
            data-testid="main-loading-overlay"
          >
            <div className="w-10 h-10 border-2 border-[var(--accent)] rounded-full border-t-transparent animate-spin" />
          </div>
        )}
        <NavigationProvider value={navigationContextValue}>
        <CompanyProvider value={companyContextValue}>
        <AppDataProvider value={appDataContextValue}>
        <MainContent
          key={`main-content-${menuResetVersion}`}
          user={user}
          mainMenu={mainMenu}
          data={data}
          subView={subView}
          setSubView={setSubView as (v: string | null) => void}
          selectedCo={selectedCo}
          setSelectedCo={handleSelectedCoChange}
          companies={companies as unknown as string[]}
          selectedCompanyId={selectedCompanyId}
          setSelectedCompanyId={handleSelectedCompanyIdChange}
          onRefresh={handleRefresh}
          initialMyPageTab={initialMyPageTab}
          onConsumeMyPageInitialTab={() => setInitialMyPageTab(null)}
          initialBoard={initialBoardView}
          initialOpenPostId={initialOpenPostId}
          onConsumeOpenPostId={() => setInitialOpenPostId(null)}
          chatListResetToken={chatListResetToken}
          initialOpenChatRoomId={initialOpenChatRoomId}
          initialOpenChatRequestToken={initialOpenChatRequestToken}
          initialOpenMessageId={initialOpenMessageId}
          onConsumeOpenChatRoomId={() => {
            setInitialOpenChatRoomId(null);
            setInitialOpenMessageId(null);
          }}
          shareTarget={shareTarget}
          onConsumeShareTarget={() => setShareTarget(null)}
          onOpenApproval={handleOpenApproval}
          initialApprovalIntent={initialApprovalIntent}
          onConsumeApprovalIntent={() => setInitialApprovalIntent(null)}
          initialInventoryWorkflowApprovalId={initialInventoryWorkflowApprovalId}
          onConsumeInitialInventoryWorkflowApprovalId={() => setInitialInventoryWorkflowApprovalId(null)}
          setMainMenu={setMainMenu}
          onOpenChatMessage={(roomId, messageId) => {
            setMainMenu('채팅');
            setInitialOpenChatRoomId(roomId);
            setInitialOpenMessageId(messageId);
            setInitialOpenChatRequestToken((value) => value + 1);
          }}
          onOpenBoardPost={(boardId, postId) => {
            setMainMenu('게시판');
            if (boardId) setInitialBoardView(boardId);
            setInitialOpenPostId(postId);
          }}
        />
        </AppDataProvider>
        </CompanyProvider>
        </NavigationProvider>
      </div>
    </div>
  );
}

export default function MainPage() {
  return (
    <Suspense fallback={<MainPageFallback />}>
      <MainPageContent />
    </Suspense>
  );
}
