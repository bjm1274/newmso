/**
 * staff-shift-resolver.ts
 *
 * 직원의 근무유형을 해석하는 헬퍼.
 * DB 스키마 변경(staff_members.shift_id 단일 → staff_shift_assignments 다중)에 대응한다.
 *
 * 폴백 우선순위:
 *  1. shift_assignments(날짜별 근무표 배정)의 shift_id (날짜 특정 시)
 *  2. staff_shift_assignments WHERE is_primary = TRUE
 *  3. staff_members.shift_id (legacy 호환)
 *
 * NOTE: 예전에는 1번을 근태기록(attendances/attendance)의 shift_id 로 읽었으나
 *       두 테이블 어디에도 shift_id 컬럼이 없다(PRAGMA 실측). 날짜별 배정을 담는
 *       실테이블은 shift_assignments(staff_id, work_date, shift_id, shift_name)다.
 */

import { z } from 'zod';
import { db } from '@/lib/db-client';

// ---------------------------------------------------------------------------
// 스키마
// ---------------------------------------------------------------------------

const StaffShiftAssignmentSchema = z.object({
  id: z.string().optional().nullable(),
  staff_id: z.string(),
  shift_id: z.string(),
  is_primary: z.boolean().optional().nullable(),
  priority: z.number().int().optional().nullable(),
  effective_from: z.string().optional().nullable(),
  effective_to: z.string().optional().nullable(),
  created_at: z.string().optional().nullable() });

export type StaffShiftAssignment = z.infer<typeof StaffShiftAssignmentSchema>;

/** shift_assignments — 날짜별 근무표 배정 (운영 실컬럼: id, staff_id, work_date, shift_id, company_name, shift_name) */
const DateShiftAssignmentRowSchema = z.object({
  staff_id: z.string(),
  work_date: z.string().optional().nullable(),
  shift_id: z.string().optional().nullable() });

const StaffLegacyRowSchema = z.object({
  id: z.string(),
  shift_id: z.string().optional().nullable() });

// ---------------------------------------------------------------------------
// 반환 타입
// ---------------------------------------------------------------------------

// 'attendance' 는 근태기록에서 shift_id 를 읽던 시절의 값. 근태 테이블에는 그 컬럼이
// 없어 실제로는 한 번도 반환된 적이 없다. 날짜별 배정은 'assignment' 로 구분한다.
export type ShiftResolutionSource = 'assignment' | 'attendance' | 'primary' | 'legacy' | 'none';

export type ResolvedShift = {
  shiftId: string | null;
  isPrimary: boolean;
  source: ShiftResolutionSource;
};

export type StaffShiftEntry = {
  shiftId: string;
  isPrimary: boolean;
  priority: number;
};

// ---------------------------------------------------------------------------
// getStaffShifts — 단일 직원의 모든 근무유형 조회
// ---------------------------------------------------------------------------

export async function getStaffShifts(staffId: string): Promise<StaffShiftEntry[]> {
  const safeId = z.string().min(1).parse(staffId);

  const { data, error } = await db
    .from('staff_shift_assignments')
    .select('shift_id, is_primary, priority')
    .eq('staff_id', safeId)
    .order('priority', { ascending: true });

  if (error) {
    // 테이블 미존재 등 호환 에러 시 빈 배열 반환 (legacy 폴백은 호출자가 처리)
    return [];
  }

  const rows = z.array(StaffShiftAssignmentSchema.partial()).safeParse(data ?? []);
  if (!rows.success) return [];

  return rows.data
    .filter((row): row is { shift_id: string; is_primary?: boolean | null; priority?: number | null } =>
      typeof row.shift_id === 'string' && row.shift_id.length > 0,
    )
    .map((row) => ({
      shiftId: row.shift_id as string,
      isPrimary: row.is_primary === true,
      priority: typeof row.priority === 'number' ? row.priority : 999 }));
}

// ---------------------------------------------------------------------------
// getPrimaryShift — 단일 직원의 주근무유형 ID
// ---------------------------------------------------------------------------

export async function getPrimaryShift(staffId: string): Promise<string | null> {
  const safeId = z.string().min(1).parse(staffId);

  // 1. staff_shift_assignments에서 is_primary=TRUE 조회
  const { data: primaryData } = await db
    .from('staff_shift_assignments')
    .select('shift_id')
    .eq('staff_id', safeId)
    .eq('is_primary', true)
    .maybeSingle();

  const primaryShiftId = (primaryData as { shift_id?: string | null } | null)?.shift_id;
  if (primaryShiftId) return primaryShiftId;

  // 2. legacy — staff_members.shift_id
  const { data: staffData } = await db
    .from('staff_members')
    .select('id, shift_id')
    .eq('id', safeId)
    .maybeSingle();

  const parsed = StaffLegacyRowSchema.safeParse(staffData);
  if (parsed.success) return parsed.data.shift_id ?? null;

  return null;
}

// ---------------------------------------------------------------------------
// getStaffShiftsBatch — 여러 직원의 근무유형을 한 번에 조회 (N+1 방지)
// ---------------------------------------------------------------------------

export async function getStaffShiftsBatch(
  staffIds: string[],
): Promise<Map<string, StaffShiftEntry[]>> {
  const result = new Map<string, StaffShiftEntry[]>();
  if (staffIds.length === 0) return result;

  const safeIds = z.array(z.string().min(1)).parse(staffIds);

  const { data, error } = await db
    .from('staff_shift_assignments')
    .select('staff_id, shift_id, is_primary, priority')
    .in('staff_id', safeIds)
    .order('priority', { ascending: true });

  if (!error && Array.isArray(data)) {
    const rows = z.array(StaffShiftAssignmentSchema.partial()).safeParse(data);
    if (rows.success) {
      for (const row of rows.data) {
        if (!row.staff_id || !row.shift_id) continue;
        const entry: StaffShiftEntry = {
          shiftId: row.shift_id,
          isPrimary: row.is_primary === true,
          priority: typeof row.priority === 'number' ? row.priority : 999 };
        const existing = result.get(row.staff_id) ?? [];
        existing.push(entry);
        result.set(row.staff_id, existing);
      }
    }
  }

  // legacy 폴백: staff_shift_assignments에 데이터 없는 직원은 staff_members.shift_id로 채움
  const missingIds = safeIds.filter((id) => !result.has(id) || result.get(id)!.length === 0);
  if (missingIds.length > 0) {
    const { data: legacyData } = await db
      .from('staff_members')
      .select('id, shift_id')
      .in('id', missingIds);

    const legacyRows = z.array(StaffLegacyRowSchema).safeParse(legacyData ?? []);
    if (legacyRows.success) {
      for (const row of legacyRows.data) {
        if (!row.shift_id) continue;
        result.set(row.id, [
          {
            shiftId: row.shift_id,
            isPrimary: true,
            priority: 0 },
        ]);
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// getPrimaryShiftBatch — 여러 직원의 주근무유형 ID만 조회 (N+1 방지)
// ---------------------------------------------------------------------------

export async function getPrimaryShiftBatch(
  staffIds: string[],
): Promise<Map<string, string | null>> {
  const batchMap = await getStaffShiftsBatch(staffIds);
  const result = new Map<string, string | null>();

  for (const [staffId, entries] of batchMap.entries()) {
    const primary = entries.find((e) => e.isPrimary) ?? entries[0] ?? null;
    result.set(staffId, primary ? primary.shiftId : null);
  }

  // staffId가 batchMap에 없으면 null
  for (const id of staffIds) {
    if (!result.has(id)) result.set(id, null);
  }

  return result;
}

// ---------------------------------------------------------------------------
// resolveShiftForDate — 날짜 기준 근무유형 해석 (가장 정확한 단일 ID 반환)
// ---------------------------------------------------------------------------

export async function resolveShiftForDate(
  staffId: string,
  date: string,
): Promise<ResolvedShift> {
  const safeId = z.string().min(1).parse(staffId);
  const safeDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(date);

  // 1. 날짜별 근무표 배정(shift_assignments)
  //    예전 코드는 attendances/attendance 의 shift_id 를 읽었지만 두 테이블 모두
  //    그런 컬럼이 없어 이 단계가 항상 헛돌았다. 날짜별 배정의 실테이블은 여기다.
  const { data: assignData, error: assignError } = await db
    .from('shift_assignments')
    .select('staff_id, work_date, shift_id')
    .eq('staff_id', safeId)
    .eq('work_date', safeDate)
    .order('created_at', { ascending: false })
    .limit(1);

  if (!assignError) {
    const assignRow = (assignData as unknown[] | null | undefined)?.[0];
    const assignParsed = DateShiftAssignmentRowSchema.safeParse(assignRow);
    if (assignParsed.success && assignParsed.data.shift_id) {
      return { shiftId: assignParsed.data.shift_id, isPrimary: false, source: 'assignment' };
    }
  }

  // 2. staff_shift_assignments is_primary=TRUE
  const primaryShiftId = await getPrimaryShift(safeId);
  if (primaryShiftId) {
    return { shiftId: primaryShiftId, isPrimary: true, source: 'primary' };
  }

  // 3. legacy staff_members.shift_id (getPrimaryShift 내부에서 이미 조회하므로 여기선 none)
  return { shiftId: null, isPrimary: false, source: 'none' };
}
