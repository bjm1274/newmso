export const ROSTER_PATTERN_PROFILE_STORAGE_KEY = 'erp_roster_pattern_profiles_v1';

export type RosterPatternGroupMode =
  | 'rotation'
  | 'day_fixed'
  | 'night_fixed'
  | 'evening_fixed';

export type RosterPatternStaffGroup = {
  id: string;
  label: string;
  mode: RosterPatternGroupMode;
  matchKeywords: string[];
  shiftIds: string[];
  note?: string;
};

export type RosterPatternProfile = {
  id: string;
  name: string;
  companyName?: string;
  companyId?: string | null;
  teamKeywords: string[];
  description: string;
  staffGroups: RosterPatternStaffGroup[];
  updatedAt: string;
};

let rosterPatternProfileCache: RosterPatternProfile[] = [];

function clonePatternProfile(profile: RosterPatternProfile): RosterPatternProfile {
  return {
    ...profile,
    teamKeywords: [...profile.teamKeywords],
    staffGroups: profile.staffGroups.map((group) => ({
      ...group,
      matchKeywords: [...group.matchKeywords],
      shiftIds: [...group.shiftIds],
    })),
  };
}

function normalizeKeywordList(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || '').trim())
      .filter(Boolean);
  }

  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeShiftIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index);
}

export function buildDefaultPatternProfile(companyName = '', companyId: string | null = null): RosterPatternProfile {
  const stamp = Date.now();

  return {
    id: `roster-pattern-${stamp}`,
    name: '',
    companyName,
    companyId,
    teamKeywords: [],
    description: '',
    staffGroups: [
      {
        id: `group-day-${stamp}`,
        label: '데이 전담',
        mode: 'day_fixed',
        matchKeywords: [],
        shiftIds: [],
        note: '',
      },
      {
        id: `group-night-${stamp}`,
        label: '나이트 전담',
        mode: 'night_fixed',
        matchKeywords: [],
        shiftIds: [],
        note: '',
      },
      {
        id: `group-rotation-${stamp}`,
        label: '순환 교대',
        mode: 'rotation',
        matchKeywords: [],
        shiftIds: [],
        note: '',
      },
    ],
    updatedAt: new Date().toISOString(),
  };
}

export function readCachedPatternProfiles() {
  return rosterPatternProfileCache.map(clonePatternProfile);
}

export function writeCachedPatternProfiles(profiles: RosterPatternProfile[]) {
  rosterPatternProfileCache = profiles.map(clonePatternProfile);
}

export function normalizePatternProfile(record: unknown): RosterPatternProfile | null {
  if (!record || typeof record !== 'object') return null;

  const source = record as Record<string, unknown>;
  const id = String(source.id || '').trim();
  const name = String(source.name || '').trim();
  if (!id || !name) return null;

  const groups = Array.isArray(source.staffGroups)
    ? source.staffGroups
        .map((group, index) => {
          if (!group || typeof group !== 'object') return null;
          const groupSource = group as Record<string, unknown>;
          const mode = String(groupSource.mode || 'rotation') as RosterPatternGroupMode;
          const note = String(groupSource.note || '').trim();

          if (!['rotation', 'day_fixed', 'night_fixed', 'evening_fixed'].includes(mode)) {
            return null;
          }

          return {
            id: String(groupSource.id || `group-${id}-${index}`).trim() || `group-${id}-${index}`,
            label: String(groupSource.label || `그룹 ${index + 1}`).trim() || `그룹 ${index + 1}`,
            mode,
            matchKeywords: normalizeKeywordList(groupSource.matchKeywords),
            shiftIds: normalizeShiftIds(groupSource.shiftIds),
            ...(note ? { note } : {}),
          } as RosterPatternStaffGroup;
        })
        .filter((group): group is RosterPatternStaffGroup => group !== null)
    : [];

  return {
    id,
    name,
    companyName: String(source.companyName || '').trim(),
    companyId: String(source.companyId || '').trim() || null,
    teamKeywords: normalizeKeywordList(source.teamKeywords),
    description: String(source.description || '').trim(),
    staffGroups: groups,
    updatedAt: String(source.updatedAt || new Date().toISOString()),
  };
}

export function getPatternProfileShiftIds(profile?: RosterPatternProfile | null) {
  if (!profile) return [];

  return profile.staffGroups
    .flatMap((group) => group.shiftIds)
    .filter(Boolean)
    .filter((shiftId, index, list) => list.indexOf(shiftId) === index);
}

export function normalizePatternText(value: string) {
  return String(value || '').replace(/\s+/g, '').toLowerCase();
}

export function matchPatternProfileForDepartment(
  profile: RosterPatternProfile,
  department: string,
  companyName?: string
) {
  if (companyName && profile.companyName && profile.companyName !== companyName) {
    return false;
  }

  if (!department || profile.teamKeywords.length === 0) return false;
  const normalizedDepartment = normalizePatternText(department);

  return profile.teamKeywords.some((keyword) =>
    normalizedDepartment.includes(normalizePatternText(keyword))
  );
}

export function buildPatternStaffSearchText(staff: Record<string, unknown>) {
  return normalizePatternText(
    [
      staff.position,
      staff.role,
      staff.employmentType,
      staff.department,
      staff.shiftType,
      staff.assignedShiftId,
      staff.assignedShiftName,
    ]
      .filter(Boolean)
      .join(' ')
  );
}

export function findPatternStaffGroup(
  profile: RosterPatternProfile | null | undefined,
  staff: Record<string, unknown>
) {
  if (!profile) return null;
  const searchText = buildPatternStaffSearchText(staff);

  return (
    profile.staffGroups.find((group) =>
      group.matchKeywords.some((keyword) =>
        searchText.includes(normalizePatternText(keyword))
      )
    ) || null
  );
}
