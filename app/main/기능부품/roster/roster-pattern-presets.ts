/**
 * Extracted wizard preset normalization helpers.
 */
import { normalizeCoverageRoleTags } from '@/lib/roster-role-tags';
import { normalizeGenerationRule } from '@/lib/roster-generation-rules';
import type {
  CoverageBand,
  RosterWizardPreset,
  StaffRestrictionDraft,
  WeeklyTemplateWeek,
  WizardPairRule,
  WorkShift,
} from './roster-wizard-types';
import { CUSTOM_PATTERN_VALUE } from './roster-wizard-types';
import {
  clampNightShiftCount,
  normalizeBlockedShiftBands,
  normalizeBlockedWeekdays,
  normalizeShiftName,
  normalizeStaffBlockPreference,
} from './roster-shift-utils';
import { isWeeklyTemplatePattern } from './roster-pattern-detection';
import {
  formatWeekdaySummary,
  getWeeklyTemplateWeekLabel,
  normalizeActiveWeekdays,
} from './roster-pattern-template-utils';

export function buildWizardPresetDescription(
  pattern: string,
  weeklyTemplateWeeks: WeeklyTemplateWeek[],
  shiftCount: number
) {
  if (isWeeklyTemplatePattern(pattern)) {
    return weeklyTemplateWeeks
      .map((week, index) => `${getWeeklyTemplateWeekLabel(index)} ${formatWeekdaySummary(week.activeWeekdays)}`)
      .join(' / ');
  }
  if (pattern === CUSTOM_PATTERN_VALUE) {
    return `커스텀 순환 · 근무유형 ${shiftCount}개`;
  }
  return `${pattern} · 근무유형 ${shiftCount}개`;
}

export function normalizePresetRecord(record: Record<string, unknown>): RosterWizardPreset | null {
  if (!record || typeof record !== 'object') return null;
  const id = String(record.id || '').trim();
  const name = String(record.name || '').trim();
  if (!id || !name) return null;

  const generationRule = normalizeGenerationRule(record.generationRule);
  const shiftIds = Array.isArray(record.shiftIds)
    ? record.shiftIds.map((shiftId: unknown) => String(shiftId || '').trim()).filter(Boolean)
    : [];
  const shiftNames = Array.isArray(record.shiftNames)
    ? record.shiftNames.map((shiftName: unknown) => String(shiftName || '').trim()).filter(Boolean)
    : [];

  const customPatternSlots = Array.isArray(record.customPatternSlots)
    ? record.customPatternSlots
        .map((token: unknown) => {
          if (token === 'OFF') return 'OFF' as const;
          const slot = Number(token);
          return Number.isInteger(slot) && slot > 0 ? slot : null;
        })
        .filter((token: number | 'OFF' | null): token is number | 'OFF' => token !== null)
    : [];

  const weeklyTemplateWeeks = Array.isArray(record.weeklyTemplateWeeks)
    ? record.weeklyTemplateWeeks
        .map((week: unknown) => {
          const w = week as Record<string, unknown> | null | undefined;
          const shiftSlot = Number(w?.shiftSlot);
          if (!Number.isInteger(shiftSlot) || shiftSlot <= 0) return null;
          return {
            shiftSlot,
            activeWeekdays: normalizeActiveWeekdays(
              Array.isArray(w?.activeWeekdays) ? (w.activeWeekdays as number[]) : []
            ),
          };
        })
        .filter(
          (week: { shiftSlot: number; activeWeekdays: number[] } | null): week is { shiftSlot: number; activeWeekdays: number[] } =>
            week !== null
        )
    : [];

  const staffNightRanges =
    record.staffNightRanges && typeof record.staffNightRanges === 'object'
      ? Object.fromEntries(
          Object.entries(record.staffNightRanges as Record<string, unknown>).map(([staffId, value]) => {
            const source = value as Record<string, unknown> | null | undefined;
            const minNightShiftCount = clampNightShiftCount(Number(source?.minNightShiftCount) || 0, 31);
            const maxNightShiftCount = Math.max(
              minNightShiftCount,
              clampNightShiftCount(Number(source?.maxNightShiftCount) || 0, 31)
            );
            return [String(staffId || ''), { minNightShiftCount, maxNightShiftCount }];
          })
        )
      : {};

  const staffBlockPreferences =
    record.staffBlockPreferences && typeof record.staffBlockPreferences === 'object'
      ? Object.fromEntries(
          Object.entries(record.staffBlockPreferences as Record<string, unknown>).map(([staffId, value]) => [
            String(staffId || ''),
            normalizeStaffBlockPreference(value),
          ])
        )
      : {};

  const staffDedicatedBands =
    record.staffDedicatedBands && typeof record.staffDedicatedBands === 'object'
      ? Object.fromEntries(
          Object.entries(record.staffDedicatedBands as Record<string, unknown>).map(([staffId, value]) => {
            const normalizedValue = String(value || '').trim().toLowerCase();
            const band: CoverageBand | '' =
              normalizedValue === 'day' || normalizedValue === 'evening' || normalizedValue === 'night'
                ? (normalizedValue as CoverageBand)
                : '';
            return [String(staffId || ''), band];
          })
        )
      : {};

  const staffCoverageRoleTags =
    record.staffCoverageRoleTags && typeof record.staffCoverageRoleTags === 'object'
      ? Object.fromEntries(
          Object.entries(record.staffCoverageRoleTags as Record<string, unknown>).map(([staffId, value]) => [
            String(staffId || ''),
            normalizeCoverageRoleTags(Array.isArray(value) ? value : String(value || '').split(',')),
          ])
        )
      : {};

  const staffRestrictions =
    record.staffRestrictions && typeof record.staffRestrictions === 'object'
      ? Object.fromEntries(
          Object.entries(record.staffRestrictions as Record<string, unknown>).map(([staffId, value]) => {
            const source = value as Record<string, unknown> | null | undefined;
            return [
              String(staffId || ''),
              {
                blockedShiftBands: normalizeBlockedShiftBands(source?.blockedShiftBands),
                blockedWeekdays: normalizeBlockedWeekdays(source?.blockedWeekdays),
                avoidWeekendWork: Boolean(source?.avoidWeekendWork),
                avoidHolidayWork: Boolean(source?.avoidHolidayWork),
                preferWeekendOff: Boolean(source?.preferWeekendOff),
                preferHolidayOff: Boolean(source?.preferHolidayOff),
                avoidConsecutiveEvening: Boolean(source?.avoidConsecutiveEvening),
                preferEarlyMonthNight: Boolean(source?.preferEarlyMonthNight),
              } satisfies StaffRestrictionDraft,
            ];
          })
        )
      : {};

  const pairRules = Array.isArray(record.pairRules)
    ? record.pairRules
        .map((entry, index) => {
          const source = entry as Record<string, unknown> | null | undefined;
          const primaryStaffId = String(source?.primaryStaffId || '').trim();
          const secondaryStaffId = String(source?.secondaryStaffId || '').trim();
          const mode = String(source?.mode || '').trim();
          const band = String(source?.band || '').trim();
          if (!primaryStaffId || !secondaryStaffId || primaryStaffId === secondaryStaffId) return null;
          if (mode !== 'together' && mode !== 'separate') return null;
          if (band !== 'night' && band !== 'work') return null;
          return {
            id: String(source?.id || `pair-rule-${index + 1}`),
            primaryStaffId,
            secondaryStaffId,
            mode,
            band,
          } satisfies WizardPairRule;
        })
        .filter((entry): entry is WizardPairRule => Boolean(entry))
    : [];

  const inferredShiftSlotCount = Math.max(
    Number(record.shiftSlotCount) || 0,
    shiftIds.length,
    customPatternSlots.reduce(
      (max: number, token: number | 'OFF') => (token === 'OFF' ? max : Math.max(max, token)),
      0
    ),
    weeklyTemplateWeeks.reduce(
      (max: number, week: { shiftSlot: number; activeWeekdays: number[] }) => Math.max(max, week.shiftSlot),
      0
    ),
    1
  );

  return {
    id,
    name,
    description: String(record.description || '').trim(),
    pattern: String(record.pattern || '상근'),
    shiftSlotCount: inferredShiftSlotCount,
    shiftIds: shiftIds.slice(0, inferredShiftSlotCount),
    shiftNames: shiftNames.slice(0, inferredShiftSlotCount),
    startOffset: Math.max(0, Math.floor(Number(record.startOffset) || 0)),
    nightShiftCount: Math.max(0, Math.floor(Number(record.nightShiftCount) || 0)),
    customPatternSlots,
    weeklyTemplateWeeks,
    generationRule,
    staffNightRanges,
    staffBlockPreferences,
    staffDedicatedBands,
    staffCoverageRoleTags,
    staffRestrictions,
    pairRules,
  };
}

export function resolvePresetShiftIds(
  preset: RosterWizardPreset,
  fallbackShiftIds: string[],
  workShifts: WorkShift[]
) {
  const validShiftIds = new Set(workShifts.map((shift) => shift.id));
  const shiftIdByName = new Map<string, string>();

  workShifts.forEach((shift) => {
    const normalizedName = normalizeShiftName(shift.name);
    if (normalizedName && !shiftIdByName.has(normalizedName)) {
      shiftIdByName.set(normalizedName, shift.id);
    }
  });

  const resolvedPresetShiftIds = preset.shiftIds
    .map((shiftId, index) => {
      if (validShiftIds.has(shiftId)) return shiftId;
      const shiftName = preset.shiftNames[index] || '';
      return shiftIdByName.get(normalizeShiftName(shiftName)) || '';
    })
    .filter(Boolean);

  return [...resolvedPresetShiftIds, ...fallbackShiftIds.filter(Boolean), ...workShifts.map((shift) => shift.id)]
    .filter((shiftId, index, list) => list.indexOf(shiftId) === index)
    .slice(0, Math.max(1, preset.shiftSlotCount));
}
