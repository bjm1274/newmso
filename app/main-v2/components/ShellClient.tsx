'use client';

/**
 * ShellClient.tsx — layout.tsx용 클라이언트 쉘 래퍼
 *
 * - layout.tsx(RSC)에서 'use client' 부분만 이 컴포넌트에 격리
 * - Sidebar / BottomTab 상태(activeMenu, activeTab)를 이 컴포넌트에서 관리
 * - JM2: 최소 상태, 인터랙티브 부분만 Client Component
 * - JM4: any 금지, 타입 명시
 */

import { useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import BottomTab, { type BottomTabId } from '@/app/components/BottomTab';
import type { MenuId, SidebarUser } from './types';

// pathname → MenuId 매핑
function resolveMenuId(pathname: string): MenuId {
  if (pathname.startsWith('/main-v2/hr')) return '인사·근태·급여';
  if (pathname.startsWith('/main-v2/ops')) return '운영';
  if (pathname.startsWith('/main-v2/mgmt')) return '경영';
  if (pathname.startsWith('/main-v2/settings')) return '설정';
  return '업무';
}

// pathname → BottomTabId 매핑
function resolveTabId(pathname: string): BottomTabId {
  if (pathname.startsWith('/main-v2/work')) return '업무';
  if (pathname.startsWith('/main-v2/settings/my-page')) return '내정보';
  if (pathname.startsWith('/main-v2/settings/notifications')) return '알림';
  if (pathname === '/main-v2') return '홈';
  return '더보기';
}

// 임시 더미 사용자 — W-SN(세션) 워커 완료 후 실제 세션 데이터로 교체
const DUMMY_USER: SidebarUser = {
  name: '사용자',
  role: 'staff',
};

interface ShellClientProps {
  children: ReactNode;
}

export function ShellClient({ children }: ShellClientProps) {
  const pathname = usePathname();

  const [activeMenu, setActiveMenu] = useState<MenuId>(() =>
    resolveMenuId(pathname),
  );
  const [activeTab, setActiveTab] = useState<BottomTabId>(() =>
    resolveTabId(pathname),
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      {/* PC 사이드바 */}
      <aside
        aria-label="주 탐색 메뉴"
        className="hidden md:flex md:flex-col md:shrink-0"
      >
        <Sidebar
          currentMenuId={activeMenu}
          onMenuChange={setActiveMenu}
          user={DUMMY_USER}
        />
      </aside>

      {/* 콘텐츠 영역 */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <main
          id="main-content"
          aria-label="주 콘텐츠"
          className="flex-1 overflow-y-auto"
        >
          {children}
        </main>

        {/* 모바일 하단 탭 */}
        <nav aria-label="하단 탐색 탭" className="md:hidden">
          <BottomTab
            currentTabId={activeTab}
            onTabChange={setActiveTab}
          />
        </nav>
      </div>
    </div>
  );
}
