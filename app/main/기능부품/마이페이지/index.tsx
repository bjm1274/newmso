'use client';
import { toast } from '@/lib/toast';
import { useState, useEffect, memo, useMemo } from 'react';

// 기능 컴포넌트 불러오기
import MyTodoList from './나의할일';
import CommuteRecord from './출퇴근기록/index';
import MyDocuments from './서류제출';
import {
  buildProfileSummary,
  PayrollAndCertificatesHub,
  QuickFavoriteButton,
  TabButton,
} from './마이페이지공통섹션';
import AnnualLeaveUsagePanel from './연차휴가내역';
import NotificationInbox from '../알림인박스/index';
import ContractSignatureModal from '../인사관리서브/계약문서/전자서명모달';
import { supabase } from '@/lib/supabase';
import { isActiveStaff } from '@/lib/active-staff';
import { STORAGE_KEYS } from '@/lib/storage-keys';
import { useActionDialog } from '@/app/components/useActionDialog';
import { HR_TAB_KEY, INV_VIEW_KEY, MYPAGE_TAB_KEY } from '@/app/main/navigation-state';
import { persistSupabaseAccessToken } from '@/lib/supabase-bridge';
import { LucideIcon } from '../조직도서브/조직도측면창';

const MYPAGE_RECORDS_VIEW_KEY = 'erp_mypage_records_view';
const FAVORITES_KEY = 'erp_mypage_favorites';

type FavoriteId =
  | 'mypage_profile'
  | 'mypage_commute'
  | 'mypage_todo'
  | 'mypage_leave'
  | 'mypage_records'
  | 'mypage_certificates'
  | 'mypage_salary'
  | 'mypage_documents'
  | 'hr_payroll'
  | 'inv_purchase'
  | 'menu_home'
  | 'menu_org'
  | 'menu_extra'
  | 'menu_chat'
  | 'menu_board'
  | 'menu_approval'
  | 'menu_hr'
  | 'menu_inventory'
  | 'menu_admin';

const FAVORITE_OPTIONS: { id: FavoriteId; label: string; icon: string }[] = [
  { id: 'mypage_profile', label: '내 정보', icon: 'User' },
  { id: 'mypage_commute', label: '출퇴근', icon: 'Clock' },
  { id: 'mypage_todo', label: '할일', icon: 'CheckSquare' },
  { id: 'mypage_leave', label: '연차휴가', icon: 'CalendarDays' },
  { id: 'mypage_records', label: '급여·증명서', icon: 'Receipt' },
  { id: 'mypage_documents', label: '서류제출', icon: 'Upload' },
  { id: 'hr_payroll', label: '인사관리 · 급여', icon: 'Users' },
  { id: 'inv_purchase', label: '재고관리 · 발주', icon: 'Package' },
  // 전체 메뉴 바로가기
  { id: 'menu_home', label: '메인 · 내 정보', icon: 'User' },
  { id: 'menu_org', label: '조직도', icon: 'Building2' },
  { id: 'menu_extra', label: '추가기능', icon: 'Plus' },
  { id: 'menu_chat', label: '채팅', icon: 'MessageSquare' },
  { id: 'menu_board', label: '게시판', icon: 'ClipboardList' },
  { id: 'menu_approval', label: '전자결재', icon: 'FileCheck2' },
  { id: 'menu_hr', label: '인사관리 (전체)', icon: 'Users' },
  { id: 'menu_inventory', label: '재고관리 (전체)', icon: 'Package' },
  { id: 'menu_admin', label: '관리자', icon: 'Settings' },
];

const LEGACY_FAVORITE_MAP: Partial<Record<FavoriteId, FavoriteId>> = {
  mypage_certificates: 'mypage_records',
  mypage_salary: 'mypage_records',
};

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
  const { dialog, openConfirm, openPrompt } = useActionDialog();
  const isRetired = !isActiveStaff(user ?? {});
  const [activeTab, setActiveTab] = useState<'profile' | 'records' | 'todo' | 'commute' | 'leave' | 'documents' | 'notifications'>('profile');
  const [recordsView, setRecordsView] = useState<'salary' | 'certificates'>('salary');
  const [favorites, setFavorites] = useState<FavoriteId[]>([]);
  const [favoritesHydrated, setFavoritesHydrated] = useState(false);
  const [showFavPicker, setShowFavPicker] = useState(false);
  const [pendingFav, setPendingFav] = useState<FavoriteId | ''>('');
  const [profileSummary, setProfileSummary] = useState(() => buildProfileSummary(user));
  const [isEditingProfile, setIsEditingProfile] = useState(false);

  const [pendingContract, setPendingContract] = useState<EmploymentContractRecord | null>(null);
  const [latestContract, setLatestContract] = useState<EmploymentContractRecord | null>(null);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const favoritesKey = useMemo(() => {
    const userId = String(user?.id || user?.auth_user_id || user?.employee_no || user?.name || '').trim();
    return userId ? `${FAVORITES_KEY}:${userId}` : FAVORITES_KEY;
  }, [user?.auth_user_id, user?.employee_no, user?.id, user?.name]);

  // 미서명 계약서 확인
  useEffect(() => {
    if (!user?.id) return;
    const checkPendingContracts = async () => {
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

      const nextLatestContract = (nextLatest as EmploymentContractRecord | null) ?? null;
      const nextPendingContract =
        (nextPending as EmploymentContractRecord | null) ??
        (nextLatestContract && !nextLatestContract.signed_at ? nextLatestContract : null);

      setLatestContract(nextLatestContract);

      if (nextPendingContract) {
        setPendingContract(nextPendingContract);
        setShowSignaturePad(true);
      } else {
        setPendingContract(null);
        setShowSignaturePad(false);
      }
    };
    void checkPendingContracts();
  }, [user?.id]);

  const handleSignComplete = async (signatureDataUrl: string, contractText: string) => {
    const currentUserId = typeof user?.id === 'string' ? user.id : null;
    if (!pendingContract || !currentUserId) return;
    try {
      await supabase
        .from('employment_contracts')
        .update({
          status: '서명완료',
          signed_at: new Date().toISOString(),
          signature_data: signatureDataUrl
        })
        .eq('id', pendingContract.id);

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
      await supabase.from('onboarding_checklists').upsert(
        {
          staff_id: currentUserId,
          checklist_type: '입사',
          items: syncedItems,
          target_date: entryChecklistRow?.target_date ?? null,
          completed_at: isChecklistComplete(syncedItems) ? signedAt : null,
        },
        { onConflict: 'staff_id,checklist_type' },
      );

      // 문서 보관함으로 자동 저장 (PDF는 보관함에서 열 때 생성됨)
      await supabase.from('document_repository').insert({
        title: `${user?.name} 근로계약서 (${new Date().toLocaleDateString()})`,
        category: '계약서',
        content: contractText,
        company_name: (user?.company as string) || '전체',
        created_by: currentUserId,
        version: 1
      });

      // HR에게 알림 전송
      await supabase.from('notifications').insert({
        user_id: 'system_admin',
        title: '계약서 서명 완료',
        message: `${user?.name} 님이 근로계약서에 전자서명을 완료했습니다.`,
        type: 'SUCCESS',
        read_at: null
      });

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
      toast('서명 저장 중 오류가 발생했습니다.', 'error');
    }
  };

  // 초기 탭: 알림 탭 우선, 그 외에는 이전에 보던 탭을 로컬스토리지에서 복구
  useEffect(() => {
    if (initialMyPageTab === 'notifications') {
      setActiveTab('notifications');
      onConsumeMyPageInitialTab?.();
      return;
    }
    if (typeof window === 'undefined') return;
    try {
      const saved = window.localStorage.getItem(MYPAGE_TAB_KEY) as any;
      const allowed = ['profile', 'records', 'salary', 'todo', 'commute', 'leave', 'certificates', 'documents', 'notifications'];
      if (saved && allowed.includes(saved)) {
        if (saved === 'salary' || saved === 'certificates') {
          setActiveTab('records');
          setRecordsView(saved);
          window.localStorage.setItem(MYPAGE_RECORDS_VIEW_KEY, saved);
        } else {
          setActiveTab(saved);
        }
      }
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
      const saved = window.localStorage.getItem(MYPAGE_RECORDS_VIEW_KEY) as any;
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

  useEffect(() => {
    setProfileSummary(buildProfileSummary(user));
  }, [user]);

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

  // 즐겨찾기 목록 복구
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setFavoritesHydrated(false);
    try {
      const raw = window.localStorage.getItem(favoritesKey) || window.localStorage.getItem(FAVORITES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const validIds = FAVORITE_OPTIONS.map(o => o.id);
          const normalized = parsed
            .map((id: FavoriteId) => LEGACY_FAVORITE_MAP[id] || id)
            .filter((id: FavoriteId, index: number, array: FavoriteId[]) => array.indexOf(id) === index)
            .filter((id: FavoriteId) => validIds.includes(id));
          setFavorites(normalized);
        }
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

  const handleFavoriteClick = (fav: FavoriteId) => {
    if (fav === 'mypage_profile') setActiveTab('profile');
    else if (fav === 'mypage_commute') setActiveTab('commute');
    else if (fav === 'mypage_todo') setActiveTab('todo');
    else if (fav === 'mypage_leave') setActiveTab('leave');
    else if (fav === 'mypage_records') {
      setActiveTab('records');
    }
    else if (fav === 'mypage_certificates') {
      setActiveTab('records');
      setRecordsView('certificates');
    } else if (fav === 'mypage_salary') {
      setActiveTab('records');
      setRecordsView('salary');
    }
    else if (fav === 'mypage_documents') setActiveTab('documents');
    else if (fav === 'hr_payroll') {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(HR_TAB_KEY, '급여');
      }
      setSubView?.('급여');
      setMainMenu?.('인사관리');
    } else if (fav === 'inv_purchase') {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(INV_VIEW_KEY, '발주');
      }
      setSubView?.('발주');
      setMainMenu?.('재고관리');
    } else if (fav === 'menu_home') {
      setMainMenu?.('내정보');
    } else if (fav === 'menu_org') {
      setMainMenu?.('조직도');
    } else if (fav === 'menu_extra') {
      setMainMenu?.('추가기능');
    } else if (fav === 'menu_chat') {
      setMainMenu?.('채팅');
    } else if (fav === 'menu_board') {
      setSubView?.('공지사항');
      setMainMenu?.('게시판');
    } else if (fav === 'menu_approval') {
      setSubView?.('기안함');
      setMainMenu?.('전자결재');
    } else if (fav === 'menu_hr') {
      setSubView?.('구성원');
      setMainMenu?.('인사관리');
    } else if (fav === 'menu_inventory') {
      setSubView?.('현황');
      setMainMenu?.('재고관리');
    } else if (fav === 'menu_admin') {
      setMainMenu?.('관리자');
    }
  };

  const handleFavoriteRemove = (id: FavoriteId) => {
    setFavorites((prev) => prev.filter(f => f !== id));
  };

  const handleAddFavorite = () => {
    if (!pendingFav) return;
    if (!favorites.includes(pendingFav)) {
      setFavorites((prev) => [...prev, pendingFav]);
    }
    setPendingFav('');
    setShowFavPicker(false);
  };

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
          userId: profileSummary.id || user?.id,
          name: profileSummary.name || user?.name,
          employeeNo: profileSummary.employeeNo || user?.employee_no,
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

    try {
      await fetch('/api/auth/session', { method: 'DELETE' });
    } catch {
      // ignore
    }

    try {
      localStorage.removeItem(STORAGE_KEYS.USER);
      localStorage.removeItem(STORAGE_KEYS.LOGIN_AT);
      persistSupabaseAccessToken(null);
      void supabase.realtime.setAuth(null);
    } catch {
      // ignore
    }

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
  const attendanceTotal = Number(user.current_month_work_days ?? user.attendance_total ?? 7);
  const attendancePresent = Number(user.current_month_present_days ?? user.attendance_present ?? 1);
  const attendanceLate = Number(user.current_month_late_count ?? user.attendance_late ?? 0);
  const attendanceAbsent = Number(user.current_month_absent_count ?? user.attendance_absent ?? 0);
  const attendanceValue = attendanceTotal > 0 ? `${attendancePresent}/${attendanceTotal}` : '—';
  const attendanceNote =
    attendanceTotal <= 0
      ? '집계 중'
      : attendanceAbsent > 0
        ? `결근 ${attendanceAbsent}일`
        : attendanceLate > 0
          ? `지각 ${attendanceLate}회`
          : '개근';

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

      <header className="flex min-h-[72px] shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--card)] px-5 md:px-6">
        <div className="min-w-0">
          <h1 className="text-[15px] font-bold text-[var(--foreground)]">내 정보</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={handleLogout}
            data-testid="mypage-logout-button"
            className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 text-[12px] font-bold text-[var(--toss-gray-4)] shadow-sm transition-all hover:border-[var(--danger)]/30 hover:bg-[var(--danger-light)] hover:text-[var(--danger)]"
          >
            <LucideIcon name="LogOut" size={15} />
            로그아웃
          </button>
          <button
            type="button"
            onClick={handleToggleEdit}
            data-testid="mypage-profile-edit-toggle"
            className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 text-[12px] font-bold text-[var(--foreground)] shadow-sm transition-all hover:border-[var(--accent)]/40 hover:bg-[var(--accent-light)]"
          >
            <LucideIcon name="SquarePen" size={15} />
            {isEditingProfile ? '수정 취소' : '정보 수정'}
          </button>
        </div>
      </header>

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
                isActive={activeTab === 'leave'}
                onClick={() => setActiveTab('leave')}
                label="연차휴가"
                icon="CalendarDays"
              />
            )}
            <TabButton
              isActive={activeTab === 'records'}
              onClick={() => { setActiveTab('records'); }}
              label="급여·증명서"
              icon="Receipt"
              ariaLabel="급여·증명서"
            />
            {!isRetired && (
              <TabButton
                isActive={activeTab === 'documents'}
                onClick={() => setActiveTab('documents')}
                label="서류제출"
                icon="Upload"
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
            {favorites.map((id) => {
              const opt = FAVORITE_OPTIONS.find(o => o.id === id);
              if (!opt) return null;
              const isActive =
                (id === 'mypage_profile' && activeTab === 'profile') ||
                (id === 'mypage_commute' && activeTab === 'commute') ||
                (id === 'mypage_todo' && activeTab === 'todo') ||
                (id === 'mypage_leave' && activeTab === 'leave') ||
                (id === 'mypage_records' && activeTab === 'records') ||
                (id === 'mypage_certificates' && activeTab === 'records' && recordsView === 'certificates') ||
                (id === 'mypage_salary' && activeTab === 'records' && recordsView === 'salary') ||
                (id === 'mypage_documents' && activeTab === 'documents');
              return (
                <QuickFavoriteButton
                  key={id}
                  label={opt.label}
                  icon={opt.icon}
                  onClick={() => handleFavoriteClick(id)}
                  active={isActive}
                  onRemove={() => handleFavoriteRemove(id)}
                />
              );
            })}
          </div>
          {showFavPicker && (
            <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] p-2 sm:flex-row sm:items-center">
              <select
                value={pendingFav}
                onChange={(e) => setPendingFav(e.target.value as FavoriteId | '')}
                data-testid="mypage-favorite-select"
                className="h-9 min-w-0 flex-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 text-[12px] font-semibold text-[var(--foreground)] outline-none transition-all focus:border-[var(--accent)]"
              >
                <option value="">항목 선택</option>
                {FAVORITE_OPTIONS.filter(o => !favorites.includes(o.id)).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={handleAddFavorite}
                  disabled={!pendingFav}
                  data-testid="mypage-favorite-add"
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--accent)] px-3 text-[12px] font-bold text-white transition-all hover:opacity-95 disabled:cursor-not-allowed disabled:bg-[var(--toss-gray-2)]"
                >
                  <LucideIcon name="Check" size={14} />
                  추가
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPendingFav('');
                    setShowFavPicker(false);
                  }}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-[var(--toss-gray-4)] transition-all hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                  aria-label="즐겨찾기 선택 닫기"
                >
                  <LucideIcon name="X" size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 메인 콘텐츠 영역 */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-[var(--page-bg)] px-5 py-5 transition-all duration-300 md:px-6">
          {activeTab === 'profile' && (
            <div data-testid="mypage-profile-tab" className="animate-premium-fade space-y-4 pb-4">
              <section className="erp-card rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
                <div className="flex items-center justify-between gap-5">
                  <div className="flex min-w-0 items-center gap-5">
                    <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-[#BFD2FF] bg-[#EAF1FF] text-[22px] font-black text-[var(--accent)]">
                      {profileSummary.avatarUrl ? (
                        <img src={profileSummary.avatarUrl} alt="프로필 사진" className="h-full w-full object-cover" />
                      ) : (
                        <span>{initial}</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-[16px] font-bold text-[var(--foreground)]">
                        {profileSummary.name || String(user.name || '사용자')}
                      </h2>
                      <p className="mt-2 text-[12px] font-medium text-[var(--toss-gray-4)]">
                        {profileSummary.position || '직책 정보 없음'} · {profileSummary.department || '소속 정보 없음'}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="erp-status erp-status-green">재직중</span>
                        <span className="erp-status erp-status-blue">정규직</span>
                        <span className="erp-chip">{tenureLabel}</span>
                      </div>
                    </div>
                  </div>
                  <div className="hidden text-right text-[12px] font-medium text-[var(--toss-gray-3)] sm:block">
                    <p>사번 {profileSummary.employeeNo || String(user.employee_no || '00123')}</p>
                    <p className="mt-3">입사 {joinedAtLabel}</p>
                  </div>
                </div>
              </section>

              {isEditingProfile && (
                <section data-testid="mypage-profile-edit-panel" className="rounded-[var(--radius-lg)] border border-[var(--accent)]/20 bg-[var(--card)] p-4 shadow-sm">
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

              <div className="erp-stat-grid">
                {[
                  { label: '이번 달 근태', value: attendanceValue, note: attendanceNote, icon: 'Clock', tone: 'text-teal-500 bg-teal-50' },
                  { label: '잔여 연차', value: `${leaveRemaining}일`, note: '연차 현황', icon: 'CalendarDays', tone: 'text-[var(--accent)] bg-[var(--accent-light)]' },
                  { label: '이번 달 급여', value: '비공개', note: '급여명세서에서 확인', icon: 'Lock', tone: 'text-[var(--toss-gray-3)] bg-[var(--muted)]' },
                  { label: '미결재', value: `${pendingApprovalCount}건`, note: '결재 대기중', icon: 'FileWarning', tone: 'text-amber-500 bg-amber-50' },
                ].map((item) => (
                  <article key={item.label} className="erp-stat-card">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[12px] font-medium text-[var(--toss-gray-4)]">{item.label}</p>
                      <span className={`flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] ${item.tone}`}>
                        <LucideIcon name={item.icon} size={16} />
                      </span>
                    </div>
                    <p className={`mt-3 text-[24px] font-black leading-none ${item.label === '이번 달 급여' ? 'text-[var(--toss-gray-3)] tracking-widest' : 'text-[var(--foreground)]'}`}>
                      {item.value}
                    </p>
                    <p className={`mt-2 text-[11px] font-semibold ${item.note === '개근' || (!item.note.startsWith('지각') && item.note !== '집계 중' && item.note !== '결재 대기중' && item.label !== '이번 달 급여') ? 'text-[var(--success)]' : 'text-[var(--toss-gray-3)]'}`}>
                      {item.note}
                    </p>
                  </article>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  { label: '급여명세서 보기', desc: '비밀번호 입력 후 확인', icon: 'ShieldCheck', action: () => { setActiveTab('records'); setRecordsView('salary'); } },
                  { label: '연차/휴가 내역', desc: `잔여 ${leaveRemaining}일`, icon: 'CalendarDays', action: () => setActiveTab('leave') },
                  { label: '전자결재 확인', desc: `${pendingApprovalCount}건 대기`, icon: 'FileCheck2', action: () => onOpenApproval?.({ viewMode: '결재함' }) },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={item.action}
                    className="erp-action-tile flex items-center gap-3 text-left hover:bg-[var(--accent-light)]/35"
                  >
                    <span className="erp-icon-box shrink-0">
                      <LucideIcon name={item.icon} size={17} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[12px] font-bold text-[var(--foreground)]">{item.label}</span>
                      <span className="mt-1 block text-[11px] font-medium text-[var(--toss-gray-3)]">{item.desc}</span>
                    </span>
                  </button>
                ))}
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
