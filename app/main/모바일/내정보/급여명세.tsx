'use client';

/**
 * 급여명세 — 모바일 내정보 라우트용 얇은 래퍼.
 *
 * 실제 급여 조회/비밀번호 확인/발행 명세 필터/공유·인쇄 UI는
 * PC 마이페이지의 공통 SalarySlipContainer가 담당한다.
 */

import { memo } from 'react';
import type { ErpUser } from '@/types';
import MobileHeader from '../셸/MobileHeader';
import SalarySlipContainer from '@/app/main/기능부품/마이페이지/급여명세서';

export type 급여명세Props = {
  user: ErpUser;
  onBack: () => void;
};

function 급여명세Base({ user, onBack }: 급여명세Props) {
  return (
    <div className="m-screen">
      <MobileHeader title="급여명세" back={onBack} />
      <div className="m-scroll" style={{ padding: '16px 16px 0' }}>
        <SalarySlipContainer user={user} />
      </div>
    </div>
  );
}

const 급여명세 = memo(급여명세Base);
export default 급여명세;
