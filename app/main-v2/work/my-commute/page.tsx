/**
 * my-commute/page.tsx — 출퇴근 (RSC)
 *
 * JM: 단일 책임 — metadata + CommuteClient 마운트
 */

import type { Metadata } from 'next';
import { CommuteClient } from './CommuteClient';

export const metadata: Metadata = { title: '출퇴근' };

export default function MyCommutePage() {
  return <CommuteClient />;
}
