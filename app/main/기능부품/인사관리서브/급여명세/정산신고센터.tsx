'use client';

import { useEffect, useMemo, useState } from 'react';
import TaxFileGenerator from '../원천징수파일생성';
import InsuranceManagement from '../4대보험관리';
import InsuranceEDI from './4대보험EDI';
import PayrollEmailSender from './급여명세서발송';
import YearEndSettlement from './연말정산';
import SeveranceLeaveDashboard from './예상퇴직금연차대시보드';
import SeveranceCalculator from './퇴직금계산기';
import RetirementPensionManager from './퇴직연금관리';
import { LucideIcon } from '../../조직도서브/조직도측면창';

export type SettlementReportingCenterTab =
  | '개요'
  | '연말퇴직정산'
  | '원천징수파일'
  | '4대보험EDI'
  | '퇴직연금';

type Props = {
  staffs?: any[];
  companyStaffs?: any[];
  selectedCo?: string;
  user?: any;
  yearMonth: string;
  initialTab?: string;
};

const CENTER_TABS: Array<{
  id: SettlementReportingCenterTab;
  label: string;
  icon: string;
  note: string;
}> = [
  { id: '개요', label: '개요', icon: 'LayoutDashboard', note: '업무 흐름' },
  { id: '연말퇴직정산', label: '연말·퇴직정산', icon: 'CalendarDays', note: '정산 처리' },
  { id: '원천징수파일', label: '원천징수파일', icon: 'FileBarChart', note: '홈택스 파일' },
  { id: '4대보험EDI', label: '4대보험·EDI', icon: 'Landmark', note: '신고 이력' },
  { id: '퇴직연금', label: '퇴직연금', icon: 'BriefcaseBusiness', note: 'DC/DB 관리' },
];

function normalizeSettlementTab(tab?: string | null): SettlementReportingCenterTab {
  if (!tab) return '개요';
  if (tab === '4대보험' || tab === '4대보험 / EDI') return '4대보험EDI';
  if (tab === '연말정산' || tab === '퇴직정산') return '연말퇴직정산';
  if (CENTER_TABS.some((item) => item.id === tab)) return tab as SettlementReportingCenterTab;
  return '개요';
}

function metric(value: number | string, label: string, icon: string, tone: 'blue' | 'green' | 'amber' | 'rose') {
  const toneClass = {
    blue: 'bg-[var(--accent-selected-subtle)] text-[var(--accent)]',
    green: 'bg-[var(--success-light)] text-[var(--success)]',
    amber: 'bg-[var(--warning-light)] text-[var(--warning)]',
    rose: 'bg-[var(--danger-light)] text-[var(--danger)]',
  }[tone];

  return (
    <div key={label} className="erp-stat-card flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11px] font-bold text-[var(--zinc-500)]">{label}</p>
        <p className="mt-1 truncate text-lg font-black text-[var(--foreground)]">{value}</p>
      </div>
      <span className={`erp-icon-box ${toneClass}`}>
        <LucideIcon name={icon} size={18} />
      </span>
    </div>
  );
}

export default function SettlementReportingCenter({
  staffs = [],
  companyStaffs,
  selectedCo = '전체',
  user,
  yearMonth,
  initialTab,
}: Props) {
  const [activeTab, setActiveTab] = useState<SettlementReportingCenterTab>(() =>
    normalizeSettlementTab(initialTab),
  );

  useEffect(() => {
    setActiveTab(normalizeSettlementTab(initialTab));
  }, [initialTab]);

  const scopedCompanyStaffs = companyStaffs || staffs;
  const companyLabel = selectedCo || '전체';
  const activeStaffCount = staffs.length;
  const companyStaffCount = scopedCompanyStaffs.length;
  const [year, month] = (yearMonth || '').split('-');
  const periodLabel = year && month ? `${year}년 ${Number(month)}월` : yearMonth;

  const overviewItems = useMemo(
    () => [
      {
        id: '연말퇴직정산' as const,
        title: '연말·퇴직정산',
        desc: '연말정산, 퇴직금 계산, 퇴직금·연차 현황을 함께 봅니다.',
        icon: 'CalendarClock',
        status: '정산',
      },
      {
        id: '원천징수파일' as const,
        title: '원천징수파일',
        desc: '확정 급여 기준 홈택스, EDI, 사내 보고용 파일을 생성합니다.',
        icon: 'FileBarChart',
        status: '파일',
      },
      {
        id: '4대보험EDI' as const,
        title: '4대보험·EDI',
        desc: '취득, 변경, 상실 신고 이력과 월별 EDI 산출 내역을 관리합니다.',
        icon: 'Landmark',
        status: '신고',
      },
      {
        id: '퇴직연금' as const,
        title: '퇴직연금',
        desc: 'DC/DB 가입 상태, 월 기여금, 누적 적립금을 확인합니다.',
        icon: 'BriefcaseBusiness',
        status: '연금',
      },
    ],
    [],
  );

  return (
    <div className="erp-page space-y-4 p-4 md:p-5" data-testid="settlement-reporting-center-view">
      <div className="erp-toolbar flex-wrap justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="erp-icon-box">
            <LucideIcon name="FileCheck2" size={18} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-[var(--zinc-500)]">
              연말정산, 퇴직정산, 원천징수, 4대보험, 퇴직연금을 한곳에서 관리합니다.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="erp-chip erp-chip-active">{periodLabel}</span>
          <span className="erp-chip">{companyLabel}</span>
        </div>
      </div>

      <div className="erp-stat-grid">
        {metric(activeStaffCount, '운영 직원', 'Users', 'blue')}
        {metric(companyStaffCount, '회사 직원', 'Building2', 'green')}
        {metric('5개', '통합 업무', 'Layers3', 'amber')}
        {metric('1곳', '상단 진입점', 'Route', 'rose')}
      </div>

      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-muted)] p-1">
        <nav className="flex min-w-max gap-1" aria-label="정산 신고센터 탭">
          {CENTER_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              data-testid={`settlement-center-tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`flex h-11 items-center gap-2 rounded-[var(--radius-md)] px-3 text-left text-xs font-bold transition ${
                activeTab === tab.id
                  ? 'bg-[var(--card)] text-[var(--accent)] shadow-sm'
                  : 'text-[var(--zinc-500)] hover:text-[var(--foreground)]'
              }`}
            >
              <LucideIcon name={tab.icon} size={15} />
              <span>{tab.label}</span>
              <span className="hidden text-[10px] font-medium text-[var(--zinc-400)] md:inline">{tab.note}</span>
            </button>
          ))}
        </nav>
      </div>

      {activeTab === '개요' && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {overviewItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className="erp-action-tile group min-h-[148px] text-left hover:border-[var(--accent)]"
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <span className="erp-icon-box">
                  <LucideIcon name={item.icon} size={18} />
                </span>
                <span className="erp-status erp-status-blue">{item.status}</span>
              </div>
              <h3 className="text-sm font-black text-[var(--foreground)]">{item.title}</h3>
              <p className="mt-2 text-xs font-medium leading-relaxed text-[var(--zinc-500)]">{item.desc}</p>
              <div className="mt-4 flex items-center gap-1 text-xs font-black text-[var(--accent)]">
                열기
                <LucideIcon name="ArrowRight" size={13} />
              </div>
            </button>
          ))}
        </div>
      )}

      {activeTab === '연말퇴직정산' && (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
          <div className="min-w-0">
            <YearEndSettlement staffs={scopedCompanyStaffs} selectedCo={selectedCo} />
          </div>
          <div className="grid min-w-0 gap-4">
            <SeveranceCalculator />
            <SeveranceLeaveDashboard staffs={staffs} />
            <PayrollEmailSender staffs={staffs} yearMonth={yearMonth} />
          </div>
        </div>
      )}

      {activeTab === '원천징수파일' && (
        <div className="max-w-4xl">
          <TaxFileGenerator staffs={staffs} selectedCo={selectedCo} />
        </div>
      )}

      {activeTab === '4대보험EDI' && (
        <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="min-w-0 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)]">
            <InsuranceManagement staffs={scopedCompanyStaffs} selectedCo={selectedCo} />
          </div>
          <div className="min-w-0 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)]">
            <InsuranceEDI staffs={scopedCompanyStaffs} selectedCo={selectedCo} user={user} />
          </div>
        </div>
      )}

      {activeTab === '퇴직연금' && (
        <div className="max-w-5xl">
          <RetirementPensionManager staffs={staffs} selectedCo={selectedCo} user={user} />
        </div>
      )}
    </div>
  );
}
