/**
 * my-main/page.tsx — 마이페이지 메인 (RSC)
 *
 * JM: 단일 책임 — metadata + MyMainClient 마운트
 */

import type { Metadata } from 'next';
import { MyMainClient } from './MyMainClient';

export const metadata: Metadata = { title: '내정보' };

export default function MyMainPage() {
  return <MyMainClient />;
}
