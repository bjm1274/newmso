'use client';

/**
 * 회사 관리 워크센터 — 7탭 통합
 * (기본 정보 / 근무 형태 / 법인카드 / 계약 템플릿 / 휴가·공휴일 / 급여 기준 / 문서 보관)
 *
 * JM: 라우팅·헤더만 담당, 각 탭 내부는 별도 파일
 * JM2: 각 탭 컴포넌트는 dynamic import (탭 클릭 시 로드)
 * JM6: TabBar는 role="tablist"/"tab" 사용 (admin-workcenter-common)
 */

import { useState } from 'react';
import { SmBtn, TabBar, WorkcenterHeader } from './admin-workcenter-common';
import { ADMIN_WORKCENTERS } from './admin-types';
import type { CompanyTabId } from './CompanyWorkcenter/types';

// 정적 import — Turbopack의 한글 폴더+영문 하위 경로 dynamic/lazy panic 회피.
// 인사관리워크센터의 영문 하위 컴포넌트들과 동일한 패턴.
import CompanyBasicTab from './CompanyWorkcenter/CompanyBasicTab';
import ShiftManagement from '../인사관리서브/근무형태관리';
import CompanyCardTab from './CompanyWorkcenter/CompanyCardTab';
import CompanyTemplateTab from './CompanyWorkcenter/CompanyTemplateTab';
import CompanyLeaveTab from './CompanyWorkcenter/CompanyLeaveTab';
import CompanyPayrollTab from './CompanyWorkcenter/CompanyPayrollTab';
import CompanyDocsTab from './CompanyWorkcenter/CompanyDocsTab';
// 레거시 회사관리 leavePolicy 와 동일 — e2e leave-management + 연차 자동부여 설정
import LeaveManagement from '../인사관리서브/휴가신청/휴가관리메인';

const TABS: { id: CompanyTabId; label: string }[] = [
  { id: 'company', label: '기본 정보' },
  // e2e(smoke) getByRole name "근무형태" 호환 — 공백 없는 레거시 라벨 유지
  { id: 'shift', label: '근무형태' },
  { id: 'card', label: '법인카드' },
  { id: 'contract', label: '계약 템플릿' },
  { id: 'leavePolicy', label: '휴가·경조사·공휴일' },
  { id: 'payrollPolicy', label: '급여 기준' },
  { id: 'docs', label: '문서 보관' },
];

type CompanyWorkcenterProps = {
  user?: Record<string, unknown> | null;
  staffs?: unknown[];
  onRefresh?: () => void;
};

export default function CompanyWorkcenter({
  user,
  staffs = [],
  onRefresh }: CompanyWorkcenterProps = {}) {
  const meta = ADMIN_WORKCENTERS.company;
  const [tab, setTab] = useState<CompanyTabId>('company');

  return (
    <div className="space-y-4 animate-in fade-in duration-300" data-testid="company-manager-view">
      <WorkcenterHeader
        title={meta.label}
        subtitle="기본정보·근무형태·법인카드·계약·휴가·급여·문서 7개 화면 통합"
        mergedCount={meta.mergedCount}
        mergedTitles={meta.mergedTitles}
        actions={<SmBtn primary ariaLabel="회사 데이터 새로고침">새로고침</SmBtn>}
      />

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      <div role="tabpanel" aria-label={TABS.find((t) => t.id === tab)?.label}>
        {tab === 'company' && <CompanyBasicTab />}
        {tab === 'shift' && <ShiftManagement selectedCo="전체" />}
        {tab === 'card' && <CompanyCardTab />}
        {tab === 'contract' && <CompanyTemplateTab />}
        {tab === 'leavePolicy' && (
          <div className="space-y-4">
            <LeaveManagement
              staffs={staffs}
              selectedCo="전체"
              onRefresh={onRefresh}
              user={user}
              allowLeaveTabs
              allowHolidayTab
              tabMode="admin"
            />
            <CompanyLeaveTab />
          </div>
        )}
        {tab === 'payrollPolicy' && <CompanyPayrollTab />}
        {tab === 'docs' && <CompanyDocsTab />}
      </div>
    </div>
  );
}
