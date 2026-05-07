'use client';

type RosterWizardRuleSummarySectionProps = Record<string, any>;

export default function RosterWizardRuleSummarySection(props: RosterWizardRuleSummarySectionProps) {
  const {
    OFF_SHIFT_TOKEN,
    addWizardRoleCoverageRule,
    applyWizardPreset,
    effectiveWizardCustomPatternSequence,
    effectiveWizardWeeklyTemplateWeeks,
    formatWeekdaySummary,
    getPatternSequenceLabel,
    getShiftBadgeClass,
    getShiftNameById,
    getWeeklyTemplateWeekLabel,
    orderedWizardShiftIds,
    removeWizardRoleCoverageRule,
    resetWizardRuleSelection,
    selectedWizardPreset,
    serializeCoverageRoleTags,
    setWizardSelectedPresetId,
    updateWizardRoleCoverageRule,
    userWizardPresets,
    wizardPattern,
    wizardRuleDraft,
    wizardSelectedPresetId,
    wizardSelectedStaffIds,
    wizardUsesCustomPattern,
    wizardUsesWeeklyTemplate,
    workShifts,
  } = props;

  return (
    <>
                    <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h5 className="text-sm font-bold text-[var(--foreground)]">역할 커버 슬롯</h5>
                        </div>
                        <button
                          type="button"
                          onClick={addWizardRoleCoverageRule}
                          className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-[11px] font-bold text-[var(--foreground)]"
                          data-testid="roster-wizard-rule-role-coverage-add"
                        >
                          역할 슬롯 추가
                        </button>
                      </div>
    
                      <div className="mt-4 space-y-3">
                        {wizardRuleDraft.roleCoverageRules.length === 0 ? (
                          <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--muted)] px-4 py-3 text-[12px] font-semibold text-[var(--toss-gray-3)]">
                            추가한 역할 슬롯이 없습니다.
                          </div>
                        ) : (
                          wizardRuleDraft.roleCoverageRules.map((roleRule: any, index: any) => (
                            <div
                              key={roleRule.id}
                              className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] p-4"
                            >
                              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                                <label className="flex flex-col gap-1 xl:col-span-2">
                                  <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">슬롯 이름</span>
                                  <input
                                    value={roleRule.label}
                                    onChange={(event) =>
                                      updateWizardRoleCoverageRule(roleRule.id, 'label', event.target.value)
                                    }
                                    className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                                    data-testid={`roster-wizard-rule-role-slot-label-${index + 1}`}
                                  />
                                </label>
                                <label className="flex flex-col gap-1 xl:col-span-3">
                                  <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">키워드</span>
                                  <input
                                    value={serializeCoverageRoleTags(roleRule.keywords)}
                                    onChange={(event) =>
                                      updateWizardRoleCoverageRule(roleRule.id, 'keywords', event.target.value)
                                    }
                                    className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                                    data-testid={`roster-wizard-rule-role-slot-keywords-${index + 1}`}
                                  />
                                </label>
                                <label className="flex flex-col gap-1">
                                  <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">데이</span>
                                  <input
                                    type="number"
                                    min={0}
                                    max={20}
                                    value={roleRule.minDayStaff}
                                    onChange={(event) =>
                                      updateWizardRoleCoverageRule(roleRule.id, 'minDayStaff', event.target.value)
                                    }
                                    className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                                    data-testid={`roster-wizard-rule-role-slot-day-${index + 1}`}
                                  />
                                </label>
                                <label className="flex flex-col gap-1">
                                  <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">이브닝</span>
                                  <input
                                    type="number"
                                    min={0}
                                    max={20}
                                    value={roleRule.minEveningStaff}
                                    onChange={(event) =>
                                      updateWizardRoleCoverageRule(roleRule.id, 'minEveningStaff', event.target.value)
                                    }
                                    className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                                  />
                                </label>
                                <label className="flex flex-col gap-1">
                                  <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">나이트</span>
                                  <input
                                    type="number"
                                    min={0}
                                    max={20}
                                    value={roleRule.minNightStaff}
                                    onChange={(event) =>
                                      updateWizardRoleCoverageRule(roleRule.id, 'minNightStaff', event.target.value)
                                    }
                                    className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                                    data-testid={`roster-wizard-rule-role-slot-night-${index + 1}`}
                                  />
                                </label>
                              </div>
                              <div className="mt-3 flex justify-end">
                                <button
                                  type="button"
                                  onClick={() => removeWizardRoleCoverageRule(roleRule.id)}
                                  className="rounded-[var(--radius-md)] border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-bold text-red-700"
                                >
                                  슬롯 삭제
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
    
                    <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--muted)] p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <p className="text-sm font-bold text-[var(--foreground)]">저장한 규칙 선택</p>
                        </div>
                        <div className="w-full lg:max-w-xl">
                          <select
                            value={wizardSelectedPresetId}
                            onChange={(event) => {
                              const nextId = event.target.value;
                              setWizardSelectedPresetId(nextId);
                              if (!nextId) {
                                resetWizardRuleSelection();
                                return;
                              }
                              const preset = userWizardPresets.find((item: any) => item.id === nextId);
                              if (preset) {
                                applyWizardPreset(preset);
                              }
                            }}
                            className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                            data-testid="roster-wizard-preset-select"
                          >
                            <option value="">규칙을 선택하세요</option>
                            {userWizardPresets.map((preset: any) => (
                              <option key={preset.id} value={preset.id}>
                                {preset.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      {userWizardPresets.length === 0 ? (
                        <div className="mt-4 rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--card)] p-4 text-sm font-semibold text-[var(--toss-gray-3)]">
                          저장된 규칙이 없습니다.
                        </div>
                      ) : wizardSelectedPresetId ? (
                        <div className="mt-4 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4">
                          <div className="flex flex-wrap gap-2">
                            <span className="rounded-[var(--radius-md)] bg-[var(--toss-blue-light)] px-3 py-1 text-[11px] font-bold text-[var(--accent)]">
                              선택된 규칙
                            </span>
                            <span
                              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-[11px] font-semibold text-[var(--foreground)]"
                              data-testid="roster-wizard-loaded-preset-name"
                            >
                              {selectedWizardPreset?.name || ''}
                            </span>
                            <span className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-[11px] font-semibold text-[var(--foreground)]">
                              타입: {wizardPattern}
                            </span>
                            {orderedWizardShiftIds.map((shiftId: any, index: any) => (
                              <span
                                key={shiftId}
                                className={`rounded-[var(--radius-md)] border px-3 py-1 text-[11px] font-semibold ${getShiftBadgeClass(getShiftNameById(shiftId, workShifts))}`}
                              >
                                {index + 1}차 · {getShiftNameById(shiftId, workShifts)}
                              </span>
                            ))}
                          </div>
    
                          {wizardUsesCustomPattern && (
                            <div className="mt-4 flex flex-wrap gap-2">
                              {effectiveWizardCustomPatternSequence.map((token: any, index: any) => {
                                const tokenLabel = getPatternSequenceLabel(token, workShifts);
                                return (
                                  <span
                                    key={`${token}-${index}`}
                                    className={`rounded-[var(--radius-md)] border px-3 py-1 text-[11px] font-semibold ${token === OFF_SHIFT_TOKEN ? 'border-[var(--border)] bg-[var(--muted)] text-[var(--foreground)]' : getShiftBadgeClass(tokenLabel)}`}
                                  >
                                    {index + 1}. {tokenLabel}
                                  </span>
                                );
                              })}
                            </div>
                          )}
    
                          {wizardUsesWeeklyTemplate && (
                            <div className="mt-4 flex flex-wrap gap-2">
                              {effectiveWizardWeeklyTemplateWeeks.map((week: any, index: any) => (
                                <span
                                  key={`${week.shiftId}-${index}`}
                                  className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] px-3 py-1 text-[11px] font-semibold text-[var(--foreground)]"
                                >
                                  {getWeeklyTemplateWeekLabel(index)} · {getShiftNameById(week.shiftId, workShifts)} · {formatWeekdaySummary(week.activeWeekdays)}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
    
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="rounded-[var(--radius-xl)] bg-[var(--muted)] p-4">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--toss-gray-3)]">생성 대상</p>
                        <p className="mt-2 text-lg font-bold text-[var(--foreground)]">{wizardSelectedStaffIds.length}명</p>
                      </div>
                      <div className="rounded-[var(--radius-xl)] bg-[var(--muted)] p-4">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--toss-gray-3)]">적용 방식</p>
                        <p className="mt-2 text-lg font-bold text-[var(--foreground)]">
                          {wizardPattern || '규칙 미선택'}
                        </p>
                      </div>
                    </div>
    </>
  );
}
