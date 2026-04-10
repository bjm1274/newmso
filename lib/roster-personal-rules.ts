export type RosterBand = 'day' | 'evening' | 'night';

export type StaffAllowedBandMode = 'all' | 'no_night' | 'day_evening' | 'day_only';

export type StaffPersonalRules = {
  allowedBandMode: StaffAllowedBandMode;
  avoidWeekendWork: boolean;
  avoidDayAfterEvening: boolean;
  maxConsecutiveNightShifts: number;
};

export type StaffPersonalRuleConfig = {
  allowedBandMode?: StaffAllowedBandMode | null;
  avoidWeekendWork?: boolean | null;
  avoidDayAfterEveningPersonal?: boolean | null;
  maxConsecutiveNightShifts?: number | null;
};

const DEFAULT_ALLOWED_BAND_MODES: StaffAllowedBandMode[] = [
  'all',
  'no_night',
  'day_evening',
  'day_only',
];

export function buildDefaultStaffPersonalRules(): Required<
  Pick<
    StaffPersonalRuleConfig,
    | 'allowedBandMode'
    | 'avoidWeekendWork'
    | 'avoidDayAfterEveningPersonal'
    | 'maxConsecutiveNightShifts'
  >
> {
  return {
    allowedBandMode: 'all',
    avoidWeekendWork: false,
    avoidDayAfterEveningPersonal: false,
    maxConsecutiveNightShifts: 0,
  };
}

export function buildStaffPersonalRulesFromConfig(
  config?: StaffPersonalRuleConfig | null,
  allowedModes: StaffAllowedBandMode[] = DEFAULT_ALLOWED_BAND_MODES
): StaffPersonalRules {
  return {
    allowedBandMode:
      config?.allowedBandMode && allowedModes.includes(config.allowedBandMode)
        ? config.allowedBandMode
        : 'all',
    avoidWeekendWork: config?.avoidWeekendWork === true,
    avoidDayAfterEvening: config?.avoidDayAfterEveningPersonal === true,
    maxConsecutiveNightShifts: Math.max(
      0,
      Math.min(5, Math.floor(Number(config?.maxConsecutiveNightShifts) || 0))
    ),
  };
}

export function getAllowedBandsForStaffMode(mode: StaffAllowedBandMode) {
  switch (mode) {
    case 'day_only':
      return new Set<RosterBand>(['day']);
    case 'day_evening':
      return new Set<RosterBand>(['day', 'evening']);
    case 'no_night':
      return new Set<RosterBand>(['day', 'evening']);
    default:
      return new Set<RosterBand>(['day', 'evening', 'night']);
  }
}

export function filterShiftIdsByStaffPersonalRules<TShift>(
  shiftIds: string[],
  shiftMap: Map<string, TShift>,
  personalRules: StaffPersonalRules,
  resolveShiftBand: (shift: TShift) => RosterBand
) {
  const allowedBands = getAllowedBandsForStaffMode(personalRules.allowedBandMode);

  return shiftIds.filter((shiftId) => {
    const shift = shiftMap.get(shiftId);
    if (!shift) return false;
    return allowedBands.has(resolveShiftBand(shift));
  });
}

function countBandStreakAtIndex<TShift>(
  assignments: string[],
  index: number,
  shiftMap: Map<string, TShift>,
  band: RosterBand,
  getAssignedShiftBand: (token: string, shiftMap: Map<string, TShift>) => RosterBand | null
) {
  if (index < 0 || index >= assignments.length) return 0;
  if (getAssignedShiftBand(assignments[index] || '', shiftMap) !== band) return 0;

  let streak = 1;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (getAssignedShiftBand(assignments[cursor] || '', shiftMap) !== band) break;
    streak += 1;
  }
  for (let cursor = index + 1; cursor < assignments.length; cursor += 1) {
    if (getAssignedShiftBand(assignments[cursor] || '', shiftMap) !== band) break;
    streak += 1;
  }
  return streak;
}

export function findStaffSpecificAssignmentViolation<TShift>({
  assignments,
  dateIndex,
  nextShiftId,
  monthDates,
  shiftMap,
  personalRules,
  offShiftToken,
  resolveShiftBand,
  getAssignedShiftBand,
}: {
  assignments: string[];
  dateIndex: number;
  nextShiftId: string;
  monthDates: string[];
  shiftMap: Map<string, TShift>;
  personalRules: StaffPersonalRules;
  offShiftToken: string;
  resolveShiftBand: (shift: TShift) => RosterBand;
  getAssignedShiftBand: (token: string, shiftMap: Map<string, TShift>) => RosterBand | null;
}) {
  if (!nextShiftId || nextShiftId === offShiftToken) return null;
  const shift = shiftMap.get(nextShiftId);
  if (!shift) return null;

  const allowedBands = getAllowedBandsForStaffMode(personalRules.allowedBandMode);
  const nextBand = resolveShiftBand(shift);
  const dateKey = monthDates[dateIndex] || '';
  const dayOfWeek = dateKey ? new Date(`${dateKey}T00:00:00`).getDay() : -1;
  const previousBand =
    dateIndex > 0 ? getAssignedShiftBand(assignments[dateIndex - 1] || '', shiftMap) : null;
  const tentativeAssignments = [...assignments];
  tentativeAssignments[dateIndex] = nextShiftId;

  if (!allowedBands.has(nextBand)) {
    if (personalRules.allowedBandMode === 'day_only') {
      return '이 직원은 Day 전용으로 설정되어 있습니다.';
    }
    if (personalRules.allowedBandMode === 'day_evening') {
      return '이 직원은 Day/Evening까지만 배치하도록 설정되어 있습니다.';
    }
    if (personalRules.allowedBandMode === 'no_night') {
      return '이 직원은 Night 제외로 설정되어 있습니다.';
    }
  }

  if (personalRules.avoidWeekendWork && (dayOfWeek === 0 || dayOfWeek === 6)) {
    return '이 직원은 주말 근무 제외로 설정되어 있습니다.';
  }

  if (personalRules.avoidDayAfterEvening && previousBand === 'evening' && nextBand === 'day') {
    return '이 직원은 E 다음 Day 배치를 금지하도록 설정되어 있습니다.';
  }

  if (
    personalRules.maxConsecutiveNightShifts > 0 &&
    nextBand === 'night' &&
    countBandStreakAtIndex(
      tentativeAssignments,
      dateIndex,
      shiftMap,
      'night',
      getAssignedShiftBand
    ) > personalRules.maxConsecutiveNightShifts
  ) {
    return `이 직원의 연속 NIGHT 최대값 ${personalRules.maxConsecutiveNightShifts}일을 초과합니다.`;
  }

  return null;
}
