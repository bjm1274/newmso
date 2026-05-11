/**
 * main-v2/ops/page.tsx — 운영 메뉴 홈 (스텁)
 *
 * JM8: 화면 구현 X, 서브화면 목록 카드만
 */

import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: '운영' };

const OPS_ITEMS = [
  { label: '재고관리', href: '/main-v2/ops/inventory', description: '물품 입출고 및 현황' },
  { label: 'OP 체크', href: '/main-v2/ops/op-check', description: '운영 점검 체크리스트' },
  { label: '시설관리', href: '/main-v2/ops/facility', description: '시설 현황 및 보수' },
  { label: '비품대여', href: '/main-v2/ops/rental', description: '비품 대여 신청 현황' },
] as const;

export default function OpsHomePage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-xl font-black text-[var(--foreground)]">운영</h1>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="list">
        {OPS_ITEMS.map((item) => (
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
