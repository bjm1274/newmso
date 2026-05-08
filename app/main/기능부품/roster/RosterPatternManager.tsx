// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
'use client';

type RosterPatternManagerProps = Record<string, any>;

export default function RosterPatternManager(props: RosterPatternManagerProps) {
  const {
    PATTERN_GROUP_MODE_OPTIONS,
    addPatternGroup,
    companyPatternProfiles,
    deletePatternProfile,
    editPatternProfile,
    formatShiftHours,
    getShiftBadgeClass,
    patternDraft,
    removePatternGroup,
    resetPatternDraft,
    savePatternProfile,
    selectedCompany,
    togglePatternGroupShift,
    updatePatternDraftField,
    updatePatternGroup,
    workingShifts,
  } = props;
  return (
(
      <div className="space-y-4" data-testid="roster-pattern-manager">
        <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-xl font-bold text-[var(--foreground)]">교대방식 패턴</h3>
            </div>
            <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--muted)] px-4 py-3 text-sm font-semibold text-[var(--foreground)]">
              적용 사업체 · {selectedCompany || '미선택'}
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
          <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h4 className="text-lg font-bold text-[var(--foreground)]">패턴 편집</h4>
              </div>
              <button
                type="button"
                onClick={resetPatternDraft}
                className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm font-bold text-[var(--foreground)]"
                data-testid="pattern-profile-reset"
              >
                새 패턴
              </button>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-2">
                <span className="text-xs font-bold text-[var(--toss-gray-3)]">패턴 이름</span>
                <input
                  value={patternDraft.name}
                  onChange={(event) => updatePatternDraftField('name', event.target.value)}
                  placeholder="예: 병동 3교대 기본"
                  className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                  data-testid="pattern-name-input"
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-xs font-bold text-[var(--toss-gray-3)]">팀 키워드</span>
                <input
                  value={patternDraft.teamKeywords.join(', ')}
                  onChange={(event) => updatePatternDraftField('teamKeywords', event.target.value)}
                  placeholder="예: 병동팀, 1병동, 간호병동"
                  className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                  data-testid="pattern-team-keywords-input"
                />
              </label>
            </div>

            <label className="mt-4 flex flex-col gap-2">
              <span className="text-xs font-bold text-[var(--toss-gray-3)]">패턴 설명</span>
              <textarea
                value={patternDraft.description}
                onChange={(event) => updatePatternDraftField('description', event.target.value)}
                placeholder="예: 병동 순환 3교대 + 나이트전담 1명 + 데이전담 1명"
                rows={3}
                className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm leading-6 text-[var(--foreground)] outline-none"
              />
            </label>

            <div className="mt-4 space-y-4">
              {patternDraft.staffGroups.map((group, index) => (
                <div
                  key={group.id}
                  className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)]/80 p-5"
                  data-testid={`pattern-group-card-${group.id}`}
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="grid flex-1 gap-3 md:grid-cols-2">
                      <label className="flex flex-col gap-2">
                        <span className="text-xs font-bold text-[var(--toss-gray-3)]">직원 그룹 이름</span>
                        <input
                          value={group.label}
                          onChange={(event) => updatePatternGroup(group.id, { label: event.target.value })}
                          placeholder={`그룹 ${index + 1}`}
                          className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-sm font-semibold text-[var(--foreground)] outline-none"
                          data-testid={`pattern-group-label-${group.id}`}
                        />
                      </label>
                      <label className="flex flex-col gap-2">
                        <span className="text-xs font-bold text-[var(--toss-gray-3)]">운영 방식</span>
                        <select
                          value={group.mode}
                          onChange={(event) =>
                            updatePatternGroup(group.id, {
                              mode: event.target.value as any,
                            })
                          }
                          className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-sm font-semibold text-[var(--foreground)] outline-none"
                          data-testid={`pattern-group-mode-${group.id}`}
                        >
                          {PATTERN_GROUP_MODE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <button
                      type="button"
                      onClick={() => removePatternGroup(group.id)}
                      disabled={patternDraft.staffGroups.length === 1}
                      className="rounded-[var(--radius-md)] border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      그룹 삭제
                    </button>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <label className="flex flex-col gap-2">
                      <span className="text-xs font-bold text-[var(--toss-gray-3)]">직원 구분 키워드</span>
                      <input
                        value={group.matchKeywords.join(', ')}
                        onChange={(event) =>
                          updatePatternGroup(group.id, {
                            matchKeywords: event.target.value
                              .split(',')
                              .map((item) => item.trim())
                              .filter(Boolean),
                          })
                        }
                        placeholder="예: 나이트전담, 고정나이트, 야간전담"
                        className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-sm font-semibold text-[var(--foreground)] outline-none"
                      />
                    </label>
                    <label className="flex flex-col gap-2">
                      <span className="text-xs font-bold text-[var(--toss-gray-3)]">메모</span>
                      <input
                        value={group.note || ''}
                        onChange={(event) => updatePatternGroup(group.id, { note: event.target.value })}
                        placeholder="예: 나이트 나이트 휴무 휴무 반복"
                        className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-sm font-semibold text-[var(--foreground)] outline-none"
                      />
                    </label>
                  </div>

                  <div className="mt-4">
                    <p className="text-xs font-bold text-[var(--toss-gray-3)]">연결 근무유형</p>
                    {workingShifts.length === 0 ? (
                      <div className="mt-2 rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm font-semibold text-[var(--toss-gray-3)]">
                        먼저 근무형태를 등록해 주세요.
                      </div>
                    ) : (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {workingShifts.map((shift) => {
                          const active = group.shiftIds.includes(shift.id);
                          return (
                            <button
                              key={shift.id}
                              type="button"
                              onClick={() => togglePatternGroupShift(group.id, shift.id)}
                              className={`rounded-[var(--radius-md)] border px-3 py-2 text-[11px] font-semibold transition-all ${
                                active
                                  ? `${getShiftBadgeClass(shift.name)} ring-2 ring-[var(--accent)]/20`
                                  : 'border-[var(--border)] bg-[var(--card)] text-[var(--foreground)]'
                              }`}
                              data-testid={`pattern-group-shift-${group.id}-${shift.id}`}
                            >
                              {shift.name} · {formatShiftHours(shift)}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={addPatternGroup}
                className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm font-bold text-[var(--foreground)]"
                data-testid="pattern-group-add"
              >
                그룹 추가
              </button>
              <button
                type="button"
                onClick={savePatternProfile}
                className="rounded-[var(--radius-lg)] bg-[var(--accent)] px-4 py-3 text-sm font-bold text-white"
                data-testid="pattern-profile-save"
              >
                패턴 저장
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
              <h4 className="text-lg font-bold text-[var(--foreground)]">저장된 패턴</h4>

              {companyPatternProfiles.length === 0 ? (
                <div className="mt-4 rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] bg-[var(--muted)] p-5 text-sm font-semibold text-[var(--toss-gray-3)]">
                  아직 저장된 교대방식 패턴이 없습니다.
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {companyPatternProfiles.map((profile) => (
                    <div
                      key={profile.id}
                      className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--muted)]/80 p-4"
                      data-testid={`pattern-profile-card-${profile.id}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-[var(--foreground)]">{profile.name}</p>
                          <p className="mt-1 text-xs font-semibold text-[var(--accent)]">
                            {profile.teamKeywords.join(', ')}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            onClick={() => editPatternProfile(profile)}
                            className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs font-bold text-[var(--foreground)]"
                            data-testid={`pattern-profile-edit-${profile.id}`}
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`"${profile.name}" 패턴을 삭제할까요?`)) {
                                deletePatternProfile(profile.id);
                              }
                            }}
                            className="rounded-[var(--radius-md)] border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-600"
                            data-testid={`pattern-profile-delete-${profile.id}`}
                          >
                            삭제
                          </button>
                        </div>
                      </div>

                      {profile.description ? (
                        <p className="mt-3 text-sm leading-6 text-[var(--toss-gray-4)]">{profile.description}</p>
                      ) : null}

                      <div className="mt-3 flex flex-wrap gap-2">
                        {profile.staffGroups.map((group) => {
                          const modeLabel =
                            PATTERN_GROUP_MODE_OPTIONS.find((option) => option.value === group.mode)?.label ||
                            group.mode;
                          return (
                            <span
                              key={group.id}
                              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-[11px] font-semibold text-[var(--foreground)]"
                            >
                              {group.label} · {modeLabel}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    )
  );
}
