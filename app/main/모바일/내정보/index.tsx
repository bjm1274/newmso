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
import { canAccessMyPageTab } from '@/lib/access-control';

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
    const staffId = resolvedStaffId;
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
    const canRecords =
      canAccessMyPageTab(user, 'salary') || canAccessMyPageTab(user, 'certificates');
    contentElement = canRecords ? (
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
    ) : (
      <div className="m-screen">
        <MobileHeader title="급여·증명서" back={onBack} />
        <div className="m-scroll" style={{ padding: '16px' }}>
          <p style={{ fontSize: 14, color: 'var(--z-500)' }}>급여·증명서 조회 권한이 없습니다.</p>
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
          {/*
            onOpenContractSignature 를 넘겨야 '전자서명 진행' 버튼이 렌더된다.
            (서류제출.tsx 는 `pendingContract && props.onOpenContractSignature` 로 건다)
            이걸 안 넘겨서 모바일에는 버튼이 아예 없었고, 서명 모달을 한 번 닫으면
            동의 항목·교부확인으로 다시 들어갈 방법이 없었다. 계약 상태·요청일은
            컴포넌트가 스스로 조회하므로 그대로 보였고, 그래서 더 헷갈렸다.

            모달은 MobileShell 이 갖고 있다. 셸이 이미 듣고 있는 이벤트를 쏘면
            checkPendingContracts() 가 다시 돌아 모달이 열린다.
          */}
          <MyDocuments
            user={user}
            onOpenContractSignature={() => {
              window.dispatchEvent(new CustomEvent('erp-mobile-trigger-signature'));
            }}
          />
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
