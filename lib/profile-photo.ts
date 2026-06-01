const PROFILE_PHOTO_BUCKET = 'profiles';
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

function getR2PublicBase(): string | null {
  const raw =
    typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL : undefined;
  const url = typeof raw === 'string' ? raw.trim().replace(/\/+$/, '') : '';
  return url || null;
}

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
  if (typeof value === 'boolean' || value === null || typeof value === 'undefined' || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getProfilePhotoPath(source: any): string | null {
  return (
    cleanString(source?.profile_photo_path) ||
    cleanString(source?.permissions?.profile_photo_path) ||
    cleanString(source?.permissions?.avatar_path) ||
    null
  );
}

// 업로드 라우트는 R2 objectKey(`profiles/{id}/avatar`)를 그대로 path로 저장하지만,
// 레거시 경로는 버킷 상대 경로(`{id}/avatar`)다. 아래에서 항상 버킷명을 다시 붙이므로
// 선행 버킷 prefix가 있으면 제거해 URL이 중복(`/profiles/profiles/...`)되지 않게 한다.
function toBucketRelativePath(path: string): string {
  const prefix = `${PROFILE_PHOTO_BUCKET}/`;
  let result = path;
  while (result.startsWith(prefix)) {
    result = result.slice(prefix.length);
  }
  return result;
}

export function buildProfilePhotoUrlFromPath(
  path: string | null | undefined,
  updatedAt?: string | null
): string | null {
  const r2Base = getR2PublicBase();
  const cleanedPath = cleanString(path);
  if (!r2Base || !cleanedPath) return null;
  const relativePath = toBucketRelativePath(cleanedPath);
  if (!relativePath) return null;
  const encodedPath = relativePath.split('/').map(encodeURIComponent).join('/');
  const basePhotoUrl = `${r2Base}/${PROFILE_PHOTO_BUCKET}/${encodedPath}`;
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

  const employType =
    cleanString(base.employ_type) ||
    cleanString(base.employment_type) ||
    cleanString(permissions.employ_type) ||
    cleanString(permissions.employment_type);

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
    employ_type: employType,
    employment_type: employType,
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
