'use client';

import { EditableGrid, type EditableGridField } from '@/app/components/EditableGrid';

type RosterStaffConfigTableProps = Record<string, unknown>;

/**
 * 직원별 자동 편성 설정 행 모델 (런타임 형상; props가 any[]로 들어와 unknown 가드로 감싼다)
 */
type StaffConfig = {
  enabled: boolean;
  pattern: string;
  primaryShiftId: string;
  secondaryShiftId: string;
  tertiaryShiftId: string;
  startOffset: number;
  nightShiftCount: number;
  minNightShiftCount: number;
  maxNightShiftCount: number;
  customPatternSequence: unknown[];
  weeklyTemplateWeeks: Array<{ activeWeekdays: unknown }>;
};

type StaffRow = {
  id: string | number;
  name: string;
  position?: string;
};

type Shift = {
  id: string;
  name: string;
};

type PatternOption = {
  value: string;
  label: string;
};

/* ───── 안전 캐스팅 헬퍼 ───── */
const asNumber = (value: string, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

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
  } = props as {
    CUSTOM_PATTERN_VALUE: string;
    PATTERN_OPTIONS: PatternOption[];
    WIZARD_PATTERN_OPTIONS: PatternOption[];
    buildInitialConfig: (
      staff: StaffRow,
      index: number,
      shifts: Shift[],
      monthLength: number
    ) => StaffConfig;
    clampNightShiftCount: (value: number, monthLength: number) => number;
    defaultShiftOrder: Shift[];
    defaultShiftPool: Shift[];
    formatWeekdaySummary: (activeWeekdays: unknown) => string;
    getDepartmentName: (staff: StaffRow) => string;
    getPatternSequenceLabel: (token: unknown, workShifts: Shift[]) => string;
    getRequiredShiftCount: (pattern: string) => number;
    getWeeklyTemplateWeekLabel: (weekIndex: number) => string;
    highlightedRosterTarget: string | null;
    inferDefaultNightShiftCount: (pattern: string, monthLength: number) => number;
    isNightPattern: (pattern: string) => boolean;
    isWeeklyTemplatePattern: (pattern: string) => boolean;
    loadingShifts: boolean;
    monthDates: unknown[];
    staffConfigs: Record<string, StaffConfig>;
    targetStaffs: StaffRow[];
    updateConfig: (staff: StaffRow, index: number, patch: Partial<StaffConfig>) => void;
    workShifts: Shift[];
    workingShifts: Shift[];
  };

  type RowCtx = {
    staff: StaffRow;
    index: number;
    config: StaffConfig;
    requiredShiftCount: number;
    availablePatternOptions: PatternOption[];
  };

  const rows: RowCtx[] = targetStaffs.map((staff, index) => {
    const config: StaffConfig =
      staffConfigs[String(staff.id)] ||
      buildInitialConfig(
        staff,
        index,
        defaultShiftOrder.length ? defaultShiftOrder : defaultShiftPool,
        monthDates.length
      );
    const requiredShiftCount = getRequiredShiftCount(config.pattern);
    const availablePatternOptions =
      config.pattern === CUSTOM_PATTERN_VALUE ? WIZARD_PATTERN_OPTIONS : PATTERN_OPTIONS;
    return { staff, index, config, requiredShiftCount, availablePatternOptions };
  });

  const fields: EditableGridField<RowCtx>[] = [
    {
      id: 'enabled',
      label: '적용',
      align: 'center',
      width: '64px',
      render: ({ staff, index, config }) => {
        const checkboxId = `roster-staff-enabled-${staff.id}`;
        return (
          <label htmlFor={checkboxId} className="inline-flex cursor-pointer">
            <input
              id={checkboxId}
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => updateConfig(staff, index, { enabled: e.target.checked })}
              className="h-4 w-4 accent-[var(--accent)]"
              aria-label={`${staff.name} 자동 편성 적용`}
            />
          </label>
        );
      },
    },
    {
      id: 'staff',
      label: '직원',
      width: '160px',
      showOnMobile: false,
      render: ({ staff }) => (
        <div>
          <p className="text-sm font-bold text-[var(--foreground)]">{staff.name}</p>
          <p className="text-[11px] text-[var(--toss-gray-3)]">
            {getDepartmentName(staff)} · {staff.position || '직원'}
          </p>
        </div>
      ),
    },
    {
      id: 'pattern',
      label: '패턴',
      width: '200px',
      render: ({ staff, index, config }) => {
        const selectId = `roster-staff-pattern-${staff.id}`;
        const availablePatternOptions =
          config.pattern === CUSTOM_PATTERN_VALUE ? WIZARD_PATTERN_OPTIONS : PATTERN_OPTIONS;
        return (
          <div className="flex flex-col gap-1">
            <select
              id={selectId}
              value={config.pattern}
              onChange={(e) =>
                updateConfig(staff, index, {
                  pattern: e.target.value,
                  nightShiftCount: isNightPattern(e.target.value)
                    ? inferDefaultNightShiftCount(e.target.value, monthDates.length)
                    : 0,
                })
              }
              aria-label={`${staff.name} 패턴`}
              className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
            >
              {availablePatternOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {config.pattern === CUSTOM_PATTERN_VALUE && config.customPatternSequence.length > 0 && (
              <p className="text-[11px] font-medium text-[var(--toss-gray-3)]">
                순환:{' '}
                {config.customPatternSequence
                  .map((token) => getPatternSequenceLabel(token, workShifts))
                  .join(' → ')}
              </p>
            )}
            {isWeeklyTemplatePattern(config.pattern) && config.weeklyTemplateWeeks.length > 0 && (
              <p className="text-[11px] font-medium text-[var(--toss-gray-3)]">
                {config.weeklyTemplateWeeks
                  .map(
                    (week, weekIndex) =>
                      `${getWeeklyTemplateWeekLabel(weekIndex)} ${formatWeekdaySummary(week.activeWeekdays)}`
                  )
                  .join(' / ')}
              </p>
            )}
          </div>
        );
      },
    },
    {
      id: 'primary',
      label: '주 근무',
      width: '140px',
      render: ({ staff, index, config }) => {
        const selectId = `roster-staff-primary-${staff.id}`;
        return (
          <select
            id={selectId}
            value={config.primaryShiftId}
            onChange={(e) => updateConfig(staff, index, { primaryShiftId: e.target.value })}
            aria-label={`${staff.name} 주 근무`}
            className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
          >
            {workingShifts.map((shift) => (
              <option key={shift.id} value={shift.id}>
                {shift.name}
              </option>
            ))}
          </select>
        );
      },
    },
    {
      id: 'secondary',
      label: '보조 근무',
      width: '140px',
      render: ({ staff, index, config, requiredShiftCount }) => {
        const selectId = `roster-staff-secondary-${staff.id}`;
        return (
          <select
            id={selectId}
            value={config.secondaryShiftId}
            onChange={(e) => updateConfig(staff, index, { secondaryShiftId: e.target.value })}
            disabled={requiredShiftCount < 2}
            aria-label={`${staff.name} 보조 근무`}
            className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none disabled:cursor-not-allowed disabled:bg-[var(--tab-bg)]"
          >
            {workingShifts.map((shift) => (
              <option key={shift.id} value={shift.id}>
                {shift.name}
              </option>
            ))}
          </select>
        );
      },
    },
    {
      id: 'tertiary',
      label: '야간/3차',
      width: '140px',
      render: ({ staff, index, config, requiredShiftCount }) => {
        const selectId = `roster-staff-tertiary-${staff.id}`;
        return (
          <select
            id={selectId}
            value={config.tertiaryShiftId}
            onChange={(e) => updateConfig(staff, index, { tertiaryShiftId: e.target.value })}
            disabled={requiredShiftCount < 3}
            aria-label={`${staff.name} 야간/3차 근무`}
            className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none disabled:cursor-not-allowed disabled:bg-[var(--tab-bg)]"
          >
            {workingShifts.map((shift) => (
              <option key={shift.id} value={shift.id}>
                {shift.name}
              </option>
            ))}
          </select>
        );
      },
    },
    {
      id: 'startOffset',
      label: '시작 오프셋',
      width: '110px',
      render: ({ staff, index, config }) => {
        const inputId = `roster-staff-offset-${staff.id}`;
        return (
          <input
            id={inputId}
            type="number"
            inputMode="numeric"
            min={0}
            value={config.startOffset}
            onChange={(e) => updateConfig(staff, index, { startOffset: asNumber(e.target.value, 0) })}
            disabled={isWeeklyTemplatePattern(config.pattern)}
            aria-label={`${staff.name} 시작 오프셋`}
            className="w-full md:w-24 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none disabled:cursor-not-allowed disabled:bg-[var(--tab-bg)]"
          />
        );
      },
    },
    {
      id: 'nightCount',
      label: '월 나이트',
      width: '110px',
      render: ({ staff, index, config }) => {
        const inputId = `roster-staff-night-${staff.id}`;
        return (
          <input
            id={inputId}
            type="number"
            inputMode="numeric"
            min={0}
            max={monthDates.length}
            value={config.nightShiftCount}
            disabled={!isNightPattern(config.pattern)}
            onChange={(e) =>
              updateConfig(staff, index, {
                nightShiftCount: clampNightShiftCount(asNumber(e.target.value, 0), monthDates.length),
              })
            }
            aria-label={`${staff.name} 월 나이트 횟수`}
            className="w-full md:w-24 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none disabled:cursor-not-allowed disabled:bg-[var(--tab-bg)]"
          />
        );
      },
    },
    {
      id: 'nightMin',
      label: '나이트 최소',
      width: '110px',
      render: ({ staff, index, config }) => {
        const inputId = `roster-staff-night-min-${staff.id}`;
        return (
          <div className="flex flex-col gap-1">
            <input
              id={inputId}
              type="number"
              inputMode="numeric"
              min={0}
              max={monthDates.length}
              value={config.minNightShiftCount}
              onChange={(e) =>
                updateConfig(staff, index, {
                  minNightShiftCount: clampNightShiftCount(
                    asNumber(e.target.value, 0),
                    monthDates.length
                  ),
                })
              }
              aria-label={`${staff.name} 나이트 최소`}
              className="w-full md:w-24 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
              data-testid={`staff-night-min-${staff.id}`}
            />
            <p className="text-[10px] font-medium text-[var(--toss-gray-3)]">0이면 개인 최소 미적용</p>
          </div>
        );
      },
    },
    {
      id: 'nightMax',
      label: '나이트 최대',
      width: '110px',
      render: ({ staff, index, config }) => {
        const inputId = `roster-staff-night-max-${staff.id}`;
        return (
          <div className="flex flex-col gap-1">
            <input
              id={inputId}
              type="number"
              inputMode="numeric"
              min={0}
              max={monthDates.length}
              value={config.maxNightShiftCount}
              onChange={(e) =>
                updateConfig(staff, index, {
                  maxNightShiftCount: clampNightShiftCount(
                    asNumber(e.target.value, 0),
                    monthDates.length
                  ),
                })
              }
              aria-label={`${staff.name} 나이트 최대`}
              className="w-full md:w-24 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
              data-testid={`staff-night-max-${staff.id}`}
            />
            <p className="text-[10px] font-medium text-[var(--toss-gray-3)]">0이면 개인 최대 미적용</p>
          </div>
        );
      },
    },
  ];

  return (
    <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4 className="text-base font-bold text-[var(--foreground)]">대상 직원 세부 조정</h4>
        </div>
        {loadingShifts && (
          <span className="text-[12px] font-semibold text-[var(--accent)]">
            근무형태 불러오는 중...
          </span>
        )}
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
        <div className="mt-4">
          <EditableGrid<RowCtx>
            rows={rows}
            fields={fields}
            rowKey={({ staff }) => String(staff.id)}
            rowTone={({ staff }) =>
              highlightedRosterTarget === `roster-config-row-${staff.id}` ? 'changed' : 'normal'
            }
            mobileTitle={({ staff }) => (
              <div>
                <p className="text-sm font-bold text-[var(--foreground)]">{staff.name}</p>
                <p className="text-[11px] font-medium text-[var(--toss-gray-3)]">
                  {getDepartmentName(staff)} · {staff.position || '직원'}
                </p>
              </div>
            )}
            emptyMessage="선택한 팀에 직원이 없습니다."
          />
        </div>
      )}
    </div>
  );
}
