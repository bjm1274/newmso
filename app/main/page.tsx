'use client';
import { Suspense, useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { withMissingColumnFallback } from '@/lib/supabase-compat';
import { persistSupabaseAccessToken } from '@/lib/supabase-bridge';
import { setSelectedCompanyId as persistSelectedCompanyId, getSelectedCompanyId } from '@/lib/useCompany';
import { hasUserPayloadChanged } from '@/lib/access-control';

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
  const [initialOpenMessageId, setInitialOpenMessageId] = useState<string | null>(null);
  const [initialOpenPostId, setInitialOpenPostId] = useState<string | null>(null);

  const [data, setData] = useState<ERPData>({
    staffs: [],
    depts: [],
    posts: [],
    tasks: [],
    surgeries: [],
    mris: []
  });
  const [loginAt] = useState<string>(new Date().toISOString());

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

  // 1. 초기 로드 시 사용자 정보 및 이전 상태 복구
  useEffect(() => {
    let ignore = false;

    const bootstrap = async () => {
      try {
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
        const sessionUser = payload?.user;
        if (!sessionUser) {
          await clearClientSession();
          router.replace('/');
          return;
        }

        if (!ignore) {
          setUser(sessionUser);
        }

        try {
          localStorage.setItem('erp_user', JSON.stringify(sessionUser));
          persistSupabaseAccessToken(payload?.supabaseAccessToken ?? null);
          void supabase.realtime.setAuth(payload?.supabaseAccessToken ?? null);
        } catch {
          // ignore
        }

        const savedMenu = localStorage.getItem('erp_last_menu');
        const savedSubView = localStorage.getItem('erp_last_subview');
        const savedCo = localStorage.getItem('erp_last_co');

        if (savedMenu && !ignore) setMainMenu(savedMenu);
        if (savedSubView && !ignore) setSubView(savedSubView);

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
              const sorted = (list || []).sort((a: any, b: any) => {
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
  }, [clearClientSession, router]); // 마운트 시 1회만 실행

  // 1-1. 강제 로그아웃 실시간 감지 (Session Security)
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase.channel(`force-logout-${user.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'staff_members', filter: `id=eq.${user.id}` }, (payload) => {
        const forceLogoutAt = payload.new.force_logout_at;
        if (forceLogoutAt && new Date(forceLogoutAt).getTime() > new Date(loginAt).getTime()) {
          alert('관리자에 의해 강제 로그아웃 되었습니다. 다시 로그인해 주세요.');
          void clearClientSession();
          window.location.href = '/';
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [clearClientSession, user?.id, loginAt]);

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
            alert("보안 정책 또는 시스템 업데이트로 인해 모든 세션이 만료되었습니다. 다시 로그인해 주세요.");
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

  // 알림 클릭 시 open_chat_room 쿼리 처리 → 채팅 메뉴 + 해당 채팅방 연동 (웹/모바일 동일)
  useEffect(() => {
    const roomId = searchParams.get('open_chat_room')?.trim();
    const msgId = searchParams.get('open_msg')?.trim();
    if (roomId || msgId) {
      setMainMenu('채팅');
      if (roomId) setInitialOpenChatRoomId(roomId);
      if (msgId) setInitialOpenMessageId(msgId);
      router.replace('/main', { scroll: false });
    }
  }, [searchParams, router]);

  // 페이지 이동 처리 (알림 인박스에서 메뉴 오픈용)
  useEffect(() => {
    const targetMenu = searchParams.get('open_menu')?.trim();
    const openPost = searchParams.get('open_post')?.trim();
    if (targetMenu || openPost) {
      if (targetMenu) setMainMenu(targetMenu);
      const openBoard = searchParams.get('open_board')?.trim();
      if (openBoard) {
        setInitialBoardView(openBoard);
      }
      if (openPost) {
        setMainMenu('게시판'); // open_post가 있으면 무조건 게시판으로 이동
        setInitialOpenPostId(openPost);
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
  }, [user, selectedCompanyId, selectedCo]);

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
      const filterCompanyName =
        isMso
          ? selectedCo && selectedCo !== '전체'
            ? selectedCo
            : null
          : u?.company ?? null;

      const { data: staffData } = await withMissingColumnFallback(
        async () => {
          let staffQuery = supabase
            .from('staff_members')
            .select('*')
            .order('employee_no', { ascending: true });
          if (filterCompanyId) {
            staffQuery = staffQuery.eq('company_id', filterCompanyId);
          } else if (filterCompanyName) {
            staffQuery = staffQuery.eq('company', filterCompanyName);
          }
          return staffQuery;
        },
        async () => {
          let staffQuery = supabase
            .from('staff_members')
            .select('*')
            .order('employee_no', { ascending: true });
          if (filterCompanyName) {
            staffQuery = staffQuery.eq('company', filterCompanyName);
          }
          return staffQuery;
        }
      );

      const { data: postData } = await withMissingColumnFallback(
        async () => {
          let postQuery = supabase.from('board_posts').select('*').order('created_at', { ascending: false });
          if (filterCompanyId) {
            postQuery = postQuery.eq('company_id', filterCompanyId);
          } else if (filterCompanyName) {
            postQuery = postQuery.eq('company', filterCompanyName);
          }
          return postQuery;
        },
        async () => {
          let postQuery = supabase.from('board_posts').select('*').order('created_at', { ascending: false });
          if (filterCompanyName) {
            postQuery = postQuery.eq('company', filterCompanyName);
          }
          return postQuery;
        }
      );

      // 현재 사용자의 변경된 정보(팀/부서 등)가 있으면 세션 동기화
      if (staffData && u?.id) {
        const updatedSelf = staffData.find((s: any) => s.id === u.id);
        if (updatedSelf) {
          const safeSelf = { ...updatedSelf };
          delete safeSelf.password;
          delete safeSelf.passwd;
          if (hasUserPayloadChanged(u, safeSelf)) {
            setUser(safeSelf);
            localStorage.setItem('erp_user', JSON.stringify(safeSelf));
            localStorage.setItem('user_session', JSON.stringify(safeSelf));
          }
        }
      }

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
  const subgroupLabels: Record<string, string> = {
    '경영 분석': '📊 경영 분석',
    '조직 / 권한': '🔐 조직 / 권한',
    '시스템 설정': '⚙️ 시스템 설정',
    '데이터 관리': '🗂️ 데이터 관리',
    '감사 센터': '🔍 감사 센터',
    인력관리: '👥 인력관리',
    '근태/급여': '💰 근태 · 급여',
    '복무/복지': '🏥 복무 · 복지',
    '문서/기타': '📂 문서 · 기타',
  };

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
    <div
      className="flex flex-col md:flex-row h-screen w-full bg-[var(--background)] overflow-hidden min-h-[100dvh]"
      data-testid="main-shell"
    >
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

      {currentSubMenus.length > 0 && (
        <aside className="flex flex-row md:flex-col w-full md:w-44 bg-[var(--toss-card)] border-b md:border-b-0 md:border-r border-[var(--toss-border)] p-2 md:py-4 md:px-3 space-x-1 md:space-x-0 md:space-y-1 shrink-0 overflow-x-auto md:overflow-x-visible no-scrollbar">
          {(() => {
            if (mainMenu === '관리자') {
              const groups = Array.from(new Set(currentSubMenus.map(s => s.group))).filter(Boolean);

              return groups.map(groupName => (
                  <div key={groupName!} className="flex flex-row md:flex-col space-x-1 md:space-x-0 md:space-y-1 mb-0 md:mb-4 shrink-0">
                  <div className="hidden md:block px-3 py-1.5 text-[10px] font-bold text-[var(--toss-gray-4)] uppercase tracking-wider">
                    {subgroupLabels[groupName!] || groupName}
                  </div>
                  {currentSubMenus.filter(s => s.group === groupName).map(sub => (
                    <button
                      key={sub.id}
                      onClick={() => setSubView(sub.id)}
                      className={`flex-none md:w-full text-center md:text-left px-4 md:px-3 py-2 md:py-2.5 text-[11px] font-bold rounded-[12px] transition-all whitespace-nowrap md:flex md:items-center md:gap-2 ${subView === sub.id
                        ? 'bg-[var(--foreground)] text-white shadow-md'
                        : 'text-[var(--toss-gray-3)] hover:text-[var(--foreground)] hover:bg-[var(--toss-gray-1)]'
                        }`}
                    >
                      <span className="hidden md:inline text-[13px] shrink-0">{sub.icon || '•'}</span>
                      <span>{sub.label}</span>
                    </button>
                  ))}
                </div>
              ));
            }

            return currentSubMenus.map((sub) => (
              <button
                key={sub.id}
                onClick={() => setSubView(sub.id)}
                className={`flex-none md:w-full text-center md:text-left px-4 md:px-3 py-2 md:py-2.5 text-[11px] font-bold rounded-[12px] transition-all whitespace-nowrap md:flex md:items-center md:gap-2 ${subView === sub.id
                  ? 'bg-[var(--toss-blue)] text-white shadow-md'
                  : 'text-[var(--toss-gray-3)] hover:text-[var(--foreground)] hover:bg-[var(--toss-gray-1)]'
                  }`}
              >
                <span className="hidden md:inline text-[13px] shrink-0">{sub.icon || '•'}</span>
                <span>{sub.label}</span>
              </button>
            ));
          })()}
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
          onOpenInventory={() => setMainMenu('재고관리')}
        />
        {/* 전역 알림 및 푸시 처리 (채팅 탭을 열지 않아도 작동) */}
        <NotificationSystem
          user={user}
          onOpenChatRoom={(roomId) => { setMainMenu('채팅'); setInitialOpenChatRoomId(roomId); }}
          onOpenMessage={(roomId, messageId) => { setMainMenu('채팅'); setInitialOpenChatRoomId(roomId); setInitialOpenMessageId(messageId); }}
          onOpenApproval={() => setMainMenu('전자결재')}
          onOpenBoard={(boardId) => { setMainMenu('게시판'); if (boardId) setInitialBoardView(boardId); }}
          onOpenPost={(boardId, postId) => { setMainMenu('게시판'); if (boardId) setInitialBoardView(boardId); setInitialOpenPostId(postId); }}
        />

        {loading && (
          <div
            className="absolute inset-0 bg-[var(--toss-card)]/60 z-40 flex items-center justify-center"
            data-testid="main-loading-overlay"
          >
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
          initialOpenPostId={initialOpenPostId}
          onConsumeOpenPostId={() => setInitialOpenPostId(null)}
          initialOpenChatRoomId={initialOpenChatRoomId}
          initialOpenMessageId={initialOpenMessageId}
          onConsumeOpenChatRoomId={() => {
            setInitialOpenChatRoomId(null);
            setInitialOpenMessageId(null);
          }}
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
