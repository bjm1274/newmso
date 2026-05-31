'use client';

/**
 * 경영 대시보드 (모바일) — 데스크톱 ExecDashboard 풀기능 재사용.
 * "전부 모바일화" 정책: 상세 분석·드릴다운·다운로드 모두 모바일에서 노출 (PC 우회 제거).
 */

import dynamic from 'next/dynamic';
import type { ErpUser } from '@/types';
import MFeatureScreen from '../공통/MFeatureScreen';

const ExecDashboard = dynamic(() => import('../../기능부품/관리자워크센터/ExecDashboard'), {
  ssr: false,
});

export default function 경영대시({ user, onBack }: { user: ErpUser; onBack: () => void }) {
  const company = typeof user.company === 'string' ? user.company : undefined;
  return (
    <MFeatureScreen title="경영 대시보드" sub={company} onBack={onBack}>
      <ExecDashboard />
    </MFeatureScreen>
  );
}
