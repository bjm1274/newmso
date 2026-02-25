'use client';
import { useState, useEffect } from 'react';

// 기능 컴포넌트 불러오기
import AppLogo from '@/app/components/AppLogo';
import MyProfileCard from './프로필카드';
import SalarySlipContainer from './급여명세서';
import MyTodoList from './나의할일';
import CommuteRecord from './출퇴근기록';
import MyCertificates from './증명서관리';
import NotificationInbox from '../알림인박스';
import ContractSignatureModal from '../인사관리서브/계약문서/전자서명모달';
import { supabase } from '@/lib/supabase';

const MYPAGE_TAB_KEY = 'erp_mypage_tab';
const FAVORITES_KEY = 'erp_mypage_favorites';
const HR_TAB_KEY = 'erp_hr_tab';
const INV_VIEW_KEY = 'erp_inventory_view';

type FavoriteId =
  | 'mypage_profile'
  | 'mypage_commute'
  | 'mypage_todo'
  | 'mypage_certificates'
  | 'mypage_salary'
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
  { id: 'mypage_certificates', label: '증명서', icon: '📄' },
  { id: 'mypage_salary', label: '급여명세서', icon: '💰' },
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

export default function MyPageMain({ user, initialMyPageTab, onConsumeMyPageInitialTab, onOpenApproval, setMainMenu }: any) {
  const [activeTab, setActiveTab] = useState<'profile' | 'salary' | 'todo' | 'commute' | 'certificates' | 'notifications'>('profile');
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

  const handleSignComplete = async (signatureDataUrl: string) => {
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

      // HR에게 알림 전송 (system_admin로 임시 지정)
      await supabase.from('notifications').insert({
        user_id: 'system_admin',
        title: '계약서 서명 완료',
        message: `${user.name} 님이 근로계약서에 전자서명을 완료했습니다.`,
        type: 'SUCCESS',
        is_read: false
      });

      alert('근로계약서 서명이 성공적으로 완료되었습니다.');
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
      const allowed = ['profile', 'salary', 'todo', 'commute', 'certificates', 'notifications'];
      if (saved && allowed.includes(saved)) {
        setActiveTab(saved);
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

  // 즐겨찾기 목록 복구
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(FAVORITES_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const validIds = FAVORITE_OPTIONS.map(o => o.id);
        setFavorites(parsed.filter((id: any) => validIds.includes(id)));
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
    else if (fav === 'mypage_certificates') setActiveTab('certificates');
    else if (fav === 'mypage_salary') setActiveTab('salary');
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
    <div className="h-full min-h-0 flex flex-col app-page px-3 py-4 md:p-6 rounded-none md:rounded-[3rem] overflow-hidden relative">

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
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4 shrink-0">
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
                  (id === 'mypage_certificates' && activeTab === 'certificates') ||
                  (id === 'mypage_salary' && activeTab === 'salary');
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
            isActive={activeTab === 'certificates'}
            onClick={() => setActiveTab('certificates')}
            label="증명서" icon="📄"
          />
          <TabButton
            isActive={activeTab === 'salary'}
            onClick={() => setActiveTab('salary')}
            label="급여" icon="💰"
          />
          <TabButton
            isActive={activeTab === 'notifications'}
            onClick={() => setActiveTab('notifications')}
            label="알림" icon="🔔"
          />
        </div>
      </div>

      {/* 메인 콘텐츠 영역 */}
      <div className="flex-1 min-h-0 overflow-hidden relative">
        <div className="absolute inset-0 overflow-y-auto overflow-x-hidden transition-all duration-300">
          {activeTab === 'profile' && <MyProfileCard user={user} onOpenApproval={onOpenApproval} />}
          {activeTab === 'commute' && (
            <CommuteRecord
              user={user}
              onRequestCorrection={(log: any) =>
                onOpenApproval?.({
                  type: '출결정정',
                  workDate: log.work_date,
                  todayLog: log,
                })
              }
            />
          )}
          {activeTab === 'todo' && <MyTodoList user={user} />}
          {activeTab === 'salary' && <SalarySlipContainer user={user} />}
          {activeTab === 'certificates' && <MyCertificates user={user} />}
          {activeTab === 'notifications' && <NotificationInbox user={user} onRefresh={() => { }} />}
        </div>
      </div>

    </div>
  );
}

function TabButton({ isActive, onClick, label, icon }: any) {
  return (
    <button
      onClick={onClick}
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