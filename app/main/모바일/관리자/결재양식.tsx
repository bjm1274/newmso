'use client';

/**
 * 결재 양식 (모바일) — 데스크톱 FormsWorkcenter 풀기능 재사용.
 * "전부 모바일화" 정책: 양식 신규·편집·디자인·삭제 모두 모바일에서.
 */

import dynamic from 'next/dynamic';
import type { ErpUser } from '@/types';
import MFeatureScreen from '../공통/MFeatureScreen';

const FormsWorkcenter = dynamic(() => import('../../기능부품/관리자워크센터/FormsWorkcenter'), {
  ssr: false,
});

export default function 결재양식({ onBack }: { user: ErpUser; onBack: () => void }) {
  return (
    <MFeatureScreen title="결재 양식" onBack={onBack}>
      <FormsWorkcenter />
    </MFeatureScreen>
  );
}
