/**
 * attendance-dashboard/page.tsx — 근태 대시보드 (RSC)
 *
 * JM : 단일 책임 — RSC 진입점, metadata만
 * JM2: 인터랙션 없는 Server Component
 */

import type { Metadata } from 'next';
import { AttendanceDashboardClient } from './AttendanceDashboardClient';

export const metadata: Metadata = { title: '근태 대시보드' };

export default function AttendanceDashboardPage() {
  return <AttendanceDashboardClient />;
}
