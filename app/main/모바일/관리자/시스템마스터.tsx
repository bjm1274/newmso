'use client';

/**
 * 시스템 마스터 (모바일) — 데스크톱 SystemMasterCenter 풀기능 재사용.
 * "전부 모바일화" 정책: 변경이력·정합성·복구·연차수정 등 전 기능을 모바일에서 노출.
 */

import dynamic from 'next/dynamic';
import type { ErpUser } from '@/types';
import MFeatureScreen from '../공통/MFeatureScreen';

const SystemMasterCenter = dynamic(
  () => import('../../기능부품/관리자전용서브/시스템마스터센터'),
  { ssr: false },
);

export default function 시스템마스터({ user, onBack }: { user: ErpUser; onBack: () => void }) {
  const company = typeof user.company === 'string' ? user.company : undefined;
  return (
    <MFeatureScreen title="시스템 마스터" sub={company} onBack={onBack}>
      <SystemMasterCenter user={user} />
    </MFeatureScreen>
  );
}
