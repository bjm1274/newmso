// ============================================================
// lib/db/functions/staff.ts
// register_staff_full RPC의 TypeScript 포트.
//
// 원본: supabase/migrations/2026-05-11_010_register_staff_rpc.sql
// PostgreSQL 함수가 했던 5단계 INSERT를 D1 batch로 묶어 원자성을 보존.
//   1) staff_members
//   2) staff_licenses (여러 row)
//   3) staff_job_categories (여러 row)
//   4) staff_shift_assignments (여러 row)
//   5) leave_balances 초기 row 1건
// ============================================================

import { sql } from 'drizzle-orm';
import type { D1Client } from '../client-d1';
import {
  staff_members,
  staff_licenses,
  staff_job_categories,
  staff_shift_assignments,
  leave_balances,
} from '../schema';

// ─────────────────────────────────────────────────────────────
// 입력 타입 — Supabase RPC 호출 측과 호환되는 키 이름 유지
// ─────────────────────────────────────────────────────────────
export interface RegisterStaffInput {
  staff: StaffRow;
  licenses?: LicenseRow[];
  job_categories?: JobCategoryRow[];
  shift_assignments?: ShiftAssignmentRow[];
  leave_year: number;
  leave_total: number;
}

export interface StaffRow {
  name: string;
  phone?: string | null;
  company: string;
  department?: string | null;
  position?: string | null;
  resident_no?: string | null;
  email?: string | null;
  address?: string | null;
  bank_account?: string | null;
  salary_info?: string | null;
  joined_at?: string | null;
  join_date?: string | null;
  resigned_at?: string | null;
  status?: string | null;
  shift_id?: string | null;
  license?: string | null;
  permissions?: Record<string, unknown> | null;
  working_hours_per_week?: number | null;
  working_days_per_week?: number | null;
  base_salary?: number | null;
  meal_allowance?: number | null;
  night_duty_allowance?: number | null;
  vehicle_allowance?: number | null;
  childcare_allowance?: number | null;
  research_allowance?: number | null;
  other_taxfree?: number | null;
  position_allowance?: number | null;
  overtime_allowance?: number | null;
  night_work_allowance?: number | null;
  holiday_work_allowance?: number | null;
  annual_leave_pay?: number | null;
  role?: string | null;
  employee_no: string;
}

export interface LicenseRow {
  license_type?: string | null;
  license_name?: string | null;
  license_number?: string | null;
  issued_date?: string | null;
  expiry_date?: string | null;
  issuing_body?: string | null;
  memo?: string | null;
  is_primary?: boolean | null;
}

export interface JobCategoryRow {
  job_category_id: string;
  is_primary?: boolean | null;
}

export interface ShiftAssignmentRow {
  shift_id: string;
  is_primary?: boolean | null;
  priority?: number | null;
}

export interface RegisterStaffResult {
  staff_id: string;
  ok: true;
}

// ─────────────────────────────────────────────────────────────
// 유틸: 빈 문자열 → null, boolean → 0|1
// ─────────────────────────────────────────────────────────────
function nullIfEmpty(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const trimmed = String(v).trim();
  return trimmed === '' ? null : trimmed;
}

function bnum(v: boolean | null | undefined): number {
  return v === true ? 1 : 0;
}

function numOrZero(v: number | null | undefined): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function addOneYearISO(dateStr: string): string {
  // YYYY-MM-DD 입력 가정, 그 외는 그대로 + ' + 1 year' fallback 불가능 → throw 대신 null 처리
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!m) return dateStr;
  const y = Number(m[1]);
  return `${y + 1}-${m[2]}-${m[3]}`;
}

function defaultExpiryDate(joinedAt: string | null | undefined, leaveYear: number): string {
  const j = nullIfEmpty(joinedAt);
  if (j) return addOneYearISO(j);
  return `${leaveYear}-12-31`;
}

// ─────────────────────────────────────────────────────────────
// 본함수
// ─────────────────────────────────────────────────────────────

/**
 * register_staff_full TS 포트.
 *
 * D1은 진짜 트랜잭션이 아닌 batch만 제공. batch 내부의 statement는
 * 모두 성공해야 commit되므로 원자성은 RPC와 동일하게 보장됨.
 *
 * 호출자가 staff_id를 미리 생성해 전달해야 함 (D1 batch는 RETURNING으로
 * 후속 statement에 값을 넘길 수 없기 때문). crypto.randomUUID() 권장.
 */
export async function registerStaffFull(
  db: D1Client,
  staffId: string,
  input: RegisterStaffInput,
): Promise<RegisterStaffResult> {
  const s = input.staff;
  const expiry = defaultExpiryDate(s.joined_at, input.leave_year);

  // 빈 license row (모든 필드 비어 있음) 제외
  const licenses = (input.licenses ?? []).filter((row) => {
    return (
      nullIfEmpty(row.license_type) !== null ||
      nullIfEmpty(row.license_name) !== null ||
      nullIfEmpty(row.license_number) !== null
    );
  });

  const jobCats = input.job_categories ?? [];
  const shiftAsgns = input.shift_assignments ?? [];

  // ─── 1) staff_members INSERT
  const staffInsert = db.insert(staff_members).values({
    id: staffId,
    employee_no: s.employee_no,
    name: s.name,
    company: s.company,
    phone: nullIfEmpty(s.phone),
    department: nullIfEmpty(s.department),
    position: nullIfEmpty(s.position),
    resident_no: nullIfEmpty(s.resident_no),
    email: nullIfEmpty(s.email),
    address: nullIfEmpty(s.address),
    bank_account: nullIfEmpty(s.bank_account),
    salary_info: nullIfEmpty(s.salary_info),
    joined_at: nullIfEmpty(s.joined_at),
    join_date: nullIfEmpty(s.join_date),
    resigned_at: nullIfEmpty(s.resigned_at),
    status: s.status ?? '재직',
    shift_id: nullIfEmpty(s.shift_id),
    license: s.license ?? null,
    permissions: JSON.stringify(s.permissions ?? {}),
    working_hours_per_week: s.working_hours_per_week ?? null,
    working_days_per_week: s.working_days_per_week ?? null,
    base_salary: numOrZero(s.base_salary),
    meal_allowance: numOrZero(s.meal_allowance),
    night_duty_allowance: numOrZero(s.night_duty_allowance),
    vehicle_allowance: numOrZero(s.vehicle_allowance),
    childcare_allowance: numOrZero(s.childcare_allowance),
    research_allowance: numOrZero(s.research_allowance),
    other_taxfree: numOrZero(s.other_taxfree),
    position_allowance: numOrZero(s.position_allowance),
    overtime_allowance: numOrZero(s.overtime_allowance),
    night_work_allowance: numOrZero(s.night_work_allowance),
    holiday_work_allowance: numOrZero(s.holiday_work_allowance),
    annual_leave_pay: numOrZero(s.annual_leave_pay),
    annual_leave_total: 0,
    annual_leave_used: 0,
    role: s.role ?? 'staff',
  });

  // ─── 2) staff_licenses INSERT (여러 row, ON CONFLICT DO NOTHING)
  const licenseStmts = licenses.map((row) =>
    db
      .insert(staff_licenses)
      .values({
        id: crypto.randomUUID(),
        staff_id: staffId,
        license_type: nullIfEmpty(row.license_type),
        license_name: nullIfEmpty(row.license_name),
        license_number: nullIfEmpty(row.license_number),
        issued_date: nullIfEmpty(row.issued_date),
        expiry_date: nullIfEmpty(row.expiry_date),
        issuing_body: nullIfEmpty(row.issuing_body),
        memo: nullIfEmpty(row.memo),
        is_primary: bnum(row.is_primary),
      })
      .onConflictDoNothing(),
  );

  // ─── 3) staff_job_categories INSERT (ON CONFLICT (staff_id, job_category_id) DO UPDATE)
  const jobStmts = jobCats.map((row) =>
    db
      .insert(staff_job_categories)
      .values({
        id: crypto.randomUUID(),
        staff_id: staffId,
        job_category_id: row.job_category_id,
        is_primary: bnum(row.is_primary),
      })
      .onConflictDoUpdate({
        target: [staff_job_categories.staff_id, staff_job_categories.job_category_id],
        set: { is_primary: sql`excluded.is_primary` },
      }),
  );

  // ─── 4) staff_shift_assignments INSERT
  const shiftStmts = shiftAsgns.map((row) =>
    db
      .insert(staff_shift_assignments)
      .values({
        id: crypto.randomUUID(),
        staff_id: staffId,
        shift_id: row.shift_id,
        is_primary: bnum(row.is_primary),
        priority: row.priority ?? 0,
      })
      .onConflictDoUpdate({
        target: [staff_shift_assignments.staff_id, staff_shift_assignments.shift_id],
        set: {
          is_primary: sql`excluded.is_primary`,
          priority: sql`excluded.priority`,
        },
      }),
  );

  // ─── 5) leave_balances 초기 row (ON CONFLICT (staff_id, year) DO NOTHING)
  const total = numOrZero(input.leave_total);
  const leaveStmt = db
    .insert(leave_balances)
    .values({
      id: crypto.randomUUID(),
      staff_id: staffId,
      year: input.leave_year,
      total_days: total,
      used_days: 0,
      remaining_days: total,
      expiry_date: expiry,
    })
    .onConflictDoNothing();

  // ─── batch — D1은 단일 atomic write로 실행
  const statements = [
    staffInsert,
    ...licenseStmts,
    ...jobStmts,
    ...shiftStmts,
    leaveStmt,
  ];

  // batch는 최소 1개의 statement를 요구. staffInsert가 항상 있어 안전.
  // drizzle-orm/d1의 batch 타입은 [first, ...rest] 형태
  const [first, ...rest] = statements;
  await db.batch([first, ...rest] as unknown as Parameters<typeof db.batch>[0]);

  return { staff_id: staffId, ok: true };
}
