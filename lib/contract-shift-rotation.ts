export type ShiftRecord = Record<string, unknown>;

function toPlainObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeShiftId(value: unknown) {
  return String(value || '').trim();
}

export function normalizeShiftIds(values: unknown[], limit = 2) {
  return Array.from(new Set(values.map(normalizeShiftId).filter(Boolean))).slice(0, limit);
}

export function inferShiftBand(name?: unknown) {
  const match = String(name || '').trim().match(/(?:\/|\s|-|_)(D|E|N)$/i);
  return match ? match[1].toUpperCase() : '';
}

export function stripShiftBandSuffix(name?: unknown) {
  return String(name || '').trim().replace(/(?:\/|\s|-|_)(D|E|N)$/i, '').trim();
}

export function getShiftBandCodesForType(shiftType?: unknown) {
  const pattern = String(shiftType || '').replace(/\s+/g, '');
  if (pattern.includes('3교대')) return ['D', 'E', 'N'];
  if (pattern.includes('데이이브전담')) return ['D', 'E'];
  if (pattern.includes('데이전담')) return ['D'];
  if (pattern.includes('이브전담')) return ['E'];
  if (pattern.includes('나이트전담') || pattern.includes('야간전담')) return ['N'];
  return [] as string[];
}

export function isShiftBandGroupRow(shift?: ShiftRecord | null) {
  return Boolean(shift && (getShiftBandCodesForType(shift.shift_type).length > 0 || inferShiftBand(shift.name)));
}

export function getShiftBandGroupRows(seedShift: ShiftRecord, rows: ShiftRecord[] | null | undefined) {
  const baseName = stripShiftBandSuffix(seedShift.name);
  const companyName = String(seedShift.company_name || seedShift.company || '');
  const shiftType = String(seedShift.shift_type || '');
  const bandOrder = getShiftBandCodesForType(shiftType);
  const sameGroupRows = (rows || []).filter((row) => {
    const rowCompanyName = String(row.company_name || row.company || '');
    return (
      isShiftBandGroupRow(row) &&
      stripShiftBandSuffix(row.name) === baseName &&
      rowCompanyName === companyName &&
      String(row.shift_type || '') === shiftType
    );
  });

  return sameGroupRows.sort((a, b) => {
    const aBand = inferShiftBand(a.name);
    const bBand = inferShiftBand(b.name);
    const aIndex = bandOrder.indexOf(aBand);
    const bIndex = bandOrder.indexOf(bBand);
    return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
  });
}

export function getWeeklyRotationShiftIds(source?: Record<string, unknown> | null, primaryShiftId?: unknown) {
  const permissions = toPlainObject(source?.permissions);
  const workConditions = toPlainObject(permissions.work_conditions);
  const primaryId = normalizeShiftId(primaryShiftId) || normalizeShiftId(source?.shift_id);
  const shiftGroupIds = Array.isArray(workConditions.shift_group_ids)
    ? workConditions.shift_group_ids
    : Array.isArray(permissions.shift_group_ids)
      ? permissions.shift_group_ids
      : [];
  if (shiftGroupIds.length > 1) {
    return normalizeShiftIds([primaryId, ...shiftGroupIds], 7);
  }
  const storedRotationIds = Array.isArray(workConditions.weekly_rotation_shift_ids)
    ? workConditions.weekly_rotation_shift_ids
    : Array.isArray(permissions.weekly_rotation_shift_ids)
      ? permissions.weekly_rotation_shift_ids
      : [];
  const secondaryId =
    normalizeShiftId(workConditions.secondary_shift_id) ||
    normalizeShiftId(permissions.secondary_shift_id);

  return normalizeShiftIds([primaryId, ...storedRotationIds, secondaryId], 2);
}

export function orderShiftsByIds(rows: ShiftRecord[] | null | undefined, shiftIds: string[]) {
  const shiftMap = new Map((rows || []).map((shift) => [normalizeShiftId(shift.id), shift]));
  return shiftIds.map((shiftId) => shiftMap.get(shiftId)).filter(Boolean) as ShiftRecord[];
}

export function withWeeklyRotationShifts(orderedShifts: ShiftRecord[]) {
  if (orderedShifts.length === 0) return null;
  return {
    ...orderedShifts[0],
    weekly_rotation_shifts: orderedShifts };
}

function toTime(value: unknown) {
  return value ? String(value).slice(0, 5) : '';
}

function formatRange(start: string, end: string) {
  if (start && end) return `${start} ~ ${end}`;
  return start || end || '';
}

export function buildShiftContractVariables(
  shiftSource: ShiftRecord | ShiftRecord[] | null | undefined,
  contract?: Record<string, unknown> | null,
  user?: Record<string, unknown> | null,
): Record<string, string> {
  const sourceObject = toPlainObject(shiftSource);
  const rotationShifts = Array.isArray(shiftSource)
    ? shiftSource
    : Array.isArray(sourceObject.weekly_rotation_shifts)
      ? (sourceObject.weekly_rotation_shifts as ShiftRecord[])
      : shiftSource
        ? [shiftSource as ShiftRecord]
        : [];

  const fallbackStart = toTime(contract?.shift_start_time || user?.shift_start_time);
  const fallbackEnd = toTime(contract?.shift_end_time || user?.shift_end_time);
  const fallbackBreakStart = toTime(contract?.break_start_time || user?.break_start_time);
  const fallbackBreakEnd = toTime(contract?.break_end_time || user?.break_end_time);
  const fallbackTimeRange = formatRange(fallbackStart, fallbackEnd);
  const fallbackBreakRange = formatRange(fallbackBreakStart, fallbackBreakEnd);

  if (rotationShifts.length === 0) {
    const fallbackSchedule = fallbackTimeRange
      ? `${fallbackTimeRange}${fallbackBreakRange ? ` (휴게 ${fallbackBreakRange})` : ''}`
      : '';
    return {
      shift_name: '',
      shift_start: fallbackStart,
      shift_end: fallbackEnd,
      break_start: fallbackBreakStart,
      break_end: fallbackBreakEnd,
      shift_time_range: fallbackTimeRange,
      shift_time: fallbackTimeRange,
      break_time_range: fallbackBreakRange,
      shift_schedule: fallbackSchedule,
      weekly_rotation_shift_schedule: fallbackSchedule,
      work_schedule: fallbackSchedule };
  }

  const valuesFor = (key: string, fallback: string) =>
    rotationShifts.map((shift, index) => {
      const value = toTime(shift?.[key]) || (index === 0 ? fallback : '');
      return value;
    });
  const bandLabels = rotationShifts.map((shift) => inferShiftBand(shift?.name));
  const isBandGroup = rotationShifts.length > 1 && bandLabels.filter(Boolean).length >= 2;
  const baseShiftName = stripShiftBandSuffix(rotationShifts[0]?.name);
  const segmentLabel = (index: number) => {
    const shift = rotationShifts[index];
    const name = String(shift?.name || '').trim();
    if (name) {
      const cleanName = stripShiftBandSuffix(name) || name;
      return cleanName;
    }
    if (isBandGroup) return bandLabels[index] || `${index + 1}번`;
    return `${index + 1}주차`;
  };

  const formatSegmentValues = (values: string[], includeSingleShiftName = false) => {
    if (rotationShifts.length <= 1) {
      const val = values.find(Boolean) || '';
      if (!includeSingleShiftName) return val;
      const shiftName = String(rotationShifts[0]?.name || '').trim();
      if (val && shiftName) {
        return `${stripShiftBandSuffix(shiftName) || shiftName} ${val}`;
      }
      return val;
    }

    const filled = values
      .map((value, index) => (value ? `${segmentLabel(index)} ${value}` : ''))
      .filter(Boolean);
    return filled.join(' / ');
  };

  const shiftStarts = valuesFor('start_time', fallbackStart);
  const shiftEnds = valuesFor('end_time', fallbackEnd);
  const breakStarts = valuesFor('break_start_time', fallbackBreakStart);
  const breakEnds = valuesFor('break_end_time', fallbackBreakEnd);
  const shiftTimeRanges = shiftStarts.map((start, index) => formatRange(start, shiftEnds[index] || ''));
  const breakTimeRanges = breakStarts.map((start, index) => {
    const s = start ? String(start).trim() : '';
    const e = breakEnds[index] ? String(breakEnds[index]).trim() : '';
    return s && e ? `${s} ~ ${e}` : s || e || '';
  });
  const shiftNames = rotationShifts
    .map((shift, index) => {
      const name = String(shift?.name || '').trim();
      if (!name) return '';
      if (isBandGroup) return `${segmentLabel(index)} ${stripShiftBandSuffix(name) || name}`;
      return rotationShifts.length > 1 ? `${segmentLabel(index)} ${name}` : name;
    })
    .filter(Boolean);
  const scheduleItems = rotationShifts
    .map((shift, index) => {
      const name = String(shift?.name || '').trim();
      const timeRange = shiftTimeRanges[index];
      const breakRange = breakTimeRanges[index];
      const label = rotationShifts.length > 1 ? `${segmentLabel(index)} ` : '';
      if (isBandGroup) {
        return timeRange ? `${label}${timeRange}${breakRange ? ` (휴게 ${breakRange})` : ''}` : '';
      }
      const body = [name, timeRange ? `(${timeRange}${breakRange ? `, 휴게 ${breakRange}` : ''})` : ''].filter(Boolean).join(' ');
      return body ? `${label}${body}` : '';
    })
    .filter(Boolean);
  const scheduleText = isBandGroup && baseShiftName
    ? `${baseShiftName} (${bandLabels.filter(Boolean).join('/')}): ${scheduleItems.join(' / ')}`
    : scheduleItems.join(' / ');

  return {
    shift_name: isBandGroup && baseShiftName ? `${baseShiftName} (${bandLabels.filter(Boolean).join('/')})` : shiftNames.join(' / '),
    shift_start: formatSegmentValues(shiftStarts),
    shift_end: formatSegmentValues(shiftEnds),
    break_start: formatSegmentValues(breakStarts),
    break_end: formatSegmentValues(breakEnds),
    shift_time_range: formatSegmentValues(shiftTimeRanges, true),
    shift_time: formatSegmentValues(shiftTimeRanges, true),
    break_time_range: formatSegmentValues(breakTimeRanges),
    shift_schedule: scheduleText,
    weekly_rotation_shift_schedule: scheduleText,
    work_schedule: scheduleText };
}
