'use client';
import { toast } from '@/lib/toast';
import { getKoreanMonthString } from '@/lib/seoul-time';
import { getMonthBoundaries } from '@/lib/date-utils';
import { useState, useEffect, useCallback, memo, useMemo } from 'react';
// 2026-05-27 회귀 방지: 일부 chunk가 isMobile 변수를 참조하는 stale 컴파일 잔재 — 안전 정의 유지
import { useIsMobile } from '@/app/components/useIsMobile';
import {
  calculateMonthlyAttendance,
  type MonthlyAttendance,
} from './출퇴근기록/attendance-utils';

// 기능 컴포넌트 불러오기
import MyTodoList from './나의할일';
import CommuteRecord from './출퇴근기록';
import MyDocuments from './서류제출';
import MyProfileCard from './프로필카드';
import {
  buildProfileSummary,
  PayrollAndCertificatesHub,
  QuickFavoriteButton,
  TabButton,
} from './마이페이지공통섹션';
import AnnualLeaveUsagePanel from './연차휴가내역';
import HomeTabHeader, { type HomeKpiCard } from './홈탭헤더';
import NotificationInbox from '../알림인박스';
import ContractSignatureModal from '../인사관리서브/계약문서/전자서명모달';
import { supabase } from '@/lib/supabase';
import { isActiveStaff } from '@/lib/active-staff';
import { sendAdminNotifications } from '@/lib/notification-utils';
import { STORAGE_KEYS } from '@/lib/storage-keys';
import { useActionDialog } from '@/app/components/useActionDialog';
import { HR_TAB_KEY, INV_VIEW_KEY, MYPAGE_TAB_KEY } from '@/app/main/navigation-state';
import { performClientLogout } from '@/lib/client-logout';
import { LucideIcon } from '../조직도서브/조직도측면창';
import { canAccessMyPageTab, hasPermission } from '@/lib/access-control';
import {
  FAVORITES_KEY,
  buildMenuEntry,
  buildMypageEntry,
  buildSubMenuEntry,
  canAccessFavoriteEntry,
  getInnerTabPendingKey,
  getInnerTabsFor,
  getPermittedMainMenus,
  getPermittedMypageTabs,
  getPermittedSubMenuBearers,
  getPermittedSubMenuOptions,
  migrateStoredFavorites,
  type FavoriteEntry,
  type MainMenuId,
  type MypageTabId,
} from './즐겨찾기설정';

const MYPAGE_RECORDS_VIEW_KEY = 'erp_mypage_records_view';

type FavoritePickerKind = 'mypage' | 'menu' | 'submenu';

interface MyPageMainProps {
  user?: Record<string, unknown> | null;
  initialMyPageTab?: string | null;
  onConsumeMyPageInitialTab?: () => void;
  onOpenApproval?: (options?: Record<string, unknown>) => void;
  setMainMenu?: (menu: string) => void;
  setSubView?: (view: string | null) => void;
  onOpenChatMessage?: (roomId: string, messageId: string) => void;
  selectedCo?: string | null;
  selectedCompanyId?: string | null;
}

type EmploymentContractRecord = {
  id: string;
  contract_type?: string | null;
  status?: string | null;
  requested_at?: string | null;
  signed_at?: string | null;
  signature_data?: string | null;
  [key: string]: unknown;
};

function parseDate(value: unknown) {
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatCompactDate(value: unknown) {
  const parsed = parseDate(value);
  if (!parsed) return '-';
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}.${month}.${day}`;
}

function getTenureLabel(value: unknown, now = new Date()) {
  const joinedAt = parseDate(value);
  if (!joinedAt) return '입사일 미등록';

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (joinedAt.getTime() > today.getTime()) return '입사 예정';

  let years = today.getFullYear() - joinedAt.getFullYear();
  if (
    today.getMonth() < joinedAt.getMonth() ||
    (today.getMonth() === joinedAt.getMonth() && today.getDate() < joinedAt.getDate())
  ) {
    years -= 1;
  }

  return `입사 ${Math.max(1, years + 1)}년차`;
}

function getUserInitial(value: unknown) {
  return String(value || '박').trim().slice(0, 1) || '박';
}

function MyPageMain({
  user,
  initialMyPageTab,
  onConsumeMyPageInitialTab,
  onOpenApproval,
  setMainMenu,
  setSubView,
  onOpenChatMessage,
}: MyPageMainProps) {
  // 2026-05-27: chunk가 isMobile 변수 참조하는 stale 잔재 — 안전 정의
  // (현재 본문에서 사용 안 해도 컴파일된 코드의 미정의 참조 회귀 방지)
  const isMobile = useIsMobile();
  const { dialog, openConfirm, openPrompt } = useActionDialog();
  const isRetired = !isActiveStaff(user ?? {});
  const [activeTab, setActiveTab] = useState<'profile' | 'records' | 'todo' | 'commute' | 'leave' | 'documents' | 'notifications'>('profile');
  const [recordsView, setRecordsView] = useState<'salary' | 'certificates'>('salary');
  const [favorites, setFavorites] = useState<FavoriteEntry[]>([]);
  const [favoritesHydrated, setFavoritesHydrated] = useState(false);
  const [showFavPicker, setShowFavPicker] = useState(false);
  const [pickerKind, setPickerKind] = useState<FavoritePickerKind>('submenu');
  const [pickerMypageTab, setPickerMypageTab] = useState<MypageTabId | ''>('');
  const [pickerMainMenu, setPickerMainMenu] = useState<MainMenuId | ''>('');
  const [pickerSubView, setPickerSubView] = useState('');
  const [pickerInnerTab, setPickerInnerTab] = useState('');
  const [profileSummary, setProfileSummary] = useState(() => buildProfileSummary(user));
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [showSecret, setShowSecret] = useState(true);

  const [pendingContract, setPendingContract] = useState<EmploymentContractRecord | null>(null);
  const [latestContract, setLatestContract] = useState<EmploymentContractRecord | null>(null);
  const [showSignaturePad, setShowSignaturePad] = useState(false);

  // 이번 달 근태 실 데이터
  const [monthlyAttendance, setMonthlyAttendance] = useState<MonthlyAttendance | null>(null);
  const favoritesKey = useMemo(() => {
    const userId = String(user?.id || user?.auth_user_id || user?.employee_no || user?.name || '').trim();
    return userId ? `${FAVORITES_KEY}:${userId}` : FAVORITES_KEY;
  }, [user?.auth_user_id, user?.employee_no, user?.id, user?.name]);

  // 미서명 계약서 확인
  // JM2: 동일 id/상태이면 setLatestContract/setPendingContract 호출을 생략하여
  // 자식 컴포넌트에 매번 새 객체 참조가 흘러가지 않도록 한다.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const isSameContract = (
      a: EmploymentContractRecord | null,
      b: EmploymentContractRecord | null,
    ): boolean => {
      if (a === b) return true;
      if (!a || !b) return false;
      return (
        String(a.id) === String(b.id) &&
        a.status === b.status &&
        a.signed_at === b.signed_at &&
        a.requested_at === b.requested_at
      );
    };
    const checkPendingContracts = async () => {
      try {
        const [{ data: nextPending }, { data: nextLatest }] = await Promise.all([
          supabase
            .from('employment_contracts')
            .select('*')
            .eq('staff_id', user.id as string)
            .eq('status', '서명대기')
            .order('requested_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('employment_contracts')
            .select('*')
            .eq('staff_id', user.id as string)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);
        if (cancelled) return;

        const nextLatestContract = (nextLatest as EmploymentContractRecord | null) ?? null;
        const nextPendingContract =
          (nextPending as EmploymentContractRecord | null) ??
          (nextLatestContract && !nextLatestContract.signed_at ? nextLatestContract : null);

        setLatestContract((prev) => (isSameContract(prev, nextLatestContract) ? prev : nextLatestContract));

        if (nextPendingContract) {
          setPendingContract((prev) => (isSameContract(prev, nextPendingContract) ? prev : nextPendingContract));
          setShowSignaturePad((prev) => (prev ? prev : true));
        } else {
          setPendingContract((prev) => (prev === null ? prev : null));
          setShowSignaturePad((prev) => (prev === false ? prev : false));
        }
      } catch {
        // JM3: 계약서 조회 실패 시 기존 상태 유지 — 사용자에 노출할 필요 없음.
      }
    };
    void checkPendingContracts();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // 이번 달 근태 실 데이터 fetch (mount 1회, JM2: realtime 없음)
  const fetchMonthlyAttendanceSummary = useCallback(async () => {
    const userId = user?.id;
    if (!userId) return; // JM5: user.id 없으면 skip
    const now = new Date();
    // 이번 달 범위는 KST 기준 (디바이스 타임존과 무관하게 서버 KST 날짜키와 일치)
    const { startDate: firstDay, endDate: lastDay } = getMonthBoundaries(getKoreanMonthString(now));
    try {
      const { data, error } = await supabase
        .from('attendance')
        .select('check_in, check_out, status, date')
        .eq('staff_id', userId as string)
        .gte('date', firstDay)
        .lte('date', lastDay);
      if (error || !data) return; // JM3: 실패 시 silent — 집계 중 유지
      setMonthlyAttendance(calculateMonthlyAttendance(data));
    } catch {
      // silent fallback: 집계 중 표시 유지
    }
  }, [user?.id]);

  useEffect(() => {
    void fetchMonthlyAttendanceSummary();
  }, [fetchMonthlyAttendanceSummary]);

  // JM2/JM3: 인사관리·근태이상 워크센터에서 본인 근태가 보정되면 즉시 재집계.
  //   - 정상 처리 같은 액션이 발생하면 attendance 테이블이 update 되고
  //     'erp-attendance-updated' 이벤트가 broadcast 된다.
  //   - 본인(user.id)에 해당할 때만 refetch (다른 사용자 이벤트는 무시 — 불필요한 호출 방지)
  //   - 안전: 이벤트 detail이 비어 있으면 그냥 refetch (deferred broadcast 호환)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const userId = user?.id ? String(user.id) : '';
    const handleAttendanceUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ staffId?: unknown }>).detail;
      const targetId = detail?.staffId ? String(detail.staffId) : '';
      if (targetId && userId && targetId !== userId) return;
      void fetchMonthlyAttendanceSummary();
    };
    window.addEventListener('erp-attendance-updated', handleAttendanceUpdated as EventListener);
    return () => {
      window.removeEventListener('erp-attendance-updated', handleAttendanceUpdated as EventListener);
    };
  }, [fetchMonthlyAttendanceSummary, user?.id]);

  const handleSignComplete = async (
    signatureDataUrl: string,
    contractText: string,
    receiptSignatureData?: string,
    privacyConsent?: boolean | null
  ) => {
    const currentUserId = typeof user?.id === 'string' ? user.id : null;
    if (!pendingContract || !currentUserId) return;
    try {
      const { error: updateError } = await supabase
        .from('employment_contracts')
        .update({
          status: '서명완료',
          signed_at: new Date().toISOString(),
          signature_data: signatureDataUrl,
          receipt_signature_data: receiptSignatureData || null,
          privacy_consent: privacyConsent === true ? 1 : (privacyConsent === false ? 0 : null)
        })
        .eq('id', pendingContract.id);

      if (updateError) {
        throw new Error(`계약서 상태 업데이트 실패: ${updateError.message}`);
      }

      const { data: checklistRows } = await supabase
        .from('onboarding_checklists')
        .select('id, checklist_type, items, target_date')
        .eq('staff_id', currentUserId);

      const { isChecklistComplete, normalizeChecklistItems, syncChecklistWithContract } = await import('@/lib/hr-checklists');
      const entryChecklistRow = Array.isArray(checklistRows)
        ? checklistRows.find((row) => String(row?.checklist_type ?? '').trim() === '입사') ?? null
        : null;
      const signedAt = new Date().toISOString();
      const syncedItems = syncChecklistWithContract(
        normalizeChecklistItems(entryChecklistRow?.items ?? null, '입사'),
        '입사',
        {
          status: '서명완료',
          requestedAt: (pendingContract.requested_at as string) || null,
          signedAt,
        },
      );
      const { error: checklistError } = await supabase.from('onboarding_checklists').upsert(
        {
          staff_id: currentUserId,
          checklist_type: '입사',
          items: syncedItems,
          target_date: entryChecklistRow?.target_date ?? null,
          completed_at: isChecklistComplete(syncedItems) ? signedAt : null,
        },
        { onConflict: 'staff_id,checklist_type' },
      );

      if (checklistError) {
        throw new Error(`온보딩 체크리스트 업데이트 실패: ${checklistError.message}`);
      }

      // 문서 보관함으로 자동 저장 (PDF는 보관함에서 열 때 생성됨)
      // 서명 이미지·주소·연락처 PII 가 포함되므로 저장 직전 암호화(키 미설정 시 평문 폴백)
      const { encryptContract } = await import('@/lib/contract-crypto');
      const encryptedContractText = await encryptContract(contractText);
      const { error: insertDocError } = await supabase.from('document_repository').insert({
        title: `${user?.name} 근로계약서 (${new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })})`,
        category: '계약서',
        content: encryptedContractText,
        company_name: (user?.company as string) || '전체',
        created_by: currentUserId,
        version: 1
      });

      if (insertDocError) {
        throw new Error(`문서 보관함 저장 실패: ${insertDocError.message}`);
      }

      // HR에게 알림 전송 — [4차 전수조사 admin-05] 존재하지 않는 user_id='system_admin'
      // (FK 위반) 대신 HR 담당 부서 staff에게 fan-out + dedupe하는 공통 헬퍼 사용.
      await sendAdminNotifications([{
        type: 'SUCCESS',
        title: '계약서 서명 완료',
        body: `${user?.name} 님이 근로계약서에 전자서명을 완료했습니다.`,
        dedupeKey: `contract-signed:${pendingContract.id}`,
      }]);

      toast('근로계약서 서명이 성공적으로 완료되었습니다. 마이페이지 > 급여·증명서 또는 문서보관함에서 확인하실 수 있습니다.', 'success');
      window.dispatchEvent(new CustomEvent('erp-contract-signed', { detail: { staffId: user?.id, contractId: pendingContract.id } }));
      setPendingContract(null);
      setLatestContract({
        ...pendingContract,
        status: '서명완료',
        signed_at: signedAt,
        signature_data: signatureDataUrl,
      });
      setShowSignaturePad(false);
    } catch (e) {
      console.error('[마이페이지] 근로계약서 서명 저장 실패:', e);
      toast(e instanceof Error ? e.message : '서명 저장 중 오류가 발생했습니다.', 'error');
    }
  };

  // 초기 탭: 외부 진입값 우선, 그 외에는 이전에 보던 탭을 로컬스토리지에서 복구
  useEffect(() => {
    const persistRecordsView = (view: 'salary' | 'certificates') => {
      if (typeof window === 'undefined') return;
      try {
        window.localStorage.setItem(MYPAGE_RECORDS_VIEW_KEY, view);
      } catch {
        // ignore
      }
    };

    const applyInitialTab = (value: string | null | undefined) => {
      const tab = String(value ?? '').trim();
      if (!tab) return false;

      if (tab === 'salary' || tab === 'records_salary') {
        setActiveTab('records');
        setRecordsView('salary');
        persistRecordsView('salary');
        return true;
      }

      if (tab === 'certificates' || tab === 'records_certificates') {
        setActiveTab('records');
        setRecordsView('certificates');
        persistRecordsView('certificates');
        return true;
      }

      const allowedTabs = ['profile', 'records', 'todo', 'commute', 'leave', 'documents', 'notifications'] as const;
      if ((allowedTabs as readonly string[]).includes(tab)) {
        setActiveTab(tab as typeof allowedTabs[number]);
        return true;
      }

      return false;
    };

    if (applyInitialTab(initialMyPageTab)) {
      onConsumeMyPageInitialTab?.();
      return;
    }
    if (typeof window === 'undefined') return;
    try {
      const saved = window.localStorage.getItem(MYPAGE_TAB_KEY);
      applyInitialTab(saved);
    } catch {
      // ignore
    }
  }, [initialMyPageTab, onConsumeMyPageInitialTab]);

  // 탭 변경 시 현재 탭을 로컬스토리지에 저장하여 새로고침해도 유지
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(MYPAGE_TAB_KEY, activeTab);
    } catch {
      // ignore
    }
  }, [activeTab]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = window.localStorage.getItem(MYPAGE_RECORDS_VIEW_KEY);
      if (saved === 'salary' || saved === 'certificates') {
        setRecordsView(saved);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(MYPAGE_RECORDS_VIEW_KEY, recordsView);
      if (activeTab === 'records') {
        window.localStorage.setItem(MYPAGE_TAB_KEY, 'records');
      }
    } catch {
      // ignore
    }
  }, [activeTab, recordsView]);

  // JM2: user 객체 참조가 매 렌더마다 새로 들어와도 실제 값이 동일하면 재계산 차단.
  // 이전에는 deps가 [user] 였기 때문에 상위에서 user를 새 객체로 내려보낼 때마다
  // setProfileSummary가 호출되어 마이페이지 전체가 끊임없이 리렌더되는 원인이 됨.
  // 프로필 요약에 실제로 필요한 primitive만 deps로 좁혀서 안정화한다.
  const profileSummaryDeps = useMemo(
    () => ({
      id: (user as Record<string, unknown> | undefined)?.id,
      name: (user as Record<string, unknown> | undefined)?.name,
      position: (user as Record<string, unknown> | undefined)?.position,
      department: (user as Record<string, unknown> | undefined)?.department,
      employee_no: (user as Record<string, unknown> | undefined)?.employee_no,
      photo_url: (user as Record<string, unknown> | undefined)?.photo_url,
      avatar_url: (user as Record<string, unknown> | undefined)?.avatar_url,
      profile_photo_updated_at: (user as Record<string, unknown> | undefined)?.profile_photo_updated_at,
    }),
    [
      (user as Record<string, unknown> | undefined)?.id,
      (user as Record<string, unknown> | undefined)?.name,
      (user as Record<string, unknown> | undefined)?.position,
      (user as Record<string, unknown> | undefined)?.department,
      (user as Record<string, unknown> | undefined)?.employee_no,
      (user as Record<string, unknown> | undefined)?.photo_url,
      (user as Record<string, unknown> | undefined)?.avatar_url,
      (user as Record<string, unknown> | undefined)?.profile_photo_updated_at,
    ],
  );
  useEffect(() => {
    setProfileSummary(buildProfileSummary(profileSummaryDeps as Record<string, unknown>));
  }, [profileSummaryDeps]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const syncFromStorage = () => {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEYS.USER);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (!user?.name || parsed?.name === (user.name as string)) {
          setProfileSummary(buildProfileSummary(parsed));
        }
      } catch {
        // ignore
      }
    };

    const handleProfileUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<{ user?: any }>;
      if (customEvent.detail?.user) {
        setProfileSummary(buildProfileSummary(customEvent.detail.user));
        return;
      }
      syncFromStorage();
    };

    syncFromStorage();
    window.addEventListener('erp-profile-updated', handleProfileUpdate as EventListener);
    return () => {
      window.removeEventListener('erp-profile-updated', handleProfileUpdate as EventListener);
    };
  }, [user?.name]);

  // 즐겨찾기 목록 복구 (레거시 문자열 ID + 신규 객체 둘 다 지원)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setFavoritesHydrated(false);
    try {
      const raw = window.localStorage.getItem(favoritesKey) || window.localStorage.getItem(FAVORITES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setFavorites(migrateStoredFavorites(parsed));
      }
    } catch {
      // ignore
    } finally {
      setFavoritesHydrated(true);
    }
  }, [favoritesKey]);

  // 즐겨찾기 저장
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!favoritesHydrated) return;
    try {
      window.localStorage.setItem(favoritesKey, JSON.stringify(favorites));
    } catch {
      // ignore
    }
  }, [favorites, favoritesHydrated, favoritesKey]);

  const applyMainMenu = useCallback((mainMenu: MainMenuId, subView?: string | null, innerTab?: string | null) => {
    // 인사관리/재고관리 서브탭은 별도 localStorage 키로 동기화
    if (mainMenu === '인사관리' && subView) {
      try { window.localStorage.setItem(HR_TAB_KEY, subView); } catch { /* ignore */ }
    } else if (mainMenu === '재고관리' && subView) {
      try { window.localStorage.setItem(INV_VIEW_KEY, subView); } catch { /* ignore */ }
    }
    // 깊은 inner tab — 호스트 컴포넌트가 마운트 시 일회성으로 읽고 지움
    if (innerTab && subView) {
      const pendingKey = getInnerTabPendingKey(mainMenu, subView);
      if (pendingKey) {
        try { window.localStorage.setItem(pendingKey, innerTab); } catch { /* ignore */ }
      }
    }
    setSubView?.(subView ?? null);
    setMainMenu?.(mainMenu);
  }, [setMainMenu, setSubView]);

  const handleFavoriteClick = useCallback((fav: FavoriteEntry) => {
    if (fav.kind === 'mypage') {
      if (fav.tab === 'records_certificates') {
        setActiveTab('records');
        setRecordsView('certificates');
      } else if (fav.tab === 'records_salary') {
        setActiveTab('records');
        setRecordsView('salary');
      } else if (fav.tab === 'notifications') {
        setActiveTab('notifications');
      } else {
        setActiveTab(fav.tab as Exclude<MypageTabId, 'records_certificates' | 'records_salary' | 'notifications'>);
      }
      return;
    }
    if (fav.kind === 'menu') {
      applyMainMenu(fav.mainMenu);
      return;
    }
    applyMainMenu(fav.mainMenu, fav.subView, fav.innerTab);
  }, [applyMainMenu]);

  const handleFavoriteRemove = useCallback((id: string) => {
    setFavorites((prev) => prev.filter((entry) => entry.id !== id));
  }, []);

  const resetPicker = useCallback(() => {
    setPickerKind('submenu');
    setPickerMypageTab('');
    setPickerMainMenu('');
    setPickerSubView('');
    setPickerInnerTab('');
    setShowFavPicker(false);
  }, []);

  const handleAddFavorite = useCallback(() => {
    let next: FavoriteEntry | null = null;
    if (pickerKind === 'mypage' && pickerMypageTab) {
      next = buildMypageEntry(pickerMypageTab);
    } else if (pickerKind === 'menu' && pickerMainMenu) {
      next = buildMenuEntry(pickerMainMenu);
    } else if (pickerKind === 'submenu' && pickerMainMenu && pickerSubView) {
      next = buildSubMenuEntry(pickerMainMenu, pickerSubView, pickerInnerTab || undefined);
    }
    if (!next) return;
    setFavorites((prev) => (prev.some((entry) => entry.id === next!.id) ? prev : [...prev, next!]));
    resetPicker();
  }, [pickerKind, pickerMypageTab, pickerMainMenu, pickerSubView, pickerInnerTab, resetPicker]);

  // 권한 기반 옵션 — user에 따라 동적 필터링
  const permittedMypageTabs = useMemo(() => getPermittedMypageTabs(user as any), [user]);
  const permittedMainMenus = useMemo(() => getPermittedMainMenus(user as any), [user]);
  const permittedSubMenuBearers = useMemo(() => getPermittedSubMenuBearers(user as any), [user]);
  const pickerSubViewOptions = useMemo(
    () => (pickerMainMenu ? getPermittedSubMenuOptions(user as any, pickerMainMenu) : []),
    [pickerMainMenu, user],
  );
  const pickerInnerTabOptions = useMemo(
    () => (pickerMainMenu && pickerSubView ? getInnerTabsFor(pickerMainMenu, pickerSubView) : []),
    [pickerMainMenu, pickerSubView],
  );

  const canAddFavorite = useMemo(() => {
    if (pickerKind === 'mypage') return Boolean(pickerMypageTab);
    if (pickerKind === 'menu') return Boolean(pickerMainMenu);
    return Boolean(pickerMainMenu && pickerSubView);
  }, [pickerKind, pickerMypageTab, pickerMainMenu, pickerSubView]);

  // 권한 기반 즐겨찾기 표시 — 권한이 회수된 항목은 자동 숨김 (저장된 데이터는 유지)
  const visibleFavorites = useMemo(
    () => favorites.filter((entry) => canAccessFavoriteEntry(user as any, entry)),
    [favorites, user],
  );

  const verifyProfilePassword = async () => {
    try {
      const input = await openPrompt({
        title: '본인 확인',
        description: '현재 비밀번호를 입력해 주세요.',
        confirmText: '확인',
        cancelText: '취소',
        inputType: 'password',
        required: true,
        placeholder: '현재 비밀번호',
      });
      if (!input) return false;

      const response = await fetch('/api/auth/verify-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: input,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        toast(payload?.error ? `본인 확인 중 오류가 발생했습니다.\n${payload.error}` : '본인 확인 중 오류가 발생했습니다.', 'error');
        return false;
      }

      if (!payload?.verified) {
        toast('비밀번호가 일치하지 않습니다.');
        return false;
      }

      return true;
    } catch {
      toast('본인 확인 중 오류가 발생했습니다.', 'error');
      return false;
    }
  };

  const handleToggleEdit = async () => {
    if (isEditingProfile) {
      setIsEditingProfile(false);
      return;
    }
    // mypage_수정 권한 체크 (권한 없으면 편집 진입 차단)
    if (!hasPermission(user, 'mypage_수정')) {
      toast('정보 수정 권한이 없습니다. 관리자에게 문의하세요.', 'warning');
      return;
    }

    const verified = await verifyProfilePassword();
    if (verified) {
      setIsEditingProfile(true);
    }
  };

  const handleChangePassword = async () => {
    const currentPassword = await openPrompt({
      title: '비밀번호 변경',
      description: '현재 비밀번호를 먼저 입력해 주세요.',
      confirmText: '다음',
      cancelText: '취소',
      inputType: 'password',
      required: true,
      placeholder: '현재 비밀번호',
    });
    if (!currentPassword) return;

    const nextPassword = await openPrompt({
      title: '새 비밀번호',
      description: '앞으로 로그인할 때 사용할 새 비밀번호를 입력해 주세요.',
      confirmText: '다음',
      cancelText: '취소',
      inputType: 'password',
      required: true,
      placeholder: '새 비밀번호',
      helperText: '4자 이상 입력해 주세요.',
    });
    if (!nextPassword) return;
    if (nextPassword.trim().length < 4) {
      toast('새 비밀번호는 4자 이상 입력해 주세요.', 'warning');
      return;
    }

    const nextPasswordConfirm = await openPrompt({
      title: '새 비밀번호 확인',
      description: '새 비밀번호를 한 번 더 입력해 주세요.',
      confirmText: '변경',
      cancelText: '취소',
      inputType: 'password',
      required: true,
      placeholder: '새 비밀번호 확인',
    });
    if (!nextPasswordConfirm) return;

    if (nextPassword !== nextPasswordConfirm) {
      toast('새 비밀번호가 서로 일치하지 않습니다.', 'warning');
      return;
    }

    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword: nextPassword }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        toast(payload?.error || '비밀번호 변경에 실패했습니다.', 'error');
        return;
      }
      toast('비밀번호가 변경되었습니다. 다음 로그인부터 새 비밀번호를 사용해 주세요.', 'success');
    } catch {
      toast('비밀번호 변경 중 오류가 발생했습니다.', 'error');
    }
  };

  const handleLogout = async () => {
    const shouldLogout = await openConfirm({
      title: '로그아웃',
      description: '현재 계정에서 로그아웃합니다. 계속할까요?',
      confirmText: '로그아웃',
      cancelText: '취소',
      tone: 'danger',
    });
    if (!shouldLogout) return;

    await performClientLogout();
    window.location.replace('/');
  };

  if (!user) return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
      <div className="h-14 w-14 rounded-full skeleton" />
      <div className="w-40 skeleton-text" />
      <div className="w-56 skeleton-sm" />
    </div>
  );

  const joinedAt = user.joined_at || user.join_date || user.hire_date || user.created_at;
  const joinedAtLabel = formatCompactDate(joinedAt);
  const tenureLabel = getTenureLabel(joinedAt);
  const initial = getUserInitial(profileSummary.name || user.name);
  const leaveRemaining =
    Number(user.annual_leave_remaining) ||
    Math.max(0, Number(user.annual_leave_total || 15) - Number(user.annual_leave_used || 0)) ||
    8.5;
  const pendingApprovalCount = Math.max(0, Number(user.pending_approval_count ?? 0));
  // 이번 달 근태: 실 데이터(monthlyAttendance) 우선, 없으면 '집계 중'.
  // KPI는 분수 (present / total) 형식 — value.main = present, value.fraction = "/total"
  const attendanceSub = !monthlyAttendance
    ? '집계 중'
    : monthlyAttendance.absent > 0
      ? `결근 ${monthlyAttendance.absent}일`
      : monthlyAttendance.late > 0
        ? `지각 ${monthlyAttendance.late}회`
        : monthlyAttendance.present > 0
          ? '개근'
          : '집계 중';

  // 지시서 handoff/01-mypage-내정보 §3-2 — KPI 5장 단일 행.
  const homeKpis: HomeKpiCard[] = [
    {
      key: 'attendance',
      label: '이번 달 근태',
      sub: attendanceSub,
      icon: 'Clock',
      tone: 'neutral',
      value: monthlyAttendance
        ? {
            main: String(monthlyAttendance.present),
            fraction: `/${monthlyAttendance.total}`,
          }
        : null,
      onClick: isRetired ? undefined : () => setActiveTab('commute'),
    },
    {
      key: 'leave',
      label: '연차휴가',
      sub: '사용 내역 확인',
      icon: 'CalendarDays',
      tone: 'success',
      value: { main: String(leaveRemaining), unit: '일' },
      onClick: isRetired ? undefined : () => setActiveTab('leave'),
    },
    {
      key: 'salary',
      label: '급여명세서',
      sub: '월별 명세서 확인',
      icon: 'Receipt',
      tone: 'neutral',
      value: null,
      onClick: () => {
        setRecordsView('salary');
        setActiveTab('records');
      },
    },
    {
      key: 'certificates',
      label: '증명서',
      sub: '발급 문서 확인',
      icon: 'FileText',
      tone: 'neutral',
      value: null,
      onClick: () => {
        setRecordsView('certificates');
        setActiveTab('records');
      },
    },
    {
      key: 'approvals',
      label: '미결재',
      sub: '결재 대기중',
      icon: 'FileWarning',
      tone: 'warn',
      value: { main: String(pendingApprovalCount), unit: '건' },
    },
  ];

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-x-hidden app-page">
      {dialog}

      {/* 전자 서명 전용 신규 모달 */}
      {pendingContract && showSignaturePad && (
        <ContractSignatureModal
          contract={pendingContract}
          user={user}
          onClose={() => setShowSignaturePad(false)}
          onSuccess={handleSignComplete}
        />
      )}

      <section className="shrink-0 border-b border-[var(--border)] bg-[var(--card)] px-5 py-2.5 md:px-6">
        <div className="flex min-w-0 flex-col gap-2">
          <nav className="no-scrollbar flex min-w-0 items-center gap-1 overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--page-bg)] p-1">
            <TabButton
              isActive={activeTab === 'profile'}
              onClick={() => setActiveTab('profile')}
              label="내 정보"
              icon="User"
            />
            {!isRetired && (
              <TabButton
                isActive={activeTab === 'commute'}
                onClick={() => setActiveTab('commute')}
                label="출퇴근"
                icon="Clock"
              />
            )}
            {!isRetired && (
              <TabButton
                isActive={activeTab === 'todo'}
                onClick={() => setActiveTab('todo')}
                label="할일"
                icon="CheckSquare"
              />
            )}
            {!isRetired && (
              <TabButton
                isActive={activeTab === 'documents'}
                onClick={() => setActiveTab('documents')}
                label="서류제출"
                icon="Upload"
              />
            )}
            {(canAccessMyPageTab(user, 'salary') || canAccessMyPageTab(user, 'certificates')) && (
              <TabButton
                isActive={activeTab === 'records'}
                onClick={() => setActiveTab('records')}
                label="급여·증명서"
                icon="FileCheck"
              />
            )}
            <TabButton
              isActive={activeTab === 'notifications'}
              onClick={() => setActiveTab('notifications')}
              label="알림"
              icon="Bell"
            />
          </nav>

          <div className="no-scrollbar flex min-w-0 items-center gap-2 overflow-x-auto">
            <button
              type="button"
              onClick={() => setShowFavPicker((v) => !v)}
              data-testid="mypage-favorite-picker-toggle"
              aria-expanded={showFavPicker}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--card)] px-3 text-[11px] font-bold text-[var(--toss-gray-4)] transition-all hover:border-[var(--accent)]/40 hover:bg-[var(--accent-light)] hover:text-[var(--accent)]"
            >
              <LucideIcon name="Star" size={14} />
              즐겨찾기 추가
            </button>
            {visibleFavorites.map((entry) => {
              const isActive =
                entry.kind === 'mypage' && (
                  (entry.tab === 'profile' && activeTab === 'profile') ||
                  (entry.tab === 'commute' && activeTab === 'commute') ||
                  (entry.tab === 'todo' && activeTab === 'todo') ||
                  (entry.tab === 'leave' && activeTab === 'leave') ||
                  (entry.tab === 'records' && activeTab === 'records') ||
                  (entry.tab === 'records_certificates' && activeTab === 'records' && recordsView === 'certificates') ||
                  (entry.tab === 'records_salary' && activeTab === 'records' && recordsView === 'salary') ||
                  (entry.tab === 'documents' && activeTab === 'documents')
                );
              return (
                <QuickFavoriteButton
                  key={entry.id}
                  label={entry.label}
                  icon={entry.icon}
                  onClick={() => handleFavoriteClick(entry)}
                  active={Boolean(isActive)}
                  onRemove={() => handleFavoriteRemove(entry.id)}
                />
              );
            })}
          </div>
          {showFavPicker && (
            <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] p-2">
              <div className="flex flex-wrap gap-1.5">
                {([
                  { id: 'submenu', label: '메뉴 · 세부기능' },
                  { id: 'menu', label: '메뉴 바로가기' },
                  { id: 'mypage', label: '마이페이지 탭' },
                ] as { id: FavoritePickerKind; label: string }[]).map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      setPickerKind(option.id);
                      setPickerMypageTab('');
                      setPickerMainMenu('');
                      setPickerSubView('');
                      setPickerInnerTab('');
                    }}
                    className={`h-8 rounded-[var(--radius-md)] px-3 text-[11px] font-bold transition ${
                      pickerKind === option.id
                        ? 'bg-[var(--accent)] text-white'
                        : 'bg-[var(--card)] text-[var(--toss-gray-4)] hover:bg-[var(--muted)]'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap">
                {pickerKind === 'mypage' && (
                  <select
                    value={pickerMypageTab}
                    onChange={(e) => setPickerMypageTab(e.target.value as MypageTabId | '')}
                    data-testid="mypage-favorite-select-tab"
                    className="h-9 min-w-0 flex-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 text-[12px] font-semibold text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                  >
                    <option value="">마이페이지 탭 선택</option>
                    {permittedMypageTabs.map((o) => (
                      <option key={o.tab} value={o.tab}>{o.label}</option>
                    ))}
                  </select>
                )}
                {pickerKind === 'menu' && (
                  <select
                    value={pickerMainMenu}
                    onChange={(e) => setPickerMainMenu(e.target.value as MainMenuId | '')}
                    data-testid="mypage-favorite-select-menu"
                    className="h-9 min-w-0 flex-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 text-[12px] font-semibold text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                  >
                    <option value="">메인 메뉴 선택</option>
                    {permittedMainMenus.map((o) => (
                      <option key={o.mainMenu} value={o.mainMenu}>{o.label}</option>
                    ))}
                  </select>
                )}
                {pickerKind === 'submenu' && (
                  <>
                    <select
                      value={pickerMainMenu}
                      onChange={(e) => {
                        setPickerMainMenu(e.target.value as MainMenuId | '');
                        setPickerSubView('');
                        setPickerInnerTab('');
                      }}
                      data-testid="mypage-favorite-select-mainmenu"
                      className="h-9 min-w-0 flex-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 text-[12px] font-semibold text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                    >
                      <option value="">메뉴 선택</option>
                      {permittedSubMenuBearers.map((id) => (
                        <option key={id} value={id}>{id}</option>
                      ))}
                    </select>
                    <select
                      value={pickerSubView}
                      onChange={(e) => {
                        setPickerSubView(e.target.value);
                        setPickerInnerTab('');
                      }}
                      disabled={!pickerMainMenu}
                      data-testid="mypage-favorite-select-subview"
                      className="h-9 min-w-0 flex-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 text-[12px] font-semibold text-[var(--foreground)] outline-none focus:border-[var(--accent)] disabled:opacity-50"
                    >
                      <option value="">세부기능 선택</option>
                      {pickerSubViewOptions.map((o) => (
                        <option key={o.subView} value={o.subView}>{o.label}</option>
                      ))}
                    </select>
                    {pickerInnerTabOptions.length > 0 && (
                      <select
                        value={pickerInnerTab}
                        onChange={(e) => setPickerInnerTab(e.target.value)}
                        data-testid="mypage-favorite-select-innertab"
                        className="h-9 min-w-0 flex-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 text-[12px] font-semibold text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                      >
                        <option value="">상세 탭 (선택)</option>
                        {pickerInnerTabOptions.map((o) => (
                          <option key={o.id} value={o.id}>{o.label}</option>
                        ))}
                      </select>
                    )}
                  </>
                )}
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={handleAddFavorite}
                    disabled={!canAddFavorite}
                    data-testid="mypage-favorite-add"
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--accent)] px-3 text-[12px] font-bold text-white transition-all hover:opacity-95 disabled:cursor-not-allowed disabled:bg-[var(--toss-gray-2)]"
                  >
                    <LucideIcon name="Check" size={14} />
                    추가
                  </button>
                  <button
                    type="button"
                    onClick={resetPicker}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-[var(--toss-gray-4)] transition-all hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                    aria-label="즐겨찾기 선택 닫기"
                  >
                    <LucideIcon name="X" size={14} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 메인 콘텐츠 영역 */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-[var(--page-bg)] px-5 py-5 transition-all duration-300 md:px-6">
          {activeTab === 'profile' && (
            <div data-testid="mypage-profile-tab" className="animate-premium-fade flex min-h-full flex-col gap-4 pb-4">
              <HomeTabHeader
                name={profileSummary.name || String(user.name || '사용자')}
                positionAndDept={`${profileSummary.position || '직책 정보 없음'} · ${profileSummary.department || '소속 정보 없음'}`}
                employeeNo={profileSummary.employeeNo || String(user.employee_no || '00123')}
                joinedAtLabel={joinedAtLabel}
                tenureLabel={tenureLabel}
                isRetired={isRetired}
                initial={initial}
                avatarUrl={profileSummary.avatarUrl}
                kpis={homeKpis}
              />

              <MyProfileCard
                user={user}
                onOpenApproval={onOpenApproval}
                hideHeader
                hideActionBar
                showSecret={showSecret}
                setShowSecret={setShowSecret}
                isEditing={isEditingProfile}
                setIsEditing={setIsEditingProfile}
              />

              {isEditingProfile && (
                <section data-testid="mypage-profile-edit-panel" className="rounded-[var(--radius-lg)] border border-[var(--accent)]/20 bg-[var(--card)] p-4 shadow-sm animate-premium-fade">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--toss-gray-3)]">정보 수정</p>
                      <h3 className="mt-1 text-[15px] font-bold text-[var(--foreground)]">계정 보안 설정</h3>
                    </div>
                    <button
                      type="button"
                      onClick={handleChangePassword}
                      data-testid="mypage-change-password-in-edit"
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--accent)] px-4 text-[12px] font-bold text-white shadow-sm transition-all hover:opacity-95"
                    >
                      <LucideIcon name="LockKeyhole" size={15} />
                      비밀번호 변경
                    </button>
                  </div>
                </section>
              )}

              <div className="mt-auto flex flex-col gap-2 border-t border-[var(--border)] pt-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={handleLogout}
                  data-testid="mypage-logout-button"
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-4 text-[12px] font-bold text-[var(--toss-gray-4)] shadow-sm transition-all hover:border-[var(--danger)]/30 hover:bg-[var(--danger-light)] hover:text-[var(--danger)]"
                >
                  <LucideIcon name="LogOut" size={15} />
                  로그아웃
                </button>
                {hasPermission(user, 'mypage_수정') && (
                <button
                  type="button"
                  onClick={handleToggleEdit}
                  data-testid="mypage-profile-edit-toggle"
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-4 text-[12px] font-bold text-[var(--foreground)] shadow-sm transition-all hover:border-[var(--accent)]/40 hover:bg-[var(--accent-light)]"
                >
                  <LucideIcon name="SquarePen" size={15} />
                  {isEditingProfile ? '수정 취소' : '정보 수정'}
                </button>
                )}
              </div>
            </div>
          )}
          {activeTab === 'commute' && (
            <div data-testid="mypage-commute-tab" className="animate-premium-fade pb-3">
              <CommuteRecord
                user={user}
                onRequestCorrection={(log: any) =>
                onOpenApproval?.({
                  type: '출결정정',
                  viewMode: '작성하기',
                  dates: [log.date || log.work_date].filter(Boolean),
                })
              }
              />
            </div>
          )}
          {activeTab === 'todo' && <div data-testid="mypage-todo-tab" className="animate-premium-fade pb-3"><MyTodoList user={user} onChatNavigate={onOpenChatMessage} /></div>}
          {activeTab === 'leave' && <div data-testid="mypage-leave-tab" className="animate-premium-fade pb-3"><AnnualLeaveUsagePanel user={user} onBack={() => setActiveTab('profile')} /></div>}
          {activeTab === 'records' && (
            <div data-testid="mypage-records-tab" className="animate-premium-fade pb-3">
              <PayrollAndCertificatesHub
                user={user}
                activeView={recordsView}
                onBack={() => setActiveTab('profile')}
                onChangeView={setRecordsView}
              />
            </div>
          )}
          {activeTab === 'documents' && (
            <div data-testid="mypage-documents-tab" className="animate-premium-fade pb-3">
              <MyDocuments
                user={user}
                latestContract={latestContract}
                pendingContract={pendingContract}
                onOpenContractSignature={(contract: EmploymentContractRecord) => {
                  setPendingContract(contract);
                  setShowSignaturePad(true);
                }}
              />
            </div>
          )}
          {activeTab === 'notifications' && <div data-testid="mypage-notifications-tab" className="animate-premium-fade pb-3"><NotificationInbox user={user} onRefresh={() => { }} onOpenMessage={onOpenChatMessage} onOpenChatRoom={onOpenChatMessage ? (roomId: string) => onOpenChatMessage(roomId, '') : undefined} onOpenApproval={onOpenApproval} setMainMenu={setMainMenu} /></div>}
      </div>

    </div>
  );
}

export default memo(MyPageMain);
