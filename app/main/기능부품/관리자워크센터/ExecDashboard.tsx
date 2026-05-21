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
import { Card, Chip, KpiGrid, ProgressBar, SmBtn, TabBar, WorkcenterHeader } from './admin-workcenter-common';
import { ADMIN_WORKCENTERS, type AdminKpi } from './admin-types';

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

// ─── 개요 탭 (기존 더미 시각화 유지) ────────────────────
const KPI_ITEMS: AdminKpi[] = [
  { label: '5월 매출', value: '182.4', unit: 'M원', sub: '전월 동기 +4.2%' },
  { label: '5월 비용', value: '128.7', unit: 'M원', sub: '인건비 94 · 임차 18 · 기타 16' },
  { label: '영업이익', value: '53.7', unit: 'M원', sub: '이익률 29.4%' },
  { label: '방문 환자', value: '1,284', unit: '명', sub: '신규 142 · 재진 1,142' },
  { label: '예산 집행률', value: '42', unit: '%', sub: '5월 누적 / 목표' },
  { label: '현금 잔고', value: '412', unit: 'M원', sub: '법인 4개 합산' },
  { label: '미수금', value: '14.2', unit: 'M원', sub: '30일 이상 4건' },
  { label: '결재 대기', value: '12', unit: '건', sub: '긴급 2 · 일반 10' },
];

const STEPS: { id: number; label: string; ts: string; state: 'done' | 'on' | 'pending' }[] = [
  { id: 1, label: '4월 마감', ts: '5/3', state: 'done' },
  { id: 2, label: '손익 확정', ts: '5/4', state: 'done' },
  { id: 3, label: '5월 진행', ts: '진행 중', state: 'on' },
  { id: 4, label: '5월 마감', ts: '예정 6/3', state: 'pending' },
  { id: 5, label: '분기 보고', ts: '예정 6/30', state: 'pending' },
];

const ExecHero = memo(function ExecHero({ onTabChange }: { onTabChange: (t: ExecTabId) => void }) {
  return (
    <div className="rounded-[var(--radius-xl)] bg-[var(--zinc-900,#18181B)] text-white p-5 mb-4 flex items-center gap-4 flex-wrap">
      <div className="flex-1 min-w-[260px]">
        <div className="text-[10.5px] font-semibold text-white/60 mb-1">
          2026년 5월 (1~11일) · 박철홍정형외과 통합
        </div>
        <div className="text-base font-bold mb-3">
          매출 <span className="text-[11px] font-semibold text-white/60 ml-1">5/31 마감 예정</span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {STEPS.map((s) => {
            const cls =
              s.state === 'done'
                ? 'bg-emerald-500/30 text-emerald-200 border-emerald-500/40'
                : s.state === 'on'
                  ? 'bg-[var(--accent)]/40 text-white border-[var(--accent)]'
                  : 'bg-white/10 text-white/60 border-white/15';
            return (
              <div
                key={s.id}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-[var(--radius-md)] border text-[10.5px] font-semibold ${cls}`}
              >
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-white/15 text-[10px]">
                  {s.state === 'done' ? '✓' : s.id}
                </span>
                <span>{s.label}</span>
                <span className="text-white/50">· {s.ts}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-[10.5px] font-semibold text-white/60">5월 누적 매출 (1-11일)</div>
        <div className="text-2xl font-bold tabular-nums mt-0.5">
          182,420,000<span className="text-sm font-semibold text-white/60 ml-0.5">원</span>
        </div>
        <div className="text-[11px] text-white/60 mt-0.5">
          전월 동기 <span className="text-emerald-300 font-bold">+4.2%</span> · 목표 달성률 38%
        </div>
        <button
          type="button"
          onClick={() => onTabChange('report')}
          className="mt-2 px-3 py-1.5 rounded-[var(--radius-md)] bg-[var(--accent)] text-white text-[11px] font-bold hover:opacity-90"
        >
          전체 보고서 →
        </button>
      </div>
    </div>
  );
});

type BarRow = { m: string; rev: number; cost: number; prof: number; partial?: boolean };
const CHART_DATA: BarRow[] = [
  { m: '12월', rev: 312, cost: 234, prof: 78 },
  { m: '1월', rev: 295, cost: 218, prof: 77 },
  { m: '2월', rev: 318, cost: 232, prof: 86 },
  { m: '3월', rev: 342, cost: 246, prof: 96 },
  { m: '4월', rev: 368, cost: 258, prof: 110 },
  { m: '5월', rev: 182, cost: 128, prof: 54, partial: true },
];
const MAX_BAR = 400;

const PnlChart = memo(function PnlChart() {
  return (
    <>
      {/* 스택(누적) 막대: 각 월 1개 컬럼에 매출·비용·이익 순서로 누적 */}
      <div className="flex items-end gap-2 h-[170px] px-1 pb-1">
        {CHART_DATA.map((b) => {
          const total = b.rev + b.cost + b.prof;
          const totalH = (total / MAX_BAR) * 130;
          const revH = (b.rev / total) * totalH;
          const costH = (b.cost / total) * totalH;
          const profH = totalH - revH - costH;
          return (
            <div key={b.m} className="flex-1 flex flex-col items-center justify-end gap-1.5">
              <div
                className="w-full flex flex-col-reverse overflow-hidden rounded-t-sm"
                style={{ height: `${totalH}px` }}
                role="img"
                aria-label={`${b.m} 매출 ${b.rev}M 비용 ${b.cost}M 이익 ${b.prof}M`}
              >
                {/* 아래부터: 매출 → 비용 → 이익 순으로 쌓임 */}
                <div
                  className="w-full bg-[var(--accent)] shrink-0"
                  style={{ height: `${revH}px` }}
                />
                <div
                  className="w-full bg-rose-400 shrink-0"
                  style={{ height: `${costH}px` }}
                />
                <div
                  className="w-full bg-emerald-500 shrink-0"
                  style={{ height: `${profH}px` }}
                />
              </div>
              <div className={`text-[10px] font-semibold ${b.partial ? 'text-amber-600' : 'text-[var(--toss-gray-4)]'}`}>
                {b.m}
                {b.partial && <span className="ml-0.5 text-[9px]">(1-11)</span>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-3 mt-2 text-[10.5px] font-semibold text-[var(--toss-gray-4)]">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-[var(--accent)]" />매출
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-rose-400" />비용
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-500" />이익
        </span>
      </div>
    </>
  );
});

const BUDGET_DATA = [
  { name: '인건비', plan: 1080, used: 472, pct: 44 },
  { name: '임차료', plan: 216, used: 108, pct: 50 },
  { name: '의료소모품', plan: 180, used: 68, pct: 38 },
  { name: '마케팅', plan: 60, used: 18, pct: 30 },
  { name: '기타 운영', plan: 120, used: 56, pct: 47 },
];
const PNL_BY_CORP: { name: string; delta: string; tone: 'success' | 'warn'; rate: string }[] = [
  { name: '박철홍정형외과', delta: '+38M', tone: 'success', rate: '이익률 29%' },
  { name: '수연의원', delta: '+12M', tone: 'success', rate: '이익률 24%' },
  { name: 'MSO 본사', delta: '-2M', tone: 'warn', rate: '적자 진행' },
  { name: '지점 A', delta: '+6M', tone: 'success', rate: '이익률 18%' },
];

function OverviewTab({ onTabChange }: { onTabChange: (t: ExecTabId) => void }) {
  return (
    <>
      <ExecHero onTabChange={onTabChange} />
      <KpiGrid items={KPI_ITEMS} cols={8} />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <Card
          title="월별 매출·비용·이익 (최근 6개월)"
          action={<SmBtn onClick={() => onTabChange('report')}>상세 보고서</SmBtn>}
        >
          <PnlChart />
        </Card>
        <Card title="예산 vs 집행" action={<SmBtn onClick={() => onTabChange('budget')}>예산 관리 →</SmBtn>}>
          <div className="space-y-2.5">
            {BUDGET_DATA.map((b) => (
              <div key={b.name} className="grid grid-cols-[80px_1fr_120px] items-center gap-3">
                <div className="text-[12px] font-semibold text-[var(--foreground)]">{b.name}</div>
                <ProgressBar value={b.pct} tone={b.pct > 50 ? 'warn' : 'accent'} />
                <div className="text-[11px] font-bold text-right tabular-nums text-[var(--foreground)]">
                  {b.used}/{b.plan}
                  <span className="text-[10px] font-semibold text-[var(--toss-gray-4)] ml-1">M ({b.pct}%)</span>
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-[var(--border)] mt-4 pt-3">
            <h4 className="text-[12px] font-bold text-[var(--foreground)] mb-2">법인별 손익 (4법인)</h4>
            <div className="space-y-1.5">
              {PNL_BY_CORP.map((p) => (
                <div
                  key={p.name}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-[var(--radius-md)] bg-[var(--muted)]"
                >
                  <Chip tone={p.tone}>{p.delta}</Chip>
                  <div className="flex-1 flex items-center gap-1.5 text-[12px]">
                    <b className="text-[var(--foreground)]">{p.name}</b>
                    <span className="text-[10.5px] text-[var(--toss-gray-4)]">· 5월 누적</span>
                  </div>
                  <span className="text-[11px] font-bold tabular-nums text-[var(--foreground)]">{p.rate}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}

export default function ExecDashboard() {
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

      {tab === 'overview' && <OverviewTab onTabChange={setTab} />}
      {tab === 'biz' && <BusinessDashboard />}
      {tab === 'fin' && <FinancialDashboard />}
      {tab === 'budget' && <BudgetManagement staffs={[]} />}
      {tab === 'report' && <IntegratedReport staffs={[]} />}
      {tab === 'pnl' && <CompanyPnL staffs={[]} selectedCo="전체" user={null} />}
      {tab === 'custom' && <CustomDashboard user={{}} selectedCo="전체" />}
    </>
  );
}
