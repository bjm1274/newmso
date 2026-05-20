'use client';

import { useMemo, type Dispatch, type SetStateAction } from 'react';
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
import ApprovalApproverLinePanel from './ApprovalApproverLinePanel';
import ApprovalLineTimeline from './ApprovalLineTimeline';

type ApprovalComposerViewProps = {
  user: StaffMember | null;
  staffs: StaffMember[];
  draftBanner: boolean;
  setDraftBanner: Dispatch<SetStateAction<boolean>>;
  loadDraftFromStorage: () => void;
  clearDraftFromStorage: () => void;
  approverCandidates: StaffMember[];
  referenceCandidates: StaffMember[];
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

type FormOption = {
  tab: string;
  normalized: string;
  label: string;
  isCustom: boolean;
  group: 'leave' | 'work' | 'misc';
  requiresPermission: boolean;
};

const LEAVE_KEYWORDS = ['연차/휴가', '연차계획서', '연장근무', '출결정정', '연차촉진'];
const WORK_KEYWORDS = ['물품', '수리', '보고', '업무', '공문'];
const PERMISSION_KEYWORDS = ['공문발송'];

function classifyGroup(label: string, normalized: string): 'leave' | 'work' | 'misc' {
  if (LEAVE_KEYWORDS.some((kw) => label.includes(kw) || normalized.includes(kw))) return 'leave';
  if (WORK_KEYWORDS.some((kw) => label.includes(kw) || normalized.includes(kw))) return 'work';
  return 'misc';
}

export default function ApprovalComposerView({
  user,
  staffs,
  draftBanner,
  setDraftBanner,
  loadDraftFromStorage,
  clearDraftFromStorage,
  approverCandidates,
  referenceCandidates,
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
  const allOptions: FormOption[] = useMemo(() => {
    return composeFormTabs.map((tab) => {
      const normalized = normalizeComposeFormType(tab);
      const label = builtinFormTypes.includes(tab)
        ? tab
        : customFormTypes.find((customForm) => customForm.slug === tab)?.name ?? tab;
      const isCustom = customFormTypes.some((customForm) => customForm.slug === tab);
      return {
        tab,
        normalized,
        label,
        isCustom,
        group: classifyGroup(label, normalized),
        requiresPermission: PERMISSION_KEYWORDS.some((kw) => label.includes(kw) || normalized.includes(kw)),
      };
    });
  }, [composeFormTabs, builtinFormTypes, customFormTypes]);

  const groupedOptions = useMemo(() => {
    const used = new Set<string>();
    const make = (key: 'leave' | 'work' | 'misc') =>
      allOptions.filter((option) => {
        if (used.has(option.normalized)) return false;
        if (option.group !== key) return false;
        used.add(option.normalized);
        return true;
      });
    return [
      { key: 'leave' as const, title: '근태·휴가', items: make('leave') },
      { key: 'work' as const, title: '업무·지원', items: make('work') },
      { key: 'misc' as const, title: '양식·기타', items: make('misc') },
    ].filter((group) => group.items.length > 0);
  }, [allOptions]);

  const currentOption = useMemo(
    () => allOptions.find((option) => option.tab === formType || option.normalized === formType),
    [allOptions, formType],
  );
  const activeFormLabel = currentOption?.label || formType;
  const currentSelectValue = currentOption?.tab ?? '';

  // '증명서발급' 양식은 자체 양식 컴포넌트가 본문을 대체하므로 일반 문서 본문/이전 기안 노출 제외
  const selectedDraft = formType !== '증명서발급' ? lastDraftByType[formType] : null;
  const showDocumentBody = formType !== '증명서발급';
  const isOfficialDispatch = formType === '공문발송';
  const isEditingApproval = Boolean(editingApproval?.id);
  const contentReady = !showDocumentBody || isOfficialDispatch || Boolean(formTitle.trim());

  const selectFormType = (tab: string) => {
    const nextFormType = normalizeComposeFormType(tab);
    setFormType(nextFormType);
    if (ccLine.length === 0) applyDefaultReferenceUsers(nextFormType);
  };

  const submitApproval = () => {
    void handleSubmit();
  };

  const submitDisabled = !hasApproverSelection || !contentReady || isSubmitting;

  // 결재 흐름 미리보기용 가상 item (작성 중 모드)
  const composePreviewItem = useMemo<Record<string, unknown>>(
    () => ({
      sender_id: user?.id || '',
      sender_name: user?.name || '기안자(나)',
      status: '대기',
      created_at: new Date().toISOString(),
      meta_data: { approver_line: approverLine.map((approver) => String(approver.id)) },
    }),
    [user, approverLine],
  );

  return (
    <div className="mx-auto w-full max-w-[62.4rem] space-y-3 pb-6">
      {isEditingApproval && (
        <div className="app-card flex items-start gap-3 border-[var(--accent)]/25 bg-[var(--accent-selected-subtle)] p-3">
          <span className="erp-icon-box h-8 w-8 shrink-0 bg-[var(--card)] text-[var(--accent)]">
            <LucideIcon name="FilePenLine" size={15} strokeWidth={2.2} />
          </span>
          <p className="text-[13px] font-bold text-[var(--foreground)]">회수한 기안서를 수정 중입니다.</p>
        </div>
      )}

      {draftBanner && (
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
            <button type="button" onClick={loadDraftFromStorage} className="btn-premium-primary min-h-[34px] flex-1 sm:flex-none">
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

      {/* 헤더: 양식 드롭다운 + 상신 액션 (H1·서브 라인 제거 — 사용자 결정 27번) */}
      <header className="app-card flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <label className="flex items-center gap-2">
            <span className="text-[11px] font-black text-[var(--muted-foreground)]">양식</span>
            <div className="relative">
              <select
                value={currentSelectValue}
                onChange={(event) => {
                  if (event.target.value) selectFormType(event.target.value);
                }}
                data-testid="approval-form-type-select"
                aria-label="결재 양식 선택"
                className="h-9 min-w-[180px] appearance-none rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] pl-3 pr-9 text-[13px] font-black text-[var(--foreground)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15"
              >
                <option value="" disabled>
                  양식을 선택하세요
                </option>
                {groupedOptions.map((group) => (
                  <optgroup key={group.key} label={group.title}>
                    {group.items.map((option) => (
                      <option key={option.tab} value={option.tab}>
                        {option.label}
                        {option.requiresPermission ? ' · 권한 필요' : ''}
                        {option.isCustom ? ' (커스텀)' : ''}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]">
                <LucideIcon name="ChevronDown" size={14} strokeWidth={2.2} />
              </span>
            </div>
          </label>
          {currentOption?.requiresPermission && (
            <span className="rounded-[var(--radius-sm,4px)] bg-[var(--warning-light)] px-2 py-0.5 text-[10px] font-black text-[var(--warning)]">
              권한 필요
            </span>
          )}
          {selectedDraft && (
            <span className="text-[11px] font-semibold text-[var(--muted-foreground)]">
              최근 상신: {(selectedDraft.title as string) || '(제목 없음)'}
              <button
                type="button"
                onClick={loadLastDraft}
                className="ml-1.5 rounded-[var(--radius-sm,4px)] border border-[var(--border)] bg-[var(--card)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--foreground)] hover:border-[var(--accent)]/40"
              >
                불러오기
              </button>
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            data-testid="approval-submit-button"
            onClick={submitApproval}
            disabled={submitDisabled}
            className="btn-premium-primary min-h-[38px] px-4 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <LucideIcon name="Send" size={14} strokeWidth={2.2} />
            {isEditingApproval ? '수정본 재상신' : '결재 상신'}
          </button>
        </div>
      </header>

      {/* 결재 흐름 카드 — 상신 버튼 바로 아래 (사용자 결정 29번) */}
      <section className="app-card px-3 py-2.5">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <h2 className="text-[12px] font-black text-[var(--foreground)]">결재 흐름</h2>
          <span className="text-[10px] font-semibold text-[var(--muted-foreground)]">
            상신 시 첫 결재자에게 알림 발송
          </span>
        </div>
        <ApprovalLineTimeline
          item={composePreviewItem}
          staffs={approvalDirectoryStaffs}
          resolveApprovalLineIds={() => approverLine.map((approver) => String(approver.id))}
          resolveCurrentApproverId={() => (approverLine[0]?.id ? String(approverLine[0].id) : null)}
          composeMode
        />
        <ApprovalApproverLinePanel
          approverCandidates={approverCandidates}
          referenceCandidates={referenceCandidates}
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
      </section>

      {/* 본문 — 단일 컬럼 (사용자 결정 28번) */}
      <section className="app-card overflow-hidden">
        <div className="space-y-4 p-3 sm:p-4">
          <header className="flex items-center justify-between gap-2">
            <h2 className="text-[13px] font-black text-[var(--foreground)]">본문 · {activeFormLabel}</h2>
            {isOfficialDispatch && <span className="erp-status erp-status-blue">자동 반영</span>}
          </header>

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
            ) : formType === '증명서발급' ? (
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

          {showDocumentBody && !isOfficialDispatch && (
            <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
              <h3 className="mb-3 text-[12px] font-black text-[var(--foreground)]">문서 기본 정보</h3>
              <div className="space-y-3">
                <label className="block space-y-1.5">
                  <span className="text-[11px] font-bold text-[var(--muted-foreground)]">기안 제목</span>
                  <input
                    data-testid="approval-title-input"
                    value={formTitle}
                    onChange={(event) => setFormTitle(event.target.value)}
                    className="h-11 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 text-[14px] font-bold text-[var(--foreground)] outline-none transition-all focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15"
                    placeholder="기안 제목을 입력하세요"
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-[11px] font-bold text-[var(--muted-foreground)]">상세 내용</span>
                  <textarea
                    data-testid="approval-content-input"
                    value={formContent}
                    onChange={(event) => setFormContent(event.target.value)}
                    className="h-40 w-full resize-y rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-3 text-[13px] font-semibold leading-relaxed text-[var(--foreground)] outline-none transition-all focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15 md:h-48"
                    placeholder="상세 사유 및 내용을 입력하세요."
                  />
                </label>
              </div>
            </div>
          )}

          {!hasApproverSelection && (
            <p
              data-testid="approval-approver-required-banner"
              className="rounded-[var(--radius-md)] bg-[var(--danger-light)] px-3 py-2 text-[12px] font-bold text-[var(--danger)]"
            >
              결재자를 먼저 지정하세요.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
