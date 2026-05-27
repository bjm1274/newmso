'use client';

/**
 * 인사관리 라우터 — 9개 view 분기.
 *
 * MobileShell이 인사관리 메뉴 진입 시 이 컴포넌트를 마운트.
 * (현재 셸은 home/chat/board/approval/more 5탭 + home 5 sub-route로 구성되어 있고
 *  인사관리 진입점은 'more' 탭 또는 별도 메뉴에서 본 컴포넌트를 호출하는 구조를 가정.)
 *
 * 외부 진입:
 *   <인사관리 user={user} initialView="member" onExit={() => ...} />
 *
 * 내부 view 상태:
 *   'member' | 'attend' | 'leave' | 'abnormal' | 'payroll' | 'welfare' | 'docs'
 *   | 'form-member' | 'form-leave'
 *
 * JM: 분기만 담당, ~80줄
 * JM4: HrView union으로 타입 안정성
 */

import { useCallback, useState } from 'react';
import type { ErpUser } from '@/types';
import 구성원 from './구성원';
import 근태 from './근태';
import 연차 from './연차';
import 근태이상 from './근태이상';
import 급여명세서 from './급여명세서';
import 복지 from './복지';
import 계약문서 from './계약문서';
import 구성원등록 from './구성원등록';
import 연차신청 from './연차신청';

export type HrView =
  | 'member'
  | 'attend'
  | 'leave'
  | 'abnormal'
  | 'payroll'
  | 'welfare'
  | 'docs'
  | 'form-member'
  | 'form-leave';

export type 인사관리Props = {
  user: ErpUser;
  initialView?: HrView;
  /** 인사관리 모듈을 닫고 상위(예: more 탭) 으로 돌아갈 때 호출 */
  onExit: () => void;
};

export default function 인사관리({
  user,
  initialView = 'member',
  onExit,
}: 인사관리Props) {
  const [view, setView] = useState<HrView>(initialView);

  const staffId = typeof user.id === 'string' ? user.id : null;
  const staffName = typeof user.name === 'string' ? user.name : undefined;
  const company = typeof user.company === 'string' ? user.company : undefined;

  const goBack = useCallback(() => {
    // form은 진입 전 화면으로 복귀
    if (view === 'form-member') {
      setView('member');
      return;
    }
    if (view === 'form-leave') {
      setView('leave');
      return;
    }
    onExit();
  }, [view, onExit]);

  switch (view) {
    case 'member':
      return (
        <구성원
          company={company}
          onBack={onExit}
          onOpenForm={() => setView('form-member')}
        />
      );
    case 'attend':
      return <근태 staffId={staffId} company={company} onBack={onExit} />;
    case 'leave':
      return (
        <연차 staffId={staffId} onBack={onExit} onApply={() => setView('form-leave')} />
      );
    case 'abnormal':
      return <근태이상 user={user} onBack={onExit} />;
    case 'payroll':
      return <급여명세서 staffId={staffId} company={company} onBack={onExit} />;
    case 'welfare':
      return <복지 company={company} onBack={onExit} />;
    case 'docs':
      return <계약문서 staffId={staffId} onBack={onExit} />;
    case 'form-member':
      return <구성원등록 onBack={goBack} />;
    case 'form-leave':
      return (
        <연차신청 staffId={staffId} staffName={staffName} onBack={goBack} />
      );
    default:
      return null;
  }
}
