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
    <div className="h-full flex flex-col bg-gray-50 px-3 py-4 md:p-6 rounded-none md:rounded-[3rem] overflow-hidden">
      
      {/* 상단 로고 및 헤더 */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4 shrink-0">
        <div className="text-left space-y-2">
          <div className="flex items-center gap-3 mb-2">
            <AppLogo size={40} />
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">
              반갑습니다, {user.name}님 👋
            </h1>
          </div>
          <p className="text-xs font-bold text-gray-400">
            내 정보 · 출퇴근 · 할일 · 증명서 · 급여명세서를 한 곳에서 관리합니다.
          </p>
          {/* 자주 쓰는 기능 즐겨찾기 바로가기 */}
          <div className="flex flex-col gap-2 mt-2">
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
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowFavPicker((v) => !v)}
                className="px-3 py-1.5 rounded-full text-[11px] font-black border border-dashed border-gray-300 text-gray-500 hover:bg-gray-50"
              >
                + 즐겨찾기 추가
              </button>
              {showFavPicker && (
                <div className="flex items-center gap-2">
                  <select
                    value={pendingFav}
                    onChange={(e) => setPendingFav(e.target.value as FavoriteId | '')}
                    className="px-3 py-1.5 rounded-full text-[11px] font-black border border-gray-300 bg-white"
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
                    className="px-3 py-1.5 rounded-full text-[11px] font-black bg-gray-900 text-white hover:bg-black"
                  >
                    추가
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 통합 탭 네비게이션 */}
        <div className="flex bg-white p-1.5 rounded-full shadow-sm border border-gray-100 overflow-x-auto max-w-full">
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
            label="증명서" icon="📄" // [추가] 신규 탭
          />
          <TabButton 
            isActive={activeTab === 'salary'} 
            onClick={() => setActiveTab('salary')} 
            label="급여명세서" icon="💰" 
          />
          <TabButton 
            isActive={activeTab === 'notifications'} 
            onClick={() => setActiveTab('notifications')} 
            label="알림" icon="🔔" 
          />
        </div>
      </div>

      {/* 메인 콘텐츠 영역 */}
      <div className="flex-1 overflow-hidden relative">
        <div className="absolute inset-0 transition-all duration-300">
          {activeTab === 'profile' && <MyProfileCard user={user} />}
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
          {activeTab === 'notifications' && <NotificationInbox user={user} onRefresh={() => {}} />}
        </div>
      </div>

    </div>
  );
}

function TabButton({ isActive, onClick, label, icon }: any) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-black transition-all duration-200 whitespace-nowrap
        ${isActive ? 'bg-gray-900 text-white shadow-md transform scale-105' : 'bg-transparent text-gray-400 hover:bg-gray-50'}
      `}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function QuickFavoriteButton({ label, icon, onClick, active, onRemove }: any) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-black border transition-all
        ${active ? 'bg-gray-900 text-white border-gray-900 shadow-sm' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}
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
          className="ml-1 text-[10px] text-gray-400 hover:text-red-500"
        >
          ✕
        </span>
      )}
    </button>
  );
}