'use client';

/**
 * 계약·문서 워크센터 — 계약서 자동생성 5단계 워크플로 step
 *
 * 새 디자인 (지시서 §1-2): 다크 배너 + 5단계 ol/li (a11y)
 *   1. 직원 선택
 *   2. 양식 선택
 *   3. 항목 입력
 *   4. 미리보기
 *   5. 전자서명 발송
 *
 * 본 컴포넌트는 step UI만 제공한다. 실제 본문(직원 선택·양식 편집·서명 요청)은
 * 기존 `계약서자동생성.tsx`에 위임한다 — 비즈니스 로직 변경 금지.
 *
 * step 상태는 props로 받아 현재 진행 단계만 강조한다.
 *
 * JM: 단일 책임 — step 표시만.
 * JM4: any 금지. step ID literal union.
 * JM6: <ol> + <li>, 진행 중 step은 aria-current="step".
 */

import React from 'react';

export type WizardStep = 1 | 2 | 3 | 4 | 5;

export interface WizardStepDef {
  id: WizardStep;
  title: string;
  description: string;
}

export const CONTRACT_GEN_STEPS: WizardStepDef[] = [
  { id: 1, title: '직원 선택', description: '계약 대상 직원을 선택합니다.' },
  { id: 2, title: '양식 선택', description: '근로·연봉·수습 등 템플릿 선택.' },
  { id: 3, title: '항목 입력', description: '근무조건·임금·기간을 입력·확인.' },
  { id: 4, title: '미리보기', description: '생성될 계약서 PDF를 검토합니다.' },
  { id: 5, title: '전자서명 발송', description: '대표자·직원에게 동시 전송.' },
];

type StepStatus = 'done' | 'current' | 'pending';

function statusFor(stepId: WizardStep, currentStep: WizardStep): StepStatus {
  if (stepId < currentStep) return 'done';
  if (stepId === currentStep) return 'current';
  return 'pending';
}

interface ContractGenWizardProps {
  /** 현재 진행 중인 step (기본 1). */
  currentStep?: WizardStep;
}

export default function ContractGenWizard({
  currentStep = 1 }: ContractGenWizardProps) {
  return (
    <section
      className="app-card p-3 md:p-4"
      aria-labelledby="contract-gen-wizard-title"
    >
      <header className="mb-2.5 flex items-center justify-between">
        <h3
          id="contract-gen-wizard-title"
          className="text-[13px] font-bold text-[var(--foreground)]"
        >
          계약서 생성 5단계 워크플로
        </h3>
        <span className="text-[11px] font-medium text-[var(--toss-gray-4)] tnum">
          {currentStep} / {CONTRACT_GEN_STEPS.length}
        </span>
      </header>

      <ol className="flex flex-col gap-1.5">
        {CONTRACT_GEN_STEPS.map((step) => {
          const status = statusFor(step.id, currentStep);
          return (
            <StepItem
              key={step.id}
              step={step}
              status={status}
              isLast={step.id === CONTRACT_GEN_STEPS.length}
            />
          );
        })}
      </ol>
    </section>
  );
}

// ─── 개별 step item ────────────────────────────────────────────────
function StepItem({
  step,
  status,
  isLast }: {
  step: WizardStepDef;
  status: StepStatus;
  isLast: boolean;
}) {
  // 좌측 3px 색띠 + 번호 chip + 타이틀/설명
  const borderColor =
    status === 'done'
      ? 'border-l-[#10B981]'
      : status === 'current'
        ? 'border-l-[var(--accent)]'
        : 'border-l-[var(--border)]';

  const numChip =
    status === 'done'
      ? 'bg-[#10B981] text-white'
      : status === 'current'
        ? 'bg-[var(--accent)] text-white'
        : 'bg-[var(--tab-bg)] text-[var(--toss-gray-4)]';

  const titleColor =
    status === 'pending'
      ? 'text-[var(--toss-gray-4)]'
      : 'text-[var(--foreground)]';

  const ariaCurrent = status === 'current' ? 'step' : undefined;

  return (
    <li
      aria-current={ariaCurrent}
      className={`flex items-start gap-2.5 rounded-r-[var(--radius-md)] border-l-[3px] ${borderColor} bg-[var(--card)] px-2.5 py-2 ${
        isLast ? '' : ''
      }`}
    >
      <span
        aria-hidden="true"
        className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${numChip}`}
      >
        {status === 'done' ? '✓' : step.id}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-[12.5px] font-bold ${titleColor}`}>
          {step.id}. {step.title}
        </span>
        <span className="mt-0.5 block text-[11px] font-medium text-[var(--toss-gray-4)]">
          {step.description}
        </span>
      </span>
      {status === 'current' && (
        <span className="inline-flex shrink-0 items-center rounded-[var(--radius-md)] bg-[var(--accent)]/10 px-1.5 py-0.5 text-[10px] font-bold text-[var(--accent)]">
          진행 중
        </span>
      )}
      {status === 'done' && (
        <span className="inline-flex shrink-0 items-center rounded-[var(--radius-md)] bg-[#10B981]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#10B981]">
          완료
        </span>
      )}
    </li>
  );
}
