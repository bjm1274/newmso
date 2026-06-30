import { normalizeProfileUser } from '@/lib/profile-photo';
import { db } from '@/lib/db-client';

type UserLikeRecord = Record<string, unknown>;
type CachedIdentityLookup = {
  expiresAt: number;
  row: UserLikeRecord | null;
};

const STAFF_IDENTITY_CACHE_MS = 30_000;
const staffIdentityCache = new Map<string, CachedIdentityLookup>();
const staffIdentityInFlight = new Map<string, Promise<UserLikeRecord | null>>();

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

function buildIdentityCacheKey(input: UserLikeRecord) {
  return [
    cleanString(input?.employee_no),
    cleanString(input?.auth_user_id),
    cleanString(input?.name),
  ].join('|');
}

async function tryResolveByColumn(column: string, value: string) {
  if (!value) return null;
  const { data, error } = await db
    .from('staff_members')
    .select('*')
    .eq(column, value)
    .maybeSingle();

  if (error || !data) return null;
  return data as UserLikeRecord;
}

async function resolveStaffRowByIdentity(normalized: UserLikeRecord) {
  const employeeNo = cleanString(normalized?.employee_no);
  const authUserId = cleanString(normalized?.auth_user_id);
  const name = cleanString(normalized?.name);

  const lookups = await Promise.all([
    tryResolveByColumn('employee_no', employeeNo),
    tryResolveByColumn('auth_user_id', authUserId),
    tryResolveByColumn('name', name),
  ]);

  return lookups.find(Boolean) || null;
}

export async function resolveStaffLike(input: UserLikeRecord | null | undefined) {
  const normalized = normalizeStaffLike(input);
  const directId = getStaffLikeId(normalized);
  if (directId) return normalized as UserLikeRecord;

  const cacheKey = buildIdentityCacheKey(normalized as UserLikeRecord);
  if (!cacheKey.replace(/\|/g, '')) return normalized as UserLikeRecord;

  const cached = staffIdentityCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.row
      ? normalizeProfileUser({ ...normalized, ...cached.row }) as UserLikeRecord
      : normalized as UserLikeRecord;
  }

  let inFlight = staffIdentityInFlight.get(cacheKey);
  if (!inFlight) {
    inFlight = resolveStaffRowByIdentity(normalized as UserLikeRecord).finally(() => {
      staffIdentityInFlight.delete(cacheKey);
    });
    staffIdentityInFlight.set(cacheKey, inFlight);
  }

  const row = await inFlight;
  staffIdentityCache.set(cacheKey, {
    expiresAt: Date.now() + STAFF_IDENTITY_CACHE_MS,
    row });

  return row
    ? normalizeProfileUser({ ...normalized, ...row }) as UserLikeRecord
    : normalized as UserLikeRecord;
}
