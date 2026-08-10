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

/**
 * 시프트를 D/E/N/OFF 밴드로 분류할 때 볼 텍스트.
 *
 * **description 은 쓰지 않는다.** 자유 서술 필드라 밴드와 무관한 단어가 섞인다:
 *   - `[SHIFT_META]{"monthly_night_days":6,...}` → 'night' 이 항상 걸린다
 *   - `휴게시간 총2h 오후12:30~14:00` → '오후' 가 걸려 주간 근무가 이브닝이 된다
 *
 * 실제로 운영 활성 시프트 40개 중 35개가 이 이유로 N 으로 판정됐고,
 * 근무표를 편성하면 모든 칸이 N 으로 찍혔다. 밴드는 이름·근무유형·시각만으로
 * 판정한다(`병동3교대/D`, `데이전담/D` 처럼 이름이 밴드를 담고 있다).
 */
export function buildShiftBandText(shift: {
  name?: string | null;
  shift_type?: string | null;
}): string {
  return [shift.name, shift.shift_type]
    .map((value) => String(value ?? '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ');
}

/**
 * 이 시프트에 실제 근무 시각이 있는가.
 *
 * 휴무 코드는 `00:00:00~00:00:00` 처럼 시작·종료가 같다. 반대로 근무 시각이
 * 있는 시프트는 이름·유형에 '휴무' 가 들어가도 휴무일 수 없다 — shift_type 에는
 * `2일근무 1일휴무` 같은 **근무 패턴**이 들어가기 때문이다.
 */
export function hasWorkingHours(shift: {
  start_time?: string | null;
  end_time?: string | null;
}): boolean {
  const start = String(shift.start_time ?? '').trim();
  const end = String(shift.end_time ?? '').trim();
  if (!start || !end) return false;
  return start.slice(0, 5) !== end.slice(0, 5);
}

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
    // **명시적으로 배정된 shift_id 는 회사가 달라도 그대로 사용한다.**
    //
    // 예전에는 시프트의 company_name 이 직원 회사와 다르면 배정을 버리고
    // 기본 시프트로 폴백했다. 그런데 이 시스템은 MSO 라 회사 간 **대체근무**가
    // 정상 업무이고, 프로덕션 근무배정 1,945건 중 766건(39.4%)이 교차회사다.
    // 즉 대체근무 배정이 통째로 무시되어 지각 판정·근로시간 계산이 틀리고 있었다.
    // 배정 자체가 관리자의 명시적 의도이므로 회사 일치를 요구해서는 안 된다.
    //
    // 회사 선호(preferredCompany)는 아래 **이름 기반 해석**에서만 의미가 있다.
    // 같은 이름의 시프트가 회사마다 있을 때 어느 것인지 고르는 용도다.
    const assignedShift = lookup.byId.get(shiftId) || null;
    if (assignedShift) {
      return applyDailyScheduleForDate(assignedShift, options?.workDate);
    }
    // 배정된 id 가 시프트 마스터에 없으면(삭제 등) 폴백.
    return resolveFallbackShift();
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
