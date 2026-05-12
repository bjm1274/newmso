/**
 * main-v2/hr/page.tsx — 인사 메뉴 홈 (스텁)
 *
 * JM8: 화면 구현 X, 서브화면 목록 카드만
 */

import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: '인사' };

const HR_ITEMS = [
  { label: '인사관리', href: '/main-v2/hr/personnel', description: '직원 정보 및 이력 관리' },
  { label: '급여명세', href: '/main-v2/hr/payroll', description: '급여 계산 및 명세서' },
  { label: '근태관리', href: '/main-v2/hr/attendance', description: '출퇴근 및 근태 현황' },
  { label: '로스터', href: '/main-v2/hr/roster', description: '근무 스케줄 계획' },
  { label: '연차관리', href: '/main-v2/hr/leave', description: '연차 신청 및 현황' },
] as const;

export default function HrHomePage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="list">
        {HR_ITEMS.map((item) => (
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
