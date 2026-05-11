/**
 * app/main-v2/ops/discharge-review/page.tsx
 * 퇴원심사 목록 페이지 — Server Component
 * mockup: ops_discharge_review_list (PC.html 목록 패널)
 */

import type { Metadata } from 'next';
import DischargeReviewListClient from './DischargeReviewListClient';

export const metadata: Metadata = {
  title: '퇴원심사',
};

export default function DischargeReviewListPage() {
  return (
    <div className="h-full">
      <DischargeReviewListClient />
    </div>
  );
}
