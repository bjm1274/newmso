const PROFILE_PHOTO_BUCKET = 'profiles';
const PLACEHOLDER_SUPABASE_URL = 'https://placeholder.supabase.co';
const STAFF_ALLOWANCE_KEYS = [
  'meal_allowance',
  'night_duty_allowance',
  'vehicle_allowance',
  'childcare_allowance',
  'research_allowance',
  'other_taxfree',
  'position_allowance',
  'overtime_allowance',
  'night_work_allowance',
  'holiday_work_allowance',
  'annual_leave_pay',
] as const;

function cleanString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function asRecord(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, any>;
}

function cleanFiniteNumber(value: unknown): number | null {
  if (value === null || typeof value === 'undefined' || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getSupabasePublicBaseUrl(): string | null {
  const rawUrl =
    typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_SUPABASE_URL : undefined;
  const url = cleanString(rawUrl);
  if (!url || url === PLACEHOLDER_SUPABASE_URL) return null;
  return url.replace(/\/+$/, '');
}

export function getProfilePhotoPath(source: any): string | null {
  return (
    cleanString(source?.profile_photo_path) ||
    cleanString(source?.permissions?.profile_photo_path) ||
    cleanString(source?.permissions?.avatar_path) ||
    null
  );
}

export function buildProfilePhotoUrlFromPath(
  path: string | null | undefined,
  updatedAt?: string | null
): string | null {
  const baseUrl = getSupabasePublicBaseUrl();
  const cleanedPath = cleanString(path);
  if (!baseUrl || !cleanedPath) return null;
  const basePhotoUrl = `${baseUrl}/storage/v1/object/public/${PROFILE_PHOTO_BUCKET}/${cleanedPath}`;
  const version = cleanString(updatedAt);
  return version ? `${basePhotoUrl}?v=${encodeURIComponent(version)}` : basePhotoUrl;
}

export function getProfilePhotoUrl(source: any): string | null {
  const photoUpdatedAt =
    cleanString(source?.profile_photo_updated_at) ||
    cleanString(source?.permissions?.profile_photo_updated_at);
  const photoPath = getProfilePhotoPath(source);
  if (photoPath) {
    const generatedUrl = buildProfilePhotoUrlFromPath(photoPath, photoUpdatedAt);
    if (generatedUrl) return generatedUrl;
  }

  return (
    cleanString(source?.avatar_url) ||
    cleanString(source?.photo_url) ||
    cleanString(source?.profile_photo_url) ||
    cleanString(source?.permissions?.profile_photo_url) ||
    null
  );
}

export function normalizeProfileUser<T>(source: T): T {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return source;

  const base = source as Record<string, any>;
  const permissions = asRecord(base.permissions);
  const payrollAllowances = asRecord(permissions.payroll_allowances);
  const extension =
    cleanString(base.extension) ||
    cleanString(permissions.extension);
  const bankName =
    cleanString(base.bank_name) ||
    cleanString(permissions.bank_name);
  const bankAccount =
    cleanString(base.bank_account) ||
    cleanString(permissions.bank_account);
  const photoPath = getProfilePhotoPath(base);
  const photoUpdatedAt =
    cleanString(base.profile_photo_updated_at) ||
    cleanString(permissions.profile_photo_updated_at);
  const photoUrl = getProfilePhotoUrl(base);
  const normalizedPermissions = { ...permissions };

  if (photoPath) {
    normalizedPermissions.profile_photo_path = photoPath;
  }
  if (photoUpdatedAt) {
    normalizedPermissions.profile_photo_updated_at = photoUpdatedAt;
  }
  if (photoUrl) {
    normalizedPermissions.profile_photo_url = photoUrl;
  }
  if (Object.keys(payrollAllowances).length > 0) {
    normalizedPermissions.payroll_allowances = payrollAllowances;
  }

  const normalizedBase = {
    ...base,
    permissions: normalizedPermissions,
    extension,
    bank_name: bankName,
    bank_account: bankAccount,
    profile_photo_path: photoPath,
    profile_photo_updated_at: photoUpdatedAt,
    avatar_url: photoUrl,
    photo_url: photoUrl,
  } as Record<string, any>;

  for (const key of STAFF_ALLOWANCE_KEYS) {
    const topLevelValue = cleanFiniteNumber(base[key]);
    const fallbackValue = cleanFiniteNumber(payrollAllowances[key] ?? permissions[key]);
    if (topLevelValue !== null) {
      normalizedBase[key] = topLevelValue;
    } else if (fallbackValue !== null) {
      normalizedBase[key] = fallbackValue;
    }
  }

  return normalizedBase as T;
}

export function withProfilePhotoMetadata<T>(
  source: T,
  photoPath: string,
  photoUpdatedAt: string
): T {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return source;

  const base = source as Record<string, any>;
  const permissions = asRecord(base.permissions);
  return normalizeProfileUser({
    ...base,
    permissions: {
      ...permissions,
      profile_photo_path: photoPath,
      profile_photo_updated_at: photoUpdatedAt,
    },
    profile_photo_path: photoPath,
    profile_photo_updated_at: photoUpdatedAt,
  } as T);
}
