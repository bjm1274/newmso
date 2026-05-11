'use client';

/**
 * AttendanceTabs.tsx — 근태 3개 화면 공통 상단 탭
 *
 * JM : 단일 책임 — 탭 네비게이션만
 * JM4: any 금지, union 타입
 * JM6: role="tablist", aria-selected, 키보드 탐색
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type AttendanceTab = 'dashboard' | 'calendar' | 'roster';

const TABS = [
  { id: 'dashboard' as AttendanceTab, label: '근태 대시보드', href: '/main-v2/hr/attendance-dashboard' },
  { id: 'calendar'  as AttendanceTab, label: '근태 달력',     href: '/main-v2/hr/attendance-calendar' },
  { id: 'roster'    as AttendanceTab, label: '근무표',         href: '/main-v2/hr/attendance-roster' },
] as const;

function resolveActive(pathname: string): AttendanceTab {
  if (pathname.includes('attendance-calendar')) return 'calendar';
  if (pathname.includes('attendance-roster'))   return 'roster';
  return 'dashboard';
}

export function AttendanceTabs() {
  const pathname  = usePathname();
  const activeTab = resolveActive(pathname);

  return (
    <nav
      role="tablist"
      aria-label="근태 화면 탭"
      className="flex border-b border-[var(--border)] bg-[var(--card)] px-6"
    >
      {TABS.map(({ id, label, href }) => {
        const isActive = id === activeTab;
        return (
          <Link
            key={id}
            href={href}
            role="tab"
            aria-selected={isActive}
            aria-current={isActive ? 'page' : undefined}
            className={[
              'inline-flex items-center px-5 py-3.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              'focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-[-2px]',
              isActive
                ? 'border-[var(--accent)] text-[var(--accent)] font-semibold'
                : 'border-transparent text-[var(--toss-gray-4)] hover:text-[var(--foreground)]',
            ].join(' ')}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
