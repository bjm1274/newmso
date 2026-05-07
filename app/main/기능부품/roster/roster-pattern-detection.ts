/**
 * Extracted pattern detection and resolution helpers.
 */
import type { RosterPatternProfile } from '@/lib/roster-pattern-profiles';
import { findPatternStaffGroup } from '@/lib/roster-pattern-profiles';
import type { StaffMember } from '@/types';
import { getShiftNameById } from './roster-pattern-display';
import {
DAY_DEDICATED_PATTERN_KEYWORDS,
EVENING_DEDICATED_PATTERN_KEYWORDS,
FIXED_PATTERN_KEYWORDS,
getDepartmentName,
hasPatternKeyword,
NIGHT_DEDICATED_PATTERN_KEYWORDS,
OFFICE_PATTERN_KEYWORDS,
ONE_WORK_ONE_OFF_PATTERN_KEYWORDS,
pickShiftByKeywords,
resolveConfiguredWorkDayMode,
resolveShiftBand,
sortShifts,
THREE_SHIFT_PATTERN_KEYWORDS,
TWO_SHIFT_PATTERN_KEYWORDS,
TWO_WORK_ONE_OFF_PATTERN_KEYWORDS
} from './roster-shift-utils';
import type {
PlannerResolvedPatternGroup,
RosterPatternGroupMode,
WorkShift
} from './roster-wizard-types';
import {
CUSTOM_PATTERN_VALUE,
WEEKLY_TEMPLATE_PATTERN_VALUE
} from './roster-wizard-types';

export function isNightPattern(pattern: string) {
  return pattern === '3교대' || pattern === '야간전담';
}

export function isCustomPattern(pattern: string) {
  return pattern === CUSTOM_PATTERN_VALUE;
}

export function isWeeklyTemplatePattern(pattern: string) {
  return pattern === WEEKLY_TEMPLATE_PATTERN_VALUE;
}

export function getRequiredShiftCount(pattern: string) {
  switch (pattern) {
    case '3교대':
      return 3;
    case '2교대':
    case '2일근무1일휴무':
      return 2;
    case CUSTOM_PATTERN_VALUE:
      return 1;
    default:
      return 1;
  }
}

export function inferPattern(staff: StaffMember, shifts: WorkShift[]) {
  const assignedShift = shifts.find((shift) => shift.id === (staff as Record<string, unknown>)?.shift_id);
  const sources: Array<string | null | undefined> = [
    (staff as Record<string, unknown>)?.shift_type as string | undefined,
    assignedShift?.shift_type,
    assignedShift?.name,
  ];

  if (hasPatternKeyword(sources, THREE_SHIFT_PATTERN_KEYWORDS)) return '3교대';
  if (hasPatternKeyword(sources, TWO_SHIFT_PATTERN_KEYWORDS)) return '2교대';
  if (hasPatternKeyword(sources, TWO_WORK_ONE_OFF_PATTERN_KEYWORDS)) return '2일근무1일휴무';
  if (hasPatternKeyword(sources, ONE_WORK_ONE_OFF_PATTERN_KEYWORDS)) return '1일근무1일휴무';
  if (hasPatternKeyword(sources, NIGHT_DEDICATED_PATTERN_KEYWORDS)) return '야간전담';
  if (
    hasPatternKeyword(sources, OFFICE_PATTERN_KEYWORDS) ||
    (assignedShift && resolveConfiguredWorkDayMode(assignedShift) === 'weekdays')
  ) {
    return '상근';
  }
  if (shifts.length >= 3) return '3교대';
  return '상근';
}

// ─── 밴드/시프트 유틸 ─────────────────────────────────────────────────────────

export function getBandShiftIds(
  band: 'day' | 'evening' | 'night',
  shifts: WorkShift[],
  preferredShiftId = ''
) {
  const bandShiftIds = sortShifts(shifts.filter((shift) => resolveShiftBand(shift) === band)).map(
    (shift) => shift.id
  );

  if (preferredShiftId && bandShiftIds.includes(preferredShiftId)) {
    return [preferredShiftId, ...bandShiftIds.filter((shiftId) => shiftId !== preferredShiftId)];
  }

  return bandShiftIds;
}

export function buildDefaultShiftOrder(shifts: WorkShift[]) {
  const sorted = sortShifts(shifts);
  const bucket = [
    pickShiftByKeywords(sorted, ['day', '데이', '주간', '상근', '일근', '오전']),
    pickShiftByKeywords(sorted, ['evening', 'eve', '이브', '오후', '중간']),
    pickShiftByKeywords(sorted, ['night', '나이트', '야간']),
  ].filter(Boolean) as WorkShift[];

  const unique = [...bucket];
  sorted.forEach((shift) => {
    if (!unique.some((item) => item.id === shift.id)) {
      unique.push(shift);
    }
  });

  return unique.slice(0, 3);
}

// ─── 전담 패턴 그룹 자동 감지 ────────────────────────────────────────────────

export function inferDedicatedPatternGroup(
  staff: StaffMember,
  shifts: WorkShift[]
): PlannerResolvedPatternGroup | null {
  if (shifts.length === 0) return null;

  const s = staff as Record<string, unknown>;
  const assignedShift = shifts.find((shift) => shift.id === s?.shift_id) || null;
  const sources: Array<string | null | undefined> = [
    s?.shift_type as string | undefined,
    staff?.position,
    staff?.role,
    assignedShift?.shift_type,
    assignedShift?.name,
    assignedShift?.description,
  ];

  const buildGroup = (
    band: 'day' | 'evening' | 'night',
    mode: RosterPatternGroupMode,
    label: string,
    rationale: string
  ) => {
    const shiftIds = getBandShiftIds(band, shifts, assignedShift?.id || '');
    if (shiftIds.length === 0) return null;

    return {
      key: `auto-${mode}`,
      label,
      mode,
      shiftIds,
      rationale,
      source: 'auto' as const,
    };
  };

  if (hasPatternKeyword(sources, DAY_DEDICATED_PATTERN_KEYWORDS)) {
    return buildGroup(
      'day',
      'day_fixed',
      '데이전담',
      '직원 근무유형과 배정 근무를 기준으로 데이 전담자로 자동 감지했습니다.'
    );
  }

  if (hasPatternKeyword(sources, EVENING_DEDICATED_PATTERN_KEYWORDS)) {
    return buildGroup(
      'evening',
      'evening_fixed',
      '이브전담',
      '직원 근무유형과 배정 근무를 기준으로 이브 전담자로 자동 감지했습니다.'
    );
  }

  if (hasPatternKeyword(sources, NIGHT_DEDICATED_PATTERN_KEYWORDS)) {
    return buildGroup(
      'night',
      'night_fixed',
      '나이트전담',
      '직원 근무유형과 배정 근무를 기준으로 나이트 전담자로 자동 감지했습니다.'
    );
  }

  if (assignedShift && hasPatternKeyword(sources, FIXED_PATTERN_KEYWORDS)) {
    const assignedBand = resolveShiftBand(assignedShift);
    if (assignedBand === 'day') {
      return buildGroup(
        'day',
        'day_fixed',
        '데이전담',
        '고정 근무 힌트와 배정 근무 시간을 기준으로 데이 전담자로 판단했습니다.'
      );
    }
    if (assignedBand === 'evening') {
      return buildGroup(
        'evening',
        'evening_fixed',
        '이브전담',
        '고정 근무 힌트와 배정 근무 시간을 기준으로 이브 전담자로 판단했습니다.'
      );
    }
    if (assignedBand === 'night') {
      return buildGroup(
        'night',
        'night_fixed',
        '나이트전담',
        '고정 근무 힌트와 배정 근무 시간을 기준으로 나이트 전담자로 판단했습니다.'
      );
    }
  }

  return null;
}

export function resolvePlannerPatternGroup({
  staff,
  patternProfile,
  availableShifts,
  allShifts,
}: {
  staff: StaffMember;
  patternProfile?: RosterPatternProfile | null;
  availableShifts: WorkShift[];
  allShifts: WorkShift[];
}): PlannerResolvedPatternGroup | null {
  const staffExtra = staff as Record<string, unknown>;
  const matchedGroup = patternProfile
    ? findPatternStaffGroup(patternProfile, {
        name: String(staff.name || ''),
        position: String(staff.position || ''),
        role: String(staff.role || ''),
        employmentType: String(staffExtra.employment_type || ''),
        department: String(getDepartmentName(staff) || ''),
        shiftType: String(staffExtra.shift_type || ''),
        assignedShiftId: String(staffExtra.shift_id || ''),
        assignedShiftName: getShiftNameById(String(staffExtra.shift_id || ''), allShifts),
      })
    : null;

  if (matchedGroup) {
    return {
      key: matchedGroup.id,
      label: matchedGroup.label,
      mode: matchedGroup.mode,
      shiftIds: matchedGroup.shiftIds,
      rationale: `${matchedGroup.label} 그룹 설정을 기준으로 고정 사이클을 적용했습니다.`,
      source: 'profile',
    };
  }

  return inferDedicatedPatternGroup(staff, availableShifts);
}
