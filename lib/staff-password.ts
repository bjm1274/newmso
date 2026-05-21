import bcrypt from 'bcryptjs';
import { isMissingColumnError } from '@/lib/supabase-compat';
import {
  resolveDataBackend,
  getD1Binding,
  getD1Drizzle,
  staff_members as staffMembersTable,
  eq,
} from '@/lib/db';

export type StaffCredentialRow = {
  id: string;
  name?: string | null;
  employee_no?: string | null;
  password?: string | null;
  passwd?: string | null;
};

export const STAFF_PASSWORD_BASE_SELECT = 'id, name, employee_no';
export const STAFF_PASSWORD_SELECT = `${STAFF_PASSWORD_BASE_SELECT}, password, passwd`;

export function pickStoredPassword(staff: { password?: string | null; passwd?: string | null } | null) {
  const password = String(staff?.password ?? '').trim();
  if (password) return password;
  return String(staff?.passwd ?? '').trim();
}

export async function verifyStoredPassword(storedPassword: string, inputPassword: string) {
  if (!storedPassword) {
    return { ok: false, needsHashUpgrade: false };
  }

  if (storedPassword.startsWith('$2')) {
    return {
      ok: await bcrypt.compare(inputPassword, storedPassword),
      needsHashUpgrade: false,
    };
  }

  return {
    ok: storedPassword === inputPassword,
    needsHashUpgrade: storedPassword === inputPassword,
  };
}

// ----------------------------------------------------------------
// D1 전용 헬퍼 — staff_members 비밀번호 컬럼 직접 조회/갱신
// ----------------------------------------------------------------

/** D1에서 staff_members 비밀번호 행 1건 조회 (by id) */
export async function selectStaffCredentialByIdD1(staffId: string): Promise<StaffCredentialRow | null> {
  const d1 = await getD1Binding();
  if (!d1) throw new Error('[staff-password] D1 binding not available (selectStaffCredentialByIdD1)');
  const db = getD1Drizzle(d1);
  const rows = await db
    .select({
      id: staffMembersTable.id,
      name: staffMembersTable.name,
      employee_no: staffMembersTable.employee_no,
      password: staffMembersTable.password,
      passwd: staffMembersTable.passwd,
    })
    .from(staffMembersTable)
    .where(eq(staffMembersTable.id, staffId))
    .limit(1);
  const row = rows[0] ?? null;
  if (!row) return null;
  return {
    id: String(row.id),
    name: row.name ?? null,
    employee_no: row.employee_no ?? null,
    password: row.password ?? null,
    passwd: row.passwd ?? null,
  };
}

/** D1에서 staff_members 비밀번호 행 목록 조회 (by employee_no) */
export async function selectStaffCredentialsByEmployeeNoD1(employeeNo: string): Promise<StaffCredentialRow[]> {
  const d1 = await getD1Binding();
  if (!d1) throw new Error('[staff-password] D1 binding not available (selectStaffCredentialsByEmployeeNoD1)');
  const db = getD1Drizzle(d1);
  const rows = await db
    .select({
      id: staffMembersTable.id,
      name: staffMembersTable.name,
      employee_no: staffMembersTable.employee_no,
      password: staffMembersTable.password,
      passwd: staffMembersTable.passwd,
    })
    .from(staffMembersTable)
    .where(eq(staffMembersTable.employee_no, employeeNo))
    .limit(3);
  return rows.map((row) => ({
    id: String(row.id),
    name: row.name ?? null,
    employee_no: row.employee_no ?? null,
    password: row.password ?? null,
    passwd: row.passwd ?? null,
  }));
}

/** D1에서 staff_members 비밀번호 행 목록 조회 (by name) */
export async function selectStaffCredentialsByNameD1(name: string): Promise<StaffCredentialRow[]> {
  const d1 = await getD1Binding();
  if (!d1) throw new Error('[staff-password] D1 binding not available (selectStaffCredentialsByNameD1)');
  const db = getD1Drizzle(d1);
  const rows = await db
    .select({
      id: staffMembersTable.id,
      name: staffMembersTable.name,
      employee_no: staffMembersTable.employee_no,
      password: staffMembersTable.password,
      passwd: staffMembersTable.passwd,
    })
    .from(staffMembersTable)
    .where(eq(staffMembersTable.name, name))
    .limit(5);
  return rows.map((row) => ({
    id: String(row.id),
    name: row.name ?? null,
    employee_no: row.employee_no ?? null,
    password: row.password ?? null,
    passwd: row.passwd ?? null,
  }));
}

// ----------------------------------------------------------------
// Supabase 경로 — dual-write/supabase 모드용 (절대 삭제 금지)
// ----------------------------------------------------------------

export async function updateStaffPasswordWithFallback(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  staffId: string,
  rawPassword: string
) {
  const passwordHash = await bcrypt.hash(rawPassword, 10);

  const backend = await resolveDataBackend();
  if (backend === 'd1') {
    const d1 = await getD1Binding();
    if (!d1) throw new Error('[staff-password] D1 binding not available (updateStaffPasswordWithFallback)');
    const db = getD1Drizzle(d1);
    await db
      .update(staffMembersTable)
      .set({ password: passwordHash })
      .where(eq(staffMembersTable.id, staffId));
    return { error: null, updatedColumn: 'password' as const, passwordHash };
  }

  // Supabase 경로 (dual-write / supabase 모드)
  const passwordUpdate = await supabase
    .from('staff_members')
    .update({ password: passwordHash })
    .eq('id', staffId);

  if (!passwordUpdate.error) {
    return { error: null, updatedColumn: 'password' as const, passwordHash };
  }

  if (!isMissingColumnError(passwordUpdate.error, 'password')) {
    return { error: passwordUpdate.error, updatedColumn: null, passwordHash: null };
  }

  const passwdUpdate = await supabase
    .from('staff_members')
    .update({ passwd: passwordHash })
    .eq('id', staffId);

  if (passwdUpdate.error) {
    return { error: passwdUpdate.error, updatedColumn: null, passwordHash: null };
  }

  return { error: null, updatedColumn: 'passwd' as const, passwordHash };
}

export async function clearStaffPasswordWithFallback(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  staffId: string
) {
  const backend = await resolveDataBackend();
  if (backend === 'd1') {
    const d1 = await getD1Binding();
    if (!d1) throw new Error('[staff-password] D1 binding not available (clearStaffPasswordWithFallback)');
    const db = getD1Drizzle(d1);
    await db
      .update(staffMembersTable)
      .set({ password: null, passwd: null })
      .where(eq(staffMembersTable.id, staffId));
    return { error: null, clearedColumns: ['password', 'passwd'] as string[] };
  }

  // Supabase 경로 (dual-write / supabase 모드)
  let clearedPassword = false;
  let clearedPasswd = false;

  const passwordUpdate = await supabase
    .from('staff_members')
    .update({ password: null })
    .eq('id', staffId);

  if (!passwordUpdate.error) {
    clearedPassword = true;
  } else if (!isMissingColumnError(passwordUpdate.error, 'password')) {
    return { error: passwordUpdate.error, clearedColumns: [] as string[] };
  }

  const passwdUpdate = await supabase
    .from('staff_members')
    .update({ passwd: null })
    .eq('id', staffId);

  if (!passwdUpdate.error) {
    clearedPasswd = true;
  } else if (!isMissingColumnError(passwdUpdate.error, 'passwd')) {
    return { error: passwdUpdate.error, clearedColumns: [] as string[] };
  }

  return {
    error: null,
    clearedColumns: [
      ...(clearedPassword ? ['password'] : []),
      ...(clearedPasswd ? ['passwd'] : []),
    ],
  };
}

/**
 * Supabase 경로 전용 — `withMissingColumnsFallback` 패턴으로 컬럼 누락을 허용하며 조회.
 * d1 모드에서는 D1 전용 헬퍼(selectStaffCredentialByIdD1 등)를 직접 사용할 것.
 */
export async function selectStaffPasswordRowsWithFallback<T = StaffCredentialRow[]>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  runSelect: (selectClause: string) => PromiseLike<{ data: any; error: any }>
): Promise<{ data: T | null; error: unknown }> {
  const selectClauses = [
    STAFF_PASSWORD_SELECT,
    `${STAFF_PASSWORD_BASE_SELECT}, password`,
    `${STAFF_PASSWORD_BASE_SELECT}, passwd`,
  ];

  let lastError: unknown = null;

  for (const selectClause of selectClauses) {
    const result = await runSelect(selectClause);
    if (!result.error) {
      return result;
    }

    lastError = result.error;
    const passwordMissing = isMissingColumnError(result.error, 'password');
    const passwdMissing = isMissingColumnError(result.error, 'passwd');
    if (!passwordMissing && !passwdMissing) {
      return result;
    }
  }

  return { data: null, error: lastError };
}
