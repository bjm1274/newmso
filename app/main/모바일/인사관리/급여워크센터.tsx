'use client';

/**
 * 급여 워크센터 (모바일) — 데스크톱 PayrollWorkcenter(정산 대시보드 + 13개 모듈)를
 * next/dynamic 으로 재사용. "모바일에서도 모든 기능" 정책에 따라 전 모듈을 모바일에서 노출.
 *
 * 데스크톱 모듈 13종: 정산·대장·시뮬레이터·퇴직정산·퇴직연금·4대보험·원천징수·
 * 임금피크제·최저임금·비과세·통상임금·미지급수당·무급결근.
 * PayrollWorkcenter가 자체 PayrollProvider로 데이터를 fetch하므로 별도 연동 불필요.
 * (관리자 권한관리가 직원권한통합을 dynamic import 하는 패턴과 동일)
 *
 * JM: 단일 책임(헤더 + 워크센터 마운트)
 */

import dynamic from 'next/dynamic';
import type { ErpUser } from '@/types';
import MobileHeader from '../셸/MobileHeader';

const Loading = () => (
  <div style={{ padding: '40px 16px', textAlign: 'center', fontSize: 13, color: 'var(--z-500)' }}>
    급여 워크센터를 불러오는 중...
  </div>
);

const PayrollWorkcenter = dynamic(
  () => import('../../기능부품/인사관리워크센터/payroll/PayrollWorkcenter'),
  { ssr: false, loading: Loading },
);

export type 급여워크센터Props = {
  user: ErpUser;
  onBack: () => void;
};

export default function 급여워크센터({ user, onBack }: 급여워크센터Props) {
  const company = typeof user.company === 'string' ? user.company : undefined;
  return (
    <div className="m-screen">
      <MobileHeader title="급여 워크센터" sub={company || '인사관리'} back={onBack} />
      <div className="m-scroll">
        <PayrollWorkcenter selectedCo={company} user={user} />
      </div>
    </div>
  );
}
