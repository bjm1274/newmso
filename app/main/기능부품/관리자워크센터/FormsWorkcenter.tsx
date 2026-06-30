'use client';

/**
 * 결재 양식 — 2탭
 * 개요(양식 목록 요약) + 양식 관리·편집(실제 ApprovalFormTypesManager)
 *
 * JM: 200줄 이내
 * JM2: ApprovalFormTypesManager는 dynamic import
 * JM6: 카드는 article + 버튼은 button 태그
 */

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { Card, KpiGrid, SmBtn, TabBar, WorkcenterHeader } from './admin-workcenter-common';
import { ADMIN_WORKCENTERS, type AdminKpi } from './admin-types';
import { useFormsOverview } from './useFormsOverview';

const Loading = () => (
  <div className="flex items-center justify-center py-20">
    <div className="w-7 h-7 border-2 border-[var(--accent)] rounded-full border-t-transparent animate-spin" />
  </div>
);

// 실제 전자결재 양식 관리 컴포넌트 (양식 목록, 편집, 미리보기 포함)
const ApprovalFormTypesManager = dynamic(
  () => import('../관리자전용서브/전자결재양식관리'),
  { ssr: false, loading: Loading }
);

type FormsTabId = 'overview' | 'manage';

const TABS: { id: FormsTabId; label: string }[] = [
  { id: 'overview', label: '개요' },
  { id: 'manage', label: '양식 관리·편집' },
];

/** 실연동 KPI (approval_form_types 종수 + 이번 달 approvals 사용 건수) */
function liveFormsKpi(d: ReturnType<typeof useFormsOverview>): AdminKpi[] {
  return [
    { label: '전체 양식', value: d.loading ? '…' : String(d.totalForms), unit: '종' },
    { label: '활성', value: d.loading ? '…' : String(d.activeForms), unit: '종', tone: 'success' },
    { label: '비활성', value: d.loading ? '…' : String(d.inactiveForms), unit: '종', tone: 'muted' },
    {
      label: '이번 달 사용',
      value: d.loading ? '…' : String(d.monthlyUsage),
      unit: '회',
      sub: `${d.yearMonth} 결재 기준` },
  ];
}

function OverviewTab({ onGoManage }: { onGoManage: () => void }) {
  const overview = useFormsOverview();

  return (
    <>
      <KpiGrid items={liveFormsKpi(overview)} cols={4} />

      <Card
        title="양식별 이번 달 사용 현황"
        action={<SmBtn onClick={onGoManage}>양식 관리·편집 →</SmBtn>}
      >
        {overview.loading ? (
          <p className="text-[12px] text-[var(--toss-gray-3)] py-6 text-center">불러오는 중…</p>
        ) : overview.usageByType.length === 0 ? (
          <p className="text-[12px] text-[var(--toss-gray-3)] py-6 text-center">
            {overview.yearMonth}에 등록된 결재 사용 내역이 없습니다.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {overview.usageByType.map((row) => (
              <li key={row.type} className="flex items-center justify-between py-2">
                <span className="text-[13px] font-semibold text-[var(--foreground)] truncate">{row.type}</span>
                <span className="text-[11px] font-bold tabular-nums text-[var(--toss-gray-4)] shrink-0 ml-3">
                  {row.count}회
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[10px] text-[var(--toss-gray-4)] mt-3">
          {overview.yearMonth} 결재(approvals) 구분값 기준 집계 · 양식 편집은 관리 탭에서 진행합니다.
        </p>
      </Card>
    </>
  );
}

export default function FormsWorkcenter({ user }: { user?: unknown }) {
  const meta = ADMIN_WORKCENTERS.forms;
  const [tab, setTab] = useState<FormsTabId>('overview');

  return (
    <>
      <WorkcenterHeader
        title={meta.label}
        subtitle="양식 관리·편집 통합 — 결재 양식 종수·사용 현황 실연동"
        mergedCount={meta.mergedCount}
        mergedTitles={meta.mergedTitles}
        actions={<SmBtn primary onClick={() => setTab('manage')}>새 결재 양식</SmBtn>}
      />

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'overview' && <OverviewTab onGoManage={() => setTab('manage')} />}
      {tab === 'manage' && <ApprovalFormTypesManager user={user} />}
    </>
  );
}
