export type ShiftLookupRecord = {
  id?: string | null;
  name?: string | null;
  company_name?: string | null;
  start_time?: string | null;
  end_time?: string | null;
};

export type ShiftAssignmentReference = {
  shift_id?: string | null;
  shift_name?: string | null;
};

function normalizeShiftLookupText(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
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
  },
) {
  const shiftId = String(assignment?.shift_id || '').trim();
  if (shiftId) {
    return lookup.byId.get(shiftId) || null;
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
          return preferredCandidate;
        }
      }
      return candidates[0] || null;
    }
  }

  const fallbackShiftId = String(options?.fallbackShiftId || '').trim();
  if (fallbackShiftId) {
    return lookup.byId.get(fallbackShiftId) || null;
  }

  return null;
}
