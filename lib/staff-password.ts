import bcrypt from 'bcryptjs';
import { isMissingColumnError } from '@/lib/supabase-compat';

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

export async function updateStaffPasswordWithFallback(
  supabase: any,
  staffId: string,
  rawPassword: string
) {
  const passwordHash = await bcrypt.hash(rawPassword, 10);

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

export async function clearStaffPasswordWithFallback(supabase: any, staffId: string) {
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

export async function selectStaffPasswordRowsWithFallback<T = StaffCredentialRow[]>(
  runSelect: (selectClause: string) => PromiseLike<{ data: any; error: any }>
): Promise<{ data: T | null; error: any }> {
  const selectClauses = [
    STAFF_PASSWORD_SELECT,
    `${STAFF_PASSWORD_BASE_SELECT}, password`,
    `${STAFF_PASSWORD_BASE_SELECT}, passwd`,
  ];

  let lastError: any = null;

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
