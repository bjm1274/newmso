'use client';

/**
 * 운영 설정 (모바일) — 데스크톱 OpsWorkcenter 풀기능 재사용.
 * "전부 모바일화" 정책: 일반·메시지·팝업·외부연동 편집 모두 모바일에서.
 */

import dynamic from 'next/dynamic';
import type { ErpUser } from '@/types';
import MFeatureScreen from '../공통/MFeatureScreen';

const OpsWorkcenter = dynamic(() => import('../../기능부품/관리자워크센터/OpsWorkcenter'), {
  ssr: false,
});

export default function 운영설정({ onBack }: { user: ErpUser; onBack: () => void }) {
  return (
    <MFeatureScreen title="운영 설정" onBack={onBack}>
      <OpsWorkcenter />
    </MFeatureScreen>
  );
}
