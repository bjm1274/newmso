'use client';

import RosterRuleListPanel from './RosterRuleListPanel';

type RosterRuleManagerProps = Record<string, any>;

export default function RosterRuleManager(props: RosterRuleManagerProps) {
  const {
    GENERATION_STYLE_OPTIONS,
    companyGenerationRules,
    deleteGenerationRule,
    editGenerationRule,
    generationRuleDraft,
    getGenerationStyleMeta,
    migrateLegacyGenerationRules,
    resetGenerationRuleDraft,
    saveGenerationRule,
    selectedCompany,
    updateGenerationRuleDraftField,
  } = props;
  return (
(
      <div className="space-y-4" data-testid="roster-rule-manager">
        <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-xl font-bold text-[var(--foreground)]">근무규칙생성</h3>
            </div>
            <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--muted)] px-4 py-3 text-sm font-semibold text-[var(--foreground)]">
              적용 사업체 · {selectedCompany || '미선택'}
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h4 className="text-lg font-bold text-[var(--foreground)]">규칙 편집</h4>
              </div>
              <button
                type="button"
                onClick={migrateLegacyGenerationRules}
                className="rounded-[var(--radius-lg)] border border-[var(--accent)]/30 bg-[var(--toss-blue-light)] px-4 py-3 text-sm font-bold text-[var(--accent)]"
                data-testid="generation-rule-migrate-legacy"
              >
                예전 병동 규칙 보정
              </button>
              <button
                type="button"
                onClick={resetGenerationRuleDraft}
                className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm font-bold text-[var(--foreground)]"
                data-testid="generation-rule-reset"
              >
                새 규칙
              </button>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-2">
                <span className="text-xs font-bold text-[var(--toss-gray-3)]">규칙 이름</span>
                <input
                  value={generationRuleDraft.name}
                  onChange={(event) => updateGenerationRuleDraftField('name', event.target.value)}
                  placeholder="예: 병동 기본 안전규칙"
                  className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                  data-testid="generation-rule-name-input"
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-xs font-bold text-[var(--toss-gray-3)]">팀 키워드</span>
                <input
                  value={generationRuleDraft.teamKeywords.join(', ')}
                  onChange={(event) => updateGenerationRuleDraftField('teamKeywords', event.target.value)}
                  placeholder="예: 병동팀, 1병동"
                  className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                  data-testid="generation-rule-team-keywords-input"
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-xs font-bold text-[var(--toss-gray-3)]">생성 성향</span>
                <select
                  value={generationRuleDraft.generationStyle}
                  onChange={(event) =>
                    updateGenerationRuleDraftField('generationStyle', event.target.value)
                  }
                  className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                  data-testid="generation-rule-style-select"
                >
                  {GENERATION_STYLE_OPTIONS.map((option: any) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <span className="text-[11px] text-[var(--toss-gray-3)]">
                  {getGenerationStyleMeta(generationRuleDraft.generationStyle).detail}
                </span>
              </label>

              <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] px-4 py-3 md:col-span-2">
                <p className="text-sm font-bold text-[var(--foreground)]">일자별 최소 인원</p>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <label className="flex flex-col gap-2">
                    <span className="text-xs font-bold text-[var(--toss-gray-3)]">데이 최소</span>
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={generationRuleDraft.minDayStaff}
                      onChange={(event) =>
                        updateGenerationRuleDraftField('minDayStaff', event.target.value)
                      }
                      className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                      data-testid="generation-rule-min-day-staff"
                    />
                  </label>
                  <label className="flex flex-col gap-2">
                    <span className="text-xs font-bold text-[var(--toss-gray-3)]">이브닝 최소</span>
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={generationRuleDraft.minEveningStaff}
                      onChange={(event) =>
                        updateGenerationRuleDraftField('minEveningStaff', event.target.value)
                      }
                      className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                      data-testid="generation-rule-min-evening-staff"
                    />
                  </label>
                  <label className="flex flex-col gap-2">
                    <span className="text-xs font-bold text-[var(--toss-gray-3)]">나이트 최소</span>
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={generationRuleDraft.minNightStaff}
                      onChange={(event) =>
                        updateGenerationRuleDraftField('minNightStaff', event.target.value)
                      }
                      className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                      data-testid="generation-rule-min-night-staff"
                    />
                  </label>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className="flex flex-col gap-2">
                    <span className="text-xs font-bold text-[var(--toss-gray-3)]">나이트 선임 최소</span>
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={generationRuleDraft.minSeniorNightStaff}
                      onChange={(event) =>
                        updateGenerationRuleDraftField('minSeniorNightStaff', event.target.value)
                      }
                      className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                      data-testid="generation-rule-min-senior-night-staff"
                    />
                  </label>
                  <label className="flex flex-col gap-2">
                    <span className="text-xs font-bold text-[var(--toss-gray-3)]">나이트 전담 최소</span>
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={generationRuleDraft.minDedicatedNightStaff}
                      onChange={(event) =>
                        updateGenerationRuleDraftField('minDedicatedNightStaff', event.target.value)
                      }
                      className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                      data-testid="generation-rule-min-dedicated-night-staff"
                    />
                  </label>
                </div>
              </div>
            </div>

            <label className="mt-4 flex flex-col gap-2">
              <span className="text-xs font-bold text-[var(--toss-gray-3)]">규칙 설명</span>
              <textarea
                value={generationRuleDraft.description}
                onChange={(event) => updateGenerationRuleDraftField('description', event.target.value)}
                placeholder="예: 병동 3교대자는 월 6번 나이트, 나이트 뒤 최소 하루 휴무"
                rows={3}
                className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm leading-6 text-[var(--foreground)] outline-none"
              />
            </label>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="flex items-center justify-between rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-[var(--foreground)]">나이트 다음 데이 금지</p>
                </div>
                <input
                  type="checkbox"
                  checked={generationRuleDraft.avoidDayAfterNight}
                  onChange={(event) =>
                    updateGenerationRuleDraftField('avoidDayAfterNight', event.target.checked)
                  }
                  className="h-5 w-5"
                  data-testid="generation-rule-avoid-day-after-night"
                />
              </label>

              <label className="flex items-center justify-between rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-[var(--foreground)]">이브 다음날 데이 금지</p>
                </div>
                <input
                  type="checkbox"
                  checked={generationRuleDraft.avoidDayAfterEvening}
                  onChange={(event) =>
                    updateGenerationRuleDraftField('avoidDayAfterEvening', event.target.checked)
                  }
                  className="h-5 w-5"
                  data-testid="generation-rule-avoid-day-after-evening"
                />
              </label>

              <label className="flex items-center justify-between rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-[var(--foreground)]">전담자는 자기 시간대만</p>
                </div>
                <input
                  type="checkbox"
                  checked={generationRuleDraft.fixedShiftOnly}
                  onChange={(event) =>
                    updateGenerationRuleDraftField('fixedShiftOnly', event.target.checked)
                  }
                  className="h-5 w-5"
                  data-testid="generation-rule-fixed-shift-only"
                />
              </label>

              <label className="flex items-center justify-between rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-[var(--foreground)]">순환근무 밴드 균형</p>
                </div>
                <input
                  type="checkbox"
                  checked={generationRuleDraft.balanceRotationBands}
                  onChange={(event) =>
                    updateGenerationRuleDraftField('balanceRotationBands', event.target.checked)
                  }
                  className="h-5 w-5"
                  data-testid="generation-rule-balance-bands"
                />
              </label>

              <label className="flex items-center justify-between rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-[var(--foreground)]">주말 근무 균등 분산</p>
                </div>
                <input
                  type="checkbox"
                  checked={generationRuleDraft.distributeWeekendShifts}
                  onChange={(event) =>
                    updateGenerationRuleDraftField('distributeWeekendShifts', event.target.checked)
                  }
                  className="h-5 w-5"
                  data-testid="generation-rule-distribute-weekends"
                />
              </label>

              <label className="flex items-center justify-between rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-[var(--foreground)]">공휴일 근무 공정 배분</p>
                </div>
                <input
                  type="checkbox"
                  checked={generationRuleDraft.distributeHolidayShifts}
                  onChange={(event) =>
                    updateGenerationRuleDraftField('distributeHolidayShifts', event.target.checked)
                  }
                  className="h-5 w-5"
                  data-testid="generation-rule-distribute-holidays"
                />
              </label>

              <label className="flex items-center justify-between rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-[var(--foreground)]">신규간호사 분산 배치</p>
                </div>
                <input
                  type="checkbox"
                  checked={generationRuleDraft.separateNewNursesByShift}
                  onChange={(event) =>
                    updateGenerationRuleDraftField('separateNewNursesByShift', event.target.checked)
                  }
                  className="h-5 w-5"
                  data-testid="generation-rule-separate-new-nurses"
                />
              </label>

              <label className="flex items-center justify-between rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-[var(--foreground)]">신규 간호사 단독 나이트 금지</p>
                </div>
                <input
                  type="checkbox"
                  checked={generationRuleDraft.blockNewNurseSoloNight}
                  onChange={(event) =>
                    updateGenerationRuleDraftField('blockNewNurseSoloNight', event.target.checked)
                  }
                  className="h-5 w-5"
                />
              </label>

              <label className="flex items-center justify-between rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-[var(--foreground)]">신규 나이트 선임 동반</p>
                </div>
                <input
                  type="checkbox"
                  checked={generationRuleDraft.requireSeniorWithNewNurseNight}
                  onChange={(event) =>
                    updateGenerationRuleDraftField('requireSeniorWithNewNurseNight', event.target.checked)
                  }
                  className="h-5 w-5"
                />
              </label>

              <label className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] px-4 py-3">
                <span className="text-sm font-bold text-[var(--foreground)]">나이트 뒤 휴무 일수</span>
                <input
                  type="number"
                  min={0}
                  max={5}
                  value={generationRuleDraft.offDaysAfterNight}
                  onChange={(event) =>
                    updateGenerationRuleDraftField('offDaysAfterNight', event.target.value)
                  }
                  className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                  data-testid="generation-rule-off-days-after-night"
                />
              </label>

              <label className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] px-4 py-3">
                <span className="text-sm font-bold text-[var(--foreground)]">나이트 연속 블록</span>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={generationRuleDraft.nightBlockSize}
                  onChange={(event) =>
                    updateGenerationRuleDraftField('nightBlockSize', event.target.value)
                  }
                  className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                  data-testid="generation-rule-night-block-size"
                />
              </label>

              <label className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] px-4 py-3">
                <span className="text-sm font-bold text-[var(--foreground)]">최대 연속근무일</span>
                <input
                  type="number"
                  min={2}
                  max={7}
                  value={generationRuleDraft.maxConsecutiveWorkDays}
                  onChange={(event) =>
                    updateGenerationRuleDraftField('maxConsecutiveWorkDays', event.target.value)
                  }
                  className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                  data-testid="generation-rule-max-consecutive-work-days"
                />
              </label>

              <label className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] px-4 py-3">
                <span className="text-sm font-bold text-[var(--foreground)]">연속 이브 최대 횟수</span>
                <input
                  type="number"
                  min={0}
                  max={7}
                  value={generationRuleDraft.maxConsecutiveEveningShifts}
                  onChange={(event) =>
                    updateGenerationRuleDraftField('maxConsecutiveEveningShifts', event.target.value)
                  }
                  className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                  data-testid="generation-rule-max-consecutive-evening-shifts"
                />
              </label>

              <label className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] px-4 py-3">
                <span className="text-sm font-bold text-[var(--foreground)]">주말 연속근무 최대 일수</span>
                <input
                  type="number"
                  min={0}
                  max={4}
                  value={generationRuleDraft.maxConsecutiveWeekendWorkDays}
                  onChange={(event) =>
                    updateGenerationRuleDraftField('maxConsecutiveWeekendWorkDays', event.target.value)
                  }
                  className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                  data-testid="generation-rule-max-consecutive-weekend-work-days"
                />
              </label>

              <div className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] px-4 py-3 md:col-span-2">
                <span className="text-sm font-bold text-[var(--foreground)]">3교대자 월 나이트 범위</span>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="flex flex-col gap-2">
                    <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">최소</span>
                    <input
                      type="number"
                      min={0}
                      max={31}
                      value={generationRuleDraft.minRotationNightCount}
                      onChange={(event) =>
                        updateGenerationRuleDraftField('minRotationNightCount', event.target.value)
                      }
                      className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                      data-testid="generation-rule-rotation-night-min-count"
                    />
                  </label>
                  <label className="flex flex-col gap-2">
                    <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">최대</span>
                    <input
                      type="number"
                      min={0}
                      max={31}
                      value={generationRuleDraft.maxRotationNightCount}
                      onChange={(event) =>
                        updateGenerationRuleDraftField('maxRotationNightCount', event.target.value)
                      }
                      className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                      data-testid="generation-rule-rotation-night-max-count"
                    />
                  </label>
                </div>
              </div>

              <label className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] px-4 py-3 md:col-span-2">
                <span className="text-sm font-bold text-[var(--foreground)]">최소 휴무 일수</span>
                <input
                  type="number"
                  min={7}
                  max={31}
                  value={generationRuleDraft.minMonthlyOffDays}
                  onChange={(event) =>
                    updateGenerationRuleDraftField('minMonthlyOffDays', event.target.value)
                  }
                  className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                  data-testid="generation-rule-min-monthly-off-days"
                />
              </label>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={saveGenerationRule}
                className="rounded-[var(--radius-lg)] bg-[var(--accent)] px-4 py-3 text-sm font-bold text-white"
                data-testid="generation-rule-save"
              >
                규칙 저장
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <RosterRuleListPanel
              companyGenerationRules={companyGenerationRules}
              deleteGenerationRule={deleteGenerationRule}
              editGenerationRule={editGenerationRule}
            />
          </div>
        </div>
      </div>
    )
  );
}
