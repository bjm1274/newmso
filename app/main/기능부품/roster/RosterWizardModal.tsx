// @ts-nocheck
'use client';

import RosterWizardRuleStep from './RosterWizardRuleStep';

type RosterWizardModalProps = Record<string, any>;

export default function RosterWizardModal(props: RosterWizardModalProps) {
  const {
    OFF_SHIFT_TOKEN,
    RosterWizardExceptionsStep,
    RosterWizardSetupStep,
    RosterWizardStaffStep,
    WEEKDAY_LABELS,
    WEEKDAY_PICKER_ORDER,
    activeStaffs,
    addPreferredOffDate,
    addWizardPairRule,
    applyWizard,
    availableIncludedDepartments,
    buildDefaultStaffRestrictionDraft,
    button,
    clearWizardStaffSelection,
    closeWizard,
    companyLockedByHrFilter,
    companyOptions,
    div,
    effectiveWizardCustomPatternSequence,
    effectiveWizardWeeklyTemplateWeeks,
    getDepartmentName,
    getShiftCode,
    getShiftNameById,
    h3,
    includeAllWizardStaff,
    includedDepartments,
    isAdmin,
    monthDates,
    orderedWizardShiftIds,
    p,
    preferredOffDate,
    preferredOffStaffId,
    removeWizardPairRule,
    rosterScopeLabel,
    selectedCompany,
    selectedDepartment,
    selectedMonth,
    serializeCoverageRoleTags,
    setPreferredOffDate,
    setPreferredOffStaffId,
    setSelectedCompany,
    setSelectedDepartment,
    setSelectedMonth,
    setWizardStep,
    span,
    targetStaffs,
    teamOptions,
    toast,
    toggleIncludedDepartment,
    toggleWizardStaff,
    updateWizardCoverageRoleDraft,
    updateWizardDedicatedBandDraft,
    updateWizardNightRangeDraft,
    updateWizardOffOverride,
    updateWizardPairRule,
    updateWizardStaffRestrictionDraft,
    wizardCoverageRoleDrafts,
    wizardDedicatedBandDrafts,
    wizardExcludedStaffs,
    wizardNightRangeDrafts,
    wizardOffOverrides,
    wizardOpen,
    wizardOverrideDateOptions,
    wizardOverrideShiftOptions,
    wizardPairRules,
    wizardPattern,
    wizardRequiredShiftCount,
    wizardSelectedStaffIds,
    wizardSelectedStaffs,
    wizardStaffRestrictionDrafts,
    wizardStep,
    wizardUsesCustomPattern,
    wizardUsesWeeklyTemplate,
    workShifts,
    workingShifts,
  } = props;

    if (!wizardOpen) return null;

    return (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 px-4 py-4">
            <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] shadow-sm">
              <div className="border-b border-[var(--border)] bg-[var(--page-bg)] px-4 py-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h3 className="text-2xl font-black tracking-[-0.03em] text-[var(--foreground)]">
                      <span className="bg-gradient-to-r from-[var(--accent)] to-fuchsia-500 bg-clip-text text-transparent">
                        근무표 생성
                      </span>{' '}
                      마법사
                    </h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { step: 1 as any, label: '팀 선택' },
                      { step: 2 as any, label: '직원 선택' },
                      { step: 3 as any, label: '패턴 · 근무유형' },
                      { step: 4 as any, label: '예외 일정' },
                    ].map(({ step, label }) => (
                      <div
                        key={step}
                        className={`rounded-[var(--radius-md)] px-4 py-2 text-sm font-semibold ${wizardStep === step ? 'bg-[var(--accent)] text-white' : wizardStep > step ? 'bg-[var(--toss-blue-light)] text-[var(--accent)]' : 'bg-[var(--muted)] text-[var(--toss-gray-3)]'}`}
                      >
                        {step}. {label}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
    
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                {wizardStep === 1 ? (
                  <RosterWizardSetupStep
                    selectedMonth={selectedMonth}
                    onSelectedMonthChange={setSelectedMonth}
                    selectedCompany={selectedCompany}
                    onSelectedCompanyChange={setSelectedCompany}
                    isAdmin={isAdmin}
                    companyLockedByHrFilter={companyLockedByHrFilter}
                    companyOptions={companyOptions}
                    teamOptions={teamOptions}
                    activeStaffs={activeStaffs}
                    getDepartmentName={getDepartmentName}
                    selectedDepartment={selectedDepartment}
                    onSelectedDepartmentChange={setSelectedDepartment}
                    workingShiftsCount={workingShifts.length}
                    availableIncludedDepartments={availableIncludedDepartments}
                    includedDepartments={includedDepartments}
                    onToggleIncludedDepartment={toggleIncludedDepartment}
                    rosterScopeLabel={rosterScopeLabel}
                  />
                ) : null}
    
                {wizardStep === 2 ? (
                  <RosterWizardStaffStep
                    rosterScopeLabel={rosterScopeLabel}
                    wizardSelectedStaffIds={wizardSelectedStaffIds}
                    wizardExcludedStaffs={wizardExcludedStaffs}
                    targetStaffs={targetStaffs}
                    getDepartmentName={getDepartmentName}
                    onIncludeAllWizardStaff={includeAllWizardStaff}
                    onClearWizardStaffSelection={clearWizardStaffSelection}
                    onToggleWizardStaff={toggleWizardStaff}
                  />
                ) : null}
    
                {wizardStep === 3 && (
                  <RosterWizardRuleStep {...props} />
                )}
    
                {wizardStep === 4 ? (
                  <RosterWizardExceptionsStep
                    preferredOffStaffId={preferredOffStaffId}
                    onPreferredOffStaffIdChange={setPreferredOffStaffId}
                    preferredOffDate={preferredOffDate}
                    onPreferredOffDateChange={setPreferredOffDate}
                    monthDates={monthDates}
                    onAddPreferredOffDate={addPreferredOffDate}
                    wizardSelectedStaffs={wizardSelectedStaffs}
                    wizardNightRangeDrafts={wizardNightRangeDrafts}
                    wizardDedicatedBandDrafts={wizardDedicatedBandDrafts}
                    wizardCoverageRoleDrafts={wizardCoverageRoleDrafts}
                    wizardStaffRestrictionDrafts={wizardStaffRestrictionDrafts}
                    buildDefaultStaffRestrictionDraft={buildDefaultStaffRestrictionDraft}
                    updateWizardNightRangeDraft={updateWizardNightRangeDraft}
                    updateWizardDedicatedBandDraft={updateWizardDedicatedBandDraft}
                    serializeCoverageRoleTags={serializeCoverageRoleTags}
                    updateWizardCoverageRoleDraft={updateWizardCoverageRoleDraft}
                    updateWizardStaffRestrictionDraft={updateWizardStaffRestrictionDraft}
                    weekdayPickerOrder={WEEKDAY_PICKER_ORDER}
                    weekdayLabels={WEEKDAY_LABELS}
                    wizardPairRules={wizardPairRules}
                    onAddWizardPairRule={addWizardPairRule}
                    updateWizardPairRule={updateWizardPairRule}
                    onRemoveWizardPairRule={removeWizardPairRule}
                    wizardOffOverrides={wizardOffOverrides}
                    wizardOverrideDateOptions={wizardOverrideDateOptions}
                    wizardOverrideShiftOptions={wizardOverrideShiftOptions}
                    updateWizardOffOverride={updateWizardOffOverride}
                    getDepartmentName={getDepartmentName}
                    getShiftCode={getShiftCode}
                    getShiftNameById={getShiftNameById}
                    workShifts={workShifts}
                  />
                ) : null}
              </div>
    
              <div className="border-t border-[var(--border)] px-4 py-4">
                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                  <button
                    type="button"
                    onClick={closeWizard}
                    className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm font-bold text-[var(--foreground)]"
                  >
                    닫기
                  </button>
                  <div className="flex flex-wrap justify-end gap-2">
                    {wizardStep > 1 && (
                      <button
                        type="button"
                        onClick={() => setWizardStep((prev) => (prev - 1) as any)}
                        className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm font-bold text-[var(--foreground)]"
                        data-testid="roster-wizard-back"
                      >
                        이전
                      </button>
                    )}
                    {wizardStep < 4 ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (wizardStep === 1 && (!selectedCompany || !selectedDepartment)) {
                            toast('사업체와 팀을 먼저 선택하세요.', 'warning');
                            return;
                          }
                          if (wizardStep === 2 && wizardSelectedStaffIds.length === 0) {
                            toast('직원을 한 명 이상 선택하세요.', 'warning');
                            return;
                          }
                          if (
                            !wizardUsesCustomPattern &&
                            !wizardUsesWeeklyTemplate &&
                            wizardStep === 3 &&
                            orderedWizardShiftIds.length < wizardRequiredShiftCount
                          ) {
                            toast(`${wizardPattern} 패턴에 필요한 근무유형 ${wizardRequiredShiftCount}개를 선택하세요.`, 'warning');
                            return;
                          }
                          if (wizardUsesCustomPattern && wizardStep === 3 && orderedWizardShiftIds.length === 0) {
                            toast('커스텀 패턴에 사용할 근무유형을 1개 이상 선택하세요.', 'warning');
                            return;
                          }
                          if (wizardUsesWeeklyTemplate && wizardStep === 3 && orderedWizardShiftIds.length === 0) {
                            toast('주차 템플릿에 사용할 근무유형을 1개 이상 선택하세요.', 'warning');
                            return;
                          }
                          if (
                            wizardUsesCustomPattern &&
                            wizardStep === 3 &&
                            (effectiveWizardCustomPatternSequence.length === 0 ||
                              !effectiveWizardCustomPatternSequence.some((token) => token !== OFF_SHIFT_TOKEN))
                          ) {
                            toast('커스텀 패턴 순서를 만들고, 실제 근무유형을 1개 이상 포함해 주세요.');
                            return;
                          }
                          if (
                            wizardUsesWeeklyTemplate &&
                            wizardStep === 3 &&
                            !effectiveWizardWeeklyTemplateWeeks.some(
                              (week) => Boolean(week.shiftId) && week.activeWeekdays.length > 0
                            )
                          ) {
                            toast('주차 템플릿에는 근무가 들어가는 요일을 최소 1일 이상 지정하세요.');
                            return;
                          }
                          setWizardStep((prev) => (prev + 1) as any);
                        }}
                        className="rounded-[var(--radius-lg)] bg-[var(--accent)] px-4 py-3 text-sm font-bold text-white"
                        data-testid="roster-wizard-next"
                      >
                        다음
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={applyWizard}
                        className="rounded-[var(--radius-lg)] bg-[var(--accent)] px-4 py-3 text-sm font-bold text-white"
                        data-testid="roster-wizard-apply"
                      >
                        근무표 생성
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
    );
  
}
