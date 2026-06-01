/**
 * shift-working-hours.ts
 *
 * Pure, side-effect-free module for computing weekly working hours and work-days
 * from a shift (근무형태) record.
 *
 * Ported faithfully from:
 *   app/main/기능부품/인사관리서브/구성원현황.tsx
 *   - parseShiftMetaHelper  lines 675-708
 *   - getShiftHoursAndDays  lines 710-814
 *
 * No React, no DOM, no imports from the component.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single break-plan entry stored inside ShiftMeta.break_plans */
export interface BreakPlan {
  id?: string | number;
  start_time?: string | null;
  end_time?: string | null;
  [key: string]: unknown;
}

/** Per-day schedule override stored inside ShiftMeta.daily_schedules */
export interface DaySchedule {
  enabled?: boolean;
  start_time?: string | null;
  end_time?: string | null;
  break_plan_id?: string | number | null;
  [key: string]: unknown;
}

/** Parsed contents of the [SHIFT_META] JSON block */
export interface ShiftMeta {
  shift_type: string | null;
  weekly_work_days: number;
  is_weekend_work: boolean;
  daily_schedules: Record<string, DaySchedule> | null;
  break_plans: BreakPlan[] | null;
}

/**
 * The input shape for a shift DB row.
 * All fields are optional/nullable because DB rows can be sparse; the
 * functions below guard against missing values explicitly.
 */
export interface Shift {
  id?: string | number | null;
  name?: string | null;
  /** HH:MM string, e.g. "09:00" */
  start_time?: string | null;
  /** HH:MM string, e.g. "18:00" */
  end_time?: string | null;
  /** HH:MM string */
  break_start_time?: string | null;
  /** HH:MM string */
  break_end_time?: string | null;
  /**
   * Free-text description field; may contain a [SHIFT_META]{...} JSON block
   * appended at the end.
   */
  description?: string | null;
  /** e.g. "1일근무1일휴무" */
  shift_type?: string | null;
  /** Fallback for weekly_work_days when no [SHIFT_META] block is present */
  weekly_work_days?: number | string | null;
  is_weekend_work?: boolean | null;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Marker string that separates the JSON meta-block from human-readable text */
const SHIFT_META_MARKER = '[SHIFT_META]';

/**
 * Look up a break plan by id inside a plans array.
 * Returns null when plans is absent or no match is found.
 * (Ported from the inline getPlan closure at lines 748-751.)
 */
function getPlan(
  plans: BreakPlan[] | null | undefined,
  planId: string | number | null | undefined,
): BreakPlan | null {
  if (!plans || planId == null) return null;
  return plans.find((p) => String(p.id) === String(planId)) ?? null;
}

/**
 * Compute net work minutes for a time-range object.
 * Handles overnight shifts (end < start → +24 h) and subtracts break.
 * (Ported from the inline calcWorkMinutes closure at lines 726-746.)
 */
function calcWorkMinutes(s: {
  start_time?: string | null;
  end_time?: string | null;
  break_start_time?: string | null;
  break_end_time?: string | null;
}): number {
  if (!s.start_time || !s.end_time) return 0;

  const [sh, sm] = s.start_time.split(':').map(Number);
  const [eh, em] = s.end_time.split(':').map(Number);
  if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return 0;

  let workMins = eh * 60 + em - (sh * 60 + sm);
  // Overnight shift wrap
  if (workMins <= 0) workMins += 24 * 60;

  const bstart = s.break_start_time;
  const bend = s.break_end_time;
  if (bstart && bend) {
    const [bsh, bsm] = bstart.split(':').map(Number);
    const [beh, bem] = bend.split(':').map(Number);
    if (!isNaN(bsh) && !isNaN(beh)) {
      let breakMins = beh * 60 + bem - (bsh * 60 + bsm);
      if (breakMins <= 0) breakMins += 24 * 60;
      workMins = Math.max(0, workMins - breakMins);
    }
  }

  return workMins;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse the [SHIFT_META] JSON block embedded in `shift.description`.
 *
 * Falls back to top-level shift fields when:
 *   - the marker is absent, OR
 *   - JSON.parse throws.
 *
 * (Ported from parseShiftMetaHelper, lines 675-708.)
 */
export function parseShiftMeta(shift: Shift): ShiftMeta | null {
  if (!shift) return null;

  const description = String(shift.description ?? '');
  const markerIndex = description.lastIndexOf(SHIFT_META_MARKER);

  const fallback = (): ShiftMeta => ({
    shift_type: (shift.shift_type as string | null) ?? null,
    weekly_work_days: Number(shift.weekly_work_days) || 5,
    is_weekend_work: Boolean(shift.is_weekend_work) || false,
    daily_schedules: null,
    break_plans: null,
  });

  if (markerIndex === -1) {
    return fallback();
  }

  try {
    const metaText = description.slice(markerIndex + SHIFT_META_MARKER.length).trim();
    const parsed: Record<string, unknown> = JSON.parse(metaText);
    return {
      shift_type:
        (parsed.shift_type as string | null) ??
        (shift.shift_type as string | null) ??
        null,
      weekly_work_days:
        parsed.weekly_work_days != null
          ? Number(parsed.weekly_work_days)
          : Number(shift.weekly_work_days) ?? 5,
      is_weekend_work:
        parsed.is_weekend_work != null
          ? Boolean(parsed.is_weekend_work)
          : Boolean(shift.is_weekend_work) ?? false,
      daily_schedules:
        (parsed.daily_schedules as Record<string, DaySchedule> | null) ?? null,
      break_plans: (parsed.break_plans as BreakPlan[] | null) ?? null,
    };
  } catch {
    return fallback();
  }
}

/**
 * Compute the weekly hours and work-days for a single shift record.
 *
 * Returns `{ hours: 40, days: 5 }` as the safe default when `shift` is
 * absent or all times are missing.
 *
 * Special rule — `shift_type === '1일근무1일휴무'`:
 *   days  = 3.5  (fixed)
 *   hours = avgDailyMinutes × 3.5 / 60  (rounded to 1 dp)
 *
 * Otherwise:
 *   days  = count of enabled daily_schedules keys, or weekly_work_days
 *   hours = sum of enabled-day minutes / 60  (with daily_schedules)
 *         = singleDayMinutes × days / 60     (without daily_schedules)
 *
 * (Ported from getShiftHoursAndDays, lines 710-814.)
 */
export function getShiftHoursAndDays(shift: Shift): { hours: number; days: number } {
  if (!shift) return { hours: 40, days: 5 };

  const meta = parseShiftMeta(shift);

  // -----------------------------------------------------------------------
  // 1. Determine calculatedDays
  // -----------------------------------------------------------------------
  let calculatedDays = 5;
  if (meta?.daily_schedules) {
    const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    calculatedDays = DAY_KEYS.filter((d) => meta.daily_schedules![d]?.enabled).length;
  } else {
    calculatedDays = Number(shift.weekly_work_days) || 5;
  }
  if (shift.shift_type === '1일근무1일휴무') {
    calculatedDays = 3.5;
  }

  // -----------------------------------------------------------------------
  // 2. Determine calculatedHours
  // -----------------------------------------------------------------------
  let calculatedHours = 40;
  const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

  if (shift.shift_type === '1일근무1일휴무') {
    if (meta?.daily_schedules) {
      const enabledDays = DAY_KEYS.filter((d) => meta.daily_schedules![d]?.enabled);
      if (enabledDays.length > 0) {
        const totalMins = enabledDays.reduce((sum, d) => {
          const sched = meta.daily_schedules![d];
          const plan = getPlan(meta.break_plans, sched?.break_plan_id);
          return (
            sum +
            calcWorkMinutes({
              start_time: sched?.start_time,
              end_time: sched?.end_time,
              break_start_time: plan?.start_time ?? null,
              break_end_time: plan?.end_time ?? null,
            })
          );
        }, 0);
        // Average daily minutes × 3.5 weeks / 60 → weekly hours
        calculatedHours =
          Math.round(((totalMins / enabledDays.length) * 3.5) / 60 * 10) / 10;
      } else {
        const singleMins = calcWorkMinutes({
          start_time: shift.start_time,
          end_time: shift.end_time,
          break_start_time: shift.break_start_time,
          break_end_time: shift.break_end_time,
        });
        calculatedHours = Math.round(((singleMins * 3.5) / 60) * 10) / 10;
      }
    } else {
      const singleMins = calcWorkMinutes({
        start_time: shift.start_time,
        end_time: shift.end_time,
        break_start_time: shift.break_start_time,
        break_end_time: shift.break_end_time,
      });
      calculatedHours = Math.round(((singleMins * 3.5) / 60) * 10) / 10;
    }
  } else {
    if (meta?.daily_schedules) {
      const totalMins = DAY_KEYS.reduce((sum, d) => {
        const sched = meta.daily_schedules![d];
        if (!sched?.enabled) return sum;
        const plan = getPlan(meta.break_plans, sched?.break_plan_id);
        return (
          sum +
          calcWorkMinutes({
            start_time: sched?.start_time,
            end_time: sched?.end_time,
            break_start_time: plan?.start_time ?? null,
            break_end_time: plan?.end_time ?? null,
          })
        );
      }, 0);
      calculatedHours = Math.round((totalMins / 60) * 10) / 10;
    } else {
      const singleMins = calcWorkMinutes({
        start_time: shift.start_time,
        end_time: shift.end_time,
        break_start_time: shift.break_start_time,
        break_end_time: shift.break_end_time,
      });
      calculatedHours = Math.round(((singleMins * calculatedDays) / 60) * 10) / 10;
    }
  }

  return { hours: calculatedHours, days: calculatedDays };
}

/**
 * Compute the AVERAGE weekly hours and work-days across multiple shifts.
 *
 * - Null/undefined entries in the array are silently skipped.
 * - Empty array (or all-null) → `{ hours: 0, days: 0 }`.
 * - Both outputs are rounded to 1 decimal place.
 */
export function averageShiftHoursAndDays(
  shifts: (Shift | null | undefined)[],
): { hours: number; days: number } {
  const valid = shifts.filter((s): s is Shift => s != null);
  if (valid.length === 0) return { hours: 0, days: 0 };

  let totalHours = 0;
  let totalDays = 0;
  for (const shift of valid) {
    const { hours, days } = getShiftHoursAndDays(shift);
    totalHours += hours;
    totalDays += days;
  }

  return {
    hours: Math.round((totalHours / valid.length) * 10) / 10,
    days: Math.round((totalDays / valid.length) * 10) / 10,
  };
}
