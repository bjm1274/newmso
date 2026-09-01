'use client';

/**
 * 인사관리 워크센터 라우터
 *
 * 사이드바2 메뉴 id를 받아 해당 워크센터 컴포넌트를 렌더링한다.
 * - 영문 id (`member`, `attend`, `leave`, `abnormal`, `welfare`, `docs`): 신규 워크센터
 * - 한글 별칭 (`구성원`, `근태`, `연차·휴가`, `근태이상`, `복지`, `계약·문서`): 호환 유지
 *
 * 급여(payroll) 워크센터는 별도 에이전트가 처리하므로 본 라우터에서 제외.
 *
 * JM: 단일 책임 — id → 컴포넌트 매핑
 * JM4: any 금지, WorkcenterId union 사용
 */

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import type { StaffMember } from '@/types';
import type { WorkcenterId } from './workcenter-common';

function HrSubLoading() {
  return (
    <div className="flex min-h-[240px] flex-1 items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--toss-blue-light)] border-t-[var(--accent)]" />
    </div>
  );
}

// 워크센터 단위 code-split — 인사관리 진입 시 급여/근태/복지 전체 번들을 한꺼번에 받지 않음
const MemberWorkcenter = dynamic(() => import('./MemberWorkcenter'), {
  ssr: false,
  loading: () => <HrSubLoading />,
});
const AttendWorkcenter = dynamic(() => import('./AttendWorkcenter'), {
  ssr: false,
  loading: () => <HrSubLoading />,
});
const LeaveWorkcenter = dynamic(() => import('./LeaveWorkcenter'), {
  ssr: false,
  loading: () => <HrSubLoading />,
});
const AbnormalWorkcenter = dynamic(() => import('./AbnormalWorkcenter'), {
  ssr: false,
  loading: () => <HrSubLoading />,
});
const PayrollWorkcenter = dynamic(() => import('./payroll/PayrollWorkcenter'), {
  ssr: false,
  loading: () => <HrSubLoading />,
});
const WelfareWorkcenter = dynamic(() => import('./WelfareWorkcenter'), {
  ssr: false,
  loading: () => <HrSubLoading />,
});
const DocsWorkcenter = dynamic(() => import('./DocsWorkcenter'), {
  ssr: false,
  loading: () => <HrSubLoading />,
});

// 근무표 관련 별칭 → 근태 워크센터 schedule 탭
export function resolveAttendInitialTab(
  initialMenu?: string | null,
): 'dashboard' | 'schedule' | 'calendar' | 'abnormal' {
  const raw = String(initialMenu || '').trim();
  if (
    raw === '간호근무표' ||
    raw === '근무표자동편성' ||
    raw === '근무표 자동편성' ||
    raw === '근무표생성' ||
    raw === '근무표 생성' ||
    raw === '근무표편성' ||
    raw === '근무표 편성' ||
    raw === '교대근무' ||
    raw === 'schedule'
  ) {
    return 'schedule';
  }
  if (raw === 'abnormal' || raw.includes('근태이상') || raw.includes('지각')) {
    return 'abnormal';
  }
  if (raw === 'calendar' || raw === '근태달력') return 'calendar';
  return 'dashboard';
}

interface HrWorkcenterRouterProps {
  workcenterId: WorkcenterId;
  staffs?: StaffMember[];
  selectedCo?: string;
  statusFilter?: '재직' | '퇴사';
  user?: Record<string, unknown> | null;
  onRefresh?: () => void;
  canRegisterNewStaff?: boolean;
  onOpenNewStaff?: () => void;
  onOpenDocumentRepoForStaff?: (staff: StaffMember) => void;
  linkedTarget?: { id?: string; name?: string };
  canManageDocuments?: boolean;
  initialMenu?: string | null;
}

/**
 * 워크센터 라우터.
 * 신규 사이드바2가 영문 id를 전달할 때, HRMainView가 이 컴포넌트로
 * 위임하여 통합 워크센터 화면을 렌더링한다.
 */
export default function HrWorkcenterRouter({
  workcenterId,
  staffs = [],
  selectedCo,
  statusFilter,
  user = null,
  onRefresh,
  canRegisterNewStaff = false,
  onOpenNewStaff,
  onOpenDocumentRepoForStaff,
  linkedTarget,
  canManageDocuments = false,
  initialMenu }: HrWorkcenterRouterProps) {
  const view = useMemo(() => {
    switch (workcenterId) {
      case 'member':
        return (
          <MemberWorkcenter
            staffs={staffs}
            selectedCo={selectedCo}
            statusFilter={statusFilter}
            user={user}
            onRefresh={onRefresh}
            canRegisterNewStaff={canRegisterNewStaff}
            onOpenNewStaff={onOpenNewStaff}
            onOpenDocumentRepoForStaff={onOpenDocumentRepoForStaff}
          />
        );
      case 'attend':
        return (
          <AttendWorkcenter
            staffs={staffs}
            selectedCo={selectedCo}
            user={user}
            onRefresh={onRefresh}
            initialTab={resolveAttendInitialTab(initialMenu)}
          />
        );
      case 'leave':
        return (
          <LeaveWorkcenter
            staffs={staffs}
            selectedCo={selectedCo}
            user={user}
            onRefresh={onRefresh}
          />
        );
      case 'abnormal':
        return (
          <AbnormalWorkcenter
            staffs={staffs}
            selectedCo={selectedCo}
            user={user}
          />
        );
      case 'payroll':
        return (
          <PayrollWorkcenter
            selectedCo={selectedCo}
            user={user}
            initialModule={initialMenu}
          />
        );
      case 'welfare':
        return (
          <WelfareWorkcenter
            staffs={staffs}
            selectedCo={selectedCo}
            user={user}
          />
        );
      case 'docs':
        return (
          <DocsWorkcenter
            staffs={staffs}
            selectedCo={selectedCo}
            user={user}
            onRefresh={onRefresh}
            linkedTarget={linkedTarget}
            canManageDocuments={canManageDocuments}
          />
        );
      default:
        return null;
    }
  }, [
    workcenterId,
    staffs,
    selectedCo,
    user,
    onRefresh,
    canRegisterNewStaff,
    onOpenNewStaff,
    onOpenDocumentRepoForStaff,
    linkedTarget,
    canManageDocuments,
    statusFilter,
    initialMenu,
  ]);

  return view;
}

// 외부에서 워크센터 컴포넌트를 직접 사용할 때 편의 export
export {
  MemberWorkcenter,
  AttendWorkcenter,
  LeaveWorkcenter,
  AbnormalWorkcenter,
  PayrollWorkcenter,
  WelfareWorkcenter,
  DocsWorkcenter };
export type { WorkcenterId };
