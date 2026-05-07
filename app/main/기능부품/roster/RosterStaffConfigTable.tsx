'use client';

type RosterStaffConfigTableProps = Record<string, any>;

export default function RosterStaffConfigTable(props: RosterStaffConfigTableProps) {
  const {
    CUSTOM_PATTERN_VALUE,
    PATTERN_OPTIONS,
    WIZARD_PATTERN_OPTIONS,
    buildInitialConfig,
    clampNightShiftCount,
    defaultShiftOrder,
    defaultShiftPool,
    formatWeekdaySummary,
    getDepartmentName,
    getPatternSequenceLabel,
    getRequiredShiftCount,
    getWeeklyTemplateWeekLabel,
    highlightedRosterTarget,
    inferDefaultNightShiftCount,
    isNightPattern,
    isWeeklyTemplatePattern,
    loadingShifts,
    monthDates,
    staffConfigs,
    targetStaffs,
    updateConfig,
    workShifts,
    workingShifts,
  } = props;
  return (
<div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-base font-bold text-[var(--foreground)]">대상 직원 세부 조정</h4>
          </div>
          {loadingShifts && <span className="text-[12px] font-semibold text-[var(--accent)]">근무형태 불러오는 중...</span>}
        </div>

        {workingShifts.length === 0 ? (
          <div className="mt-4 rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] bg-[var(--muted)] p-4 text-sm font-semibold text-[var(--toss-gray-3)]">
            등록된 근무유형이 없습니다.
          </div>
        ) : targetStaffs.length === 0 ? (
          <div className="mt-4 rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] bg-[var(--muted)] p-4 text-sm font-semibold text-[var(--toss-gray-3)]">
            선택한 팀에 직원이 없습니다.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-2">
              <thead>
                <tr className="text-left text-[11px] font-bold text-[var(--toss-gray-3)]">
                  <th className="px-3 py-2">적용</th>
                  <th className="px-3 py-2">직원</th>
                  <th className="px-3 py-2">패턴</th>
                  <th className="px-3 py-2">주 근무</th>
                  <th className="px-3 py-2">보조 근무</th>
                  <th className="px-3 py-2">야간/3차</th>
                  <th className="px-3 py-2">시작 오프셋</th>
                  <th className="px-3 py-2">월 나이트</th>
                  <th className="px-3 py-2">나이트 최소</th>
                  <th className="px-3 py-2">나이트 최대</th>
                </tr>
              </thead>
              <tbody>
                {targetStaffs.map((staff: any, index: any) => {
                  const config =
                    staffConfigs[staff.id] ||
                    buildInitialConfig(staff, index, defaultShiftOrder.length ? defaultShiftOrder : defaultShiftPool, monthDates.length);
                  const requiredShiftCount = getRequiredShiftCount(config.pattern);
                  const availablePatternOptions =
                    config.pattern === CUSTOM_PATTERN_VALUE
                      ? WIZARD_PATTERN_OPTIONS
                      : PATTERN_OPTIONS;
                  return (
                    <tr
                      key={staff.id}
                      className={`rounded-[var(--radius-xl)] ${
                        highlightedRosterTarget === `roster-config-row-${staff.id}`
                          ? 'bg-[var(--toss-blue-light)]/50 ring-2 ring-[var(--accent)]/30'
                          : 'bg-[var(--muted)]'
                      }`}
                      data-testid={`roster-config-row-${staff.id}`}
                    >
                      <td className="rounded-l-[18px] px-3 py-3">
                        <input
                          type="checkbox"
                          checked={config.enabled}
                          onChange={(e) => updateConfig(staff, index, { enabled: e.target.checked })}
                          className="h-4 w-4 accent-[var(--accent)]"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <p className="text-sm font-bold text-[var(--foreground)]">{staff.name}</p>
                        <p className="text-[11px] text-[var(--toss-gray-3)]">
                          {getDepartmentName(staff)} · {staff.position || '직원'}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <select
                          value={config.pattern}
                          onChange={(e) =>
                            updateConfig(staff, index, {
                              pattern: e.target.value,
                              nightShiftCount: isNightPattern(e.target.value)
                                ? inferDefaultNightShiftCount(e.target.value, monthDates.length)
                                : 0,
                            })
                          }
                          className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                        >
                          {availablePatternOptions.map((option: any) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        {config.pattern === CUSTOM_PATTERN_VALUE && config.customPatternSequence.length > 0 && (
                          <p className="mt-2 text-[11px] font-medium text-[var(--toss-gray-3)]">
                            순환: {config.customPatternSequence.map((token: any) => getPatternSequenceLabel(token, workShifts)).join(' → ')}
                          </p>
                        )}
                        {isWeeklyTemplatePattern(config.pattern) && config.weeklyTemplateWeeks.length > 0 && (
                          <p className="mt-2 text-[11px] font-medium text-[var(--toss-gray-3)]">
                            {config.weeklyTemplateWeeks
                              .map(
                                (week: any, weekIndex: any) =>
                                  `${getWeeklyTemplateWeekLabel(weekIndex)} ${formatWeekdaySummary(week.activeWeekdays)}`
                              )
                              .join(' / ')}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <select
                          value={config.primaryShiftId}
                          onChange={(e) => updateConfig(staff, index, { primaryShiftId: e.target.value })}
                          className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                        >
                          {workingShifts.map((shift: any) => (
                            <option key={shift.id} value={shift.id}>
                              {shift.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <select
                          value={config.secondaryShiftId}
                          onChange={(e) => updateConfig(staff, index, { secondaryShiftId: e.target.value })}
                          disabled={requiredShiftCount < 2}
                          className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none disabled:cursor-not-allowed disabled:bg-[var(--tab-bg)]"
                        >
                          {workingShifts.map((shift: any) => (
                            <option key={shift.id} value={shift.id}>
                              {shift.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <select
                          value={config.tertiaryShiftId}
                          onChange={(e) => updateConfig(staff, index, { tertiaryShiftId: e.target.value })}
                          disabled={requiredShiftCount < 3}
                          className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none disabled:cursor-not-allowed disabled:bg-[var(--tab-bg)]"
                        >
                          {workingShifts.map((shift: any) => (
                            <option key={shift.id} value={shift.id}>
                              {shift.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="number"
                          min={0}
                          value={config.startOffset}
                          onChange={(e) => updateConfig(staff, index, { startOffset: Number(e.target.value) || 0 })}
                          disabled={isWeeklyTemplatePattern(config.pattern)}
                          className="w-24 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none disabled:cursor-not-allowed disabled:bg-[var(--tab-bg)]"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="number"
                          min={0}
                          max={monthDates.length}
                          value={config.nightShiftCount}
                          disabled={!isNightPattern(config.pattern)}
                          onChange={(e) =>
                            updateConfig(staff, index, {
                              nightShiftCount: clampNightShiftCount(Number(e.target.value) || 0, monthDates.length),
                            })
                          }
                          className="w-24 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none disabled:cursor-not-allowed disabled:bg-[var(--tab-bg)]"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="number"
                          min={0}
                          max={monthDates.length}
                          value={config.minNightShiftCount}
                          onChange={(e) =>
                            updateConfig(staff, index, {
                              minNightShiftCount: clampNightShiftCount(Number(e.target.value) || 0, monthDates.length),
                            })
                          }
                          className="w-24 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                          data-testid={`staff-night-min-${staff.id}`}
                        />
                        <p className="mt-1 text-[10px] font-medium text-[var(--toss-gray-3)]">0이면 개인 최소 미적용</p>
                      </td>
                      <td className="rounded-r-[18px] px-3 py-3">
                        <input
                          type="number"
                          min={0}
                          max={monthDates.length}
                          value={config.maxNightShiftCount}
                          onChange={(e) =>
                            updateConfig(staff, index, {
                              maxNightShiftCount: clampNightShiftCount(Number(e.target.value) || 0, monthDates.length),
                            })
                          }
                          className="w-24 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                          data-testid={`staff-night-max-${staff.id}`}
                        />
                        <p className="mt-1 text-[10px] font-medium text-[var(--toss-gray-3)]">0이면 개인 최대 미적용</p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
  );
}
