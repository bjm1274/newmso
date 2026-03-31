'use client';
import { toast } from '@/lib/toast';
import { Suspense, useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { withMissingColumnFallback } from '@/lib/supabase-compat';
import { persistSupabaseAccessToken } from '@/lib/supabase-bridge';
import { setSelectedCompanyId as persistSelectedCompanyId, getSelectedCompanyId } from '@/lib/useCompany';
import { normalizeProfileUser } from '@/lib/profile-photo';
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

import Sidebar, { SUB_MENUS } from './기능부품/조직도서브/조직도측면창';
import MainContent from './기능부품/조직도서브/조직도본문';
import NotificationSystem from './기능부품/알림시스템';
import ChatAlertBanner from './기능부품/채팅알림배너';
import PermissionPromptModal from './기능부품/권한요청모달';
import type { ErpUser, ERPData, StaffMember } from '@/types';

function canAccessAdminSubMenu(user: ErpUser | null, subMenuId: string) {
  if (!canAccessMainMenu(user, '관리자')) {
    return false;
  }

  return canAccessAdminSection(user, subMenuId);
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

const CHAT_ROOM_KEY = 'erp_chat_last_room';
const CHAT_ACTIVE_ROOM_KEY = 'erp_chat_active_room';
const CHAT_FOCUS_KEY = 'erp_chat_focus_keyword';
const MYPAGE_TAB_KEY = 'erp_mypage_tab';
const HR_TAB_KEY = 'erp_hr_tab';
const HR_COMPANY_KEY = 'erp_hr_company';
const HR_STATUS_KEY = 'erp_hr_status';
const HR_WORKSPACE_KEY = 'erp_hr_workspace';
const INV_VIEW_KEY = 'erp_inventory_view';
const APPROVAL_VIEW_KEY = 'erp_approval_view';

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
  const [user, setUser] = useState<ErpUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<{ id: string; name: string; type: string }[]>([]);
  const [selectedCompanyId, setSelectedCompanyIdState] = useState<string | null>(null);
  const [menuResetVersion, setMenuResetVersion] = useState(0);

  // 초기 상태를 로컬 스토리지에서 시도 (기본: 내 정보)
  const [mainMenu, setMainMenu] = useState('내정보');
  const [subView, setSubView] = useState('전체');
  const [selectedCo, setSelectedCo] = useState('전체');
  const [initialMyPageTab, setInitialMyPageTab] = useState<string | null>(null);
  const [initialBoardView, setInitialBoardView] = useState<string | null>(null);
  const [chatListResetToken, setChatListResetToken] = useState(0);
  const [initialOpenChatRoomId, setInitialOpenChatRoomId] = useState<string | null>(null);
  const [initialOpenMessageId, setInitialOpenMessageId] = useState<string | null>(null);
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
  const [loginAt] = useState<string>(new Date().toISOString());
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
    },
    [companyById, isMsoUser]
  );

  const handleSelectedCoChange = useCallback(
    (nextCo: string | null) => {
      setSelectedCo(nextCo ?? '전체');
      if (!isMsoUser) return;
      if (!nextCo || nextCo === '전체') {
        persistSelectedCompanyId(null);
        setSelectedCompanyIdState(null);
        return;
      }
      const nextCompanyId = companyIdByName.get(nextCo) ?? null;
      persistSelectedCompanyId(nextCompanyId);
      setSelectedCompanyIdState(nextCompanyId);
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

  const resolveLegacyNavigation = useCallback(
    (menuId?: string | null, subViewId?: string | null, candidateUser?: ErpUser | null) => {
      const canOpenAdmin =
        candidateUser?.company === 'SY INC.' ||
        candidateUser?.permissions?.mso === true ||
        candidateUser?.role === 'admin' ||
        candidateUser?.permissions?.menu_관리자 === true;

      if (menuId === '인사관리' && subViewId === '조직도') {
        return canOpenAdmin
          ? { menuId: '관리자', subViewId: '회사관리' }
          : { menuId: '인사관리', subViewId: '구성원' };
      }

      if (menuId === '관리자' && subViewId === '조직도') {
        return { menuId: '관리자', subViewId: '회사관리' };
      }

      return { menuId, subViewId };
    },
    [],
  );

  const clearClientSession = useCallback(async () => {
    try {
      await fetch('/api/auth/session', { method: 'DELETE' });
    } catch {
      // ignore
    }
    try {
      localStorage.removeItem('erp_user');
      localStorage.removeItem('erp_login_at');
      persistSupabaseAccessToken(null);
      void supabase.realtime.setAuth(null);
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
      localStorage.setItem('erp_user', JSON.stringify(normalizedUser));
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

        const response = await fetch('/api/auth/session', {
          method: 'GET',
          cache: 'no-store',
        });

        if (!response.ok) {
          await clearClientSession();
          router.replace('/');
          return;
        }

        const payload = await response.json();
        const sessionUser = normalizeProfileUser(payload?.user);
        if (!sessionUser) {
          await clearClientSession();
          router.replace('/');
          return;
        }

        if (!ignore) {
          persistClientUser(sessionUser);
        }

        try {
          localStorage.setItem('erp_user', JSON.stringify(sessionUser));
          persistSupabaseAccessToken(payload?.supabaseAccessToken ?? null);
          void supabase.realtime.setAuth(payload?.supabaseAccessToken ?? null);
        } catch {
          // ignore
        }

        const savedCo = localStorage.getItem('erp_last_co');
        const savedMenu = localStorage.getItem('erp_last_menu');
        const savedSubView = localStorage.getItem('erp_last_subview');
        const navigationEntry =
          typeof window !== 'undefined' && typeof window.performance?.getEntriesByType === 'function'
            ? (window.performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)
            : undefined;
        const navigationType = navigationEntry?.type ?? 'navigate';
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
        }

        if (sessionUser.company !== 'SY INC.' && !sessionUser.permissions?.mso) {
          if (!ignore) setSelectedCo(sessionUser.company);
        } else if (savedCo && !ignore) {
          setSelectedCo(savedCo);
        }

        if (sessionUser?.company === 'SY INC.' || sessionUser?.permissions?.mso) {
          supabase
            .from('companies')
            .select('id, name, type')
            .eq('is_active', true)
            .then(({ data: list, error }) => {
              if (error) {
                console.error('companies 조회 오류:', error);
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
          if (savedId && !ignore) setSelectedCompanyIdState(savedId);
        }

        if (!ignore) {
          setSelectedCompanyIdState(getSelectedCompanyId());
        }
      } catch {
        await clearClientSession();
        router.replace('/');
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

  // 1-1. 강제 로그아웃 실시간 감지 (Session Security)
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase.channel(`force-logout-${user.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'staff_members', filter: `id=eq.${user.id}` }, (payload) => {
        const safeNextUser = { ...(payload.new || {}) };
        delete safeNextUser.password;
        delete safeNextUser.passwd;

        const normalizedNextUser = normalizeProfileUser<ErpUser>({
          ...user,
          ...safeNextUser,
        });
        if (hasUserPayloadChanged(user, normalizedNextUser)) {
          persistClientUser(normalizedNextUser);
        }

        const forceLogoutAt = payload.new.force_logout_at;
        if (forceLogoutAt && new Date(forceLogoutAt).getTime() > new Date(loginAt).getTime()) {
          toast('관리자에 의해 강제 로그아웃 되었습니다. 다시 로그인해 주세요.');
          void clearClientSession();
          window.location.href = '/';
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [clearClientSession, persistClientUser, user, user?.id, loginAt]);

  // 1-1. 강제 로그아웃(세션 만료) 체크 — 마운트 시 1회만 실행
  useEffect(() => {
    const checkForcedLogout = async () => {
      try {
        const { data: config } = await supabase
          .from('system_configs')
          .select('value')
          .eq('key', 'min_auth_time')
          .single();

        if (config?.value) {
          const minAuthTime = new Date(config.value).getTime();
          const loginAtStr = localStorage.getItem('erp_login_at');
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
        if (!response.ok) {
          await clearClientSession();
          router.replace('/');
          return;
        }
        const payload = await response.json();
        if (payload?.supabaseAccessToken) {
          persistSupabaseAccessToken(payload.supabaseAccessToken);
          void supabase.realtime.setAuth(payload.supabaseAccessToken);
        }
      } catch {
        // 갱신 실패 시 무시 (다음 주기에 재시도)
      }
    };
    const interval = setInterval(refreshSession, 30 * 60 * 1000); // 30분마다
    return () => clearInterval(interval);
  }, [user, clearClientSession, router]);

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
    router.replace('/main', { scroll: false });
  }, [navigationIntent.shareId]);

  // 알림 클릭 시 open_chat_room 쿼리 처리 → 채팅 메뉴 + 해당 채팅방 연동 (웹/모바일 동일)
  useEffect(() => {
    const roomId = navigationIntent.openChatRoom;
    const msgId = navigationIntent.openMessage;
    if (roomId || msgId) {
      setMainMenu('채팅');
      if (roomId) setInitialOpenChatRoomId(roomId);
      if (msgId) setInitialOpenMessageId(msgId);
      router.replace('/main', { scroll: false });
    }
  }, [navigationIntent.openChatRoom, navigationIntent.openMessage, router]);

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
      const savedSubView =
        typeof window !== 'undefined' ? window.localStorage.getItem('erp_last_subview') : null;
      const resolvedNavigation = targetMenu
        ? resolveLegacyNavigation(targetMenu, targetSubView ?? savedSubView, user)
        : null;
      const resolvedMenu = resolvedNavigation?.menuId
        ? normalizeMainMenuForUser(user, resolvedNavigation.menuId)
        : targetMenu;
      const resolvedSubView = targetSubView ?? resolvedNavigation?.subViewId ?? null;

      if (resolvedMenu) setMainMenu(resolvedMenu);
      if (resolvedSubView) setSubView(resolvedSubView);
      if (openApprovalId) {
        setInitialApprovalIntent({
          approvalId: openApprovalId,
          ...(resolvedSubView ? { viewMode: resolvedSubView } : {}),
        });
      }
      if (targetMenu === '내정보' && openMyPageTab) {
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
      router.replace('/main', { scroll: false });
    }
  }, [
    navigationIntent.openBoard,
    navigationIntent.openApprovalId,
    navigationIntent.openInventoryApproval,
    navigationIntent.openInventoryView,
    navigationIntent.openMenu,
    navigationIntent.openMyPageTab,
    navigationIntent.openPost,
    navigationIntent.openSubView,
    resolveLegacyNavigation,
    router,
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
    }, 30_000);

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
    fetchERPData(user, selectedCompanyId);
  }, [user, selectedCompanyId, selectedCo]);

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
      localStorage.setItem('erp_last_menu', mainMenu);
      localStorage.setItem('erp_last_subview', subView);
      localStorage.setItem('erp_last_co', selectedCo);
    }
  }, [mainMenu, subView, selectedCo, user]);

  const fetchERPData = useCallback(async (currentUser?: ErpUser | null, companyIdFilter?: string | null) => {
    setLoading(true);
    const u = currentUser ?? user;
    try {
      const { data: staffData } = await withMissingColumnFallback(
        async () => {
          return supabase
            .from('staff_members')
            .select('*')
            .order('employee_no', { ascending: true });
        },
        async () => {
          return supabase
            .from('staff_members')
            .select('*')
            .order('employee_no', { ascending: true });
        }
      );

      const normalizedStaffData = Array.isArray(staffData)
        ? staffData.map((staff: StaffMember) => normalizeProfileUser(staff))
        : [];

      const { data: postData } = await withMissingColumnFallback(
        async () => {
          return supabase.from('board_posts').select('*').order('created_at', { ascending: false });
        },
        async () => {
          return supabase.from('board_posts').select('*').order('created_at', { ascending: false });
        }
      );

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
        posts: postData || [],
        tasks: [],
        surgeries: [],
        mris: []
      });
    } catch (error) {
      console.error("데이터 로딩 실패:", error);
    } finally {
      setLoading(false);
    }
  }, [persistClientUser, user]);

  // 현재 메인 메뉴에 해당하는 서브메뉴 목록
  const isSystemMaster = hasSystemMasterPermission(user);
  const currentSubMenus = (mainMenu === '인사관리' ? [] : (SUB_MENUS[mainMenu] || []))
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
    });
  const currentSubMenuGroups = useMemo(
    () =>
      mainMenu === '관리자' || mainMenu === '재고관리'
        ? Array.from(new Set(currentSubMenus.map((subMenu) => subMenu.group))).filter(Boolean)
        : [],
    [currentSubMenus, mainMenu]
  );
  const subgroupLabels: Record<string, string> = {
    '재고 대시보드': '📊 재고 대시보드',
    '입출고 운영': '📦 입출고 운영',
    '문서 · 자산': '🧾 문서 · 자산',
    '기준 정보': '🗂️ 기준 정보',
    '경영 분석': '📊 경영 분석',
    '조직 / 권한': '🔐 조직 / 권한',
    '시스템 설정': '⚙️ 시스템 설정',
    '데이터 관리': '🗂️ 데이터 관리',
    '감사 센터': '🔍 감사 센터',
    '시스템 마스터': '🛡️ 시스템 마스터',
    인력관리: '👥 인력관리',
    '근태/급여': '💰 근태 · 급여',
    '복무/복지': '🏥 복무 · 복지',
    '문서/기타': '📂 문서 · 기타',
  };

  // 메인 메뉴가 바뀌었는데 현재 subView가 해당 메뉴의 서브메뉴에 없다면, 첫 번째 서브메뉴로 보정
  useEffect(() => {
    if (!currentSubMenus.length) return;
    const normalizedNavigation = resolveLegacyNavigation(mainMenu, subView, user);
    const preferredSubView =
      normalizedNavigation.menuId === mainMenu
        ? normalizedNavigation.subViewId
        : subView;

    if (preferredSubView && currentSubMenus.some((s) => s.id === preferredSubView)) {
      if (preferredSubView !== subView) {
        setSubView(preferredSubView);
      }
      return;
    }

    if (!currentSubMenus.some((s) => s.id === subView)) {
      setSubView(currentSubMenus[0].id);
    }
  }, [currentSubMenus, mainMenu, resolveLegacyNavigation, subView, user]);

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

  const resetPersistedMenuState = useCallback((menu: string) => {
    if (typeof window === 'undefined') return;

    try {
      switch (menu) {
        case '내정보':
          window.localStorage.removeItem(MYPAGE_TAB_KEY);
          break;
        case '채팅':
          window.localStorage.removeItem(CHAT_ROOM_KEY);
          window.localStorage.removeItem(CHAT_FOCUS_KEY);
          window.sessionStorage.removeItem(CHAT_ACTIVE_ROOM_KEY);
          break;
        case '전자결재':
          window.localStorage.removeItem(APPROVAL_VIEW_KEY);
          break;
        case '인사관리':
          window.localStorage.removeItem(HR_TAB_KEY);
          window.localStorage.removeItem(HR_COMPANY_KEY);
          window.localStorage.removeItem(HR_STATUS_KEY);
          window.localStorage.removeItem(HR_WORKSPACE_KEY);
          break;
        case '재고관리':
          window.localStorage.removeItem(INV_VIEW_KEY);
          break;
        default:
          break;
      }
    } catch {
      // ignore storage failures during menu reset
    }
  }, []);

  const handleMenuChange = useCallback((menu: string, sub?: string) => {
    const isSameMenu = menu === mainMenu;

    if (isSameMenu) {
      clearMenuNavigationTargets();
      resetPersistedMenuState(menu);
      if (menu === '채팅') {
        setChatListResetToken((prev) => prev + 1);
      }
      setMenuResetVersion((prev) => prev + 1);

      if (sub !== undefined) {
        setSubView(sub);
        return;
      }

      if (currentSubMenus.length > 0) {
        setSubView(currentSubMenus[0].id);
      }
      return;
    }

    setMainMenu(menu);
    if (sub !== undefined) setSubView(sub);
  }, [clearMenuNavigationTargets, currentSubMenus, mainMenu, resetPersistedMenuState]);

  const handleSubViewChange = useCallback((nextSubView: string) => {
    setSubView(nextSubView);
  }, []);

  const handleRefresh = useCallback(() => {
    void fetchERPData(user, selectedCompanyId);
  }, [fetchERPData, selectedCompanyId, user]);

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

  return (
    <div
      className="flex h-[100dvh] w-full flex-col overflow-hidden bg-[var(--background)] md:flex-row"
      data-testid="main-shell"
    >
      <Sidebar
        user={user}
        mainMenu={mainMenu}
        onMenuChange={handleMenuChange}
      />

      {currentSubMenus.length > 0 && (
        <aside className="no-scrollbar flex w-full shrink-0 flex-row overflow-x-auto border-b border-[var(--border)] bg-[var(--card)] px-2 py-1.5 md:sticky md:top-0 md:max-h-[100dvh] md:w-[var(--submenu-width)] md:flex-col md:overflow-x-visible md:overflow-y-auto md:border-r md:border-b-0 md:px-2 md:py-3 md:gap-0.5">
          {(() => {
            if (mainMenu === '관리자' || mainMenu === '재고관리') {
              const groups = currentSubMenuGroups;

              return groups.map(groupName => (
                <div key={groupName!} className="flex flex-row md:flex-col gap-0.5 mb-0 md:mb-2 shrink-0">
                  <div className="hidden md:block px-2 pt-2 pb-0.5 text-[9px] font-bold text-[var(--zinc-400)] uppercase tracking-widest select-none">
                    {(subgroupLabels[groupName!] || groupName)?.replace(/^[^\s]+ /, '')}
                  </div>
                  {currentSubMenus.filter(s => s.group === groupName).map(sub => (
                    <button
                      key={sub.id}
                      onClick={() => handleSubViewChange(sub.id)}
                      data-testid={buildSubMenuTestId(mainMenu, sub.id)}
                      className={`flex-none md:w-full text-center md:text-left px-3 md:px-2.5 py-1.5 text-[11px] font-semibold rounded-[var(--radius-md)] transition-all duration-150 whitespace-nowrap md:flex md:items-center md:gap-1.5 ${subView === sub.id
                        ? 'bg-[var(--accent)] text-white shadow-sm'
                        : 'text-[var(--toss-gray-4)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]'
                      }`}
                    >
                      <span className="hidden md:inline text-[12px] shrink-0" style={{ opacity: subView === sub.id ? 1 : 0.65 }}>{sub.icon || '·'}</span>
                      <span className="truncate">{sub.label}</span>
                    </button>
                  ))}
                </div>
              ));
            }

            return currentSubMenus.map((sub) => (
              <button
                key={sub.id}
                onClick={() => handleSubViewChange(sub.id)}
                data-testid={buildSubMenuTestId(mainMenu, sub.id)}
                className={`flex-none md:w-full text-center md:text-left px-3 md:px-2.5 py-1.5 text-[11px] font-semibold rounded-[var(--radius-md)] transition-all duration-150 whitespace-nowrap md:flex md:items-center md:gap-1.5 ${subView === sub.id
                  ? 'bg-[var(--accent)] text-white shadow-sm'
                  : 'text-[var(--toss-gray-4)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]'
                }`}
              >
                <span className="hidden md:inline text-[12px] shrink-0" style={{ opacity: subView === sub.id ? 1 : 0.65 }}>{sub.icon || '·'}</span>
                <span className="truncate">{sub.label}</span>
              </button>
            ));
          })()}
        </aside>
      )}

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* 접속 시 한 번 알림·GPS 권한 요청 모달 */}
        <PermissionPromptModal />
        {/* 채팅·전자결재·연차촉진·출퇴근 실시간 알림 통합 배너 (웹·모바일 즉시 표시) */}
        <ChatAlertBanner
          onOpenChat={(roomId) => { setMainMenu('채팅'); setInitialOpenChatRoomId(roomId); }}
        />
        {/* 전역 알림 및 푸시 처리 (채팅 탭을 열지 않아도 작동) */}
        <NotificationSystem
          user={user as Parameters<typeof NotificationSystem>[0]['user']}
          onOpenChatRoom={(roomId: string) => { setMainMenu('채팅'); setInitialOpenChatRoomId(roomId); }}
          onOpenMessage={(roomId: string, messageId: string) => { setMainMenu('채팅'); setInitialOpenChatRoomId(roomId); setInitialOpenMessageId(messageId); }}
          onOpenApproval={handleOpenApproval}
          onOpenInventory={(intent: { view?: string | null; approvalId?: string | null } | undefined) => {
            setMainMenu('재고관리');
            setSubView(intent?.view || '현황');
            setInitialInventoryWorkflowApprovalId(intent?.approvalId || null);
          }}
          onOpenBoard={(boardId?: string) => { setMainMenu('게시판'); if (boardId) setInitialBoardView(boardId); }}
          onOpenPost={(boardId: string, postId: string) => { setMainMenu('게시판'); if (boardId) setInitialBoardView(boardId); setInitialOpenPostId(postId); }}
        />

        {loading && (
          <div
            className="absolute inset-0 bg-[var(--toss-card)]/60 z-40 flex items-center justify-center"
            data-testid="main-loading-overlay"
          >
            <div className="w-10 h-10 border-2 border-[var(--accent)] rounded-full border-t-transparent animate-spin" />
          </div>
        )}
        <MainContent
          key={`${mainMenu}-${menuResetVersion}`}
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
          }}
        />
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
