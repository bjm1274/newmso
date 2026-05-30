'use client';

/**
 * 내정보 라우터 — home/attend/leave/payslip/cert/edit 6 sub-route 전환.
 * MobileShell이 tab === 'home' 일 때 마운트.
 * JM: 단일 책임 (분기만), ~60줄
 */

import type { ErpUser } from '@/types';
import type { MHomeSub, MTab } from '../셸/m-routes';
import SHome from './홈';
import SAttend from './출퇴근체크인';
import 연차 from './연차';
import 급여명세 from './급여명세';
import 증명서 from './증명서';
import 정보수정 from './정보수정';

export type 내정보Props = {
  user: ErpUser;
  sub?: MHomeSub;
  onSub: (sub: MHomeSub | undefined) => void;
  onLogout: () => void;
  onSwitchTab?: (tab: MTab) => void;
};

export default function 내정보({ user, sub, onSub, onLogout, onSwitchTab }: 내정보Props) {
  const onBack = () => onSub(undefined);

  if (sub === 'attend') {
    const staffId = typeof user.id === 'string' ? user.id : null;
    const staffName = typeof user.name === 'string' ? user.name : undefined;
    const company = typeof user.company === 'string' ? user.company : undefined;
    return (
      <SAttend
        staffId={staffId}
        staffName={staffName}
        company={company}
        onBack={onBack}
      />
    );
  }
  if (sub === 'leave') {
    return <연차 user={user} onBack={onBack} />;
  }
  if (sub === 'payslip') {
    return <급여명세 user={user} onBack={onBack} />;
  }
  if (sub === 'cert') {
    return <증명서 user={user} onBack={onBack} />;
  }
  if (sub === 'edit') {
    return <정보수정 user={user} onBack={onBack} />;
  }
  return <SHome user={user} onSub={onSub} onLogout={onLogout} onSwitchTab={onSwitchTab} />;
}
