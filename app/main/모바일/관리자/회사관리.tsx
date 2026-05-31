'use client';

/**
 * 회사 관리 (모바일) — 데스크톱 CompanyWorkcenter 풀기능 재사용.
 * "전부 모바일화" 정책: 기본정보·근무형태·법인카드·급여기준 편집 모두 모바일에서.
 */

import dynamic from 'next/dynamic';
import type { ErpUser } from '@/types';
import MFeatureScreen from '../공통/MFeatureScreen';

const CompanyWorkcenter = dynamic(() => import('../../기능부품/관리자워크센터/CompanyWorkcenter'), {
  ssr: false,
});

export default function 회사관리({ onBack }: { user: ErpUser; onBack: () => void }) {
  return (
    <MFeatureScreen title="회사 관리" onBack={onBack}>
      <CompanyWorkcenter />
    </MFeatureScreen>
  );
}
