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
  onSwitchTab?: (tab: MTab, sub?: string) => void;
};

import React from 'react';

export default function 내정보({ user, sub, onSub, onLogout, onSwitchTab }: 내정보Props) {
  const onBack = () => onSub(undefined);

  let contentElement: React.ReactNode;

  if (sub === 'attend') {
    const staffId = typeof user.id === 'string' ? user.id : null;
    const staffName = typeof user.name === 'string' ? user.name : undefined;
    const company = typeof user.company === 'string' ? user.company : undefined;
    contentElement = (
      <SAttend
        staffId={staffId}
        staffName={staffName}
        company={company}
        onBack={onBack}
      />
    );
  } else if (sub === 'leave') {
    contentElement = <연차 user={user} onBack={onBack} />;
  } else if (sub === 'payslip') {
    contentElement = <급여명세 user={user} onBack={onBack} />;
  } else if (sub === 'cert') {
    contentElement = <증명서 user={user} onBack={onBack} />;
  } else if (sub === 'edit') {
    contentElement = <정보수정 user={user} onBack={onBack} />;
  } else {
    contentElement = <SHome user={user} onSub={onSub} onLogout={onLogout} onSwitchTab={onSwitchTab} />;
  }

  return (
    <div data-testid="mypage-view" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {contentElement}
    </div>
  );
}
