'use client';

/**
 * 구성원 워크센터 (member) — 새 디자인 재작성
 *
 * 구조 (지시서 §1-2):
 *   - 4 KPI 행 (전체 인원 / 신규 입사 / 퇴사 예정 / 평균 근속)
 *   - 탭 (구성원 / 인사발령 / 교육·자격)
 *   - 구성원 탭: 좌측 직원 표 + 우측 프로필 드로어 (인사 이력 타임라인)
 *   - 인사발령 탭: 최근 발령 카드 리스트 + 상세 진입점 (기존 컴포넌트 위임)
 *   - 교육·자격 탭: 의무교육 진행률 카드 + 자격 만료 임박 + 상세 진입점
 *
 * 분할 (JM 500줄):
 *   - data.ts                — KPI 집계 / 타입 / 헬퍼
 *   - StaffTable.tsx         — 직원 표 + 필터
 *   - StaffDrawer.tsx        — 우측 프로필 드로어
 *   - AppointmentBoard.tsx   — 인사발령 탭
 *   - EducationBoard.tsx     — 교육·자격 탭
 *
 * JM4: any 금지, MemberTabId union 명시
 * JM6: tablist · aria-selected · dialog 패턴은 자식 컴포넌트가 처리
 */

import { useMemo, useState } from 'react';
import type { StaffMember } from '@/types';
import {
  WorkcenterEmbed,
  WorkcenterKpiRow,
  WorkcenterShell,
  WorkcenterTabBar,
  type WorkcenterTab,
} from './workcenter-common';
import { computeMemberKpis } from './MemberWorkcenter/data';
import StaffTable from './MemberWorkcenter/StaffTable';
import StaffDrawer from './MemberWorkcenter/StaffDrawer';
import AppointmentBoard from './MemberWorkcenter/AppointmentBoard';
import EducationBoard from './MemberWorkcenter/EducationBoard';

type MemberTabId = 'list' | 'appointment' | 'education';

const MEMBER_TABS: WorkcenterTab<MemberTabId>[] = [
  { id: 'list', label: '구성원' },
  { id: 'appointment', label: '인사발령' },
  { id: 'education', label: '교육·자격' },
];

interface MemberWorkcenterProps {
  staffs?: StaffMember[];
  selectedCo?: string;
  user?: Record<string, unknown> | null;
  onRefresh?: () => void;
  canRegisterNewStaff?: boolean;
  onOpenNewStaff?: () => void;
  onOpenDocumentRepoForStaff?: (staff: StaffMember) => void;
}

export default function MemberWorkcenter({
  staffs = [],
  selectedCo,
  user = null,
  canRegisterNewStaff = false,
  onOpenNewStaff,
  onOpenDocumentRepoForStaff,
}: MemberWorkcenterProps) {
  const [tab, setTab] = useState<MemberTabId>('list');
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);

  const kpis = useMemo(
    () => computeMemberKpis({ staffs, selectedCo }),
    [staffs, selectedCo],
  );

  return (
    <WorkcenterShell
      headerExtra={
        <>
          <WorkcenterKpiRow items={kpis} />
          <WorkcenterTabBar
            tabs={MEMBER_TABS}
            activeTab={tab}
            onChange={setTab}
            label="구성원 워크센터 탭"
          />
        </>
      }
    >
      <div className="min-h-0 flex-1">
        {tab === 'list' && (
          <WorkcenterEmbed label="구성원">
            <div className="grid h-full min-h-0 gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
              <StaffTable
                staffs={staffs}
                selectedId={selectedStaff ? String(selectedStaff.id) : null}
                onSelect={setSelectedStaff}
                onOpenNewStaff={onOpenNewStaff}
                canRegisterNewStaff={canRegisterNewStaff}
              />
              <StaffDrawer
                staff={selectedStaff}
                onClose={() => setSelectedStaff(null)}
                onOpenDocumentRepoForStaff={onOpenDocumentRepoForStaff}
              />
            </div>
          </WorkcenterEmbed>
        )}

        {tab === 'appointment' && (
          <WorkcenterEmbed label="인사발령">
            <AppointmentBoard staffs={staffs} selectedCo={selectedCo} user={user} />
          </WorkcenterEmbed>
        )}

        {tab === 'education' && (
          <WorkcenterEmbed label="교육·자격">
            <EducationBoard staffs={staffs} selectedCo={selectedCo} />
          </WorkcenterEmbed>
        )}
      </div>
    </WorkcenterShell>
  );
}
