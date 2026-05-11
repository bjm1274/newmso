'use client';

/**
 * PayrollWorkcenterClient.tsx — 급여 워크센터 클라이언트 레이어
 *
 * 좌측 단계 네비 + 중앙 콘텐츠 + 우측 시뮬레이터 패널 3단 레이아웃
 *
 * JM2: 단계 전환은 단일 state (activeStep + activeView)
 * JM4: any 금지, StepView 유니온 타입
 * JM6: role="tablist" 단계 네비, aria-current, aria-expanded
 */

import React, { useState } from 'react';
import { CreditCard } from 'lucide-react';
import Badge from '@/app/components/v2/Badge';
import Button from '@/app/components/v2/Button';
import { DASHBOARD_SUMMARY } from './dummy-data';
import StepDashboard, { type Step1View } from './sections/StepDashboard';
import StepLedger,    { type Step2View } from './sections/StepLedger';
import StepVerification, { type Step3View } from './sections/StepVerification';
import StepOutput,   { type Step4View } from './sections/StepOutput';
import SimulatorPanel from './SimulatorPanel';

// ── 타입 ───────────────────────────────────────────────────────────────────────

type StepKey = 1 | 2 | 3 | 4;

type StepView = Step1View | Step2View | Step3View | Step4View;

interface SubItem {
  view: StepView;
  label: string;
  badge?: string;
}

// ── 단계 정의 ──────────────────────────────────────────────────────────────────

const STEP_DEFS: Array<{
  step: StepKey;
  label: string;
  defaultView: StepView;
  subs: SubItem[];
}> = [
  {
    step: 1, label: '정산', defaultView: 'dashboard',
    subs: [
      { view: 'dashboard',       label: '대시보드',        badge: '#41' },
      { view: 'payroll-calc',    label: '급여정산',         badge: '#42' },
      { view: 'retirement-calc', label: '퇴직정산',         badge: '#44' },
      { view: 'min-wage',        label: '최저임금/비과세',  badge: '#50' },
      { view: 'unpaid-check',    label: '미지급 수당',      badge: '#52' },
      { view: 'unpaid-deduct',   label: '무급결근차감',     badge: '#53' },
    ],
  },
  {
    step: 2, label: '대장', defaultView: 'payroll-ledger',
    subs: [
      { view: 'payroll-ledger', label: '급여대장',          badge: '#43' },
      { view: 'wage-peak',      label: '임금피크제',         badge: '#49' },
      { view: 'ordinary-wage',  label: '통상임금 계산기',    badge: '#51' },
    ],
  },
  {
    step: 3, label: '검증', defaultView: 'insurance',
    subs: [
      { view: 'insurance',           label: '4대보험',   badge: '#46' },
      { view: 'retirement-pension',  label: '퇴직연금',  badge: '#48' },
    ],
  },
  {
    step: 4, label: '출력', defaultView: 'withholding',
    subs: [
      { view: 'withholding', label: '원천징수 파일', badge: '#45' },
      { view: 'payslip',     label: '명세서 인쇄'            },
    ],
  },
];

// ── 단계 상태 표시 아이콘 ──────────────────────────────────────────────────────

const STEP_STATUS_CLASS: Record<string, string> = {
  done:    'bg-[var(--success)] border-[var(--success)] text-white',
  active:  'bg-[var(--accent)]  border-[var(--accent)]  text-white',
  pending: 'border-[var(--border)] text-[var(--toss-gray-4)]',
};

const stepStatusOf = (step: StepKey, activeStep: StepKey): 'done' | 'active' | 'pending' => {
  if (step < activeStep) return 'done';
  if (step === activeStep) return 'active';
  return 'pending';
};

// ── 필터 바 (기간 / 부서 / 직종) ───────────────────────────────────────────────

function FilterBar() {
  return (
    <div
      role="search"
      aria-label="급여 기간 필터"
      className="no-print flex items-center gap-3 flex-wrap px-5 py-2 bg-[var(--card)] border-b border-[var(--border)] text-sm"
    >
      <label htmlFor="yearMonth" className="text-xs text-[var(--toss-gray-4)] whitespace-nowrap">정산 기간</label>
      <input
        id="yearMonth"
        type="month"
        defaultValue="2026-04"
        aria-label="정산 연월 선택"
        className="h-9 px-3 border border-[var(--border)] rounded-[var(--radius-md)] bg-[var(--card)] text-[var(--foreground)] text-sm focus:border-[var(--accent)] focus:outline-none"
      />
      <label htmlFor="deptFilter" className="text-xs text-[var(--toss-gray-4)] whitespace-nowrap">부서</label>
      <select
        id="deptFilter"
        aria-label="부서 선택"
        className="h-9 px-3 border border-[var(--border)] rounded-[var(--radius-md)] bg-[var(--card)] text-[var(--foreground)] text-sm focus:border-[var(--accent)] focus:outline-none"
      >
        <option value="">전체</option>
        <option value="nursing">간호부</option>
        <option value="admin">행정부</option>
        <option value="medical">진료부</option>
      </select>
      <label htmlFor="empFilter" className="text-xs text-[var(--toss-gray-4)] whitespace-nowrap">직종</label>
      <select
        id="empFilter"
        aria-label="직종 선택"
        className="h-9 px-3 border border-[var(--border)] rounded-[var(--radius-md)] bg-[var(--card)] text-[var(--foreground)] text-sm focus:border-[var(--accent)] focus:outline-none"
      >
        <option value="">전체</option>
        <option value="full">정규직</option>
        <option value="part">파트타임</option>
        <option value="contract">계약직</option>
      </select>
      <span aria-live="polite" className="ml-auto">
        <Badge color="gray">총 {DASHBOARD_SUMMARY.targetCount}명</Badge>
      </span>
    </div>
  );
}

// ── 메인 컴포넌트 ──────────────────────────────────────────────────────────────

export default function PayrollWorkcenterClient() {
  const [activeStep, setActiveStep] = useState<StepKey>(1);
  const [activeView, setActiveView] = useState<StepView>('dashboard');
  const [expandedStep, setExpandedStep] = useState<StepKey>(1);

  function handleStepClick(step: StepKey) {
    const def = STEP_DEFS.find((s) => s.step === step)!;
    if (expandedStep === step) {
      setExpandedStep(0 as StepKey); // 접기
    } else {
      setExpandedStep(step);
      setActiveStep(step);
      setActiveView(def.defaultView);
    }
  }

  function handleViewClick(step: StepKey, view: StepView) {
    setActiveStep(step);
    setActiveView(view);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden" role="application" aria-label="급여 워크센터">

      {/* ── 상단 헤더 ──────────────────────────────────────────────────── */}
      <header
        role="banner"
        className="no-print flex items-center justify-between px-5 h-13 bg-[var(--card)] border-b border-[var(--border)] flex-shrink-0"
      >
        <div className="flex items-center gap-2 text-[15px] font-bold">
          <CreditCard size={20} aria-hidden="true" />
          급여 워크센터
          <Badge color="blue">2026-04 정산 중</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setActiveStep(4);
              setActiveView('payslip');
              setTimeout(() => window.print(), 100);
            }}
            aria-label="급여명세서 인쇄"
          >
            인쇄
          </Button>
          <Button variant="primary" size="sm" aria-label="정산 내보내기">
            내보내기
          </Button>
        </div>
      </header>

      {/* ── 필터 바 ──────────────────────────────────────────────────── */}
      <FilterBar />

      {/* ── 워크센터 바디 (3단) ──────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* 좌측 단계 네비 */}
        <nav
          aria-label="급여 정산 단계 탐색"
          className="no-print w-[200px] flex-shrink-0 bg-[var(--card)] border-r border-[var(--border)] overflow-y-auto py-4"
        >
          <ul role="list">
            {STEP_DEFS.map((stepDef, i) => {
              const status   = stepStatusOf(stepDef.step, activeStep);
              const isExpanded = expandedStep === stepDef.step;
              const isLast   = i === STEP_DEFS.length - 1;

              return (
                <li key={stepDef.step} className="mb-0.5">
                  {/* 단계 버튼 */}
                  <button
                    type="button"
                    onClick={() => handleStepClick(stepDef.step)}
                    aria-current={activeStep === stepDef.step ? 'step' : undefined}
                    aria-expanded={isExpanded}
                    aria-controls={`sub-step-${stepDef.step}`}
                    className={[
                      'flex items-center gap-2.5 w-full px-4 py-2.5 text-sm font-semibold',
                      'border-l-[3px] transition-all duration-150 text-left',
                      activeStep === stepDef.step
                        ? 'border-l-[var(--accent)] bg-[var(--accent-light)] text-[var(--accent)]'
                        : 'border-l-transparent text-[var(--toss-gray-4)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]',
                    ].join(' ')}
                  >
                    <span
                      aria-hidden="true"
                      className={`w-[22px] h-[22px] rounded-full border-2 grid place-items-center text-[11px] font-bold flex-shrink-0 transition-colors ${STEP_STATUS_CLASS[status]}`}
                    >
                      {status === 'done' ? '✓' : stepDef.step}
                    </span>
                    {stepDef.label}
                  </button>

                  {/* 연결선 */}
                  {!isLast && (
                    <div className="h-[20px] w-0.5 bg-[var(--border)] ml-[27px]" aria-hidden="true" />
                  )}

                  {/* 서브메뉴 */}
                  <ul
                    id={`sub-step-${stepDef.step}`}
                    role="list"
                    className={`overflow-hidden transition-[max-height] duration-200 ${isExpanded ? 'max-h-[400px]' : 'max-h-0'}`}
                  >
                    {stepDef.subs.map((sub) => (
                      <li key={sub.view}>
                        <button
                          type="button"
                          onClick={() => handleViewClick(stepDef.step, sub.view)}
                          aria-label={`${sub.label}${sub.badge ? ` ${sub.badge}` : ''}`}
                          className={[
                            'flex items-center gap-1 w-full py-[7px] pl-[38px] pr-4 text-xs transition-all duration-100 text-left',
                            activeView === sub.view
                              ? 'text-[var(--accent)] font-semibold'
                              : 'text-[var(--toss-gray-4)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]',
                          ].join(' ')}
                        >
                          <span aria-hidden="true" className="mr-1">·</span>
                          {sub.label}
                          {sub.badge && (
                            <span className="ml-auto text-[10px] text-[var(--toss-gray-3)]">{sub.badge}</span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* 중앙 메인 콘텐츠 */}
        <main
          id="mainArea"
          role="main"
          className="flex-1 overflow-y-auto px-5 py-4 bg-[var(--muted)]"
        >
          {/* 모바일: 조회 전용 배너 */}
          <div
            role="note"
            aria-label="모바일 제한 안내"
            className="md:hidden mb-3 flex items-center gap-2 text-xs text-[var(--accent)] bg-[var(--accent-light)] border border-[var(--accent-light)] rounded-[var(--radius-md)] px-3 py-2"
          >
            모바일은 <strong>조회 전용</strong>입니다. 정산 작업은 PC에서 진행하세요.
          </div>

          {/* 모바일: 단계 표시기 */}
          <div
            role="list"
            aria-label="정산 단계 현황"
            className="md:hidden flex items-center overflow-x-auto whitespace-nowrap mb-4 bg-[var(--card)] rounded-[var(--radius-md)] p-3 gap-0"
          >
            {STEP_DEFS.map((stepDef, idx) => {
              const status = stepStatusOf(stepDef.step, activeStep);
              return (
                <React.Fragment key={stepDef.step}>
                  <div role="listitem" className="flex flex-col items-center gap-1 flex-shrink-0">
                    <div className={`w-7 h-7 rounded-full border-2 grid place-items-center text-[11px] font-bold transition-colors ${STEP_STATUS_CLASS[status]}`} aria-label={`${stepDef.step}단계 ${stepDef.label} ${status}`}>
                      {status === 'done' ? '✓' : stepDef.step}
                    </div>
                    <span className={`text-[10px] ${activeStep === stepDef.step ? 'text-[var(--accent)] font-bold' : 'text-[var(--toss-gray-4)]'}`}>
                      {stepDef.label}
                    </span>
                  </div>
                  {idx < STEP_DEFS.length - 1 && (
                    <div className={`w-8 h-0.5 flex-shrink-0 mb-3.5 ${status === 'done' ? 'bg-[var(--success)]' : 'bg-[var(--border)]'}`} aria-hidden="true" />
                  )}
                </React.Fragment>
              );
            })}
          </div>

          {/* STEP 1: 정산 */}
          {activeStep === 1 && (
            <StepDashboard activeView={activeView as Step1View} />
          )}

          {/* STEP 2: 대장 */}
          {activeStep === 2 && (
            <StepLedger activeView={activeView as Step2View} />
          )}

          {/* STEP 3: 검증 */}
          {activeStep === 3 && (
            <StepVerification activeView={activeView as Step3View} />
          )}

          {/* STEP 4: 출력 */}
          {activeStep === 4 && (
            <StepOutput activeView={activeView as Step4View} />
          )}
        </main>

        {/* 우측 시뮬레이터 패널 */}
        <SimulatorPanel />

      </div>
    </div>
  );
}
