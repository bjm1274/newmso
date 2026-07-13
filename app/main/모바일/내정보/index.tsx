'use client';

/**
 * 내정보 라우터 — home/attend/leave/records/edit/todo/notifSettings sub-route 전환.
 * MobileShell이 tab === 'home' 일 때 마운트.
 * JM: 단일 책임 (분기만), ~60줄
 */

import React, { useState } from 'react';
import type { ErpUser } from '@/types';
import type { MHomeSub, MTab } from '../셸/m-routes';
import SHome from './홈';
import SAttend from './출퇴근체크인';
import 연차 from './연차';
import 정보수정 from './정보수정';
import 나의할일 from './나의할일';
import 알림설정 from './알림설정';
import { PayrollAndCertificatesHub } from '@/app/main/기능부품/마이페이지/마이페이지공통섹션';
import MyDocuments from '@/app/main/기능부품/마이페이지/서류제출';
import MobileHeader from '../셸/MobileHeader';
import { useResolvedStaffId } from '@/lib/use-resolved-staff-id';

export type 내정보Props = {
  user: ErpUser;
  sub?: MHomeSub;
  onSub: (sub: MHomeSub | undefined) => void;
  onLogout: () => void;
  onSwitchTab?: (tab: MTab, sub?: string) => void;
};

export default function 내정보({ user, sub, onSub, onLogout, onSwitchTab }: 내정보Props) {
  const onBack = () => onSub(undefined);
  const [recordsView, setRecordsView] = useState<'salary' | 'certificates'>('salary');
  const resolvedStaffId = useResolvedStaffId(user as Record<string, unknown>);

  let contentElement: React.ReactNode;

  if (sub === 'attend') {
    const staffId = resolvedStaffId ?? (typeof user.id === 'string' ? user.id : null);
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
    contentElement = <연차 user={user} onBack={onBack} onSwitchTab={onSwitchTab} />;
  } else if (sub === 'records') {
    contentElement = (
      <div className="m-screen">
        <div className="m-scroll" style={{ padding: '0 0 0' }}>
          <PayrollAndCertificatesHub
            user={user}
            activeView={recordsView}
            onBack={onBack}
            onChangeView={setRecordsView}
          />
        </div>
      </div>
    );
  } else if (sub === 'edit') {
    contentElement = <정보수정 user={user} onBack={onBack} />;
  } else if (sub === 'todo') {
    contentElement = <나의할일 user={user} onBack={onBack} onSwitchTab={onSwitchTab} />;
  } else if (sub === 'notifSettings') {
    contentElement = <알림설정 user={user} onBack={onBack} />;
  } else if (sub === 'docs') {
    contentElement = (
      <div className="m-screen">
        <MobileHeader title="서류 제출" back={onBack} />
        <div className="m-scroll" style={{ padding: '12px 16px 24px' }}>
          <MyDocuments user={user} />
        </div>
      </div>
    );
  } else {
    contentElement = <SHome user={user} onSub={onSub} onLogout={onLogout} onSwitchTab={onSwitchTab} />;
  }

  return (
    <div data-testid="mypage-view" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {contentElement}
    </div>
  );
}
