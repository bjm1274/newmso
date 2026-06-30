'use client';

/**
 * 권한 관리 (모바일) — 데스크톱 RolesWorkcenter(직원별 상세 권한) 풀기능 재사용.
 * "전부 모바일화" 정책: 역할·직원별 권한 변경까지 모바일에서 노출 (PC 우회 제거).
 */

import dynamic from 'next/dynamic';
import type { ErpUser } from '@/types';
import MFeatureScreen from '../공통/MFeatureScreen';

const RolesWorkcenter = dynamic(() => import('../../기능부품/관리자워크센터/RolesWorkcenter'), {
  ssr: false });

export default function 권한관리({ user, onBack }: { user: ErpUser; onBack: () => void }) {
  return (
    <MFeatureScreen title="권한 관리" onBack={onBack}>
      <RolesWorkcenter user={user} />
    </MFeatureScreen>
  );
}
