/**
 * main-v2/settings/page.tsx — 설정 메뉴 홈 (스텁)
 *
 * JM8: 화면 구현 X, 서브화면 목록 카드만
 */

import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: '설정' };

const SETTINGS_ITEMS = [
  { label: '마이페이지', href: '/main-v2/settings/my-page', description: '개인 정보 및 설정' },
  { label: '알림 설정', href: '/main-v2/settings/notifications', description: '푸시 및 앱 알림' },
  { label: '관리자 전용', href: '/main-v2/settings/admin', description: '시스템 관리 기능' },
] as const;

export default function SettingsHomePage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-xl font-black text-[var(--foreground)]">설정</h1>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="list">
        {SETTINGS_ITEMS.map((item) => (
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
