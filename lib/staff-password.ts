import bcrypt from 'bcryptjs';
import {
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
// 비밀번호 갱신/초기화 — D1 전용
// ----------------------------------------------------------------

type UpdatePasswordResult = {
  error: Error | null;
  updatedColumn: 'password' | null;
  passwordHash: string | null;
};

type ClearPasswordResult = {
  error: Error | null;
  clearedColumns: string[];
};

export async function updateStaffPasswordWithFallback(
  staffId: string,
  rawPassword: string
): Promise<UpdatePasswordResult> {
  const passwordHash = await bcrypt.hash(rawPassword, 10);

  const d1 = await getD1Binding();
  if (!d1) throw new Error('[staff-password] D1 binding not available (updateStaffPasswordWithFallback)');
  const db = getD1Drizzle(d1);
  await db
    .update(staffMembersTable)
    .set({ password: passwordHash })
    .where(eq(staffMembersTable.id, staffId));
  return { error: null, updatedColumn: 'password', passwordHash };
}

export async function clearStaffPasswordWithFallback(staffId: string): Promise<ClearPasswordResult> {
  const d1 = await getD1Binding();
  if (!d1) throw new Error('[staff-password] D1 binding not available (clearStaffPasswordWithFallback)');
  const db = getD1Drizzle(d1);
  await db
    .update(staffMembersTable)
    .set({ password: null, passwd: null })
    .where(eq(staffMembersTable.id, staffId));
  return { error: null, clearedColumns: ['password', 'passwd'] };
}
