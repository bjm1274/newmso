/**
 * main-v2/layout.tsx — v2 메인 레이아웃 (RSC)
 *
 * JM: 단일 책임 — metadata + ShellClient 마운트만
 * JM2: Server Component 유지, 인터랙티브(Sidebar/BottomTab 상태)는 ShellClient에 격리
 * JM6: aside/main/nav 시맨틱 태그는 ShellClient 내부에 있음
 */

import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ShellClient } from './components/ShellClient';

export const metadata: Metadata = {
  title: {
    template: '%s | MSO v2',
    default: 'MSO v2',
  },
};

interface MainV2LayoutProps {
  children: ReactNode;
}

export default function MainV2Layout({ children }: MainV2LayoutProps) {
  return <ShellClient>{children}</ShellClient>;
}
