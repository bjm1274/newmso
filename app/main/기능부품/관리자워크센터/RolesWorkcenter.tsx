'use client';

/**
 * 권한 관리 — 직원별 권한 관리(실제 StaffPermissionManager)
 *
 * JM: 250줄 이내
 * JM2: StaffPermissionManager는 dynamic import
 * JM6: <table> + scope, 칩은 의미 색 + 텍스트 함께
 * JM4: 권한 값은 RolePermissionValue union
 */

import dynamic from 'next/dynamic';
import { WorkcenterHeader } from './admin-workcenter-common';
import { ADMIN_WORKCENTERS } from './admin-types';

const Loading = () => (
  <div className="flex items-center justify-center py-20">
    <div className="w-7 h-7 border-2 border-[var(--accent)] rounded-full border-t-transparent animate-spin" />
  </div>
);

// 실제 직원별 권한 관리 컴포넌트
const StaffPermissionManager = dynamic(
  () => import('../관리자전용서브/직원권한통합'),
  { ssr: false, loading: Loading }
);

export default function RolesWorkcenter() {
  const meta = ADMIN_WORKCENTERS.roles;

  return (
    <>
      <WorkcenterHeader
        title={meta.label}
        subtitle="직원별 상세 권한 설정"
        mergedCount={meta.mergedCount}
        mergedTitles={meta.mergedTitles}
      />

      <StaffPermissionManager onRefresh={undefined} />
    </>
  );
}
