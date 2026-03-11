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

export default function MyPageMain({ user, initialMyPageTab, onConsumeMyPageInitialTab, onOpenApproval, setMainMenu }: any) {
  const [activeTab, setActiveTab] = useState<'profile' | 'records' | 'todo' | 'commute' | 'documents' | 'notifications'>('profile');
  const [recordsView, setRecordsView] = useState<'salary' | 'certificates'>('salary');
  const [favorites, setFavorites] = useState<FavoriteId[]>([]);
  const [showFavPicker, setShowFavPicker] = useState(false);
  const [pendingFav, setPendingFav] = useState<FavoriteId | ''>('');

  const [pendingContract, setPendingContract] = useState<any>(null);
  const [showSignaturePad, setShowSignaturePad] = useState(false);

  // 미서명 계약서 확인
  useEffect(() => {
    if (!user?.id) return;
    const checkPendingContracts = async () => {
      const { data } = await supabase
        .from('employment_contracts')
        .select('*')
        .eq('staff_id', user.id)
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
        title: `${user.name} 근로계약서 (${new Date().toLocaleDateString()})`,
        category: '계약서',
        content: contractText,
        company_name: user.company || '전체',
        created_by: user.id,
        version: 1
      });

      // HR에게 알림 전송
      await supabase.from('notifications').insert({
        user_id: 'system_admin',
        title: '계약서 서명 완료',
        message: `${user.name} 님이 근로계약서에 전자서명을 완료했습니다.`,
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

  if (!user) return <div className="p-10 text-center font-bold">사용자 정보 로딩 중...</div>;

  return (
    <div className="relative h-full min-h-0 flex flex-col overflow-x-hidden app-page px-3 py-3 md:rounded-[3rem] md:px-5 md:py-4">

      {/* 전자 서명 전용 신규 모달 */}
      {pendingContract && (
        <ContractSignatureModal
          contract={pendingContract}
          user={user}
          onClose={() => setPendingContract(null)}
          onSuccess={handleSignComplete}
        />
      )}

      {/* 상단 로고 및 헤더 */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-3 shrink-0">
        <div className="text-left space-y-2 w-full">
          {/* 로고 + 인사말 바로 옆에 즐겨찾기 버튼 (모바일/PC 공통) */}
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <AppLogo size={40} />
            <h1 className="page-header-title text-2xl font-semibold tracking-tight">
              반갑습니다, {user.name}님 👋
            </h1>
            <button
              type="button"
              onClick={() => setShowFavPicker((v) => !v)}
              className="ml-1 px-3 py-1.5 rounded-full text-[11px] font-semibold border border-dashed border-[var(--toss-border)] text-[var(--toss-gray-3)] hover:bg-[var(--toss-gray-1)] whitespace-nowrap"
            >
              + 즐겨찾기 추가
            </button>
          </div>

          {/* 자주 쓰는 기능 즐겨찾기 바로가기 */}
          <div className="flex flex-col gap-2 mt-1">
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
            {showFavPicker && (
              <div className="flex items-center gap-2">
                <select
                  value={pendingFav}
                  onChange={(e) => setPendingFav(e.target.value as FavoriteId | '')}
                  className="px-3 py-1.5 rounded-full text-[11px] font-semibold border border-[var(--toss-border)] bg-[var(--toss-card)]"
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
                  className="px-3 py-1.5 rounded-full text-[11px] font-semibold bg-[var(--foreground)] text-white hover:opacity-90"
                >
                  추가
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 통합 탭 네비게이션 (가로 스크롤 레이아웃) */}
        <div className="flex justify-around md:justify-start bg-[var(--toss-card)] p-1 rounded-2xl shadow-sm border border-[var(--toss-border)] w-full md:w-fit">
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
            onClick={() => { setActiveTab('records'); setRecordsView('certificates'); }}
            label="급여·증명서" icon="📑" ariaLabel="증명서"
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

      {/* 메인 콘텐츠 영역 */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden transition-all duration-300">
          {activeTab === 'profile' && (
            <div data-testid="mypage-profile-tab" className="space-y-4 pb-4">
              <RoleDashboard user={user} setMainMenu={setMainMenu} />
              <MyProfileCard user={user} onOpenApproval={onOpenApproval} setMainMenu={setMainMenu} />
            </div>
          )}
          {activeTab === 'commute' && (
            <div data-testid="mypage-commute-tab" className="pb-4">
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
          {activeTab === 'todo' && <div data-testid="mypage-todo-tab" className="pb-4"><MyTodoList user={user} /></div>}
          {activeTab === 'records' && (
            <div data-testid="mypage-records-tab" className="pb-4">
              <PayrollAndCertificatesHub
                user={user}
                activeView={recordsView}
                onChangeView={setRecordsView}
              />
            </div>
          )}
          {activeTab === 'documents' && <div data-testid="mypage-documents-tab" className="pb-4"><MyDocuments user={user} /></div>}
          {activeTab === 'notifications' && <div data-testid="mypage-notifications-tab" className="pb-4"><NotificationInbox user={user} onRefresh={() => { }} /></div>}
      </div>

    </div>
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
    <div className="space-y-5 p-4 md:p-6">
      <section className="rounded-[20px] border border-[var(--toss-border)] bg-[var(--toss-card)] p-5 shadow-sm">
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-[var(--foreground)]">급여·증명서</h2>
            <p className="mt-1 text-sm text-[var(--toss-gray-3)]">급여명세서와 발급된 증명서를 한 화면에서 구분해서 확인합니다.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <button
              type="button"
              onClick={() => onChangeView('salary')}
              className={`rounded-[20px] border px-5 py-4 text-left transition-all ${
                activeView === 'salary'
                  ? 'border-[var(--toss-blue)] bg-[var(--toss-blue-light)]/60 shadow-sm'
                  : 'border-[var(--toss-border)] bg-white hover:bg-[var(--toss-gray-1)]'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--toss-gray-3)]">급여명세서</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">월별 급여 정산 내역 확인</p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-sm font-black text-[var(--toss-blue)] shadow-sm">
                  {summary.salaryCount}건
                </span>
              </div>
            </button>
            <button
              type="button"
              onClick={() => onChangeView('certificates')}
              className={`rounded-[20px] border px-5 py-4 text-left transition-all ${
                activeView === 'certificates'
                  ? 'border-[var(--toss-blue)] bg-[var(--toss-blue-light)]/60 shadow-sm'
                  : 'border-[var(--toss-border)] bg-white hover:bg-[var(--toss-gray-1)]'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--toss-gray-3)]">발급된 증명서</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">발급 완료 및 승인 문서 확인</p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-sm font-black text-[var(--toss-blue)] shadow-sm">
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

function TabButton({ isActive, onClick, label, icon, ariaLabel }: any) {
  return (
    <button
      onClick={onClick}
      {...(ariaLabel ? { 'aria-label': ariaLabel } : {})}
      className={`flex flex-col md:flex-row items-center gap-1 md:gap-2 px-1.5 md:px-5 py-2 md:py-2.5 rounded-xl md:rounded-full text-[10px] md:text-sm font-bold transition-all duration-200 whitespace-nowrap
        ${isActive ? 'bg-[var(--toss-blue)] text-white shadow-md' : 'bg-transparent text-[var(--toss-gray-3)] hover:bg-[var(--toss-gray-1)]'}
      `}
    >
      <span className="text-sm md:text-base">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function QuickFavoriteButton({ label, icon, onClick, active, onRemove }: any) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all
        ${active ? 'bg-[var(--toss-blue)] text-white border-[var(--toss-blue)] shadow-sm' : 'bg-[var(--toss-card)] text-[var(--toss-gray-4)] border-[var(--toss-border)] hover:bg-[var(--toss-gray-1)]'}
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
