'use client';

import type { Dispatch, SetStateAction } from 'react';
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
import { normalizeComposeFormType, resolveApprovalStaffLine } from '../전자결재-utils';
import { LucideIcon } from '../조직도서브/조직도측면창';

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
  handleSubmit: (options?: { skipSupplyInventoryReview?: boolean; unregisteredItemNames?: string[] }) => void | Promise<void>;
  isSubmitting?: boolean;
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
  const activeFormLabel = builtinFormTypes.includes(formType)
    ? formType
    : customFormTypes.find((customForm) => customForm.slug === formType)?.name ?? formType;
  const selectedDraft = formType !== '양식신청' ? lastDraftByType[formType] : null;
  const showDocumentBody = formType !== '양식신청';
  const isOfficialDispatch = formType === '공문발송';
  const isEditingApproval = Boolean(editingApproval?.id);

  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-20 md:pb-0">
      {isEditingApproval && (
        <div className="app-card flex items-start gap-3 border-[var(--accent)]/25 bg-[var(--accent-selected-subtle)] p-3">
          <span className="erp-icon-box h-8 w-8 shrink-0 bg-[var(--card)] text-[var(--accent)]">
            <LucideIcon name="FilePenLine" size={15} strokeWidth={2.2} />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-[var(--foreground)]">회수한 기안서를 수정 중입니다.</p>
          </div>
        </div>
      )}

      {draftBanner && (
        <div className="app-card flex flex-col gap-3 p-3 animate-premium-fade sm:flex-row sm:items-center">
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
              onClick={() => { clearDraftFromStorage(); setDraftBanner(false); }}
              className="btn-premium-secondary min-h-[34px] flex-1 sm:flex-none"
            >
              무시
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <section className="app-card order-2 overflow-hidden lg:order-1">
          <div className="erp-panel-header">
            <div className="min-w-0">
              <h2 className="truncate text-[15px] font-bold text-[var(--foreground)]">문서 작성</h2>
            </div>
            <span className="erp-chip erp-chip-active shrink-0">{activeFormLabel}</span>
          </div>

          <div className="border-b border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-2">
            <div className="flex w-full gap-1.5 overflow-x-auto no-scrollbar scroll-smooth snap-x snap-mandatory">
              {composeFormTabs.map((tab, index) => {
                const label = builtinFormTypes.includes(tab)
                  ? tab
                  : customFormTypes.find((customForm) => customForm.slug === tab)?.name ?? tab;
                const isActive = formType === tab || normalizeComposeFormType(tab) === formType;

                return (
                  <button
                    type="button"
                    key={`${tab}-${index}`}
                    data-testid={`approval-form-type-${index}`}
                    onClick={() => {
                      const nextFormType = normalizeComposeFormType(tab);
                      setFormType(nextFormType);
                      if (ccLine.length === 0) {
                        applyDefaultReferenceUsers(nextFormType);
                      }
                    }}
                    className={`snap-start inline-flex min-h-[34px] shrink-0 items-center rounded-[var(--radius-md)] border px-3 text-[12px] font-bold leading-tight whitespace-nowrap transition-all ${isActive ? 'border-[var(--accent)]/35 bg-[var(--card)] text-[var(--accent)] shadow-[var(--shadow-xs)]' : 'border-transparent text-[var(--muted-foreground)] hover:bg-[var(--card)] hover:text-[var(--foreground)]'}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-4 p-3 md:p-4">
            <div className="min-h-[220px] animate-premium-fade">
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
                <AnnualLeavePlanForm user={user} staffs={staffs} setExtraData={setExtraData} setFormTitle={setFormTitle} />
              ) : formType === '공문발송' ? (
                <OfficialDocumentDispatchForm
                  user={user}
                  extraData={extraData}
                  setExtraData={setExtraData}
                  setFormTitle={setFormTitle}
                  setFormContent={setFormContent}
                />
              ) : (
                <AdminForms staffs={staffs as { id: string; name: string; position: string }[]} formType={formType} setExtraData={setExtraData} />
              )}
            </div>

            {showDocumentBody && (
              <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-[13px] font-bold text-[var(--foreground)]">문서 기본 정보</h3>
                  </div>
                  {isOfficialDispatch && <span className="erp-status erp-status-blue">자동 반영</span>}
                </div>

                {!isOfficialDispatch && (
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
                )}

                {isOfficialDispatch && (
                  <div className="rounded-[var(--radius-md)] border border-[var(--accent)]/20 bg-[var(--accent-selected-subtle)] px-3 py-2 text-[12px] font-semibold text-[var(--accent)]">
                    공문 양식 자동 반영
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        <aside className="order-1 space-y-3 lg:order-2 lg:sticky lg:top-4">
          <section className="app-card overflow-visible">
            <div className="erp-panel-header">
              <div>
                <h3 className="text-[13px] font-bold text-[var(--foreground)]">결재 흐름</h3>
              </div>
              <span className={`erp-status ${hasApproverSelection ? 'erp-status-blue' : 'erp-status-red'}`}>
                {hasApproverSelection ? `${approverLine.length}명` : '필수'}
              </span>
            </div>

            <div className="space-y-3 p-3">
              <label className="block space-y-1.5">
                <span className="text-[11px] font-bold text-[var(--muted-foreground)]">결재자 선택</span>
                <select
                  data-testid="approval-approver-select"
                  onChange={(event) => {
                    const staff = approverCandidates.find((candidate) => candidate.id === event.target.value);
                    if (staff && !approverLine.find((approver) => approver.id === staff.id)) setApproverLine([...approverLine, staff]);
                    event.target.value = '';
                  }}
                  className="h-11 min-w-0 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 text-[13px] font-bold text-[var(--foreground)] outline-none transition-all focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15"
                >
                  <option value="">결재자 추가...</option>
                  {approverCandidates.map((staff) => (
                    <option key={staff.id} value={staff.id}>{staff.name} {staff.position || ''} {staff.company ? `(${staff.company})` : ''}</option>
                  ))}
                </select>
              </label>

              <div className="space-y-2">
                <p className="text-[11px] font-bold text-[var(--muted-foreground)]">결재선</p>
                {approverLine.length === 0 ? (
                  <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-4 text-center text-[11px] font-semibold text-[var(--muted-foreground)]">
                    결재자가 없습니다.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {approverLine.map((approver, index) => (
                      <div key={`${approver.id}-${index}`} className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2.5 py-2">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--accent-selected-subtle)] text-[11px] font-black text-[var(--accent)]">
                          {index + 1}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[12px] font-bold text-[var(--foreground)]">
                          {approver.name} {approver.position}
                        </span>
                        <button
                          type="button"
                          data-testid={`approval-selected-approver-remove-${index}`}
                          onClick={() => setApproverLine(approverLine.filter((_, itemIndex) => itemIndex !== index))}
                          className="icon-btn h-7 w-7 text-[var(--muted-foreground)] hover:bg-[var(--danger-light)] hover:text-[var(--danger)]"
                        >
                          <LucideIcon name="X" size={13} strokeWidth={2.4} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {!hasApproverSelection && (
                  <p className="text-[11px] font-bold text-[var(--danger)]" data-testid="approval-approver-required">
                    결재권자가 필요합니다.
                  </p>
                )}
              </div>

              <label className="block space-y-1.5">
                <span className="text-[11px] font-bold text-[var(--muted-foreground)]">참조자 선택</span>
                <select
                  data-testid="approval-cc-select"
                  onChange={(event) => {
                    const staff = approvalDirectoryStaffs.find((candidate) => String(candidate.id) === event.target.value);
                    if (staff && !ccLine.find((ccUser) => ccUser.id === staff.id)) {
                      setCcLine((prev) => [...prev, { id: staff.id, name: staff.name, position: staff.position }]);
                    }
                    event.target.value = '';
                  }}
                  className="h-11 min-w-0 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 text-[13px] font-bold text-[var(--foreground)] outline-none transition-all focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15"
                >
                  <option value="">참조자 추가...</option>
                  {approvalDirectoryStaffs
                    .filter((staff) => !ccLine.find((ccUser) => ccUser.id === staff.id))
                    .map((staff) => <option key={staff.id} value={staff.id}>{staff.name} ({staff.position || '-'}) {staff.company ? `· ${staff.company}` : ''}</option>)}
                </select>
              </label>

              <div className="space-y-2">
                <p className="text-[11px] font-bold text-[var(--muted-foreground)]">참조자</p>
                {ccLine.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {ccLine.map((ccUser, index) => (
                      <div key={`${ccUser.id}-${index}`} className="erp-chip border border-[var(--accent)]/15 bg-[var(--accent-selected-subtle)] text-[var(--accent)]">
                        참조 {ccUser.name}
                        <button
                          type="button"
                          data-testid={`approval-selected-cc-remove-${index}`}
                          onClick={() => setCcLine((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}
                          className="ml-0.5 inline-flex h-5 w-5 items-center justify-center rounded-[var(--radius-sm)] text-[var(--accent)] hover:bg-[var(--danger-light)] hover:text-[var(--danger)]"
                        >
                          <LucideIcon name="X" size={11} strokeWidth={2.4} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-[var(--radius-md)] bg-[var(--surface-subtle)] px-3 py-2 text-[11px] font-semibold text-[var(--muted-foreground)]">
                    참조자 없음
                  </p>
                )}
              </div>
            </div>
          </section>

          <section className="app-card overflow-visible p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h3 className="text-[13px] font-bold text-[var(--foreground)]">결재선 템플릿</h3>
              </div>
              <span className="erp-chip">{approverTemplates.length}개</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => { setTemplateNameInput(''); setShowTemplateModal(true); }}
                data-testid="approval-template-save-open"
                className="btn-premium-secondary min-h-[36px]"
              >
                <LucideIcon name="Save" size={14} strokeWidth={2} />
                저장
              </button>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowApproverTemplateMenu((prev) => !prev)}
                  data-testid="approval-template-load-toggle"
                  disabled={approverTemplates.length === 0}
                  className="btn-premium-primary min-h-[36px] w-full disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <LucideIcon name="FolderOpen" size={14} strokeWidth={2} />
                  불러오기
                </button>
                {showApproverTemplateMenu && approverTemplates.length > 0 && (
                  <div data-testid="approval-template-load-menu" className="absolute right-0 top-full z-50 mt-1 w-[min(280px,calc(100vw-32px))] overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-dropdown)]">
                    {approverTemplates.map((template) => (
                      <div key={template.id} className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] px-3 py-2 last:border-b-0 hover:bg-[var(--surface-subtle)]">
                        <button
                          type="button"
                          data-testid={`approval-template-load-${template.id}`}
                          onClick={() => {
                            setApproverLine(resolveApprovalStaffLine(template.line, approvalDirectoryStaffs));
                            if (Array.isArray(template.ccLine)) {
                              setCcLine(template.ccLine);
                            }
                            setShowApproverTemplateMenu(false);
                          }}
                          className="min-w-0 flex-1 text-left"
                        >
                          <span className="block truncate text-[12px] font-bold text-[var(--foreground)]">{template.name}</span>
                          <span className="mt-0.5 block text-[10px] font-semibold text-[var(--muted-foreground)]">
                            결재 {template.line.length}명{Array.isArray(template.ccLine) && template.ccLine.length > 0 ? ` · 참조 ${template.ccLine.length}명` : ''}
                          </span>
                        </button>
                        <button
                          type="button"
                          data-testid={`approval-template-delete-${template.id}`}
                          onClick={() => {
                            const next = approverTemplates.filter((item) => item.id !== template.id);
                            setApproverTemplates(next);
                            persistApproverTemplates(next);
                            if (next.length === 0) {
                              setShowApproverTemplateMenu(false);
                            }
                          }}
                          className="icon-btn h-7 w-7 text-[var(--muted-foreground)] hover:bg-[var(--danger-light)] hover:text-[var(--danger)]"
                        >
                          <LucideIcon name="X" size={13} strokeWidth={2.4} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          {selectedDraft && (
            <section className="app-card p-3">
              <div className="mb-3 flex items-center gap-2">
                <span className="erp-icon-box h-8 w-8">
                  <LucideIcon name="History" size={15} strokeWidth={2.2} />
                </span>
                <div className="min-w-0">
                  <h3 className="truncate text-[13px] font-bold text-[var(--foreground)]">최근 상신 문서</h3>
                  <p className="truncate text-[11px] font-semibold text-[var(--muted-foreground)]">
                    {(selectedDraft.title as string) || '(제목 없음)'} · {new Date(selectedDraft.created_at as string).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={loadLastDraft}
                className="btn-premium-secondary min-h-[36px] w-full"
              >
                이전 기안 불러오기
              </button>
            </section>
          )}

          {showDocumentBody && (
            <section className="app-card p-3">
              <button
                type="button"
                data-testid="approval-submit-button"
                onClick={() => {
                  void handleSubmit();
                }}
                disabled={!hasApproverSelection || isSubmitting}
                className="btn-premium-primary min-h-[44px] w-full text-[13px] font-bold disabled:cursor-not-allowed disabled:opacity-45"
              >
                <LucideIcon name="Send" size={15} strokeWidth={2.2} />
                {isEditingApproval ? '수정본 재상신' : '결재 상신'}
              </button>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
