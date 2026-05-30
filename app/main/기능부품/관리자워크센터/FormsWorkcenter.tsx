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
import { Card, Chip, KpiGrid, SmBtn, TabBar, WorkcenterHeader } from './admin-workcenter-common';
import { ADMIN_WORKCENTERS, type AdminFormCard, type AdminKpi, type ChipTone, type FormStatus } from './admin-types';

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

const FORMS_KPI: AdminKpi[] = [
  { label: '전체 양식', value: '14', unit: '종' },
  { label: '활성', value: '12', unit: '종', tone: 'success' },
  { label: '비활성·보류', value: '2', unit: '종', tone: 'muted' },
  { label: '이번 달 사용', value: '142', unit: '회', sub: '물품 38 · 연차 28 · 기타' },
];

const FORMS: AdminFormCard[] = [
  { name: '물품신청', group: '근태·휴가', version: 'v2.4', usageCount: 38, status: '활성' },
  { name: '연차/휴가', group: '근태·휴가', version: 'v1.8', usageCount: 28, status: '활성' },
  { name: '연차계획서', group: '근태·휴가', version: 'v1.2', usageCount: 8, status: '활성' },
  { name: '연장근무', group: '근태·휴가', version: 'v1.5', usageCount: 18, status: '활성' },
  { name: '출결정정', group: '근태·휴가', version: 'v1.3', usageCount: 12, status: '활성' },
  { name: '수리요청서', group: '업무·지원', version: 'v1.6', usageCount: 6, status: '활성' },
  { name: '보고서 작성', group: '업무·지원', version: 'v1.4', usageCount: 9, status: '활성' },
  { name: '업무기안', group: '업무·지원', version: 'v2.1', usageCount: 14, status: '활성' },
  { name: '업무협조', group: '업무·지원', version: 'v1.2', usageCount: 4, status: '활성' },
  { name: '공문발송', group: '업무·지원', version: 'v1.0', usageCount: 2, status: '권한 필요' },
  { name: '양식신청', group: '양식·기타', version: 'v1.1', usageCount: 3, status: '활성' },
  { name: '연차촉진통보서', group: '양식·기타', version: 'v1.0', usageCount: 0, status: '활성' },
  { name: '외부협력 동의서', group: '기타', version: 'v0.9', usageCount: 0, status: '초안' },
  { name: '장기근속 보상', group: '기타', version: 'v0.5', usageCount: 0, status: '보류' },
];

function statusTone(s: FormStatus): ChipTone {
  switch (s) {
    case '활성': return 'success';
    case '권한 필요': return 'warn';
    case '초안': return 'muted';
    case '보류': return 'danger';
  }
}

function groupBy(forms: AdminFormCard[]): Map<string, AdminFormCard[]> {
  const m = new Map<string, AdminFormCard[]>();
  for (const f of forms) {
    const arr = m.get(f.group) ?? [];
    arr.push(f);
    m.set(f.group, arr);
  }
  return m;
}

function OverviewTab({ onGoManage }: { onGoManage: () => void }) {
  const grouped = groupBy(FORMS);
  return (
    <>
      <KpiGrid items={FORMS_KPI} cols={4} />
      {[...grouped.entries()].map(([group, items]) => (
        <Card key={group} title={group} className="mb-3">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {items.map((f) => (
              <article key={f.name} className="app-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <b className="text-[13px] truncate block">{f.name}</b>
                    <div className="text-[10.5px] text-[var(--toss-gray-4)] mt-0.5">
                      {f.group} · {f.version}
                    </div>
                  </div>
                  <Chip tone={statusTone(f.status)}>{f.status}</Chip>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <span className="text-[10.5px] font-semibold tabular-nums text-[var(--toss-gray-4)]">
                    사용 {f.usageCount}회
                  </span>
                  <div className="flex items-center gap-1.5">
                    <SmBtn onClick={onGoManage}>편집</SmBtn>
                    {f.status === '활성' && <SmBtn onClick={onGoManage}>미리보기</SmBtn>}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </Card>
      ))}
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
        subtitle="양식 관리·편집 통합 — 14종 카드 그리드"
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
