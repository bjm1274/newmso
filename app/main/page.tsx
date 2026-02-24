'use client';
import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { setSelectedCompanyId as persistSelectedCompanyId, getSelectedCompanyId } from '@/lib/useCompany';

import Sidebar, { SUB_MENUS } from './기능부품/조직도서브/조직도측면창';
import MainContent from './기능부품/조직도서브/조직도본문';
import NotificationSystem from './기능부품/알림시스템';
import ChatAlertBanner from './기능부품/채팅알림배너';
import PermissionPromptModal from './기능부품/권한요청모달';

type ERPData = {
  staffs: any[];
  depts: any[];
  posts: any[];
  tasks: any[];
  surgeries: any[];
  mris: any[];
};

function MainPageFallback() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--background)] p-6 text-center">
      <div className="relative w-20 h-20 mb-8">
        <div className="absolute inset-0 border-4 border-[var(--toss-blue-light)] rounded-full" />
        <div className="absolute inset-0 border-4 border-[var(--toss-blue)] rounded-full border-t-transparent animate-spin" />
      </div>
      <h2 className="text-xl font-bold text-[var(--foreground)] mb-2">SY INC. 통합 시스템</h2>
      <p className="text-xs font-medium text-[var(--toss-gray-3)] animate-pulse">접속 중...</p>
    </div>
  );
}

function MainPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<{ id: string; name: string; type: string }[]>([]);
  const [selectedCompanyId, setSelectedCompanyIdState] = useState<string | null>(null);

  // 초기 상태를 로컬 스토리지에서 시도 (기본: 내 정보)
  const [mainMenu, setMainMenu] = useState('내정보');
  const [subView, setSubView] = useState('전체');
  const [selectedCo, setSelectedCo] = useState('전체');
  const [initialMyPageTab, setInitialMyPageTab] = useState<string | null>(null);
  const [initialBoardView, setInitialBoardView] = useState<string | null>(null);
  const [initialOpenChatRoomId, setInitialOpenChatRoomId] = useState<string | null>(null);

  const [data, setData] = useState<ERPData>({
    staffs: [],
    depts: [],
    posts: [],
    tasks: [],
    surgeries: [],
    mris: []
  });

  // 1. 초기 로드 시 사용자 정보 및 이전 상태 복구
  useEffect(() => {
    const storedUser = localStorage.getItem('erp_user');
    if (!storedUser) {
      router.replace('/');
      return;
    }
    const parsedUser = JSON.parse(storedUser);
    setUser(parsedUser);

    // 이전 메뉴 상태 복구
    const savedMenu = localStorage.getItem('erp_last_menu');
    const savedSubView = localStorage.getItem('erp_last_subview');
    const savedCo = localStorage.getItem('erp_last_co');

    if (savedMenu) setMainMenu(savedMenu);
    if (savedSubView) setSubView(savedSubView);

    if (parsedUser.company !== 'SY INC.' && !parsedUser.permissions?.mso) {
      setSelectedCo(parsedUser.company);
    } else if (savedCo) {
      setSelectedCo(savedCo);
    }

    if (parsedUser?.company === 'SY INC.' || parsedUser?.permissions?.mso) {
      supabase.from('companies').select('id, name, type').eq('is_active', true).then(({ data: list }) => {
        const sorted = (list || []).sort((a: any, b: any) => {
          const order = ['박철홍정형외과', '수연의원', 'SY INC.'];
          const ia = order.indexOf(a.name);
          const ib = order.indexOf(b.name);
          if (ia >= 0 && ib >= 0) return ia - ib;
          if (ia >= 0) return -1;
          if (ib >= 0) return 1;
          return (a.name || '').localeCompare(b.name || '');
        });
        setCompanies(sorted);
      });
      const savedId = getSelectedCompanyId();
      if (savedId) setSelectedCompanyIdState(savedId);
    }
    setSelectedCompanyIdState(getSelectedCompanyId());
  }, []);

  // 알림 클릭 시 open_chat_room 쿼리 처리 → 채팅 메뉴 + 해당 채팅방 연동 (웹/모바일 동일)
  useEffect(() => {
    const roomId = searchParams.get('open_chat_room')?.trim();
    if (roomId) {
      setMainMenu('채팅');
      setInitialOpenChatRoomId(roomId);
      router.replace('/main', { scroll: false });
    }
  }, [searchParams, router]);

  // 페이지 이동 처리 (알림 인박스에서 메뉴 오픈용)
  useEffect(() => {
    const targetMenu = searchParams.get('open_menu')?.trim();
    if (targetMenu) {
      setMainMenu(targetMenu);
      const openBoard = searchParams.get('open_board')?.trim();
      if (openBoard) {
        setInitialBoardView(openBoard);
      }
      router.replace('/main', { scroll: false });
    }
  }, [searchParams, router]);

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
  }, [user, selectedCompanyId]);

  // 2. 상태 변경 시마다 로컬 스토리지 업데이트
  useEffect(() => {
    if (user) {
      localStorage.setItem('erp_last_menu', mainMenu);
      localStorage.setItem('erp_last_subview', subView);
      localStorage.setItem('erp_last_co', selectedCo);
    }
  }, [mainMenu, subView, selectedCo, user]);

  const fetchERPData = async (currentUser?: any, companyIdFilter?: string | null) => {
    setLoading(true);
    const u = currentUser ?? user;
    try {
      const isMso = u?.company === 'SY INC.' || u?.permissions?.mso === true;
      const filterCompanyId = isMso ? companyIdFilter : u?.company_id;

      const { data: staffData } = await supabase
        .from('staff_members')
        .select('*')
        .order('employee_no', { ascending: true });

      let postQuery = supabase.from('board_posts').select('*').order('created_at', { ascending: false });
      if (filterCompanyId) {
        try { postQuery = postQuery.eq('company_id', filterCompanyId); } catch (_) { }
      }
      const { data: postData } = await postQuery;

      const uniqueDepts = Array.from(new Set((staffData || []).map((s: any) => s.department)))
        .filter(Boolean)
        .map(d => ({ name: d }));

      setData({
        staffs: staffData || [],
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
  };

  // 현재 메인 메뉴에 해당하는 서브메뉴 목록
  const currentSubMenus = mainMenu === '인사관리' ? [] : (SUB_MENUS[mainMenu] || []);

  // 메인 메뉴가 바뀌었는데 현재 subView가 해당 메뉴의 서브메뉴에 없다면, 첫 번째 서브메뉴로 보정
  useEffect(() => {
    if (!currentSubMenus.length) return;
    if (!currentSubMenus.some((s) => s.id === subView)) {
      setSubView(currentSubMenus[0].id);
    }
  }, [mainMenu]);

  // user 없으면 로그인 페이지로 리다이렉트 (초기 로드 시)
  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--background)] p-6 text-center">
        <div className="relative w-20 h-20 mb-8">
          <div className="absolute inset-0 border-4 border-[var(--toss-blue-light)] rounded-full"></div>
          <div className="absolute inset-0 border-4 border-[var(--toss-blue)] rounded-full border-t-transparent animate-spin"></div>
        </div>
        <h2 className="text-xl font-bold text-[var(--foreground)] mb-2">SY INC. 통합 시스템</h2>
        <p className="text-xs font-medium text-[var(--toss-gray-3)] animate-pulse">접속 중...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-screen w-full bg-[var(--background)] overflow-hidden min-h-[100dvh]">
      <Sidebar
        user={user}
        mainMenu={mainMenu}
        subView={subView}
        onMenuChange={(menu: string, sub?: string) => {
          setMainMenu(menu);
          if (sub !== undefined) setSubView(sub);
        }}
        onOpenNotifications={() => {
          setMainMenu('내정보');
          setInitialMyPageTab('notifications');
        }}
      />

      {/* 서브메뉴: 게시판·전자결재·인사관리·재고관리·관리자 등 (모바일 가로 스크롤, PC 세로 사이드바) */}
      {currentSubMenus.length > 0 && (
        <aside className="flex flex-row md:flex-col w-full md:w-44 bg-[var(--toss-card)] border-b md:border-b-0 md:border-r border-[var(--toss-border)] p-2 md:py-4 md:px-3 space-x-1 md:space-x-0 md:space-y-1 shrink-0 overflow-x-auto md:overflow-x-visible no-scrollbar">
          {currentSubMenus.map((sub) => (
            <button
              key={sub.id}
              onClick={() => setSubView(sub.id)}
              className={`flex-none md:w-full text-center md:text-left px-4 md:px-3 py-2 md:py-2.5 text-[11px] font-bold rounded-[12px] transition-all whitespace-nowrap ${subView === sub.id
                ? 'bg-[var(--toss-blue)] text-white shadow-md'
                : 'text-[var(--toss-gray-3)] hover:text-[var(--foreground)] hover:bg-[var(--toss-gray-1)]'
                }`}
            >
              {sub.label}
            </button>
          ))}
        </aside>
      )}

      <div className="flex-1 flex flex-col overflow-hidden min-h-0 pb-[72px] md:pb-0 relative">
        {/* 접속 시 한 번 알림·GPS 권한 요청 모달 */}
        <PermissionPromptModal />
        {/* 채팅·전자결재·연차촉진·출퇴근 실시간 알림 통합 배너 (웹·모바일 즉시 표시) */}
        <ChatAlertBanner
          onOpenChat={(roomId) => { setMainMenu('채팅'); setInitialOpenChatRoomId(roomId); }}
          onOpenApproval={() => setMainMenu('전자결재')}
          onOpenNotifications={() => { setMainMenu('내정보'); setInitialMyPageTab('notifications'); }}
        />
        {/* 전역 알림 및 푸시 처리 (채팅 탭을 열지 않아도 작동) */}
        <NotificationSystem
          user={user}
          onOpenChatRoom={(roomId) => { setMainMenu('채팅'); setInitialOpenChatRoomId(roomId); }}
          onOpenApproval={() => setMainMenu('전자결재')}
          onOpenBoard={(boardId) => { setMainMenu('게시판'); if (boardId) setInitialBoardView(boardId); }}
        />

        {loading && (
          <div className="absolute inset-0 bg-[var(--toss-card)]/60 z-40 flex items-center justify-center">
            <div className="w-10 h-10 border-2 border-[var(--toss-blue)] rounded-full border-t-transparent animate-spin" />
          </div>
        )}
        <MainContent
          user={user}
          mainMenu={mainMenu}
          data={data}
          subView={subView}
          setSubView={setSubView}
          selectedCo={selectedCo}
          setSelectedCo={setSelectedCo}
          companies={companies}
          selectedCompanyId={selectedCompanyId}
          setSelectedCompanyId={(id: string | null) => {
            persistSelectedCompanyId(id);
            setSelectedCompanyIdState(id);
          }}
          onRefresh={() => fetchERPData(user, selectedCompanyId)}
          initialMyPageTab={initialMyPageTab}
          onConsumeMyPageInitialTab={() => setInitialMyPageTab(null)}
          initialBoard={initialBoardView}
          initialOpenChatRoomId={initialOpenChatRoomId}
          onConsumeOpenChatRoomId={() => setInitialOpenChatRoomId(null)}
          setMainMenu={setMainMenu}
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
