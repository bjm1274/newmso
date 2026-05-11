/**
 * page.tsx — 업무공유 협업센터 (RSC 진입점)
 *
 * JM:  단일 책임 — metadata + Client 마운트만
 * JM2: Server Component 유지, 인터랙션은 TeamShareClient에 격리
 */

import type { Metadata } from 'next';
import TeamShareClient from './TeamShareClient';

export const metadata: Metadata = { title: '업무공유 협업센터' };

export default function TeamSharePage() {
  return <TeamShareClient />;
}
