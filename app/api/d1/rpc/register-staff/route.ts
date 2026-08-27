// ============================================================
// app/api/d1/rpc/register-staff/route.ts
// db.rpc('register_staff_full', { p_staff, p_licenses, p_job_cats,
//   p_shift_asgns, p_leave_year, p_leave_total }) 대체 라우트.
//
// lib/db/functions/staff.ts의 registerStaffFull을 호출.
// D1 batch로 5단계 INSERT를 원자적으로 실행.
//
// 요청 형식:
//   POST /api/d1/rpc/register-staff
//   body: {
//     p_staff: StaffRow,
//     p_licenses?: LicenseRow[],
//     p_job_cats?: JobCategoryRow[],
//     p_shift_asgns?: ShiftAssignmentRow[],
//     p_leave_year: number,
//     p_leave_total: number,
//   }
//
// 응답:
//   { ok: true, data: { staff_id: string } }
//   { ok: false, error: string }
//
// 권한: admin, mso, hr 권한 보유자만 (직원 등록 기능).
//       단, 등록자보다 높은 권한의 계정은 만들 수 없다 — findPrivilegeEscalation 참조.
// ============================================================
import { NextResponse } from 'next/server';
import { userId } from '@/lib/d1-api-helpers';
import { z } from 'zod';
import {
  readSessionFromRequest,
  isAdminSession,
  isSystemMasterSession,
  type SessionUser,
} from '@/lib/server-session';
import { getD1Binding, getD1Drizzle } from '@/lib/db';
import { registerStaffFull } from '@/lib/db/functions/staff';
import { SYSTEM_MASTER_ACCOUNT_ID } from '@/lib/system-master';

export const dynamic = 'force-dynamic';

// ─── 인자 스키마 (Supabase RPC 인자 이름 그대로 유지) ───────────────────────

const StaffRowSchema = z.object({
  name: z.string().min(1),
  employee_no: z.string().min(1),
  company: z.string().min(1),
  phone: z.string().nullable().optional(),
  department: z.string().nullable().optional(),
  position: z.string().nullable().optional(),
  resident_no: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  bank_account: z.string().nullable().optional(),
  salary_info: z.string().nullable().optional(),
  joined_at: z.string().nullable().optional(),
  join_date: z.string().nullable().optional(),
  resigned_at: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  shift_id: z.string().nullable().optional(),
  license: z.string().nullable().optional(),
  permissions: z.record(z.string(), z.unknown()).nullable().optional(),
  working_hours_per_week: z.number().nullable().optional(),
  working_days_per_week: z.number().nullable().optional(),
  base_salary: z.number().nullable().optional(),
  meal_allowance: z.number().nullable().optional(),
  night_duty_allowance: z.number().nullable().optional(),
  vehicle_allowance: z.number().nullable().optional(),
  childcare_allowance: z.number().nullable().optional(),
  research_allowance: z.number().nullable().optional(),
  other_taxfree: z.number().nullable().optional(),
  position_allowance: z.number().nullable().optional(),
  overtime_allowance: z.number().nullable().optional(),
  night_work_allowance: z.number().nullable().optional(),
  holiday_work_allowance: z.number().nullable().optional(),
  annual_leave_pay: z.number().nullable().optional(),
  role: z.string().nullable().optional() });

const LicenseRowSchema = z.object({
  license_type: z.string().nullable().optional(),
  license_name: z.string().nullable().optional(),
  license_number: z.string().nullable().optional(),
  issued_date: z.string().nullable().optional(),
  expiry_date: z.string().nullable().optional(),
  issuing_body: z.string().nullable().optional(),
  memo: z.string().nullable().optional(),
  is_primary: z.boolean().nullable().optional() });

const JobCategoryRowSchema = z.object({
  job_category_id: z.string().min(1),
  is_primary: z.boolean().nullable().optional() });

const ShiftAssignmentRowSchema = z.object({
  shift_id: z.string().min(1),
  is_primary: z.boolean().nullable().optional(),
  priority: z.number().nullable().optional() });

const BodySchema = z.object({
  p_staff: StaffRowSchema,
  p_licenses: z.array(LicenseRowSchema).optional(),
  p_job_cats: z.array(JobCategoryRowSchema).optional(),
  p_shift_asgns: z.array(ShiftAssignmentRowSchema).optional(),
  p_leave_year: z.number().int().min(2000).max(2100),
  p_leave_total: z.number().min(0).max(365) });

// ─── 유틸 ───────────────────────────────────────────────────────────────────

function hasHrPermission(user: SessionUser | null | undefined): boolean {
  if (!user) return false;
  const perms = (user.permissions ?? {}) as Record<string, unknown>;
  return Boolean(
    user.role === 'admin' ||
    perms.admin ||
    perms.mso ||
    perms.hr,
  );
}

/**
 * 관리자만 부여할 수 있는 권한 키. `system_master` 는 시스템마스터만 부여할 수 있다.
 */
const ADMIN_ONLY_PERMISSION_KEYS = new Set(['admin', 'mso', 'hr']);
/** 관리자 계정으로 취급되는 role 값 */
const ADMIN_ROLES = new Set(['admin']);
const SYSTEM_MASTER_ROLES = new Set(['system_master', 'master']);

/**
 * 등록자가 **자기보다 높은 권한의 계정을 만들지 못하게** 막는다.
 *
 * 이 라우트는 hr 권한만 있으면 통과하는데, 저장되는 role·permissions·employee_no 를
 * 전부 요청 본문에서 그대로 받아 썼다. 그래서 인사담당자가
 *   - `role: 'admin'` 또는 `permissions: { admin: true }` 로 관리자 계정을,
 *   - `employee_no: '9999'` 로 시스템마스터 계정을
 * 만들 수 있었다. 특히 employee_no 는 lib/d1-api-helpers.ts 의 userId() 가
 * '9999' 를 시스템마스터 신원으로 되돌려주므로, 권한 객체를 손대지 않아도
 * D1 게이트웨이가 그 계정을 시스템마스터로 인식한다.
 *
 * 조용히 강등하지 않고 거부한다 — 권한을 넘겨 요청한 것 자체가 드러나야 한다.
 *
 * @returns 위반 사유. 문제가 없으면 null.
 */
/** 이 키들은 값이 truthy 이기만 하면 그 계정이 관리자로 취급된다. */
function isPrivilegedPermissionKey(key: string): boolean {
  return key === 'system_master' || ADMIN_ONLY_PERMISSION_KEYS.has(key);
}

/**
 * 권한 상승 키만 boolean 으로 못 박는다.
 *
 * 저장된 permissions 는 그대로 세션 권한이 되는데(lib/server-session.ts 가
 * staff_members.permissions 를 실어 온다) 읽는 쪽 판정이 전부 truthy 라
 * `admin: 1` 도 관리자로 인정된다. 검사를 통과한 값이라도 형태를 맞춰 둔다.
 *
 * **전체 키를 Boolean() 하면 안 된다.** permissions 에는 권한 플래그만
 * 있는 게 아니라 profile_photo_path(문자열)·probation_months(숫자)·
 * payroll_allowances(객체) 같은 데이터가 함께 들어 있다(운영 실측 2026-08-27).
 * 일괄 변환하면 사진 경로와 급여 데이터가 통째로 파괴된다.
 */
function normalizePrivilegeFlags(
  permissions: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null | undefined {
  if (!permissions || typeof permissions !== 'object') return permissions;
  const next: Record<string, unknown> = { ...permissions };
  for (const key of Object.keys(next)) {
    if (isPrivilegedPermissionKey(key)) next[key] = Boolean(next[key]);
  }
  return next;
}

function findPrivilegeEscalation(
  staff: z.infer<typeof StaffRowSchema>,
  actor: SessionUser,
): string | null {
  const actorIsAdmin = isAdminSession(actor);
  const actorIsSystemMaster = isSystemMasterSession(actor);
  const actorPerms = (actor.permissions ?? {}) as Record<string, unknown>;

  if (String(staff.employee_no).trim() === SYSTEM_MASTER_ACCOUNT_ID && !actorIsSystemMaster) {
    return `사번 ${SYSTEM_MASTER_ACCOUNT_ID} 는 시스템마스터 전용입니다.`;
  }

  const role = String(staff.role ?? '').trim();
  if (SYSTEM_MASTER_ROLES.has(role) && !actorIsSystemMaster) {
    return `role '${role}' 은 시스템마스터만 부여할 수 있습니다.`;
  }
  if (ADMIN_ROLES.has(role) && !actorIsAdmin) {
    return `role '${role}' 은 관리자만 부여할 수 있습니다.`;
  }

  for (const [key, value] of Object.entries(staff.permissions ?? {})) {
    // 권한 상승 키(system_master·admin·mso·hr)는 **truthy 면 전부** 잡는다.
    //
    // 예전에는 루프 첫 줄이 `if (value !== true) continue;` 였다. 그래서
    // `{admin: 1}` 처럼 true 가 아닌 truthy 값이 아래 검사에 도달조차 못 했고,
    // 저장은 JSON.stringify 로 정제 없이 들어가는데 읽는 쪽은 전부 truthy
    // 판정(`perms.admin || perms.mso || ...`)이라 그대로 관리자가 됐다.
    // 인사담당자가 요청 한 번으로 관리자 계정을 만들 수 있었다(9차 P0-D01-003).
    if (isPrivilegedPermissionKey(key)) {
      if (!value) continue; // 명시적으로 끈 것은 부여가 아니다
      if (key === 'system_master') {
        if (!actorIsSystemMaster) return `권한 '${key}' 은 시스템마스터만 부여할 수 있습니다.`;
        continue;
      }
      if (!actorIsAdmin) return `권한 '${key}' 은 관리자만 부여할 수 있습니다.`;
      continue;
    }

    // 나머지 키는 `=== true` 판정을 유지한다.
    //
    // permissions 는 권한 플래그만 담긴 객체가 아니다 — 운영 실측(2026-08-27):
    // boolean 2,405개(권한 150종) 외에 string 540개(profile_photo_path·bank_name 등),
    // object 196개(insurance·payroll_allowances), number 112개(probation_months·
    // probation_percent·is_group_account)가 같은 객체에 섞여 있다.
    // 여기서 truthy 로 넓히면 `probation_months: 3` 같은 **데이터 값**이 권한
    // 부여로 오인돼, 수습기간이 있는 직원 등록이 통째로 403 이 된다.
    if (value !== true) continue;
    // 일반 권한은 등록자가 실제로 가진 것만 넘겨줄 수 있다.
    if (!actorIsAdmin && actorPerms[key] !== true) {
      return `본인에게 없는 권한 '${key}' 은 부여할 수 없습니다.`;
    }
  }

  // 소속: 관리자가 아니면 자기 회사에만 등록할 수 있다.
  const actorCompany = String(actor.company ?? '').trim();
  const targetCompany = String(staff.company ?? '').trim();
  if (!actorIsAdmin && actorCompany && targetCompany !== actorCompany) {
    return `다른 소속(${targetCompany})으로는 등록할 수 없습니다.`;
  }

  return null;
}

// ─── 핸들러 ─────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const session = await readSessionFromRequest(request);
    const actor = session?.user;
    const uid = userId(actor);
    if (!uid || !actor) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (!hasHrPermission(actor)) {
      return NextResponse.json(
        { ok: false, error: 'Permission denied: hr/admin required' },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    // 검사와 저장이 같은 값을 보게 한다 — 권한 상승 키만 boolean 으로 못 박고
    // 나머지(사진 경로·수습개월수 등 데이터)는 그대로 둔다.
    const staffPayload = {
      ...parsed.data.p_staff,
      permissions: normalizePrivilegeFlags(parsed.data.p_staff.permissions),
    };

    const escalation = findPrivilegeEscalation(staffPayload, actor);
    if (escalation) {
      return NextResponse.json({ ok: false, error: escalation }, { status: 403 });
    }

    const d1 = await getD1Binding();
    if (!d1) {
      return NextResponse.json(
        { ok: false, error: 'D1 binding not available' },
        { status: 500 },
      );
    }
    const db = getD1Drizzle(d1);

    // 호출자가 staff_id를 미리 생성 (registerStaffFull 주석 참조)
    const staffId = crypto.randomUUID();

    const data = await registerStaffFull(db, staffId, {
      staff: staffPayload,
      licenses: parsed.data.p_licenses,
      job_categories: parsed.data.p_job_cats,
      shift_assignments: parsed.data.p_shift_asgns,
      leave_year: parsed.data.p_leave_year,
      leave_total: parsed.data.p_leave_total });

    return NextResponse.json({ ok: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
