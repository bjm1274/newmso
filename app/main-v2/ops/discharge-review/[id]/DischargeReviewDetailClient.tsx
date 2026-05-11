'use client';

/**
 * DischargeReviewDetailClient.tsx — 퇴원심사 상세 인터랙션 (스텝 네비게이션)
 * JM2: 스텝 전환은 useState, 페이지 이동 0회
 * JM3: 필수 항목 미완료 시 결재 막기 (aria-live 에러)
 * JM4: StepId union, 상태 타입화
 */

import { useCallback, useState } from 'react';
import type { ChecklistItem, DischargeReview } from '../dummy-data';
import type { DischargeReason } from '../dummy-data';
import TemplateApplyModal from '../TemplateApplyModal';
import Step1BasicInfo, { type Step1Values } from '../steps/Step1BasicInfo';
import Step2Checklist from '../steps/Step2Checklist';
import Step3Approval from '../steps/Step3Approval';

type StepId = 1 | 2 | 3;

const STEPS: { id: StepId; label: string }[] = [
  { id: 1, label: '기본 정보' },
  { id: 2, label: '항목 체크' },
  { id: 3, label: '결재' },
];

interface Props {
  review: DischargeReview;
}

export default function DischargeReviewDetailClient({ review }: Props) {
  const [currentStep, setCurrentStep] = useState<StepId>(1);
  const [isTemplateOpen, setIsTemplateOpen] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Step 1 상태
  const [step1, setStep1] = useState<Step1Values>({
    dischargeDate: review.dischargeDate,
    diagnosis: review.diagnosis,
    dischargeReason: review.dischargeReason,
    dischargePlan: review.dischargePlan,
    specialNote: review.specialNote,
  });
  const [step1Errors, setStep1Errors] = useState<
    Partial<Record<keyof Step1Values, string>>
  >({});

  // Step 2 상태
  const [checklist, setChecklist] = useState<ChecklistItem[]>(review.checklist);

  // Step 3 상태
  const [finalOpinion, setFinalOpinion] = useState(review.finalOpinion);

  const checkedCount = checklist.filter((i) => i.checked).length;
  const allChecked = checkedCount === checklist.length;

  // ── 핸들러 ──────────────────────────────────────────────────────────────────

  const handleStep1Change = useCallback(
    (field: keyof Step1Values, value: string) => {
      setStep1((prev) => ({ ...prev, [field]: value as DischargeReason }));
      setStep1Errors((prev) => ({ ...prev, [field]: undefined }));
    },
    [],
  );

  const validateStep1 = (): boolean => {
    const errs: Partial<Record<keyof Step1Values, string>> = {};
    if (!step1.dischargeDate) errs.dischargeDate = '퇴원 예정일을 입력하세요';
    if (!step1.diagnosis.trim()) errs.diagnosis = '주요 진단명을 입력하세요';
    setStep1Errors(errs);
    return Object.keys(errs).length === 0;
  };

  const goStep = (id: StepId) => {
    setSubmitError('');
    setCurrentStep(id);
  };

  const handleNext = () => {
    if (currentStep === 1) {
      if (!validateStep1()) return;
      goStep(2);
    } else if (currentStep === 2) {
      goStep(3);
    } else {
      handleSubmit();
    }
  };

  const handlePrev = () => {
    if (currentStep > 1) goStep((currentStep - 1) as StepId);
  };

  const handleToggle = (id: string) => {
    setChecklist((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, checked: !item.checked } : item,
      ),
    );
  };

  const handleAddItem = (title: string) => {
    const newItem: ChecklistItem = {
      id: `custom-${Date.now()}`,
      title,
      description: '',
      checked: false,
    };
    setChecklist((prev) => [...prev, newItem]);
  };

  const handleApplyTemplate = (items: ChecklistItem[]) => {
    setChecklist(items);
  };

  const handleSubmit = () => {
    if (!allChecked) {
      setSubmitError(
        '⚠ 체크리스트 미완료 항목이 있습니다. 모든 항목을 확인 후 제출하세요.',
      );
      goStep(2);
      return;
    }
    setSubmitError('');
    setIsSubmitted(true);
  };

  if (isSubmitted) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <span className="text-5xl" aria-hidden="true">✅</span>
        <p className="text-base font-bold text-[var(--foreground)]">
          퇴원심사가 제출되었습니다
        </p>
        <p className="text-sm text-[var(--toss-gray-3)]">
          {review.patientName} · {step1.dischargeDate}
        </p>
      </div>
    );
  }

  return (
    <>
      {/* 스텝 인디케이터 */}
      <nav
        className="border-b border-[var(--border)] bg-[var(--card)] px-6"
        aria-label="심사 단계"
      >
        <div className="flex" role="tablist">
          {STEPS.map((step, idx) => {
            const isActive = currentStep === step.id;
            const isDone = currentStep > step.id;
            return (
              <div key={step.id} className="flex items-center">
                <button
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`step-panel-${step.id}`}
                  id={`step-tab-${step.id}`}
                  onClick={() => goStep(step.id)}
                  className={[
                    'flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]',
                    isActive
                      ? 'border-[var(--accent)] font-semibold text-[var(--accent)]'
                      : isDone
                        ? 'border-transparent text-green-600'
                        : 'border-transparent text-[var(--toss-gray-3)] hover:text-[var(--accent)]',
                  ].join(' ')}
                >
                  <StepBadge num={step.id} isActive={isActive} isDone={isDone} />
                  {step.label}
                </button>
                {idx < STEPS.length - 1 && (
                  <span
                    className="px-1 text-xs text-[var(--toss-gray-5)]"
                    aria-hidden="true"
                  >
                    ›
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </nav>

      {/* 스텝 본문 */}
      <div className="flex-1 overflow-y-auto p-6">
        <div
          id="step-panel-1"
          role="tabpanel"
          aria-labelledby="step-tab-1"
          hidden={currentStep !== 1}
        >
          <Step1BasicInfo
            review={review}
            values={step1}
            errors={step1Errors}
            onChange={handleStep1Change}
          />
        </div>

        <div
          id="step-panel-2"
          role="tabpanel"
          aria-labelledby="step-tab-2"
          hidden={currentStep !== 2}
        >
          <Step2Checklist
            items={checklist}
            onToggle={handleToggle}
            onAddItem={handleAddItem}
            onOpenTemplate={() => setIsTemplateOpen(true)}
            submitError={submitError}
          />
        </div>

        <div
          id="step-panel-3"
          role="tabpanel"
          aria-labelledby="step-tab-3"
          hidden={currentStep !== 3}
        >
          <Step3Approval
            review={review}
            checkedCount={checkedCount}
            totalItems={checklist.length}
            finalOpinion={finalOpinion}
            onOpinionChange={setFinalOpinion}
            submitError={submitError}
          />
        </div>
      </div>

      {/* 하단 내비게이션 */}
      <footer className="flex items-center justify-between border-t border-[var(--border)] bg-[var(--card)] px-6 py-3">
        <p
          aria-live="polite"
          aria-atomic="true"
          className="text-xs text-[var(--toss-gray-3)]"
        >
          {currentStep} / {STEPS.length} 단계
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handlePrev}
            disabled={currentStep === 1}
            aria-label="이전 단계"
            className="flex h-9 items-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-4 text-sm font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            ← 이전
          </button>
          <button
            type="button"
            onClick={handleNext}
            aria-label={currentStep === STEPS.length ? '퇴원심사 제출' : '다음 단계'}
            className="flex h-9 items-center rounded-[var(--radius-md)] bg-[var(--accent)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            {currentStep === STEPS.length ? '제출' : '다음 →'}
          </button>
        </div>
      </footer>

      {/* 템플릿 모달 / 바텀시트 */}
      <TemplateApplyModal
        isOpen={isTemplateOpen}
        onClose={() => setIsTemplateOpen(false)}
        onApply={handleApplyTemplate}
      />
    </>
  );
}

// ── 스텝 뱃지 ─────────────────────────────────────────────────────────────────

function StepBadge({
  num,
  isActive,
  isDone,
}: {
  num: number;
  isActive: boolean;
  isDone: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={[
        'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white',
        isActive
          ? 'bg-[var(--accent)]'
          : isDone
            ? 'bg-green-500'
            : 'bg-[var(--toss-gray-5)]',
      ].join(' ')}
    >
      {isDone ? '✓' : num}
    </span>
  );
}
