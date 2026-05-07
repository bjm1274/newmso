'use client';

type RosterWizardRuleSetupSectionProps = Record<string, any>;

export default function RosterWizardRuleSetupSection(props: RosterWizardRuleSetupSectionProps) {
  const {
    STAFF_BLOCK_PREFERENCE_OPTIONS,
    WIZARD_NIGHT_BLOCK_PRESET_OPTIONS,
    addWizardDateCoverageOverride,
    applyWizardNightBlockPreset,
    monthDates,
    removeWizardDateCoverageOverride,
    setWizardGenerationBasis,
    updateWizardDateCoverageOverride,
    updateWizardRuleDraftField,
    wizardGenerationBasis,
    wizardRuleDraft,
  } = props;

  return (
    <>
                    <div>
                      <h4 className="text-base font-bold text-[var(--foreground)]">자동생성 규칙 불러오기</h4>
                    </div>
    
                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
                      <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4">
                        <div className="grid gap-3 md:grid-cols-2">
                          <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">생성 기준</span>
                            <select
                              value={wizardGenerationBasis}
                              onChange={(event) =>
                                setWizardGenerationBasis(event.target.value as any)
                              }
                              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                              data-testid="roster-wizard-generation-basis-select"
                            >
                              <option value="saved_rule">저장 규칙 우선</option>
                              <option value="rotation_only">전원 순환 근무</option>
                            </select>
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">나이트 후 휴무</span>
                            <input
                              type="number"
                              min={0}
                              max={5}
                              value={wizardRuleDraft.offDaysAfterNight}
                              onChange={(event) =>
                                updateWizardRuleDraftField('offDaysAfterNight', event.target.value)
                              }
                              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                              data-testid="roster-wizard-rule-off-days-after-night"
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">최소 데이</span>
                            <input
                              type="number"
                              min={0}
                              max={20}
                              value={wizardRuleDraft.minDayStaff}
                              onChange={(event) =>
                                updateWizardRuleDraftField('minDayStaff', event.target.value)
                              }
                              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                              data-testid="roster-wizard-rule-min-day-staff"
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">최소 이브닝</span>
                            <input
                              type="number"
                              min={0}
                              max={20}
                              value={wizardRuleDraft.minEveningStaff}
                              onChange={(event) =>
                                updateWizardRuleDraftField('minEveningStaff', event.target.value)
                              }
                              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                              data-testid="roster-wizard-rule-min-evening-staff"
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">최소 나이트</span>
                            <input
                              type="number"
                              min={0}
                              max={20}
                              value={wizardRuleDraft.minNightStaff}
                              onChange={(event) =>
                                updateWizardRuleDraftField('minNightStaff', event.target.value)
                              }
                              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                              data-testid="roster-wizard-rule-min-night-staff"
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">주말 데이</span>
                            <input
                              type="number"
                              min={0}
                              max={20}
                              value={wizardRuleDraft.weekendMinDayStaff}
                              onChange={(event) =>
                                updateWizardRuleDraftField('weekendMinDayStaff', event.target.value)
                              }
                              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                              data-testid="roster-wizard-rule-weekend-min-day-staff"
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">주말 이브닝</span>
                            <input
                              type="number"
                              min={0}
                              max={20}
                              value={wizardRuleDraft.weekendMinEveningStaff}
                              onChange={(event) =>
                                updateWizardRuleDraftField('weekendMinEveningStaff', event.target.value)
                              }
                              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                              data-testid="roster-wizard-rule-weekend-min-evening-staff"
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">주말 나이트</span>
                            <input
                              type="number"
                              min={0}
                              max={20}
                              value={wizardRuleDraft.weekendMinNightStaff}
                              onChange={(event) =>
                                updateWizardRuleDraftField('weekendMinNightStaff', event.target.value)
                              }
                              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                              data-testid="roster-wizard-rule-weekend-min-night-staff"
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">공휴일 데이</span>
                            <input
                              type="number"
                              min={0}
                              max={20}
                              value={wizardRuleDraft.holidayMinDayStaff}
                              onChange={(event) =>
                                updateWizardRuleDraftField('holidayMinDayStaff', event.target.value)
                              }
                              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                              data-testid="roster-wizard-rule-holiday-min-day-staff"
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">공휴일 이브닝</span>
                            <input
                              type="number"
                              min={0}
                              max={20}
                              value={wizardRuleDraft.holidayMinEveningStaff}
                              onChange={(event) =>
                                updateWizardRuleDraftField('holidayMinEveningStaff', event.target.value)
                              }
                              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                              data-testid="roster-wizard-rule-holiday-min-evening-staff"
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">공휴일 나이트</span>
                            <input
                              type="number"
                              min={0}
                              max={20}
                              value={wizardRuleDraft.holidayMinNightStaff}
                              onChange={(event) =>
                                updateWizardRuleDraftField('holidayMinNightStaff', event.target.value)
                              }
                              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                              data-testid="roster-wizard-rule-holiday-min-night-staff"
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">나이트 최소</span>
                            <input
                              type="number"
                              min={0}
                              max={31}
                              value={wizardRuleDraft.minRotationNightCount}
                              onChange={(event) =>
                                updateWizardRuleDraftField('minRotationNightCount', event.target.value)
                              }
                              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                              data-testid="roster-wizard-rule-rotation-night-min-count"
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">나이트 최대</span>
                            <input
                              type="number"
                              min={0}
                              max={31}
                              value={wizardRuleDraft.maxRotationNightCount}
                              onChange={(event) =>
                                updateWizardRuleDraftField('maxRotationNightCount', event.target.value)
                              }
                              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                              data-testid="roster-wizard-rule-rotation-night-max-count"
                            />
                          </label>
                          <label className="flex flex-col gap-1 md:col-span-2">
                            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">최소 월 휴무</span>
                            <input
                              type="number"
                              min={0}
                              max={31}
                              value={wizardRuleDraft.minMonthlyOffDays}
                              onChange={(event) =>
                                updateWizardRuleDraftField('minMonthlyOffDays', event.target.value)
                              }
                              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                              data-testid="roster-wizard-rule-min-monthly-off-days"
                            />
                          </label>
                        </div>
                        <div className="mt-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] p-3">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-bold text-[var(--foreground)]">특정 날짜 최소 인원</p>
                            </div>
                            <button
                              type="button"
                              onClick={addWizardDateCoverageOverride}
                              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[11px] font-bold text-[var(--foreground)]"
                              data-testid="roster-wizard-date-coverage-add"
                            >
                              날짜 추가
                            </button>
                          </div>
                          <div className="mt-3 space-y-3">
                            {(wizardRuleDraft.dateCoverageOverrides || []).length === 0 ? (
                              <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-3 text-[12px] font-semibold text-[var(--toss-gray-3)]">
                                아직 추가한 날짜별 최소 인원이 없습니다.
                              </div>
                            ) : (
                              (wizardRuleDraft.dateCoverageOverrides || []).map((entry: any, index: any) => (
                                <div
                                  key={entry.id}
                                  className="grid gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-3 md:grid-cols-[minmax(160px,1.2fr)_repeat(3,minmax(0,1fr))_auto]"
                                >
                                  <label className="flex flex-col gap-1">
                                    <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">날짜</span>
                                    <select
                                      value={entry.date}
                                      onChange={(event) =>
                                        updateWizardDateCoverageOverride(entry.id, 'date', event.target.value)
                                      }
                                      className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                                      data-testid={`roster-wizard-date-coverage-date-${index + 1}`}
                                    >
                                      {monthDates.map((date: any) => (
                                        <option key={date} value={date}>
                                          {date}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <label className="flex flex-col gap-1">
                                    <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">데이</span>
                                    <input
                                      type="number"
                                      min={0}
                                      max={20}
                                      value={entry.minDayStaff}
                                      onChange={(event) =>
                                        updateWizardDateCoverageOverride(
                                          entry.id,
                                          'minDayStaff',
                                          event.target.value
                                        )
                                      }
                                      className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                                      data-testid={`roster-wizard-date-coverage-day-${index + 1}`}
                                    />
                                  </label>
                                  <label className="hidden">
                                    <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">블록 선호</span>
                                    <select
                                      value="balanced"
                                      onChange={() => undefined}
                                      className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                                      data-testid={`roster-wizard-date-coverage-block-preference-${index + 1}`}
                                    >
                                      {STAFF_BLOCK_PREFERENCE_OPTIONS.map((option: any) => (
                                        <option key={option.value} value={option.value}>
                                          {option.label}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <label className="flex flex-col gap-1">
                                    <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">이브닝</span>
                                    <input
                                      type="number"
                                      min={0}
                                      max={20}
                                      value={entry.minEveningStaff}
                                      onChange={(event) =>
                                        updateWizardDateCoverageOverride(
                                          entry.id,
                                          'minEveningStaff',
                                          event.target.value
                                        )
                                      }
                                      className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                                      data-testid={`roster-wizard-date-coverage-evening-${index + 1}`}
                                    />
                                  </label>
                                  <label className="flex flex-col gap-1">
                                    <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">나이트</span>
                                    <input
                                      type="number"
                                      min={0}
                                      max={20}
                                      value={entry.minNightStaff}
                                      onChange={(event) =>
                                        updateWizardDateCoverageOverride(
                                          entry.id,
                                          'minNightStaff',
                                          event.target.value
                                        )
                                      }
                                      className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                                      data-testid={`roster-wizard-date-coverage-night-${index + 1}`}
                                    />
                                  </label>
                                  <div className="flex items-end">
                                    <button
                                      type="button"
                                      onClick={() => removeWizardDateCoverageOverride(entry.id)}
                                      className="rounded-[var(--radius-md)] border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-bold text-red-700"
                                      data-testid={`roster-wizard-date-coverage-remove-${index + 1}`}
                                    >
                                      삭제
                                    </button>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                        <div className="mt-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] p-3">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-bold text-[var(--foreground)]">야간 블록 기본값</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {WIZARD_NIGHT_BLOCK_PRESET_OPTIONS.map((preset: any) => {
                                const selected =
                                  wizardRuleDraft.nightBlockSize === preset.nightBlockSize &&
                                  wizardRuleDraft.offDaysAfterNight === preset.offDaysAfterNight;

                                return (
                                  <button
                                    key={preset.id}
                                    type="button"
                                    onClick={() => applyWizardNightBlockPreset(preset)}
                                    className={`rounded-[var(--radius-md)] border px-3 py-2 text-[11px] font-bold transition-colors ${selected ? 'border-[var(--accent)] bg-[var(--accent)] text-white' : 'border-[var(--border)] bg-[var(--card)] text-[var(--foreground)]'}`}
                                    data-testid={`roster-wizard-night-preset-${preset.id}`}
                                  >
                                    {preset.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--muted)] p-4">
                        <div className="space-y-3">
                          <label className="flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--card)] px-3 py-3">
                            <span className="text-sm font-bold text-[var(--foreground)]">주말 분산</span>
                            <input
                              type="checkbox"
                              checked={wizardRuleDraft.distributeWeekendShifts}
                              onChange={(event) =>
                                updateWizardRuleDraftField('distributeWeekendShifts', event.target.checked)
                              }
                              data-testid="roster-wizard-rule-distribute-weekends"
                            />
                          </label>
                          <label className="flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--card)] px-3 py-3">
                            <span className="text-sm font-bold text-[var(--foreground)]">공휴일 분산</span>
                            <input
                              type="checkbox"
                              checked={wizardRuleDraft.distributeHolidayShifts}
                              onChange={(event) =>
                                updateWizardRuleDraftField('distributeHolidayShifts', event.target.checked)
                              }
                              data-testid="roster-wizard-rule-distribute-holidays"
                            />
                          </label>
                        </div>
                      </div>
                    </div>
    </>
  );
}
