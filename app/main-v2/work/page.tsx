/**
 * main-v2/work/page.tsx — 업무 메뉴 홈 (스텁)
 *
 * JM8: 화면 구현 X, 서브화면 목록 카드만
 */

import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: '업무' };

const WORK_ITEMS = [
  { label: '전자결재', href: '/main-v2/work/approval', description: '결재 요청 및 처리' },
  { label: '인계노트', href: '/main-v2/work/handover', description: '업무 인수인계' },
  { label: '게시판', href: '/main-v2/work/board', description: '공지 및 자료 공유' },
  { label: '메신저', href: '/main-v2/work/messenger', description: '팀 채팅' },
] as const;

export default function WorkHomePage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="list">
        {WORK_ITEMS.map((item) => (
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
