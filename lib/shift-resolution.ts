export type ShiftLookupRecord = {
  id?: string | null;
  name?: string | null;
  company_name?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  description?: string | null;
  weekly_work_days?: number | null;
  is_weekend_work?: boolean | null;
  shift_type?: string | null;
};

export type ShiftAssignmentReference = {
  shift_id?: string | null;
  shift_name?: string | null;
};

function normalizeShiftLookupText(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

const SHIFT_META_MARKER = '[SHIFT_META]';
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

type ShiftDayKey = typeof DAY_KEYS[number];
type ShiftDailySchedule = {
  enabled?: boolean | null;
  start_time?: string | null;
  end_time?: string | null;
};

function getDateInfo(dateValue: string | null | undefined) {
  const dateKey = String(dateValue || '').slice(0, 10);
  if (!dateKey) return null;

  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;

  const dayOfWeek = date.getDay();
  return {
    dayOfWeek,
    dayKey: DAY_KEYS[dayOfWeek] as ShiftDayKey,
    isWeekend: dayOfWeek === 0 || dayOfWeek === 6 };
}

function parseDailySchedules(description: string | null | undefined) {
  const rawDescription = String(description || '');
  const markerIndex = rawDescription.lastIndexOf(SHIFT_META_MARKER);
  if (markerIndex === -1) return null;

  const metaText = rawDescription.slice(markerIndex + SHIFT_META_MARKER.length).trim();
  try {
    const parsed = JSON.parse(metaText);
    return (parsed?.daily_schedules || null) as Partial<Record<ShiftDayKey, ShiftDailySchedule>> | null;
  } catch {
    return null;
  }
}

function getDailyScheduleForDate(
  shift: ShiftLookupRecord | null | undefined,
  workDate: string | null | undefined,
) {
  if (!shift) return null;
  const dateInfo = getDateInfo(workDate);
  if (!dateInfo) return null;

  const schedules = parseDailySchedules(shift.description);
  return schedules?.[dateInfo.dayKey] || null;
}

function applyDailyScheduleForDate(
  shift: ShiftLookupRecord | null,
  workDate: string | null | undefined,
) {
  if (!shift) return null;
  const dailySchedule = getDailyScheduleForDate(shift, workDate);
  if (!dailySchedule?.enabled) return shift;

  return {
    ...shift,
    start_time: dailySchedule.start_time || shift.start_time,
    end_time: dailySchedule.end_time || shift.end_time };
}

export function isShiftScheduledOnDate(
  shift: ShiftLookupRecord | null | undefined,
  workDate: string | null | undefined,
) {
  if (!shift) return false;

  const dailySchedule = getDailyScheduleForDate(shift, workDate);
  if (dailySchedule) return dailySchedule.enabled === true;

  const dateInfo = getDateInfo(workDate);
  if (!dateInfo?.isWeekend) return true;

  const weeklyWorkDays = Number(shift.weekly_work_days);
  if (shift.is_weekend_work === true) return true;
  if (Number.isFinite(weeklyWorkDays) && weeklyWorkDays >= 6) return true;

  return false;
}

export function buildShiftLookup(shifts: ShiftLookupRecord[] = []) {
  const byId = new Map<string, ShiftLookupRecord>();
  const byName = new Map<string, ShiftLookupRecord[]>();

  shifts.forEach((shift) => {
    const shiftId = String(shift?.id || '').trim();
    const shiftNameKey = normalizeShiftLookupText(shift?.name);

    if (shiftId) {
      byId.set(shiftId, shift);
    }
    if (shiftNameKey) {
      const existing = byName.get(shiftNameKey) || [];
      existing.push(shift);
      byName.set(shiftNameKey, existing);
    }
  });

  return { byId, byName };
}

export function resolveAssignedShift(
  assignment: ShiftAssignmentReference | null | undefined,
  lookup: ReturnType<typeof buildShiftLookup>,
  options?: {
    preferredCompany?: string | null;
    fallbackShiftId?: string | null;
    fallbackShiftIds?: string[];
    workDate?: string | null;
    checkInIso?: string | null;
  },
) {
  const resolveFallbackShift = () => {
    const fallbackShiftIds = Array.isArray(options?.fallbackShiftIds) && options!.fallbackShiftIds.length > 0
      ? options!.fallbackShiftIds.filter(Boolean)
      : [String(options?.fallbackShiftId || '').trim()].filter(Boolean);

    if (fallbackShiftIds.length === 0) return null;

    const candidates = fallbackShiftIds
      .map((id) => lookup.byId.get(id) || null)
      .filter((shift) => isShiftScheduledOnDate(shift, options?.workDate))
      .map((shift) => applyDailyScheduleForDate(shift, options?.workDate))
      .filter((shift) => shift !== null);

    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    if (options?.checkInIso) {
      const checkInDate = new Date(options.checkInIso);
      const checkInMin = checkInDate.getHours() * 60 + checkInDate.getMinutes();

      let bestCandidate = candidates[0];
      let minDiff = Infinity;

      for (const candidate of candidates) {
        if (!candidate?.start_time) continue;
        const match = String(candidate.start_time).match(/^(\d{1,2}):(\d{2})/);
        if (match) {
          const startMin = Number(match[1]) * 60 + Number(match[2]);
          const diff = Math.abs(startMin - checkInMin);
          if (diff < minDiff) {
            minDiff = diff;
            bestCandidate = candidate;
          }
        }
      }
      return bestCandidate;
    }

    return candidates[0];
  };

  const shiftId = String(assignment?.shift_id || '').trim();
  if (shiftId) {
    const assignedShift = lookup.byId.get(shiftId) || null;
    const preferredCompanyKey = normalizeShiftLookupText(options?.preferredCompany);
    if (
      assignedShift &&
      preferredCompanyKey &&
      normalizeShiftLookupText(assignedShift.company_name) !== preferredCompanyKey
    ) {
      return resolveFallbackShift();
    }

    return applyDailyScheduleForDate(assignedShift, options?.workDate);
  }

  const shiftNameKey = normalizeShiftLookupText(assignment?.shift_name);
  if (shiftNameKey) {
    const candidates = lookup.byName.get(shiftNameKey) || [];
    if (candidates.length > 0) {
      const preferredCompanyKey = normalizeShiftLookupText(options?.preferredCompany);
      if (preferredCompanyKey) {
        const preferredCandidate =
          candidates.find(
            (candidate) =>
              normalizeShiftLookupText(candidate?.company_name) === preferredCompanyKey,
          ) || null;
        if (preferredCandidate) {
          return applyDailyScheduleForDate(preferredCandidate, options?.workDate);
        }
      }
      return applyDailyScheduleForDate(candidates[0] || null, options?.workDate);
    }
  }

  return resolveFallbackShift();
}
