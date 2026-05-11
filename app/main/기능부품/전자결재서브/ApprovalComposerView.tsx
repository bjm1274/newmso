'use client';

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import type { StaffMember } from '@/types';
import AttendanceForms from './근태신청양식';
import SuppliesForm from './비품구매양식';
import AdminForms from './관리행정양식';
import FormRequest from './양식신청';
import AttendanceCorrectionForm from './출결정정양식';
import RepairRequestForm from './수리요청서양식';
import AnnualLeavePlanForm from './연차사용계획서양식';
import OfficialDocumentDispatchForm from './공문발송양식';
import ReportApprovalForm from './ReportApprovalForm';
import type { ApprovalCcUser, ApproverTemplate } from '../전자결재-types';
import { normalizeComposeFormType } from '../전자결재-utils';
import { LucideIcon } from '../조직도서브/조직도측면창';
import ApprovalFormTypePicker from './ApprovalFormTypePicker';
import ApprovalApproverLinePanel from './ApprovalApproverLinePanel';

type ApprovalComposerViewProps = {
  user: StaffMember | null;
  staffs: StaffMember[];
  draftBanner: boolean;
  setDraftBanner: Dispatch<SetStateAction<boolean>>;
  loadDraftFromStorage: () => void;
  clearDraftFromStorage: () => void;
  approverCandidates: StaffMember[];
  approvalDirectoryStaffs: StaffMember[];
  approverLine: StaffMember[];
  setApproverLine: Dispatch<SetStateAction<StaffMember[]>>;
  ccLine: ApprovalCcUser[];
  setCcLine: Dispatch<SetStateAction<ApprovalCcUser[]>>;
  templateNameInput: string;
  setTemplateNameInput: Dispatch<SetStateAction<string>>;
  setShowTemplateModal: Dispatch<SetStateAction<boolean>>;
  showApproverTemplateMenu: boolean;
  setShowApproverTemplateMenu: Dispatch<SetStateAction<boolean>>;
  approverTemplates: ApproverTemplate[];
  setApproverTemplates: Dispatch<SetStateAction<ApproverTemplate[]>>;
  persistApproverTemplates: (nextTemplates: ApproverTemplate[]) => void;
  composeFormTabs: string[];
  builtinFormTypes: string[];
  customFormTypes: { name: string; slug: string }[];
  formType: string;
  setFormType: Dispatch<SetStateAction<string>>;
  applyDefaultReferenceUsers: (targetFormType: string) => void;
  editingApproval?: Record<string, unknown> | null;
  lastDraftByType: Record<string, Record<string, unknown> | null>;
  loadLastDraft: () => void;
  formTitle: string;
  setFormTitle: Dispatch<SetStateAction<string>>;
  formContent: string;
  setFormContent: Dispatch<SetStateAction<string>>;
  extraData: Record<string, unknown>;
  setExtraData: Dispatch<SetStateAction<Record<string, unknown>>>;
  suppliesLoadKey: number;
  attendanceCorrectionSeedDates: string[];
  setAttendanceCorrectionSeedDates: Dispatch<SetStateAction<string[]>>;
  hasApproverSelection: boolean;
  handleSubmit: (options?: {
    skipSupplyInventoryReview?: boolean;
    unregisteredItemNames?: string[];
  }) => void | Promise<void>;
  isSubmitting?: boolean;
};

type StepId = 1 | 2 | 3 | 4;
type StepKey = 'form' | 'content' | 'approver' | 'submit';

const STEP_LABELS: Record<StepId, { key: StepKey; label: string; tagline: string }> = {
  1: { key: 'form', label: '양식 선택', tagline: '결재 양식을 고르세요' },
  2: { key: 'content', label: '내용 작성', tagline: '문서 내용을 입력하세요' },
  3: { key: 'approver', label: '결재선', tagline: '결재자와 참조자를 지정하세요' },
  4: { key: 'submit', label: '상신', tagline: '내용 확인 후 상신하세요' },
};

export default function ApprovalComposerView({
  user,
  staffs,
  draftBanner,
  setDraftBanner,
  loadDraftFromStorage,
  clearDraftFromStorage,
  approverCandidates,
  approvalDirectoryStaffs,
  approverLine,
  setApproverLine,
  ccLine,
  setCcLine,
  setTemplateNameInput,
  setShowTemplateModal,
  showApproverTemplateMenu,
  setShowApproverTemplateMenu,
  approverTemplates,
  setApproverTemplates,
  persistApproverTemplates,
  composeFormTabs,
  builtinFormTypes,
  customFormTypes,
  formType,
  setFormType,
  applyDefaultReferenceUsers,
  editingApproval = null,
  lastDraftByType,
  loadLastDraft,
  formTitle,
  setFormTitle,
  formContent,
  setFormContent,
  extraData,
  setExtraData,
  suppliesLoadKey,
  attendanceCorrectionSeedDates,
  setAttendanceCorrectionSeedDates,
  hasApproverSelection,
  handleSubmit,
  isSubmitting = false,
}: ApprovalComposerViewProps) {
  const [currentStep, setCurrentStep] = useState<StepId>(1);

  const activeFormLabel = builtinFormTypes.includes(formType)
    ? formType
    : customFormTypes.find((customForm) => customForm.slug === formType)?.name ?? formType;
  const selectedDraft = formType !== '양식신청' ? lastDraftByType[formType] : null;
  const showDocumentBody = formType !== '양식신청';
  const isOfficialDispatch = formType === '공문발송';
  const isEditingApproval = Boolean(editingApproval?.id);

  const contentReady = !showDocumentBody || isOfficialDispatch || Boolean(formTitle.trim());

  const canGoToStep = (target: StepId): boolean => {
    if (target === 1) return true;
    if (target === 2) return Boolean(formType);
    if (target === 3) return Boolean(formType) && contentReady;
    return Boolean(formType) && contentReady && hasApproverSelection;
  };

  const goNext = () => {
    if (currentStep < 4 && canGoToStep((currentStep + 1) as StepId)) {
      setCurrentStep((prev) => (Math.min(prev + 1, 4) as StepId));
    }
  };
  const goPrev = () => {
    if (currentStep > 1) setCurrentStep((prev) => (Math.max(prev - 1, 1) as StepId));
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [currentStep]);

  const selectFormType = (tab: string) => {
    const nextFormType = normalizeComposeFormType(tab);
    setFormType(nextFormType);
    if (ccLine.length === 0) applyDefaultReferenceUsers(nextFormType);
  };

  const submitApproval = () => {
    void handleSubmit();
  };

  const stepIds: StepId[] = [1, 2, 3, 4];

  const summaryItems = useMemo(() => {
    const items: { label: string; value: string }[] = [
      { label: '양식', value: activeFormLabel || '미선택' },
    ];
    if (showDocumentBody && !isOfficialDispatch) {
      items.push({ label: '제목', value: formTitle.trim() || '(제목 없음)' });
    }
    items.push({
      label: '결재선',
      value:
        approverLine.length > 0
          ? approverLine.map((approver, index) => `${index + 1}. ${approver.name} ${approver.position || ''}`.trim()).join(' › ')
          : '미지정',
    });
    items.push({
      label: '참조',
      value: ccLine.length > 0 ? ccLine.map((cc) => cc.name).join(', ') : '없음',
    });
    return items;
  }, [activeFormLabel, approverLine, ccLine, formTitle, isOfficialDispatch, showDocumentBody]);

  const nextDisabled = !canGoToStep((currentStep + 1) as StepId);
  const submitDisabled = !hasApproverSelection || !contentReady || isSubmitting;

  const nextLabel = currentStep === 3 ? '확인 및 상신' : '다음 단계';

  return (
    <div className="mx-auto max-w-3xl space-y-3 pb-6">
      {isEditingApproval && (
        <div className="app-card flex items-start gap-3 border-[var(--accent)]/25 bg-[var(--accent-selected-subtle)] p-3">
          <span className="erp-icon-box h-8 w-8 shrink-0 bg-[var(--card)] text-[var(--accent)]">
            <LucideIcon name="FilePenLine" size={15} strokeWidth={2.2} />
          </span>
          <p className="text-[13px] font-bold text-[var(--foreground)]">회수한 기안서를 수정 중입니다.</p>
        </div>
      )}

      {draftBanner && currentStep === 1 && (
        <div className="app-card flex flex-col gap-2 p-3 animate-premium-fade sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="erp-icon-box h-8 w-8">
              <LucideIcon name="FileClock" size={15} strokeWidth={2.2} />
            </span>
            <span className="truncate text-[13px] font-bold text-[var(--foreground)]">
              저장된 임시저장이 있습니다.
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={loadDraftFromStorage}
              className="btn-premium-primary min-h-[34px] flex-1 sm:flex-none"
            >
              불러오기
            </button>
            <button
              type="button"
              onClick={() => {
                clearDraftFromStorage();
                setDraftBanner(false);
              }}
              className="btn-premium-secondary min-h-[34px] flex-1 sm:flex-none"
            >
              무시
            </button>
          </div>
        </div>
      )}

      <nav className="app-card p-2.5 sm:p-3" aria-label="결재 작성 단계">
        <ol className="grid grid-cols-4 gap-1 sm:gap-2">
          {stepIds.map((id) => {
            const meta = STEP_LABELS[id];
            const isActive = currentStep === id;
            const isCompleted = currentStep > id;
            const reachable = canGoToStep(id);
            return (
              <li key={id} className="min-w-0">
                <button
                  type="button"
                  onClick={() => {
                    if (reachable) setCurrentStep(id);
                  }}
                  disabled={!reachable}
                  aria-current={isActive ? 'step' : undefined}
                  className={`flex w-full min-w-0 items-center gap-1.5 rounded-[var(--radius-md)] px-1.5 py-1.5 text-left transition-colors sm:gap-2 sm:px-2 ${
                    isActive
                      ? 'bg-[var(--accent-selected-subtle)]'
                      : reachable
                        ? 'hover:bg-[var(--surface-subtle)]'
                        : 'opacity-60'
                  } disabled:cursor-not-allowed`}
                >
                  <span
                    aria-hidden
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-black transition-all sm:h-7 sm:w-7 sm:text-[11px] ${
                      isActive
                        ? 'bg-[var(--accent)] text-white shadow-[var(--shadow-xs)]'
                        : isCompleted
                          ? 'bg-[var(--accent)]/75 text-white'
                          : 'border border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--muted-foreground)]'
                    }`}
                  >
                    {isCompleted ? <LucideIcon name="Check" size={12} strokeWidth={2.6} /> : id}
                  </span>
                  <span
                    className={`min-w-0 truncate text-[11px] font-black sm:text-[12px] ${
                      isActive
                        ? 'text-[var(--accent)]'
                        : isCompleted
                          ? 'text-[var(--foreground)]'
                          : 'text-[var(--muted-foreground)]'
                    }`}
                  >
                    {meta.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <section className="app-card overflow-hidden">
        <div className="space-y-4 p-3 sm:p-4">
          {currentStep === 1 && (
            <div className="space-y-3 animate-premium-fade">
              <ApprovalFormTypePicker
                composeFormTabs={composeFormTabs}
                builtinFormTypes={builtinFormTypes}
                customFormTypes={customFormTypes}
                formType={formType}
                selectFormType={selectFormType}
                lastDraftByType={lastDraftByType}
              />

              {selectedDraft && (
                <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="erp-icon-box h-7 w-7">
                      <LucideIcon name="History" size={13} strokeWidth={2.2} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-[var(--muted-foreground)]">최근 상신 문서</p>
                      <p className="truncate text-[12px] font-bold text-[var(--foreground)]">
                        {(selectedDraft.title as string) || '(제목 없음)'} ·{' '}
                        {new Date(selectedDraft.created_at as string).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <button type="button" onClick={loadLastDraft} className="btn-premium-secondary min-h-[36px] w-full">
                    이전 기안 불러오기
                  </button>
                </div>
              )}
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-4 animate-premium-fade">
              <div className="min-h-[220px]">
                {['연차/휴가', '연장근무'].includes(formType) ? (
                  <AttendanceForms
                    user={user}
                    staffs={staffs}
                    formType={formType}
                    setExtraData={setExtraData}
                    setFormTitle={setFormTitle}
                    initialExtraData={extraData}
                  />
                ) : formType === '물품신청' ? (
                  <SuppliesForm
                    key={suppliesLoadKey}
                    setExtraData={setExtraData}
                    initialItems={Array.isArray(extraData.items) ? (extraData.items as unknown[]) : undefined}
                    user={user}
                  />
                ) : formType === '수리요청서' ? (
                  <RepairRequestForm setExtraData={setExtraData} />
                ) : formType === '보고서작성' ? (
                  <ReportApprovalForm
                    extraData={extraData}
                    setExtraData={setExtraData}
                    formTitle={formTitle}
                    setFormTitle={setFormTitle}
                  />
                ) : formType === '양식신청' ? (
                  <FormRequest user={user} staffs={staffs} approverLine={approverLine} ccLine={ccLine} />
                ) : formType === '출결정정' ? (
                  <AttendanceCorrectionForm
                    user={user}
                    staffs={staffs}
                    initialSelectedDates={attendanceCorrectionSeedDates}
                    onConsumeInitialSelectedDates={() => setAttendanceCorrectionSeedDates([])}
                    setExtraData={setExtraData}
                    setFormTitle={setFormTitle}
                  />
                ) : formType === '연차계획서' ? (
                  <AnnualLeavePlanForm
                    user={user}
                    staffs={staffs}
                    setExtraData={setExtraData}
                    setFormTitle={setFormTitle}
                  />
                ) : formType === '공문발송' ? (
                  <OfficialDocumentDispatchForm
                    user={user}
                    extraData={extraData}
                    setExtraData={setExtraData}
                    setFormTitle={setFormTitle}
                    setFormContent={setFormContent}
                  />
                ) : (
                  <AdminForms
                    staffs={staffs as { id: string; name: string; position: string }[]}
                    formType={formType}
                    setExtraData={setExtraData}
                  />
                )}
              </div>

              {showDocumentBody && (
                <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="text-[13px] font-bold text-[var(--foreground)]">문서 기본 정보</h3>
                    {isOfficialDispatch && <span className="erp-status erp-status-blue">자동 반영</span>}
                  </div>

                  {!isOfficialDispatch ? (
                    <div className="space-y-3">
                      <label className="block space-y-1.5">
                        <span className="text-[11px] font-bold text-[var(--muted-foreground)]">기안 제목</span>
                        <input
                          data-testid="approval-title-input"
                          value={formTitle}
                          onChange={(event) => setFormTitle(event.target.value)}
                          className="h-12 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 text-[15px] font-bold text-[var(--foreground)] outline-none transition-all focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15"
                          placeholder="기안 제목을 입력하세요"
                        />
                      </label>
                      <label className="block space-y-1.5">
                        <span className="text-[11px] font-bold text-[var(--muted-foreground)]">상세 내용</span>
                        <textarea
                          data-testid="approval-content-input"
                          value={formContent}
                          onChange={(event) => setFormContent(event.target.value)}
                          className="h-44 w-full resize-y rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-3 text-[13px] font-semibold leading-relaxed text-[var(--foreground)] outline-none transition-all focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15 md:h-52"
                          placeholder="상세 사유 및 내용을 입력하세요."
                        />
                      </label>
                    </div>
                  ) : (
                    <div className="rounded-[var(--radius-md)] border border-[var(--accent)]/20 bg-[var(--accent-selected-subtle)] px-3 py-2 text-[12px] font-semibold text-[var(--accent)]">
                      공문 양식 자동 반영
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-3 animate-premium-fade">
              <ApprovalApproverLinePanel
                approverCandidates={approverCandidates}
                approvalDirectoryStaffs={approvalDirectoryStaffs}
                approverLine={approverLine}
                setApproverLine={setApproverLine}
                ccLine={ccLine}
                setCcLine={setCcLine}
                hasApproverSelection={hasApproverSelection}
                approverTemplates={approverTemplates}
                setApproverTemplates={setApproverTemplates}
                persistApproverTemplates={persistApproverTemplates}
                showApproverTemplateMenu={showApproverTemplateMenu}
                setShowApproverTemplateMenu={setShowApproverTemplateMenu}
                setTemplateNameInput={setTemplateNameInput}
                setShowTemplateModal={setShowTemplateModal}
              />
            </div>
          )}

          {currentStep === 4 && (
            <div className="space-y-3 animate-premium-fade">
              <ol className="space-y-2">
                {summaryItems.map((item) => (
                  <li
                    key={item.label}
                    className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3"
                  >
                    <p className="text-[10px] font-black uppercase tracking-wider text-[var(--muted-foreground)]">
                      {item.label}
                    </p>
                    <p className="mt-1 text-[13px] font-black text-[var(--foreground)] whitespace-pre-wrap break-words">
                      {item.value}
                    </p>
                  </li>
                ))}
                {showDocumentBody && !isOfficialDispatch && formContent.trim() && (
                  <li className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
                    <p className="text-[10px] font-black uppercase tracking-wider text-[var(--muted-foreground)]">
                      상세 내용
                    </p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-[13px] font-semibold leading-relaxed text-[var(--foreground)]">
                      {formContent}
                    </p>
                  </li>
                )}
              </ol>

              {!hasApproverSelection && (
                <p className="rounded-[var(--radius-md)] bg-[var(--danger-light)] px-3 py-2 text-center text-[12px] font-bold text-[var(--danger)]">
                  결재자를 먼저 지정하세요.
                </p>
              )}
            </div>
          )}
        </div>

        <footer
          className="flex items-center justify-between gap-2 border-t border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-3"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
        >
          <button
            type="button"
            onClick={goPrev}
            disabled={currentStep === 1}
            className="btn-premium-secondary min-h-[44px] flex-1 max-w-[160px] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <LucideIcon name="ChevronLeft" size={15} strokeWidth={2.2} />
            이전
          </button>

          {currentStep < 4 ? (
            <button
              type="button"
              onClick={goNext}
              disabled={nextDisabled}
              className="btn-premium-primary min-h-[44px] flex-1 max-w-[220px] disabled:cursor-not-allowed disabled:opacity-45"
              data-testid={currentStep === 3 ? 'approval-step-confirm' : `approval-step-next-${currentStep}`}
            >
              {nextLabel}
              <LucideIcon name="ChevronDown" size={15} strokeWidth={2.2} className="-rotate-90" />
            </button>
          ) : (
            <button
              type="button"
              data-testid="approval-submit-button"
              onClick={submitApproval}
              disabled={submitDisabled}
              className="btn-premium-primary min-h-[44px] flex-1 max-w-[220px] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <LucideIcon name="Send" size={15} strokeWidth={2.2} />
              {isEditingApproval ? '수정본 재상신' : '결재 상신'}
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
