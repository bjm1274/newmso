/**
 * main-v2/mgmt/page.tsx — 경영 메뉴 홈 (스텁)
 *
 * JM8: 화면 구현 X, 서브화면 목록 카드만
 */

import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: '경영' };

const MGMT_ITEMS = [
  { label: '대시보드', href: '/main-v2/mgmt/dashboard', description: '핵심 지표 통합 현황' },
  { label: '퇴원심사', href: '/main-v2/mgmt/discharge', description: 'AI 퇴원 심사 지원' },
  { label: '근무현황', href: '/main-v2/mgmt/work-status', description: '전체 근무 현황 조회' },
  { label: '보고서', href: '/main-v2/mgmt/report', description: '월간·연간 경영 보고서' },
] as const;

export default function MgmtHomePage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="list">
        {MGMT_ITEMS.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="app-card flex flex-col gap-1 p-4 transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              aria-label={`${item.label}로 이동`}
            >
              <span className="text-sm font-bold text-[var(--foreground)]">{item.label}</span>
              <span className="text-xs text-[var(--toss-gray-4)]">{item.description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
