/**
 * main-v2/page.tsx — v2 홈 (RSC)
 *
 * JM: 200줄 이내, 단일 책임 — v2 진입 안내 + 메뉴 카드 그리드
 * JM8: 화면 구현 X, 진입점 카드만
 *
 * ─ W-GG 의존 import ──────────────────────────────────────────────────
 * import { Card }   from '@/app/components/v2/Card';
 * import { Button } from '@/app/components/v2/Button';
 * ──────────────────────────────────────────────────────────────────────
 * W-GG 완료 후 위 두 줄의 주석을 해제하고 기존 Button/Card import를 제거한다.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/app/components/Button';
import { disableV2 } from './feature-flag';

export const metadata: Metadata = { title: '홈' };

// ─ 메뉴 카드 데이터 ──────────────────────────────────────────────────
const MENU_CARDS = [
  {
    key: 'work',
    label: '업무',
    description: '전자결재, 인계노트, 게시판',
    href: '/main-v2/work',
    icon: '📋',
  },
  {
    key: 'hr',
    label: '인사',
    description: '인사관리, 급여, 근태',
    href: '/main-v2/hr',
    icon: '👥',
  },
  {
    key: 'ops',
    label: '운영',
    description: '재고, 시설, OP체크',
    href: '/main-v2/ops',
    icon: '🏥',
  },
  {
    key: 'mgmt',
    label: '경영',
    description: '대시보드, 통계, 퇴원심사',
    href: '/main-v2/mgmt',
    icon: '📊',
  },
  {
    key: 'settings',
    label: '설정',
    description: '마이페이지, 알림, 관리자',
    href: '/main-v2/settings',
    icon: '⚙️',
  },
] as const;

// ─ v1 복귀 Server Action ─────────────────────────────────────────────
async function returnToV1() {
  'use server';
  await disableV2();
  // 리다이렉트는 클라이언트에서 처리 (페이지 새로고침)
}

// ─ 컴포넌트 ──────────────────────────────────────────────────────────
export default function MainV2HomePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* 헤더 배너 */}
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <span className="mb-1 inline-flex items-center rounded-[var(--radius-md)] bg-[var(--accent)]/10 px-2 py-0.5 text-xs font-bold text-[var(--accent)]">
            BETA
          </span>
          <h1 className="mt-1 text-2xl font-black text-[var(--foreground)]">
            MSO v2
          </h1>
          <p className="mt-1 text-sm text-[var(--toss-gray-4)]">
            새 인터페이스를 체험하고 있습니다. 언제든지 v1으로 돌아갈 수 있습니다.
          </p>
        </div>

        {/* v1으로 돌아가기 */}
        <form action={returnToV1}>
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            aria-label="v1 인터페이스로 돌아가기"
          >
            v1으로 돌아가기
          </Button>
        </form>
      </header>

      {/* 메뉴 카드 그리드 */}
      <section aria-label="주 메뉴">
        <ul
          className="grid grid-cols-2 gap-3 sm:grid-cols-3"
          role="list"
        >
          {MENU_CARDS.map((card) => (
            <li key={card.key}>
              <Link
                href={card.href}
                className="app-card flex flex-col gap-2 p-4 transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                aria-label={`${card.label} 메뉴로 이동`}
              >
                <span className="text-2xl" aria-hidden="true">
                  {card.icon}
                </span>
                <span className="text-sm font-bold text-[var(--foreground)]">
                  {card.label}
                </span>
                <span className="text-[11px] text-[var(--toss-gray-4)]">
                  {card.description}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
