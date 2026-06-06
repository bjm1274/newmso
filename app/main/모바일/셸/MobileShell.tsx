'use client';

/**
 * MobileShell — 모바일 진입점.
 *   - .mso-mobile 컨테이너 (토큰 + 폰트 + 다크모드 클래스)
 *   - 9탭 라우트 상태 (tab + sub) + 바텀탭 + 화면 라우터
 * isMobile=true일 때 page.tsx가 PC 셸 대신 이걸 렌더.
 * JM: 단일 책임 (라우팅), ~120줄
 * JM2: route는 단일 useState — 불필요한 리렌더 방지
 * JM6: aria-live 등은 자식 화면에서 처리
 */

import { useEffect, useState } from 'react';
import type { ErpUser } from '@/types';
import '../tokens.css';
import MobileBottomTab from './MobileBottomTab';
import type { MRoute, MTab, MHomeSub } from './m-routes';
import 알림탭 from '../내정보/알림탭';
import 내정보 from '../내정보';
import 추가기능 from '../추가기능';
import 채팅 from '../채팅';
import 게시판 from '../게시판';
import 결재 from '../결재';
import 인사관리 from '../인사관리';
import 재고관리 from '../재고';
import 관리자 from '../관리자';
import 오프라인배너 from '../공통/오프라인배너';
import 오프라인실패배너 from '../공통/오프라인실패배너';
import { initOfflineQueueFlush } from '@/lib/offline-queue-supabase';
import { initUploadQueueFlush } from '@/lib/offline-upload-queue';
import { useChatRoomsForMobile } from '../채팅/data-hooks';
import { useNavigation } from '../../contexts/NavigationContext';

export type MobileShellProps = {
  user: ErpUser;
  onLogout: () => void;
};

export default function MobileShell({ user, onLogout }: MobileShellProps) {
  const { mainMenu, setMainMenu, subView, setSubView } = useNavigation();

  const getTabFromMenu = (menu: string): MTab => {
    const menuMap: Record<string, MTab> = {
      '알림': 'notif', 'notif': 'notif',
      '내정보': 'mypage', 'mypage': 'mypage',
      '추가기능': 'addon', 'addon': 'addon', 'extra': 'addon',
      '채팅': 'chat', 'chat': 'chat',
      '게시판': 'board', 'board': 'board',
      '전자결재': 'approval', 'approval': 'approval',
      '인사관리': 'hr', 'hr': 'hr',
      '재고관리': 'stock', 'stock': 'stock', 'inventory': 'stock',
      '관리자': 'admin', 'admin': 'admin'
    };
    return menuMap[menu] || 'mypage';
  };

  const [route, setRoute] = useState<MRoute>(() => ({
    tab: getTabFromMenu(mainMenu)
  }));
  const [dark, setDark] = useState(false);
  const [chatResetToken, setChatResetToken] = useState(0);

  const userId = typeof user.id === 'string' ? user.id : null;
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const { rooms, refresh: refreshRooms } = useChatRoomsForMobile(userId, activeRoomId);
  const totalUnread = rooms.reduce((sum, r) => sum + (r.unread_count || 0), 0);

  // Synchronize route.tab when global mainMenu changes
  useEffect(() => {
    const targetTab = getTabFromMenu(mainMenu);
    if (targetTab !== route.tab) {
      setRoute({ tab: targetTab });
    }
  }, [mainMenu]);

  // URL query parameter synchronization on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const menu = params.get('open_menu');
    const board = params.get('open_board');
    if (menu) {
      const targetTab = getTabFromMenu(menu);
      setRoute({ tab: targetTab });
      if (setMainMenu) {
        setMainMenu(menu);
      }
      if (targetTab === 'board' && board && setSubView) {
        setSubView(board);
      }
    }
  }, [setMainMenu, setSubView]);

  // 시스템 다크모드 동기화
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    setDark(mql.matches);
    const handler = (e: MediaQueryListEvent) => setDark(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  // 오프라인 큐 자동 flush 초기화 (앱 마운트 시 1회)
  useEffect(() => {
    const stop = initOfflineQueueFlush();
    return stop;
  }, []);

  // 업로드 큐 자동 flush 초기화 (앱 마운트 시 1회)
  useEffect(() => {
    const stop = initUploadQueueFlush();
    return stop;
  }, []);

  const switchTab = (tab: MTab) => {
    if (tab === 'chat' && route.tab === 'chat') {
      setChatResetToken((prev) => prev + 1);
    }
    setRoute({ tab });
    const menuMap: Record<MTab, string> = {
      notif: '알림',
      mypage: '내정보',
      addon: '추가기능',
      chat: '채팅',
      board: '게시판',
      approval: '전자결재',
      hr: '인사관리',
      stock: '재고관리',
      admin: '관리자'
    };
    const targetMenu = menuMap[tab];
    if (targetMenu && setMainMenu) {
      setMainMenu(targetMenu);
    }
  };

  const setHomeSub = (sub: MHomeSub | undefined) => {
    setRoute({ tab: 'mypage', sub });
  };

  const goMypage = () => switchTab('mypage');

  const containerClass = 'mso-mobile' + (dark ? ' dark' : '');

  return (
    <div className={containerClass} data-testid="main-shell">
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'absolute', inset: 0 }}>
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <오프라인실패배너 />
          <오프라인배너 />
          {route.tab === 'notif' && <알림탭 user={user} />}
          {route.tab === 'mypage' && (
            <내정보
              user={user}
              sub={route.sub}
              onSub={setHomeSub}
              onLogout={onLogout}
              onSwitchTab={switchTab}
            />
          )}
          {route.tab === 'addon' && <추가기능 user={user} onBack={goMypage} />}
          {route.tab === 'chat' && (
            <채팅
              user={user}
              rooms={rooms}
              refreshRooms={refreshRooms}
              onActiveRoomChange={setActiveRoomId}
              resetToken={chatResetToken}
            />
          )}
          {route.tab === 'board' && <게시판 user={user} onBack={goMypage} subView={subView} setSubView={setSubView} />}
          {route.tab === 'approval' && (
            <div data-testid="approval-view" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <결재 user={user} />
            </div>
          )}
          {route.tab === 'hr' && (
            <div data-testid="hr-view" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <인사관리 user={user} onExit={goMypage} />
            </div>
          )}
          {route.tab === 'stock' && (
            <div data-testid="inventory-view" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <재고관리 user={user} onBack={goMypage} />
            </div>
          )}
          {route.tab === 'admin' && (
            <div data-testid="admin-view" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <관리자 user={user} onBack={goMypage} />
            </div>
          )}
        </div>
        <MobileBottomTab active={route.tab} onChange={switchTab} badges={{ chat: totalUnread }} />
      </div>
    </div>
  );
}
