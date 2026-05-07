export type PreferredOffSelectionMap = Record<string, string[]>;

export function formatDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

function collectDateRangeWithinMonth(startDate: string, endDate: string, monthDateSet: Set<string>) {
  if (!startDate) return [];

  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate || startDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];

  const rangeStart = start.getTime() <= end.getTime() ? start : end;
  const rangeEnd = start.getTime() <= end.getTime() ? end : start;
  const dates: string[] = [];
  const cursor = new Date(rangeStart);

  while (cursor.getTime() <= rangeEnd.getTime()) {
    const dateKey = formatDateKey(cursor);
    if (monthDateSet.has(dateKey)) {
      dates.push(dateKey);
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

export function buildBlockedDatesByStaff(
  leaveRequests: Array<{ staff_id: string; start_date: string; end_date: string }>,
  monthDateSet: Set<string>
) {
  const blockedDatesByStaff = new Map<string, Set<string>>();

  leaveRequests.forEach((leave) => {
    const staffId = String(leave.staff_id || '');
    if (!staffId) return;

    const blockedDates = collectDateRangeWithinMonth(
      String(leave.start_date || ''),
      String(leave.end_date || ''),
      monthDateSet
    );
    if (blockedDates.length === 0) return;

    const existing = blockedDatesByStaff.get(staffId) || new Set<string>();
    blockedDates.forEach((date) => existing.add(date));
    blockedDatesByStaff.set(staffId, existing);
  });

  return blockedDatesByStaff;
}

export function countBlockedDateEntries(blockedDatesByStaff: Map<string, Set<string>>) {
  return Array.from(blockedDatesByStaff.values()).reduce(
    (sum, blockedDates) => sum + blockedDates.size,
    0
  );
}

export function mergeBlockedDateMaps(...maps: Array<Map<string, Set<string>>>) {
  const merged = new Map<string, Set<string>>();

  maps.forEach((currentMap) => {
    currentMap.forEach((blockedDates, staffId) => {
      const nextDates = merged.get(staffId) || new Set<string>();
      blockedDates.forEach((date) => nextDates.add(date));
      merged.set(staffId, nextDates);
    });
  });

  return merged;
}

export function normalizePreferredOffSelections(value: unknown, monthDateSet: Set<string>) {
  if (!value || typeof value !== 'object') return {} as PreferredOffSelectionMap;

  const normalized: PreferredOffSelectionMap = {};

  Object.entries(value as Record<string, unknown>).forEach(([staffId, rawDates]) => {
    if (!Array.isArray(rawDates)) return;

    const dates = [...new Set(rawDates.map((date) => String(date || '').trim()))]
      .filter((date) => monthDateSet.has(date))
      .sort();

    if (dates.length > 0) {
      normalized[String(staffId)] = dates;
    }
  });

  return normalized;
}

export function buildPreferredOffDateMap(
  preferredOffSelections: PreferredOffSelectionMap,
  validStaffIds: Set<string>,
  monthDateSet: Set<string>
) {
  const preferredOffByStaff = new Map<string, Set<string>>();

  Object.entries(preferredOffSelections).forEach(([staffId, dates]) => {
    if (!validStaffIds.has(staffId)) return;

    const filteredDates = dates.filter((date) => monthDateSet.has(date));
    if (filteredDates.length === 0) return;

    preferredOffByStaff.set(staffId, new Set(filteredDates));
  });

  return preferredOffByStaff;
}
