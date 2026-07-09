'use client';

/**
 * 간호근무표 — 통합 근무표 편성(RosterWorkspace) 으로 이전.
 * 즐겨찾기·딥링크 호환용 thin wrapper.
 */

import RosterWorkspace from '../인사관리워크센터/AttendWorkcenter/RosterWorkspace';
import type { StaffMember } from '@/types';

export default function NurseSchedule({
  staffs = [],
  selectedCo,
}: {
  staffs?: StaffMember[];
  selectedCo?: string;
  user?: unknown;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col p-3" data-testid="nurse-schedule-compat">
      <div className="mb-2 rounded-[var(--radius-md)] border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] font-bold text-blue-800">
        근무표 자동편성은 <strong>근태 → 근무표 편성</strong> 탭에 통합되었습니다. 아래에서 동일
        기능을 사용합니다.
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <RosterWorkspace staffs={staffs} selectedCo={selectedCo} />
      </div>
    </div>
  );
}
