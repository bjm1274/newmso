/**
 * page.tsx — 경영 인사이트 대시보드 (경영 + 재무 통합)
 * JM8: 본 그룹 컴포넌트만 import
 */

import type { Metadata } from 'next';
import { InsightsDashboardClient } from './InsightsDashboardClient';

export const metadata: Metadata = {
  title: '경영 인사이트',
  description: '경영·재무 통합 대시보드 — 매출, 이익, 환자, 예산 현황',
};

export default function InsightsPage() {
  return (
    <main className="mx-auto max-w-screen-xl px-4 py-8">
      <InsightsDashboardClient />
    </main>
  );
}
