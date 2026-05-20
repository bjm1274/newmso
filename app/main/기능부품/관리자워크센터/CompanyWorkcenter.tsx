'use client';

/**
 * 회사 관리 — 2탭: 개요(기본 정보 요약) + 상세 관리(실제 CompanyManager)
 *
 * JM: 200줄 이내
 * JM2: CompanyManager는 dynamic import (탭 클릭 시 로드)
 */

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { SmBtn, TabBar, WorkcenterHeader } from './admin-workcenter-common';
import { ADMIN_WORKCENTERS } from './admin-types';

const Loading = () => (
  <div className="flex items-center justify-center py-20">
    <div className="w-7 h-7 border-2 border-[var(--accent)] rounded-full border-t-transparent animate-spin" />
  </div>
);

// 실제 회사 관리 컴포넌트 (기본정보/근무형태/법인카드/계약/휴가/급여/문서 탭 포함)
const CompanyManager = dynamic(
  () => import('../관리자전용서브/회사관리'),
  { ssr: false, loading: Loading }
);

type CompanyWcTabId = 'overview' | 'detail';

const TABS: { id: CompanyWcTabId; label: string }[] = [
  { id: 'overview', label: '개요' },
  { id: 'detail', label: '상세 관리' },
];

function OverviewTab({ onGoDetail }: { onGoDetail: () => void }) {
  const corps = [
    { n: '박철홍정형외과', t: '본사·진료', emp: 18, primary: true },
    { n: '수연의원', t: '지점·진료', emp: 8, primary: false },
    { n: 'MSO 본사', t: '경영지원', emp: 5, primary: false },
    { n: '지점 A', t: '지점·진료', emp: 6, primary: false },
  ];

  return (
    <div className="space-y-3">
      <div className="app-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-[var(--foreground)]">소속 법인 · 지점 ({corps.length})</h3>
          <SmBtn primary onClick={onGoDetail}>상세 관리 →</SmBtn>
        </div>
        <div className="space-y-1.5">
          {corps.map((c) => (
            <div
              key={c.n}
              className="flex items-center gap-2 px-3 py-2 rounded-[var(--radius-md)] bg-[var(--muted)] border border-[var(--border)]"
            >
              <div className="font-bold text-[12.5px] text-[var(--foreground)]">{c.n}</div>
              <span className="text-[10.5px] text-[var(--toss-gray-4)]">{c.t} · {c.emp}명</span>
              {c.primary && (
                <span className="ml-auto text-[10.5px] font-semibold px-2 py-0.5 rounded-[var(--radius-md)] bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/30">
                  기본
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="app-card p-4">
        <p className="text-[12px] text-[var(--toss-gray-4)]">
          기본 정보 수정, 근무 형태 관리, 법인카드, 계약 템플릿, 휴가·공휴일, 급여 기준, 문서 보관은{' '}
          <button
            type="button"
            onClick={onGoDetail}
            className="text-[var(--accent)] font-bold underline underline-offset-2"
          >
            상세 관리 탭
          </button>
          에서 확인하세요.
        </p>
      </div>
    </div>
  );
}

export default function CompanyWorkcenter() {
  const meta = ADMIN_WORKCENTERS.company;
  const [tab, setTab] = useState<CompanyWcTabId>('overview');

  return (
    <>
      <WorkcenterHeader
        title={meta.label}
        subtitle="기본정보·근무형태·법인카드·계약·휴가·급여·문서 7개 화면 통합"
        mergedCount={meta.mergedCount}
        mergedTitles={meta.mergedTitles}
        actions={
          <SmBtn primary onClick={() => setTab('detail')}>상세 관리 →</SmBtn>
        }
      />

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'overview' && <OverviewTab onGoDetail={() => setTab('detail')} />}
      {tab === 'detail' && <CompanyManager user={null} staffs={[]} onRefresh={undefined} />}
    </>
  );
}
