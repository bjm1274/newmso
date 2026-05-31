'use client';

/**
 * 감사 · 백업 (모바일) — 데스크톱 AuditWorkcenter 풀기능 재사용.
 * "전부 모바일화" 정책: 처리·차단 액션, 복구·DR 전환까지 모바일에서 노출.
 */

import dynamic from 'next/dynamic';
import type { ErpUser } from '@/types';
import MFeatureScreen from '../공통/MFeatureScreen';

const AuditWorkcenter = dynamic(() => import('../../기능부품/관리자워크센터/AuditWorkcenter'), {
  ssr: false,
});

export default function 감사백업({ user, onBack }: { user: ErpUser; onBack: () => void }) {
  const company = typeof user.company === 'string' ? user.company : undefined;
  return (
    <MFeatureScreen title="감사 · 백업" sub={company} onBack={onBack}>
      <AuditWorkcenter user={user} />
    </MFeatureScreen>
  );
}
