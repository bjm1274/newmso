'use client';

/**
 * MobileShell — 모바일 진입점.
 *   - .mso-mobile 컨테이너 (토큰 + 폰트 + 다크모드 클래스)
 *   - 라우트 상태 (tab + sub) + 바텀탭 + 화면 라우터
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
import 내정보 from '../내정보';
import 채팅 from '../채팅';
import 게시판 from '../게시판';
import 결재 from '../결재';
import 더보기 from './더보기';

export type MobileShellProps = {
  user: ErpUser;
  onLogout: () => void;
};

export default function MobileShell({ user, onLogout }: MobileShellProps) {
  const [route, setRoute] = useState<MRoute>({ tab: 'home' });
  const [dark, setDark] = useState(false);

  // 시스템 다크모드 동기화
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    setDark(mql.matches);
    const handler = (e: MediaQueryListEvent) => setDark(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  const switchTab = (tab: MTab) => {
    setRoute({ tab });
  };

  const setHomeSub = (sub: MHomeSub | undefined) => {
    setRoute({ tab: 'home', sub });
  };

  const containerClass = 'mso-mobile' + (dark ? ' dark' : '');

  return (
    <div className={containerClass}>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'absolute', inset: 0 }}>
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {route.tab === 'home' && (
            <내정보
              user={user}
              sub={route.sub}
              onSub={setHomeSub}
              onLogout={onLogout}
            />
          )}
          {route.tab === 'chat' && <채팅 user={user} />}
          {route.tab === 'board' && <게시판 user={user} onBack={() => switchTab('home')} />}
          {route.tab === 'approval' && <결재 user={user} />}
          {route.tab === 'more' && <더보기 user={user} onLogout={onLogout} />}
        </div>
        <MobileBottomTab active={route.tab} onChange={switchTab} />
      </div>
    </div>
  );
}
