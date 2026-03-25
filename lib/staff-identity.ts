import { normalizeProfileUser } from '@/lib/profile-photo';
import { supabase } from '@/lib/supabase';

type UserLikeRecord = Record<string, unknown>;

function cleanString(value: unknown) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || '';
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return '';
}

export function isUuidLike(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    cleanString(value)
  );
}

export function normalizeStaffLike<T extends UserLikeRecord | null | undefined>(input: T): T {
  return normalizeProfileUser((input ?? {}) as UserLikeRecord) as T;
}

export function getStaffLikeId(input: UserLikeRecord | null | undefined) {
  const normalized = normalizeStaffLike(input);
  const id = cleanString(normalized?.id);
  return isUuidLike(id) ? id : '';
}

async function tryResolveByColumn(base: UserLikeRecord, column: string, value: string) {
  if (!value) return null;
  const { data, error } = await supabase
    .from('staff_members')
    .select('*')
    .eq(column, value)
    .maybeSingle();

  if (error || !data) return null;
  return normalizeProfileUser({
    ...base,
    ...data,
  }) as UserLikeRecord;
}

export async function resolveStaffLike(input: UserLikeRecord | null | undefined) {
  const normalized = normalizeStaffLike(input);
  const directId = getStaffLikeId(normalized);
  if (directId) return normalized as UserLikeRecord;

  const employeeNo = cleanString(normalized?.employee_no);
  const authUserId = cleanString(normalized?.auth_user_id);
  const name = cleanString(normalized?.name);

  const byEmployeeNo = await tryResolveByColumn(normalized as UserLikeRecord, 'employee_no', employeeNo);
  if (byEmployeeNo) return byEmployeeNo;

  const byAuthUserId = await tryResolveByColumn(normalized as UserLikeRecord, 'auth_user_id', authUserId);
  if (byAuthUserId) return byAuthUserId;

  const byName = await tryResolveByColumn(normalized as UserLikeRecord, 'name', name);
  if (byName) return byName;

  return normalized as UserLikeRecord;
}
