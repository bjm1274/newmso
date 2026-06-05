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

export type MobileShellProps = {
  user: ErpUser;
  onLogout: () => void;
};

export default function MobileShell({ user, onLogout }: MobileShellProps) {
  const [route, setRoute] = useState<MRoute>({ tab: 'mypage' });
  const [dark, setDark] = useState(false);

  const userId = typeof user.id === 'string' ? user.id : null;
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const { rooms, refresh: refreshRooms } = useChatRoomsForMobile(userId, activeRoomId);
  const totalUnread = rooms.reduce((sum, r) => sum + (r.unread_count || 0), 0);

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
    setRoute({ tab });
  };

  const setHomeSub = (sub: MHomeSub | undefined) => {
    setRoute({ tab: 'mypage', sub });
  };

  const goMypage = () => switchTab('mypage');

  const containerClass = 'mso-mobile' + (dark ? ' dark' : '');

  return (
    <div className={containerClass}>
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
            />
          )}
          {route.tab === 'board' && <게시판 user={user} onBack={goMypage} />}
          {route.tab === 'approval' && <결재 user={user} />}
          {route.tab === 'hr' && <인사관리 user={user} onExit={goMypage} />}
          {route.tab === 'stock' && <재고관리 user={user} onBack={goMypage} />}
          {route.tab === 'admin' && <관리자 user={user} onBack={goMypage} />}
        </div>
        <MobileBottomTab active={route.tab} onChange={switchTab} badges={{ chat: totalUnread }} />
      </div>
    </div>
  );
}
