'use client';

type RosterWizardRuleSafetySectionProps = Record<string, any>;

export default function RosterWizardRuleSafetySection(props: RosterWizardRuleSafetySectionProps) {
  const {
    updateWizardRuleDraftField,
    wizardRuleDraft,
    wizardRuleSummaryItems,
  } = props;

  return (
    <>
                      <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4">
                        <div>
                          <h5 className="text-sm font-bold text-[var(--foreground)]">병동 안전 규칙</h5>
                        </div>
                        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                          <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">나이트 묶음 일수</span>
                            <input
                              type="number"
                              min={1}
                              max={5}
                              value={wizardRuleDraft.nightBlockSize}
                              onChange={(event) =>
                                updateWizardRuleDraftField('nightBlockSize', event.target.value)
                              }
                              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                              data-testid="roster-wizard-rule-night-block-size"
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">최대 연속 근무</span>
                            <input
                              type="number"
                              min={2}
                              max={7}
                              value={wizardRuleDraft.maxConsecutiveWorkDays}
                              onChange={(event) =>
                                updateWizardRuleDraftField('maxConsecutiveWorkDays', event.target.value)
                              }
                              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                              data-testid="roster-wizard-rule-max-consecutive-work-days"
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">최대 연속 주말 근무</span>
                            <input
                              type="number"
                              min={0}
                              max={4}
                              value={wizardRuleDraft.maxConsecutiveWeekendWorkDays}
                              onChange={(event) =>
                                updateWizardRuleDraftField(
                                  'maxConsecutiveWeekendWorkDays',
                                  event.target.value
                                )
                              }
                              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                              data-testid="roster-wizard-rule-max-consecutive-weekend-work-days"
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">최대 연속 이브닝</span>
                            <input
                              type="number"
                              min={0}
                              max={7}
                              value={wizardRuleDraft.maxConsecutiveEveningShifts}
                              onChange={(event) =>
                                updateWizardRuleDraftField(
                                  'maxConsecutiveEveningShifts',
                                  event.target.value
                                )
                              }
                              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                              data-testid="roster-wizard-rule-max-consecutive-evening-shifts"
                            />
                          </label>
                        </div>
                        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                          <label className="flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-3">
                            <span className="text-sm font-bold text-[var(--foreground)]">나이트 다음 데이 금지</span>
                            <input
                              type="checkbox"
                              checked={wizardRuleDraft.avoidDayAfterNight}
                              onChange={(event) =>
                                updateWizardRuleDraftField('avoidDayAfterNight', event.target.checked)
                              }
                              data-testid="roster-wizard-rule-avoid-day-after-night"
                            />
                          </label>
                          <label className="flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-3">
                            <span className="text-sm font-bold text-[var(--foreground)]">이브닝 다음 데이 금지</span>
                            <input
                              type="checkbox"
                              checked={wizardRuleDraft.avoidDayAfterEvening}
                              onChange={(event) =>
                                updateWizardRuleDraftField('avoidDayAfterEvening', event.target.checked)
                              }
                              data-testid="roster-wizard-rule-avoid-day-after-evening"
                            />
                          </label>
                          <label className="flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-3">
                            <span className="text-sm font-bold text-[var(--foreground)]">전담 근무 유지</span>
                            <input
                              type="checkbox"
                              checked={wizardRuleDraft.fixedShiftOnly}
                              onChange={(event) =>
                                updateWizardRuleDraftField('fixedShiftOnly', event.target.checked)
                              }
                              data-testid="roster-wizard-rule-fixed-shift-only"
                            />
                          </label>
                          <label className="flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-3">
                            <span className="text-sm font-bold text-[var(--foreground)]">교대 균형</span>
                            <input
                              type="checkbox"
                              checked={wizardRuleDraft.balanceRotationBands}
                              onChange={(event) =>
                                updateWizardRuleDraftField('balanceRotationBands', event.target.checked)
                              }
                              data-testid="roster-wizard-rule-balance-rotation-bands"
                            />
                          </label>
                          <label className="flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-3">
                            <span className="text-sm font-bold text-[var(--foreground)]">신규 간호사 분산</span>
                            <input
                              type="checkbox"
                              checked={wizardRuleDraft.separateNewNursesByShift}
                              onChange={(event) =>
                                updateWizardRuleDraftField(
                                  'separateNewNursesByShift',
                                  event.target.checked
                                )
                              }
                              data-testid="roster-wizard-rule-separate-new-nurses"
                            />
                          </label>
                          <label className="flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-3">
                            <span className="text-sm font-bold text-[var(--foreground)]">신규 단독 나이트 금지</span>
                            <input
                              type="checkbox"
                              checked={wizardRuleDraft.blockNewNurseSoloNight}
                              onChange={(event) =>
                                updateWizardRuleDraftField(
                                  'blockNewNurseSoloNight',
                                  event.target.checked
                                )
                              }
                              data-testid="roster-wizard-rule-block-new-nurse-solo-night"
                            />
                          </label>
                          <label className="flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-3 md:col-span-2 xl:col-span-3">
                            <span className="text-sm font-bold text-[var(--foreground)]">신규 나이트 선임 동반</span>
                            <input
                              type="checkbox"
                              checked={wizardRuleDraft.requireSeniorWithNewNurseNight}
                              onChange={(event) =>
                                updateWizardRuleDraftField(
                                  'requireSeniorWithNewNurseNight',
                                  event.target.checked
                                )
                              }
                              data-testid="roster-wizard-rule-require-senior-with-new-nurse-night"
                            />
                          </label>
                        </div>
                      </div>

                      <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4">
                        <div>
                          <h5 className="text-sm font-bold text-[var(--foreground)]">선임·전담 최소 배치</h5>
                        </div>
                        <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                          <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">선임 데이</span>
                            <input
                              type="number"
                              min={0}
                              max={20}
                              value={wizardRuleDraft.minSeniorDayStaff}
                              onChange={(event) =>
                                updateWizardRuleDraftField('minSeniorDayStaff', event.target.value)
                              }
                              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                              data-testid="roster-wizard-rule-min-senior-day-staff"
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">선임 이브닝</span>
                            <input
                              type="number"
                              min={0}
                              max={20}
                              value={wizardRuleDraft.minSeniorEveningStaff}
                              onChange={(event) =>
                                updateWizardRuleDraftField('minSeniorEveningStaff', event.target.value)
                              }
                              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                              data-testid="roster-wizard-rule-min-senior-evening-staff"
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">선임 나이트</span>
                            <input
                              type="number"
                              min={0}
                              max={20}
                              value={wizardRuleDraft.minSeniorNightStaff}
                              onChange={(event) =>
                                updateWizardRuleDraftField('minSeniorNightStaff', event.target.value)
                              }
                              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                              data-testid="roster-wizard-rule-min-senior-night-staff"
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">전담 데이</span>
                            <input
                              type="number"
                              min={0}
                              max={20}
                              value={wizardRuleDraft.minDedicatedDayStaff}
                              onChange={(event) =>
                                updateWizardRuleDraftField('minDedicatedDayStaff', event.target.value)
                              }
                              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                              data-testid="roster-wizard-rule-min-dedicated-day-staff"
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">전담 이브닝</span>
                            <input
                              type="number"
                              min={0}
                              max={20}
                              value={wizardRuleDraft.minDedicatedEveningStaff}
                              onChange={(event) =>
                                updateWizardRuleDraftField('minDedicatedEveningStaff', event.target.value)
                              }
                              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                              data-testid="roster-wizard-rule-min-dedicated-evening-staff"
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">전담 나이트</span>
                            <input
                              type="number"
                              min={0}
                              max={20}
                              value={wizardRuleDraft.minDedicatedNightStaff}
                              onChange={(event) =>
                                updateWizardRuleDraftField('minDedicatedNightStaff', event.target.value)
                              }
                              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                              data-testid="roster-wizard-rule-min-dedicated-night-staff"
                            />
                          </label>
                        </div>
                      </div>

                      <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--muted)] p-4">
                        <div>
                          <h5 className="text-sm font-bold text-[var(--foreground)]">선택 규칙 요약</h5>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2" data-testid="roster-wizard-rule-summary">
                          {wizardRuleSummaryItems.map((item: any, index: any) => (
                            <span
                              key={`${item}-${index}`}
                              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[11px] font-semibold text-[var(--foreground)]"
                            >
                              {item}
                            </span>
                          ))}
                        </div>
                      </div>
    </>
  );
}
