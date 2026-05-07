'use client';

import RosterPreferredOffManager from './RosterPreferredOffManager';

type RosterPlannerDashboardProps = Record<string, any>;

export default function RosterPlannerDashboard(props: RosterPlannerDashboardProps) {
  const {
    PATTERN_GROUP_MODE_OPTIONS,
    SmartMonthPicker,
    activeGenerationRuleSummaryItems,
    availableIncludedDepartments,
    canManageRosterAssignments,
    enabledTargetStaffs,
    formatShiftHours,
    generatePatternDraft,
    getShiftBadgeClass,
    includedDepartments,
    jumpToRosterWarningTarget,
    loadingShifts,
    matchingGenerationRules,
    matchingPatternProfiles,
    openWizard,
    plannerPatternPreviewGroups,
    previewRows,
    recommendedPlannerShifts,
    renderRosterScopeSummary,
    resolveConfiguredWorkDayMode,
    rosterFeasibilityIssues,
    saveAssignments,
    saveBlockingWarnings,
    saving,
    selectedDepartment,
    selectedGenerationRule,
    selectedGenerationRuleId,
    selectedMonth,
    selectedPatternProfile,
    selectedPatternProfileId,
    setSelectedDepartment,
    setSelectedGenerationRuleId,
    setSelectedMonth,
    setSelectedPatternProfileId,
    teamOptions,
    toggleIncludedDepartment,
    workingShifts,
  } = props;
  return (
<div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="shrink-0 text-xl font-bold text-[var(--foreground)]">패턴 기반 근무표 생성</h3>

            <label className="flex w-full sm:w-auto shrink-0 items-center gap-2">
              <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">팀</span>
              <select
                value={selectedDepartment}
                onChange={(event) => setSelectedDepartment(event.target.value)}
                className="w-full sm:w-auto sm:min-w-[180px] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                data-testid="roster-team-select"
              >
                {teamOptions.map((department: any) => (
                  <option key={department} value={department}>
                    {department}
                  </option>
                ))}
              </select>
            </label>

            {selectedDepartment ? (
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <span className="shrink-0 text-[11px] font-bold text-[var(--toss-gray-3)]">추가 포함 팀</span>
                {availableIncludedDepartments.length === 0 ? (
                  <span className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-[11px] font-semibold text-[var(--toss-gray-3)]">
                    선택 가능한 추가 팀 없음
                  </span>
                ) : (
                  availableIncludedDepartments.map((department: any, index: any) => {
                    const included = includedDepartments.includes(department);
                    return (
                      <button
                        key={department}
                        type="button"
                        onClick={() => toggleIncludedDepartment(department)}
                        className={`rounded-[var(--radius-md)] border px-3 py-2 text-[11px] font-bold transition-colors ${
                          included
                            ? 'border-[var(--accent)] bg-[var(--toss-blue-light)] text-[var(--accent)]'
                            : 'border-[var(--border)] bg-[var(--card)] text-[var(--foreground)]'
                        }`}
                        data-testid={`roster-include-team-${index + 1}`}
                      >
                        {included ? '포함중' : '추가'} · {department}
                      </button>
                    );
                  })
                )}
              </div>
            ) : null}

            <label className="flex w-full sm:w-auto shrink-0 items-center gap-2">
              <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">교대방식 패턴</span>
              <select
                value={selectedPatternProfileId}
                onChange={(event) => setSelectedPatternProfileId(event.target.value)}
                className="w-full sm:w-auto sm:min-w-[220px] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                data-testid="roster-pattern-profile-select"
              >
                <option value="">팀 기준 기본 규칙</option>
                {matchingPatternProfiles.map((profile: any) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex w-full sm:w-auto shrink-0 items-center gap-2">
              <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">근무규칙</span>
              <select
                value={selectedGenerationRuleId}
                onChange={(event) => setSelectedGenerationRuleId(event.target.value)}
                className="w-full sm:w-auto sm:min-w-[220px] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                data-testid="roster-generation-rule-select"
              >
                <option value="">팀 기준 기본 규칙</option>
                {matchingGenerationRules.map((rule: any) => (
                  <option key={rule.id} value={rule.id}>
                    {rule.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <span className="shrink-0 text-[11px] font-bold text-[var(--toss-gray-3)]">적용 근무유형</span>
              {loadingShifts ? (
                <span className="text-[12px] font-semibold text-[var(--accent)]">근무형태 불러오는 중...</span>
              ) : workingShifts.length === 0 ? (
                <span className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-[11px] font-semibold text-[var(--toss-gray-3)]">
                  등록된 근무형태가 없습니다.
                </span>
              ) : recommendedPlannerShifts.length === 0 ? (
                <span className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-[11px] font-semibold text-[var(--toss-gray-3)]">
                  이 팀에 맞는 추천 근무유형이 없습니다.
                </span>
              ) : (
                recommendedPlannerShifts.map((shift: any) => {
                  return (
                    <span
                      key={shift.id}
                      className={`rounded-[var(--radius-md)] border px-3 py-2 text-[11px] font-semibold ${getShiftBadgeClass(shift.name)}`}
                      data-testid={`planner-shift-chip-${shift.id}`}
                    >
                      {shift.name}
                      {' · '}
                      {formatShiftHours(shift)}
                      {' · '}
                      {resolveConfiguredWorkDayMode(shift) === 'all_days' ? '주말 포함' : '주말 제외'}
                    </span>
                  );
                })
              )}
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-3">
              <label className="flex flex-col gap-0">
                <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2">
                  <SmartMonthPicker
                    value={selectedMonth}
                    onChange={(value: any) => setSelectedMonth(value)}
                    className="w-[150px]"
                    inputClassName="text-sm font-semibold text-[var(--foreground)]"
                  />
                </div>
              </label>
              <button
                type="button"
                onClick={openWizard}
                className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm font-bold text-[var(--foreground)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                data-testid="roster-wizard-open"
              >
                근무표 생성 마법사
              </button>
                <button
                  type="button"
                  onClick={generatePatternDraft}
                  disabled={
                    loadingShifts ||
                    workingShifts.length === 0 ||
                    enabledTargetStaffs.length === 0
                  }
                  className="rounded-[var(--radius-lg)] border border-[var(--accent)] bg-[var(--toss-blue-light)] px-4 py-3 text-sm font-bold text-[var(--accent)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  data-testid="roster-auto-generate"
                >
                규칙 기반 생성
              </button>
              <button
                type="button"
                onClick={saveAssignments}
                disabled={!canManageRosterAssignments || saving || loadingShifts || previewRows.length === 0}
                className="rounded-[var(--radius-lg)] bg-[var(--accent)] px-4 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? '저장 중...' : '월간 근무표 저장'}
              </button>
            </div>
          </div>

          {renderRosterScopeSummary()}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="w-full rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--muted)]/70 px-4 py-3 text-sm font-semibold text-[var(--foreground)]">
              {selectedPatternProfile
                ? '선택한 팀 패턴 프로필을 기준으로 데이/이브/나이트 전담자와 순환 근무자를 같이 편성합니다.'
                : '저장된 팀 패턴 프로필이 없어도 직원의 shift_type과 배정 근무를 기준으로 데이/이브/나이트 전담자를 자동 감지하고, 나머지는 순환 근무로 편성합니다.'}
            </div>
            {plannerPatternPreviewGroups.length > 0 ? (
              <div
                className="w-full rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] px-4 py-3"
                data-testid="roster-pattern-group-preview"
              >
                <div className="flex flex-wrap items-center gap-2">
                  {plannerPatternPreviewGroups.map((group: any) => {
                    const modeLabel =
                      PATTERN_GROUP_MODE_OPTIONS.find((option: any) => option.value === group.mode)?.label ||
                      group.mode;
                    const toneClass =
                      group.source === 'profile'
                        ? 'border-[var(--accent)]/20 bg-[var(--toss-blue-light)]/60'
                        : group.source === 'auto'
                          ? 'border-[var(--success-light)] bg-[var(--success-light)]'
                          : 'border-[var(--border)] bg-[var(--muted)]';

                    return (
                      <span
                        key={group.key}
                        className={`rounded-[var(--radius-md)] border px-3 py-2 text-[11px] font-semibold text-[var(--foreground)] ${toneClass}`}
                      >
                        {group.label} {group.count}명 · {modeLabel}
                      </span>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {selectedPatternProfile ? (
              <div className="rounded-[var(--radius-lg)] border border-[var(--accent)]/20 bg-[var(--toss-blue-light)]/60 px-4 py-3 text-sm font-semibold text-[var(--foreground)]">
                적용 패턴 · {selectedPatternProfile.name}
                {selectedPatternProfile.description ? ` · ${selectedPatternProfile.description}` : ''}
              </div>
            ) : null}
            {selectedGenerationRule ? (
              <div className="rounded-[var(--radius-lg)] border border-[var(--success-light)] bg-[var(--success-light)] px-4 py-3 text-sm font-semibold text-[var(--foreground)]">
                적용 규칙 · {selectedGenerationRule.name}
              </div>
            ) : null}
            <div
              className="w-full rounded-[var(--radius-xl)] border border-[var(--success-light)] bg-[var(--success-light)]/80 px-4 py-4"
              data-testid="roster-active-generation-rule-summary"
            >
              <div className="flex flex-wrap items-center gap-2">
                {activeGenerationRuleSummaryItems.map((item: any, index: any) => (
                  <div
                    key={`active-rule-summary-${index}`}
                    className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[11px] font-semibold text-[var(--foreground)]"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>
            {rosterFeasibilityIssues.length > 0 ? (
              <div
                className="w-full rounded-[var(--radius-xl)] border border-amber-200 bg-amber-50/80 px-4 py-4"
                data-testid="roster-feasibility-summary"
              >
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-bold text-amber-800">생성 전 확인 필요</p>
                  {rosterFeasibilityIssues.map((issue: any) => (
                    <button
                      key={issue.id}
                      type="button"
                      onClick={() => jumpToRosterWarningTarget(issue.targetTestId)}
                      className={`rounded-[var(--radius-md)] border px-3 py-2 text-left text-[12px] font-semibold ${
                        issue.severity === 'blocking'
                          ? 'border-red-200 bg-red-50 text-red-700'
                          : 'border-amber-200 bg-[var(--card)] text-amber-800'
                      }`}
                    >
                      {issue.detail}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {saveBlockingWarnings.length > 0 ? (
              <div
                className="w-full rounded-[var(--radius-xl)] border border-red-200 bg-red-50/90 px-4 py-4"
                data-testid="roster-blocking-warning-summary"
              >
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-bold text-red-700">저장 전 차단 경고</p>
                  {saveBlockingWarnings.map((warning: any) => (
                    <button
                      key={warning.id}
                      type="button"
                      onClick={() => jumpToRosterWarningTarget(warning.targetTestId)}
                      className="rounded-[var(--radius-md)] border border-red-200 bg-[var(--card)] px-3 py-2 text-left text-[12px] font-semibold text-red-700"
                    >
                      {warning.detail}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <RosterPreferredOffManager {...props} />
          </div>
        </div>
  );
}
