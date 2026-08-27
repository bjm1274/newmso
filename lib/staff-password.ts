import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import {
  getD1Binding,
  getD1Drizzle,
  staff_members as staffMembersTable,
  eq } from '@/lib/db';

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
      needsHashUpgrade: false };
  }

  // Constant-time comparison for legacy plaintext passwords
  const storedBuf = Buffer.from(storedPassword, 'utf-8');
  const inputBuf = Buffer.from(inputPassword, 'utf-8');
  const isMatch = storedBuf.length === inputBuf.length &&
    crypto.timingSafeEqual(storedBuf, inputBuf);
  return {
    ok: isMatch,
    needsHashUpgrade: isMatch };
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
      passwd: staffMembersTable.passwd })
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
    passwd: row.passwd ?? null };
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
      passwd: staffMembersTable.passwd })
    .from(staffMembersTable)
    .where(eq(staffMembersTable.employee_no, employeeNo))
    .limit(3);
  return rows.map((row) => ({
    id: String(row.id),
    name: row.name ?? null,
    employee_no: row.employee_no ?? null,
    password: row.password ?? null,
    passwd: row.passwd ?? null }));
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
      passwd: staffMembersTable.passwd })
    .from(staffMembersTable)
    .where(eq(staffMembersTable.name, name))
    .limit(5);
  return rows.map((row) => ({
    id: String(row.id),
    name: row.name ?? null,
    employee_no: row.employee_no ?? null,
    password: row.password ?? null,
    passwd: row.passwd ?? null }));
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

/**
 * 세션 무효화 기준 시각(ISO). **초 경계로 내림한 값**이다.
 *
 * 세션을 끊는 판정은 lib/server-session.ts 의 `force_logout_at > 토큰 iat` 하나뿐인데,
 * iat 는 `Math.floor(Date.now()/1000)` 로 초 단위 내림값이다(createSessionToken).
 * 밀리초가 남은 시각을 찍으면 같은 초에 발급한 토큰까지 `10:00:00.412 > 10:00:00` 으로
 * 함께 죽는다 — 비밀번호를 바꾼 본인이 그 자리에서 튕겨 나간다.
 * 초 경계로 내림해 찍어야 "이 시각 이후 발급 토큰은 살고 이전 토큰만 죽는다" 가 성립한다.
 */
export function sessionLogoutCutoffIso(): string {
  return new Date(Math.floor(Date.now() / 1000) * 1000).toISOString();
}

/**
 * 비밀번호가 바뀐 계정의 기존 세션을 끊는다.
 *
 * 비밀번호 변경·초기화 경로는 지금까지 password 컬럼만 갱신하고 세션은 그대로 뒀다.
 * 세션 수명이 30일 슬라이딩이라 분실한 폰·공용 PC 가 계속 살아 있었다.
 * 끊는 수단은 이미 lib/offboarding-transition.ts:132 가 쓰던 force_logout_at 이다.
 *
 * @returns 찍은 시각(ISO). 이 시각 이후 iat 를 갖는 토큰은 살아남는다.
 */
export async function markStaffSessionsLoggedOut(staffId: string): Promise<string> {
  const cutoffIso = sessionLogoutCutoffIso();
  const d1 = await getD1Binding();
  if (!d1) throw new Error('[staff-password] D1 binding not available (markStaffSessionsLoggedOut)');
  const db = getD1Drizzle(d1);
  await db
    .update(staffMembersTable)
    .set({ force_logout_at: cutoffIso })
    .where(eq(staffMembersTable.id, staffId));
  return cutoffIso;
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
