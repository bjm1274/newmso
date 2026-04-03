type RosterShiftLike = {
  id?: string | null;
  name?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  description?: string | null;
  shift_type?: string | null;
  weekly_work_days?: number | null;
  is_weekend_work?: boolean | null;
};

type TeamCategory =
  | 'management'
  | 'ward'
  | 'outpatient'
  | 'office'
  | 'nutrition'
  | 'surgery'
  | 'general'
  | 'off';

const SHIFT_META_MARKER = '[SHIFT_META]';
const THREE_SHIFT_KEYWORDS = ['3교대', '3shift', '3-shift'];
const OFF_SHIFT_KEYWORDS = ['휴무', 'off', '비번', '오프'];
const MANAGEMENT_KEYWORDS = ['관리', '시설관리', '환경관리', 'management'];
const WARD_KEYWORDS = ['병동', '입원', 'ward'];
const SURGERY_KEYWORDS = ['수술', 'surgery', 'operatingroom', 'operationroom', 'oproom'];
const OUTPATIENT_KEYWORDS = ['외래', '검진', '원무', 'opd', 'outpatient'];
const OFFICE_KEYWORDS = ['상근', '일반', '주간', '행정', '총무', '사무', '구매', 'office', 'weekday', 'regular'];
const NUTRITION_KEYWORDS = ['영양', '식당', '조리', 'meal', 'kitchen', 'cafeteria'];

function normalizeText(value: string) {
  return String(value || '').replace(/\s+/g, '').toLowerCase();
}

function includesKeyword(searchText: string, keywords: string[]) {
  return keywords.some((keyword) => searchText.includes(normalizeText(keyword)));
}

function getShiftSearchText(shift: RosterShiftLike) {
  return normalizeText([shift.name, shift.shift_type, shift.description].filter(Boolean).join(' '));
}

function isOffShift(shift: RosterShiftLike) {
  return includesKeyword(getShiftSearchText(shift), OFF_SHIFT_KEYWORDS);
}

function resolveShiftBand(shift: RosterShiftLike) {
  const normalizedName = normalizeText(String(shift.name || ''));
  const startHour = Number(String(shift.start_time || '').slice(0, 2) || '0');

  if (
    normalizedName.includes('night') ||
    normalizedName.includes('나이트') ||
    normalizedName.includes('야간') ||
    startHour >= 20 ||
    startHour <= 4
  ) {
    return 'night';
  }

  if (
    normalizedName.includes('evening') ||
    normalizedName.includes('eve') ||
    normalizedName.includes('이브') ||
    normalizedName.includes('오후') ||
    (startHour >= 12 && startHour < 20)
  ) {
    return 'evening';
  }

  return 'day';
}

function resolveConfiguredWorkDayMode(shift: RosterShiftLike) {
  if (String(shift.shift_type || '').includes('3교대')) return 'all_days';
  if (shift.is_weekend_work || Number(shift.weekly_work_days) >= 7) return 'all_days';

  const description = String(shift.description || '');
  const markerIndex = description.lastIndexOf(SHIFT_META_MARKER);
  if (markerIndex === -1) return 'weekdays';

  try {
    const parsedMeta = JSON.parse(description.slice(markerIndex + SHIFT_META_MARKER.length).trim());
    return parsedMeta?.work_day_mode === 'all_days' ? 'all_days' : 'weekdays';
  } catch {
    return 'weekdays';
  }
}

function getDepartmentCategory(department: string): TeamCategory {
  const normalizedDepartment = normalizeText(department);

  if (!normalizedDepartment || normalizedDepartment === normalizeText('전체')) {
    return 'general';
  }
  if (includesKeyword(normalizedDepartment, SURGERY_KEYWORDS)) {
    return 'surgery';
  }
  if (includesKeyword(normalizedDepartment, WARD_KEYWORDS)) {
    return 'ward';
  }
  if (includesKeyword(normalizedDepartment, OUTPATIENT_KEYWORDS)) {
    return 'outpatient';
  }
  if (includesKeyword(normalizedDepartment, MANAGEMENT_KEYWORDS)) {
    return 'management';
  }
  if (includesKeyword(normalizedDepartment, NUTRITION_KEYWORDS)) {
    return 'nutrition';
  }
  if (includesKeyword(normalizedDepartment, OFFICE_KEYWORDS)) {
    return 'office';
  }

  return 'general';
}

function getShiftCategory(shift: RosterShiftLike): TeamCategory {
  const searchText = getShiftSearchText(shift);

  if (!searchText) return 'general';
  if (includesKeyword(searchText, OFF_SHIFT_KEYWORDS)) return 'off';
  if (includesKeyword(searchText, SURGERY_KEYWORDS)) return 'surgery';
  if (includesKeyword(searchText, WARD_KEYWORDS)) return 'ward';
  if (includesKeyword(searchText, OUTPATIENT_KEYWORDS)) return 'outpatient';
  if (includesKeyword(searchText, MANAGEMENT_KEYWORDS)) return 'management';
  if (includesKeyword(searchText, NUTRITION_KEYWORDS)) return 'nutrition';
  if (includesKeyword(searchText, OFFICE_KEYWORDS)) return 'office';
  return 'general';
}

function dedupeById<T extends RosterShiftLike>(shifts: T[]) {
  const seen = new Set<string>();

  return shifts.filter((shift) => {
    const id = String(shift.id || '').trim();
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function filterRosterShiftsForDepartment<T extends RosterShiftLike>(
  department: string,
  shifts: T[],
  options?: { includeOffShift?: boolean }
) {
  const includeOffShift = options?.includeOffShift !== false;
  const category = getDepartmentCategory(department);

  if (category === 'general') {
    return includeOffShift ? dedupeById(shifts) : dedupeById(shifts.filter((shift) => !isOffShift(shift)));
  }

  const offShifts = includeOffShift ? shifts.filter((shift) => getShiftCategory(shift) === 'off') : [];
  const categoryShifts = shifts.filter((shift) => getShiftCategory(shift) === category);
  if (categoryShifts.length > 0) {
    return dedupeById([...categoryShifts, ...offShifts]);
  }

  const neutralFallbackShifts = shifts.filter((shift) => {
    if (getShiftCategory(shift) !== 'general') return false;

    if (category === 'ward') {
      return (
        resolveConfiguredWorkDayMode(shift) === 'all_days' ||
        includesKeyword(getShiftSearchText(shift), THREE_SHIFT_KEYWORDS)
      );
    }

    return resolveShiftBand(shift) === 'day' && resolveConfiguredWorkDayMode(shift) === 'weekdays';
  });

  if (neutralFallbackShifts.length > 0) {
    return dedupeById([...neutralFallbackShifts, ...offShifts]);
  }

  return dedupeById(offShifts);
}
