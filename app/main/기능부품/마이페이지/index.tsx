'use client';
import { useState, useEffect } from 'react';

// 기능 컴포넌트 불러오기
import AppLogo from '@/app/components/AppLogo';
import MyProfileCard from './프로필카드';
import SalarySlipContainer from './급여명세서';
import MyTodoList from './나의할일';
import CommuteRecord from './출퇴근기록';
import MyCertificates from './증명서관리';
import MyDocuments from './서류제출';
import NotificationInbox from '../알림인박스';
import ContractSignatureModal from '../인사관리서브/계약문서/전자서명모달';
import RoleDashboard from './역할별대시보드';
import { supabase } from '@/lib/supabase';
import { getProfilePhotoUrl } from '@/lib/profile-photo';

const MYPAGE_TAB_KEY = 'erp_mypage_tab';
const MYPAGE_RECORDS_VIEW_KEY = 'erp_mypage_records_view';
const FAVORITES_KEY = 'erp_mypage_favorites';
const HR_TAB_KEY = 'erp_hr_tab';
const INV_VIEW_KEY = 'erp_inventory_view';

type FavoriteId =
  | 'mypage_profile'
  | 'mypage_commute'
  | 'mypage_todo'
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
  { id: 'mypage_profile', label: '내 정보', icon: '👤' },
  { id: 'mypage_commute', label: '출퇴근', icon: '⏰' },
  { id: 'mypage_todo', label: '할일', icon: '✅' },
  { id: 'mypage_records', label: '급여·증명서', icon: '📑' },
  { id: 'mypage_documents', label: '서류제출', icon: '📤' },
  { id: 'hr_payroll', label: '인사관리 · 급여', icon: '👥' },
  { id: 'inv_purchase', label: '재고관리 · 발주', icon: '📦' },
  // 전체 메뉴 바로가기
  { id: 'menu_home', label: '메인 · 내 정보', icon: '🆔' },
  { id: 'menu_org', label: '조직도', icon: '👤' },
  { id: 'menu_extra', label: '추가기능', icon: '🔗' },
  { id: 'menu_chat', label: '채팅', icon: '✉️' },
  { id: 'menu_board', label: '게시판', icon: '📋' },
  { id: 'menu_approval', label: '전자결재', icon: '✍️' },
  { id: 'menu_hr', label: '인사관리 (전체)', icon: '👥' },
  { id: 'menu_inventory', label: '재고관리 (전체)', icon: '📦' },
  { id: 'menu_admin', label: '관리자', icon: '⚙️' },
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
  onOpenChatMessage?: (roomId: string, messageId: string) => void;
}

export default function MyPageMain({ user, initialMyPageTab, onConsumeMyPageInitialTab, onOpenApproval, setMainMenu, onOpenChatMessage }: MyPageMainProps) {
  const [activeTab, setActiveTab] = useState<'profile' | 'records' | 'todo' | 'commute' | 'documents' | 'notifications'>('profile');
  const [recordsView, setRecordsView] = useState<'salary' | 'certificates'>('salary');
  const [favorites, setFavorites] = useState<FavoriteId[]>([]);
  const [showFavPicker, setShowFavPicker] = useState(false);
  const [pendingFav, setPendingFav] = useState<FavoriteId | ''>('');
  const [profileSummary, setProfileSummary] = useState(() => buildProfileSummary(user));
  const [showSecret, setShowSecret] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);

  const [pendingContract, setPendingContract] = useState<Record<string, unknown> | null>(null);
  const [showSignaturePad, setShowSignaturePad] = useState(false);

  // 미서명 계약서 확인
  useEffect(() => {
    if (!user?.id) return;
    const checkPendingContracts = async () => {
      const { data } = await supabase
        .from('employment_contracts')
        .select('*')
        .eq('staff_id', user.id as string)
        .eq('status', '서명대기')
        .order('requested_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        setPendingContract(data);
      } else {
        setPendingContract(null);
      }
    };
    checkPendingContracts();
  }, [user?.id]);

  const handleSignComplete = async (signatureDataUrl: string, contractText: string) => {
    if (!pendingContract) return;
    try {
      await supabase
        .from('employment_contracts')
        .update({
          status: '서명완료',
          signed_at: new Date().toISOString(),
          signature_data: signatureDataUrl
        })
        .eq('id', pendingContract.id);

      // 문서 보관함으로 자동 저장 (PDF는 보관함에서 열 때 생성됨)
      await supabase.from('document_repository').insert({
        title: `${user?.name} 근로계약서 (${new Date().toLocaleDateString()})`,
        category: '계약서',
        content: contractText,
        company_name: (user?.company as string) || '전체',
        created_by: user?.id,
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

      alert('근로계약서 서명이 성공적으로 완료되었습니다. 마이페이지 > 급여·증명서 또는 문서보관함에서 확인하실 수 있습니다.');
      setPendingContract(null);
      setShowSignaturePad(false);
    } catch (e) {
      alert('서명 저장 중 오류가 발생했습니다.');
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
      const allowed = ['profile', 'records', 'salary', 'todo', 'commute', 'certificates', 'documents', 'notifications'];
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
        const raw = window.localStorage.getItem('erp_user');
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
    try {
      const raw = window.localStorage.getItem(FAVORITES_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const validIds = FAVORITE_OPTIONS.map(o => o.id);
        const normalized = parsed
          .map((id: FavoriteId) => LEGACY_FAVORITE_MAP[id] || id)
          .filter((id: FavoriteId, index: number, array: FavoriteId[]) => array.indexOf(id) === index)
          .filter((id: FavoriteId) => validIds.includes(id));
        setFavorites(normalized);
      }
    } catch {
      // ignore
    }
  }, []);

  // 즐겨찾기 저장
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
    } catch {
      // ignore
    }
  }, [favorites]);

  const handleFavoriteClick = (fav: FavoriteId) => {
    if (fav === 'mypage_profile') setActiveTab('profile');
    else if (fav === 'mypage_commute') setActiveTab('commute');
    else if (fav === 'mypage_todo') setActiveTab('todo');
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
      setMainMenu?.('인사관리');
    } else if (fav === 'inv_purchase') {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(INV_VIEW_KEY, '발주');
      }
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
      setMainMenu?.('게시판');
    } else if (fav === 'menu_approval') {
      setMainMenu?.('전자결재');
    } else if (fav === 'menu_hr') {
      setMainMenu?.('인사관리');
    } else if (fav === 'menu_inventory') {
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
      const input = window.prompt('본인 확인을 위해 현재 비밀번호를 입력해 주세요.');
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
        alert(payload?.error ? `본인 확인 중 오류가 발생했습니다.\n${payload.error}` : '본인 확인 중 오류가 발생했습니다.');
        return false;
      }

      if (!payload?.verified) {
        alert('비밀번호가 일치하지 않습니다.');
        return false;
      }

      return true;
    } catch {
      alert('본인 확인 중 오류가 발생했습니다.');
      return false;
    }
  };

  const handleToggleSecret = async () => {
    if (showSecret) {
      setShowSecret(false);
      return;
    }

    const verified = await verifyProfilePassword();
    if (verified) {
      setShowSecret(true);
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

  if (!user) return <div className="p-5 text-center font-bold">사용자 정보 로딩 중...</div>;

  return (
    <div className="relative h-full min-h-0 flex flex-col overflow-x-hidden app-page px-3 py-2.5 md:px-4 md:py-3">

      {/* 전자 서명 전용 신규 모달 */}
      {pendingContract && (
        <ContractSignatureModal
          contract={pendingContract}
          user={user}
          onClose={() => setPendingContract(null)}
          onSuccess={handleSignComplete}
        />
      )}

      {/* 상단 헤더 */}
      <div className="mb-2.5 flex flex-col gap-2 shrink-0">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0 flex-1 text-left">
            <div className="flex flex-wrap items-center gap-2">
              <AppLogo size={32} />
              <h1 className="page-header-title">
                반갑습니다, {user?.name as string}님
              </h1>
            </div>
          </div>

          <div className="no-scrollbar flex w-full overflow-x-auto gap-0.5 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-0.5 xl:w-auto">
            <TabButton
              isActive={activeTab === 'profile'}
              onClick={() => setActiveTab('profile')}
              label="내 정보" icon="👤"
            />
            <TabButton
              isActive={activeTab === 'commute'}
              onClick={() => setActiveTab('commute')}
              label="출퇴근" icon="⏰"
            />
            <TabButton
              isActive={activeTab === 'todo'}
              onClick={() => setActiveTab('todo')}
              label="할일" icon="✅"
            />
            <TabButton
              isActive={activeTab === 'records'}
              onClick={() => { setActiveTab('records'); }}
              label="급여·증명서" icon="📑" ariaLabel="급여·증명서"
            />
            <TabButton
              isActive={activeTab === 'documents'}
              onClick={() => setActiveTab('documents')}
              label="서류제출" icon="📤"
            />
            <TabButton
              isActive={activeTab === 'notifications'}
              onClick={() => setActiveTab('notifications')}
              label="알림" icon="🔔"
            />
          </div>
        </div>

        <div className="mt-0.5 flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowFavPicker((v) => !v)}
              className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] px-3 py-1.5 text-[11px] font-semibold whitespace-nowrap text-[var(--toss-gray-3)] hover:bg-[var(--muted)]"
            >
              + 즐겨찾기 추가
            </button>
            <div className="flex gap-2 overflow-x-auto md:flex-wrap md:overflow-visible no-scrollbar">
              {favorites.map((id) => {
                const opt = FAVORITE_OPTIONS.find(o => o.id === id);
                if (!opt) return null;
                const isActive =
                  (id === 'mypage_profile' && activeTab === 'profile') ||
                  (id === 'mypage_commute' && activeTab === 'commute') ||
                  (id === 'mypage_todo' && activeTab === 'todo') ||
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
          </div>
          {showFavPicker && (
            <div className="flex items-center gap-2">
              <select
                value={pendingFav}
                onChange={(e) => setPendingFav(e.target.value as FavoriteId | '')}
                className="px-3 py-1.5 rounded-[var(--radius-md)] text-[11px] font-semibold border border-[var(--border)] bg-[var(--card)]"
              >
                <option value="">항목 선택</option>
                {FAVORITE_OPTIONS.filter(o => !favorites.includes(o.id)).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleAddFavorite}
                className="px-3 py-1.5 rounded-[var(--radius-md)] text-[11px] font-semibold bg-[var(--foreground)] text-white hover:opacity-90"
              >
                추가
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 메인 콘텐츠 영역 */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden transition-all duration-300">
          {activeTab === 'profile' && (
            <div data-testid="mypage-profile-tab" className="space-y-3 pb-3">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start">
                <ProfileHeaderSummary
                  user={profileSummary}
                  showSecret={showSecret}
                  isEditing={isEditingProfile}
                  onToggleSecret={handleToggleSecret}
                  onToggleEdit={handleToggleEdit}
                />
                <div className="min-w-0 flex-1">
                  <RoleDashboard user={user} setMainMenu={setMainMenu} />
                </div>
              </div>
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
            </div>
          )}
          {activeTab === 'commute' && (
            <div data-testid="mypage-commute-tab" className="pb-3">
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
          {activeTab === 'todo' && <div data-testid="mypage-todo-tab" className="pb-3"><MyTodoList user={user} onChatNavigate={onOpenChatMessage} /></div>}
          {activeTab === 'records' && (
            <div data-testid="mypage-records-tab" className="pb-3">
              <PayrollAndCertificatesHub
                user={user}
                activeView={recordsView}
                onChangeView={setRecordsView}
              />
            </div>
          )}
          {activeTab === 'documents' && <div data-testid="mypage-documents-tab" className="pb-3"><MyDocuments user={user} /></div>}
          {activeTab === 'notifications' && <div data-testid="mypage-notifications-tab" className="pb-3"><NotificationInbox user={user} onRefresh={() => { }} /></div>}
      </div>

    </div>
  );
}

function buildProfileSummary(source: any) {
  return {
    id: source?.id || null,
    name: source?.name || '',
    position: source?.position || '',
    department: source?.department || '',
    avatarUrl: getProfilePhotoUrl(source),
    employeeNo: source?.employee_no || '',
  };
}

function ProfileHeaderSummary({
  user,
  showSecret,
  isEditing,
  onToggleSecret,
  onToggleEdit,
}: {
  user: { id?: string | null; name: string; position: string; department: string; avatarUrl?: string | null; employeeNo?: string | null };
  showSecret: boolean;
  isEditing: boolean;
  onToggleSecret: () => void;
  onToggleEdit: () => void;
}) {
  return (
    <section className="h-[128px] w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 shadow-sm xl:max-w-[340px]">
      <div className="flex h-full items-center justify-between gap-3">
        <div className="relative shrink-0">
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--muted)] shadow-sm">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="프로필 사진" className="h-full w-full object-cover" />
            ) : (
              <span className="text-3xl text-[var(--toss-gray-3)]">👤</span>
            )}
          </div>
          {user.id ? (
            <label
              htmlFor="profiles-upload"
              className="absolute -bottom-1 -right-1 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-[var(--accent)] text-[13px] text-white shadow-sm transition-all hover:opacity-90"
              title="프로필 사진 등록"
            >
              📷
            </label>
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[28px] font-bold tracking-tight leading-tight text-[var(--foreground)] break-keep">
            {user.name} {user.position}
          </p>
          <p className="mt-2 truncate text-sm font-bold text-[var(--accent)]">
            {user.department || '소속 정보 없음'}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-1.5">
          <button
            type="button"
            onClick={onToggleSecret}
            className="rounded-[var(--radius-md)] border border-transparent bg-[var(--muted)] px-3 py-1.5 text-[10px] font-bold text-[var(--toss-gray-3)] transition-all hover:border-[var(--toss-blue-light)] hover:text-[var(--accent)]"
          >
            {showSecret ? '민감 정보 숨기기' : '보안 정보 보기'}
          </button>
          <button
            type="button"
            onClick={onToggleEdit}
            data-testid="mypage-profile-edit-toggle"
            className={`rounded-[var(--radius-md)] border px-3 py-1.5 text-[10px] font-bold transition-all ${
              isEditing
                ? 'bg-red-50 text-red-500 border-red-100 hover:bg-red-100'
                : 'bg-[var(--toss-blue-light)] text-[var(--accent)] border-[var(--toss-blue-light)] hover:bg-[var(--toss-blue-light)]'
            }`}
          >
            {isEditing ? '수정 취소' : '내 정보 수정'}
          </button>
        </div>
      </div>
    </section>
  );
}

function PayrollAndCertificatesHub({
  user,
  activeView,
  onChangeView,
}: {
  user: any;
  activeView: 'salary' | 'certificates';
  onChangeView: (view: 'salary' | 'certificates') => void;
}) {
  const [summary, setSummary] = useState({ salaryCount: 0, certificateCount: 0 });

  useEffect(() => {
    if (!user?.id) {
      setSummary({ salaryCount: 0, certificateCount: 0 });
      return;
    }

    const fetchSummary = async () => {
      const [salaryRes, certRes, approvedDocsRes] = await Promise.all([
        supabase
          .from('payroll_records')
          .select('id', { count: 'exact', head: true })
          .eq('staff_id', user.id),
        supabase
          .from('certificate_issuances')
          .select('id', { count: 'exact', head: true })
          .eq('staff_id', user.id),
        supabase
          .from('approvals')
          .select('id', { count: 'exact', head: true })
          .eq('sender_id', user.id)
          .eq('status', '승인')
          .eq('type', '양식신청'),
      ]);

      setSummary({
        salaryCount: salaryRes.count || 0,
        certificateCount: (certRes.count || 0) + (approvedDocsRes.count || 0),
      });
    };

    fetchSummary();
  }, [user?.id]);

  return (
    <div className="space-y-4 p-3 md:p-4">
      <section className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
        <div className="flex flex-col gap-3">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-[var(--foreground)]">급여·증명서</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <button
              type="button"
              aria-label="월별 정산 카드"
              onClick={() => onChangeView('salary')}
              className={`rounded-[var(--radius-xl)] border px-5 py-4 text-left transition-all ${
                activeView === 'salary'
                  ? 'border-[var(--accent)] bg-[var(--toss-blue-light)]/60 shadow-sm'
                  : 'border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)]'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--toss-gray-3)]">급여명세서</p>
                </div>
                <span className="rounded-[var(--radius-md)] bg-[var(--card)] px-3 py-1 text-sm font-black text-[var(--accent)] shadow-sm">
                  {summary.salaryCount}건
                </span>
              </div>
            </button>
            <button
              type="button"
              aria-label="발급 문서 카드"
              onClick={() => onChangeView('certificates')}
              className={`rounded-[var(--radius-xl)] border px-5 py-4 text-left transition-all ${
                activeView === 'certificates'
                  ? 'border-[var(--accent)] bg-[var(--toss-blue-light)]/60 shadow-sm'
                  : 'border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)]'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--toss-gray-3)]">발급된 증명서</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">발급 완료 및 승인 문서 확인</p>
                </div>
                <span className="rounded-[var(--radius-md)] bg-[var(--card)] px-3 py-1 text-sm font-black text-[var(--accent)] shadow-sm">
                  {summary.certificateCount}건
                </span>
              </div>
            </button>
          </div>
        </div>
      </section>

      {activeView === 'salary' ? (
        <div data-testid="mypage-salary-tab">
          <SalarySlipContainer user={user} />
        </div>
      ) : (
        <div data-testid="mypage-certificates-tab">
          <MyCertificates user={user} />
        </div>
      )}
    </div>
  );
}

function TabButton({ isActive, onClick, label, icon, ariaLabel }: {
  isActive: boolean;
  onClick: () => void;
  label: string;
  icon: string;
  ariaLabel?: string;
}) {
  return (
    <button
      onClick={onClick}
      {...(ariaLabel ? { 'aria-label': ariaLabel } : {})}
      className={`flex flex-col md:flex-row items-center gap-0.5 md:gap-1.5 px-2 md:px-4 py-1.5 md:py-2 rounded-[var(--radius-md)] text-[10px] md:text-[12px] font-semibold transition-all whitespace-nowrap
        ${isActive ? 'bg-[var(--accent)] text-white' : 'text-[var(--toss-gray-4)] hover:bg-[var(--tab-bg)] hover:text-[var(--foreground)]'}
      `}
    >
      <span className="text-[12px] md:text-[13px]">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function QuickFavoriteButton({ label, icon, onClick, active, onRemove }: {
  label: string;
  icon: string;
  onClick: () => void;
  active: boolean;
  onRemove?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-2.5 py-1 rounded-[var(--radius-md)] text-[11px] font-semibold border transition-all
        ${active ? 'bg-[var(--accent)] text-white border-[var(--accent)]' : 'bg-[var(--card)] text-[var(--toss-gray-4)] border-[var(--border)] hover:bg-[var(--tab-bg)]'}
      `}
    >
      <span>{icon}</span>
      <span>{label}</span>
      {onRemove && (
        <span
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-1 text-[11px] text-[var(--toss-gray-3)] hover:text-red-500"
        >
          ✕
        </span>
      )}
    </button>
  );
}

