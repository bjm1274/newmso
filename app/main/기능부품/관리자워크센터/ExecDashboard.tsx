'use client';

/**
 * 경영 대시보드 — 7장 → 1 통합
 * (개요 / 경영대시보드 / 재무대시보드 / 예산관리 / 통합보고서 / 법인손익 / 커스텀대시보드)
 *
 * JM: 500줄 이내
 * JM2: 실제 서브 컴포넌트는 dynamic import (탭 클릭 시 로드)
 * JM6: 탭 button 태그, 표 헤더 scope
 */

import dynamic from 'next/dynamic';
import { memo, useState } from 'react';
import { Card, Chip, KpiGrid, SmBtn, TabBar, WorkcenterHeader } from './admin-workcenter-common';
import { ADMIN_WORKCENTERS, type AdminKpi } from './admin-types';
import { useAppData } from '@/app/main/contexts/AppDataContext';
import { useExecOverview, type CorpPnlRow } from './useExecOverview';
import type { StaffMember } from '@/types';

// ─── 실제 서브 컴포넌트 (lazy) ──────────────────────────
const Loading = () => (
  <div className="flex items-center justify-center py-20">
    <div className="w-7 h-7 border-2 border-[var(--accent)] rounded-full border-t-transparent animate-spin" />
  </div>
);

const BusinessDashboard = dynamic(
  () => import('../관리자전용서브/경영대시보드'),
  { ssr: false, loading: Loading }
);
const FinancialDashboard = dynamic(
  () => import('../관리자전용서브/재무대시보드'),
  { ssr: false, loading: Loading }
);
const BudgetManagement = dynamic(
  () => import('../관리자전용서브/예산관리'),
  { ssr: false, loading: Loading }
);
const IntegratedReport = dynamic(
  () => import('../관리자전용서브/통합보고서'),
  { ssr: false, loading: Loading }
);
const CompanyPnL = dynamic(
  () => import('../관리자전용서브/법인손익현황'),
  { ssr: false, loading: Loading }
);
const CustomDashboard = dynamic(
  () => import('../관리자전용서브/커스텀대시보드'),
  { ssr: false, loading: Loading }
);

// ─── 탭 정의 ─────────────────────────────────────────────
type ExecTabId = 'overview' | 'biz' | 'fin' | 'budget' | 'report' | 'pnl' | 'custom';

const TABS: { id: ExecTabId; label: string }[] = [
  { id: 'overview', label: '개요' },
  { id: 'biz', label: '경영 대시보드' },
  { id: 'fin', label: '재무 대시보드' },
  { id: 'budget', label: '예산 관리' },
  { id: 'report', label: '통합 보고서' },
  { id: 'pnl', label: '법인 손익' },
  { id: 'custom', label: '커스텀 대시보드' },
];

// ─── 개요 탭 (G2: 실연동 가능 항목만 실데이터, 나머지는 '집계 준비중') ──
const READY_LABEL = '집계 준비중';

/** 원 → 백만원(M) 표기 */
function toMillionStr(won: number): string {
  return (Math.round((won / 1_000_000) * 10) / 10).toLocaleString('ko-KR');
}

/** 집계 준비중 카드: 매출 의존 지표는 가짜 숫자 대신 준비중으로 표기 */
function PendingCard({ title, note }: { title: string; note: string }) {
  return (
    <div className="app-card px-3 py-2.5">
      <div className="text-[10.5px] font-semibold text-[var(--toss-gray-4)] mb-1">{title}</div>
      <div className="text-lg font-bold text-[var(--toss-gray-3)]">{READY_LABEL}</div>
      <div className="text-[10px] text-[var(--toss-gray-4)] mt-0.5 truncate">{note}</div>
    </div>
  );
}

/** 실연동 KPI (미결재·현금잔고·재직 직원수·전사 인건비) */
function liveKpiItems(d: ReturnType<typeof useExecOverview>): AdminKpi[] {
  const totalLabor = d.corpRows.reduce((s, r) => s + r.laborCost, 0);
  return [
    {
      label: '결재 대기',
      value: d.loading ? '…' : String(d.pendingApprovalCount),
      unit: '건',
      sub: '승인 대기 중',
    },
    {
      label: '현금 잔고',
      value: d.loading ? '…' : toMillionStr(d.cashBalance),
      unit: 'M원',
      sub: d.cashCompanyCount > 0 ? `오늘 마감 ${d.cashCompanyCount}개 법인 합산` : '오늘 마감 등록 없음',
    },
    {
      label: '재직 직원',
      value: d.loading ? '…' : String(d.activeStaffCount),
      unit: '명',
      sub: '전사 합산',
    },
    {
      label: `이번 달 인건비`,
      value: d.loading ? '…' : toMillionStr(totalLabor),
      unit: 'M원',
      sub: `${d.yearMonth} 급여명세 기준`,
    },
  ];
}

const ExecHero = memo(function ExecHero({
  yearMonth,
  loading,
  totalLabor,
  corpCount,
  onTabChange,
}: {
  yearMonth: string;
  loading: boolean;
  totalLabor: number;
  corpCount: number;
  onTabChange: (t: ExecTabId) => void;
}) {
  return (
    <div className="rounded-[var(--radius-xl)] bg-[var(--zinc-900,#18181B)] text-white p-5 mb-4 flex items-center gap-4 flex-wrap">
      <div className="flex-1 min-w-[260px]">
        <div className="text-[10.5px] font-semibold text-white/60 mb-1">
          {yearMonth} · 전사 통합 ({corpCount}개 법인)
        </div>
        <div className="text-base font-bold mb-2">
          경영 개요 <span className="text-[11px] font-semibold text-white/60 ml-1">실데이터 연동</span>
        </div>
        <p className="text-[11px] text-white/60 leading-relaxed max-w-md">
          매출·영업이익 등 수익 지표는 데이터 소스 연동 준비 중입니다. 인건비·현금잔고·결재 현황은 실시간으로 집계됩니다.
        </p>
      </div>
      <div className="text-right shrink-0">
        <div className="text-[10.5px] font-semibold text-white/60">이번 달 전사 인건비</div>
        <div className="text-2xl font-bold tabular-nums mt-0.5">
          {loading ? '…' : Math.round(totalLabor).toLocaleString('ko-KR')}
          <span className="text-sm font-semibold text-white/60 ml-0.5">원</span>
        </div>
        <div className="text-[11px] text-white/60 mt-0.5">{yearMonth} 급여명세 합산</div>
        <button
          type="button"
          onClick={() => onTabChange('pnl')}
          className="mt-2 px-3 py-1.5 rounded-[var(--radius-md)] bg-[var(--accent)] text-white text-[11px] font-bold hover:opacity-90"
        >
          법인 손익 상세 →
        </button>
      </div>
    </div>
  );
});

/** 법인별 인건비·직원수 (실데이터) — 매출 의존 지표는 표시하지 않음 */
const CorpLaborList = memo(function CorpLaborList({ rows }: { rows: CorpPnlRow[] }) {
  const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');
  if (rows.length === 0) {
    return <p className="text-[12px] text-[var(--toss-gray-3)] py-4 text-center">법인·직원 데이터가 없습니다.</p>;
  }
  return (
    <div className="space-y-1.5">
      {rows.map((p) => (
        <div
          key={p.company}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-[var(--radius-md)] bg-[var(--muted)]"
        >
          <Chip tone="accent">{p.headcount}명</Chip>
          <div className="flex-1 flex items-center gap-1.5 text-[12px] min-w-0">
            <b className="text-[var(--foreground)] truncate">{p.company}</b>
          </div>
          <span className="text-[11px] font-bold tabular-nums text-[var(--foreground)]">
            인건비 {fmt(p.laborCost)}원
          </span>
        </div>
      ))}
    </div>
  );
});

function OverviewTab({ onTabChange, staffs }: { onTabChange: (t: ExecTabId) => void; staffs: StaffMember[] }) {
  const overview = useExecOverview(staffs);
  const totalLabor = overview.corpRows.reduce((s, r) => s + r.laborCost, 0);

  return (
    <>
      <ExecHero
        yearMonth={overview.yearMonth}
        loading={overview.loading}
        totalLabor={totalLabor}
        corpCount={overview.corpRows.length}
        onTabChange={onTabChange}
      />

      {/* 실연동 KPI */}
      <KpiGrid items={liveKpiItems(overview)} cols={4} />

      {/* 매출 의존 지표: 가짜 숫자 대신 집계 준비중 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
        <PendingCard title="이번 달 매출" note="매출 연동 예정" />
        <PendingCard title="영업이익 / 이익률" note="매출 연동 예정" />
        <PendingCard title="미수금" note="미수금 데이터 연동 예정" />
        <PendingCard title="예산 집행률" note="예산 데이터 연동 예정" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <Card title="월별 매출·비용·이익 추세">
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="text-sm font-bold text-[var(--toss-gray-3)]">{READY_LABEL}</div>
            <p className="text-[11px] text-[var(--toss-gray-4)] mt-1.5">
              매출 데이터 소스가 연동되면 최근 6개월 추세 차트가 표시됩니다.
            </p>
          </div>
        </Card>
        <Card
          title="법인별 인건비·직원수"
          action={<SmBtn onClick={() => onTabChange('pnl')}>법인 손익 →</SmBtn>}
        >
          {overview.loading ? (
            <p className="text-[12px] text-[var(--toss-gray-3)] py-4 text-center">불러오는 중…</p>
          ) : (
            <CorpLaborList rows={overview.corpRows} />
          )}
          <p className="text-[10px] text-[var(--toss-gray-4)] mt-3">
            {overview.yearMonth} 급여명세 기준 · 손익률은 매출 연동 후 제공됩니다.
          </p>
        </Card>
      </div>
    </>
  );
}

export default function ExecDashboard() {
  const { user, data } = useAppData();
  const staffs = data.staffs;
  const meta = ADMIN_WORKCENTERS.exec;
  const [tab, setTab] = useState<ExecTabId>('overview');

  return (
    <>
      <WorkcenterHeader
        title={meta.label}
        subtitle="경영·재무·예산·통합보고서·법인손익·분석 7장을 1장으로"
        mergedCount={meta.mergedCount}
        mergedTitles={meta.mergedTitles}
        actions={
          <>
            <SmBtn onClick={() => setTab('report')}>통합 보고서</SmBtn>
            <SmBtn primary onClick={() => setTab('biz')}>월말 마감 보고</SmBtn>
          </>
        }
      />

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'overview' && <OverviewTab onTabChange={setTab} staffs={staffs} />}
      {tab === 'biz' && <BusinessDashboard />}
      {tab === 'fin' && <FinancialDashboard />}
      {tab === 'budget' && <BudgetManagement staffs={staffs} />}
      {tab === 'report' && <IntegratedReport staffs={staffs} />}
      {tab === 'pnl' && <CompanyPnL staffs={staffs} selectedCo="전체" user={user} />}
      {tab === 'custom' && <CustomDashboard user={(user ?? {}) as Record<string, unknown>} selectedCo="전체" />}
    </>
  );
}
