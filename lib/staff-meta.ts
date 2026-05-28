export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function cleanOptionalText(value: unknown, fallback = '') {
  if (typeof value === 'string') {
    return value.trim() || fallback;
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value).trim() || fallback;
  }
  return fallback;
}

export function cleanOptionalDate(value: unknown, fallback = '') {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim();
  if (!normalized) return fallback;
  return normalized.slice(0, 10);
}

export function toFiniteNumberOrNull(value: unknown) {
  if (typeof value === 'boolean' || value === null || value === undefined || value === '') {
    return null;
  }
  const numeric = Number(typeof value === 'string' ? value.replace(/,/g, '').trim() : value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function toIntegerOrFallback(value: unknown, fallback = 0) {
  const numeric = toFiniteNumberOrNull(value);
  return numeric === null ? fallback : Math.round(numeric);
}

export function getStaffPermissions(source: unknown): Record<string, unknown> {
  if (!isPlainRecord(source)) return {};
  return isPlainRecord(source.permissions) ? source.permissions : {};
}

export function getStaffExtension(source: unknown) {
  if (!isPlainRecord(source)) return '';
  const permissions = getStaffPermissions(source);
  return cleanOptionalText(source.extension) || cleanOptionalText(permissions.extension);
}

export function getStaffLicenseNo(source: unknown) {
  if (!isPlainRecord(source)) return '';
  const permissions = getStaffPermissions(source);
  return cleanOptionalText(source.license_no) || cleanOptionalText(permissions.license_no);
}

export function getStaffLicenseDate(source: unknown) {
  if (!isPlainRecord(source)) return '';
  const permissions = getStaffPermissions(source);
  return cleanOptionalDate(source.license_date) || cleanOptionalDate(permissions.license_date);
}

export function getStaffLicenseNote(source: unknown) {
  if (!isPlainRecord(source)) return '';
  const permissions = getStaffPermissions(source);
  return cleanOptionalText(source.license_note) || cleanOptionalText(permissions.license_note);
}

export function getStaffEmploymentType(source: unknown, fallback = '정규직') {
  if (!isPlainRecord(source)) return fallback;
  const permissions = getStaffPermissions(source);
  return (
    cleanOptionalText(source.employment_type) ||
    cleanOptionalText(permissions.employment_type) ||
    cleanOptionalText(permissions.current_work_type) ||
    fallback
  );
}

export function getStaffContractEndDate(source: unknown) {
  if (!isPlainRecord(source)) return '';
  const permissions = getStaffPermissions(source);
  return cleanOptionalDate(source.contract_end_date) || cleanOptionalDate(permissions.contract_end_date);
}

export function getStaffProbationMonths(source: unknown, fallback = 0) {
  if (!isPlainRecord(source)) return fallback;
  const permissions = getStaffPermissions(source);
  return toIntegerOrFallback(source.probation_months ?? permissions.probation_months, fallback);
}

export function getStaffProbationPercent(source: unknown, fallback = 90) {
  if (!isPlainRecord(source)) return fallback;
  const permissions = getStaffPermissions(source);
  return toIntegerOrFallback(source.probation_percent ?? permissions.probation_percent, fallback);
}
