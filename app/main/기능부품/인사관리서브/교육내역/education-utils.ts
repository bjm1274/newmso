import { isMissingColumnError } from '@/lib/db-compat';
import { getKoreanTodayString } from '@/lib/seoul-time';
export { getScopedActiveStaffs } from '@/lib/active-staff';

// 타입 및 상수는 education-types.ts 에서 관리
export type {
  EducationCategory,
  ObligationType,
  EducationItem,
  EducationCompletionEntry,
  EducationCompletionLikeRow,
  EducationAlert,
  EducationSummary,
  LicenseLikeRow } from './education-types';

export {
  EDUCATION_ITEMS,
  EDUCATION_DEADLINES } from './education-types';

import type {
  SupabaseLike,
  SupabaseError,
  EducationCompletionLikeRow,
  EducationRecordRow,
  LicenseLikeRow,
  StaffLike,
  StaffMemberLike } from './education-types';

import {
  EDUCATION_ITEMS,
  EDUCATION_DEADLINES } from './education-types';

// ──────────────────────────────────────────────────────────────
// 회사명 기반 의료기관 판별
// ──────────────────────────────────────────────────────────────
const MEDICAL_COMPANY_PATTERN =
  /병원|의원|정형외과|내과|소아과|치과|한의원|요양|재활|산부인과|피부과|성형외과|외과|안과/i;

export function isMedicalCompany(companyName?: string) {
  return MEDICAL_COMPANY_PATTERN.test(companyName ?? '');
}

/**
 * 회사명 기반 교육 항목 필터링.
 * @deprecated 직종 코드 기반 분류(getEducationItemsForJobCategories)로 이전 예정.
 * 기존 호출부 호환을 위해 유지.
 */
export function getApplicableEducationItems(companyName?: string) {
  const medicalCompany = isMedicalCompany(companyName);
  return EDUCATION_ITEMS.filter((item) => {
    if (item.category === 'common') return true;
    return medicalCompany ? item.category === 'hospital' : item.category === 'company';
  });
}

/**
 * 직종 코드 배열에 해당하는 교육 항목 반환.
 * - appliesTo === 'all' 인 항목은 항상 포함.
 * - appliesTo 가 string[] 이면 codes 와 교집합이 있으면 포함.
 *
 * @param codes - job_categories.code 배열 (예: ['nurse', 'nurse_assistant'])
 */
export function getEducationItemsForJobCategories(codes: string[]) {
  const codeSet = new Set(codes);
  return EDUCATION_ITEMS.filter((item) => {
    if (item.appliesTo === 'all') return true;
    return item.appliesTo.some((c) => codeSet.has(c));
  });
}

// ──────────────────────────────────────────────────────────────
// 교육 완료 맵 유틸
// ──────────────────────────────────────────────────────────────
export function getEducationCompletionKey(
  staffId: string | number | null | undefined,
  educationName: string,
) {
  return `${String(staffId ?? '')}_${educationName}`;
}

export function buildEducationCompletionMap(
  rows: EducationCompletionLikeRow[] = [],
) {
  const next: Record<string, { is_completed: boolean; certificate_url: string | null }> = {};
  for (const row of rows) {
    next[getEducationCompletionKey(row.staff_id, row.education_name)] = {
      is_completed: true,
      certificate_url: row.certificate_url ?? null };
  }
  return next;
}

// ──────────────────────────────────────────────────────────────
// 에러 처리 유틸
// ──────────────────────────────────────────────────────────────
export function isEducationCompletionQueryRecoverableError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const err = error as SupabaseError;
  const code = String(err.code ?? '').toUpperCase();
  const message =
    `${String(err.message ?? '')} ${String(err.details ?? '')} ${String(err.hint ?? '')}`.toLowerCase();
  return (
    code === 'PGRST205' ||
    code === '42P01' ||
    code === '42501' ||
    message.includes('education_completions') ||
    message.includes('schema cache') ||
    message.includes('permission denied') ||
    message.includes('relation') ||
    message.includes('does not exist')
  );
}

export function serializeEducationQueryError(error: unknown): SupabaseError | unknown {
  if (!error || typeof error !== 'object') return error;
  const err = error as SupabaseError;
  return {
    code: err.code ?? null,
    message: err.message ?? null,
    details: err.details ?? null,
    hint: err.hint ?? null };
}

// ──────────────────────────────────────────────────────────────
// 교육 완료 데이터 Supabase 패치/upsert/삭제 (폴백 포함)
// ──────────────────────────────────────────────────────────────
function hasMeaningfulDate(value: unknown) {
  if (typeof value !== 'string') return false;
  const normalized = value.trim();
  return normalized !== '' && !Number.isNaN(new Date(normalized).getTime());
}

function isEducationRecordCompleted(row: EducationRecordRow) {
  if (hasMeaningfulDate(row.completed_at)) return true;
  const s = String(row.status ?? '').trim().toLowerCase();
  return (
    s.includes('완료') || s.includes('수료') || s.includes('이수') ||
    s.includes('complete') || s.includes('completed') || s.includes('done')
  );
}

export async function selectEducationCompletionRowsWithFallback(db: SupabaseLike) {
  let completionQuery = await db
    .from('education_completions')
    .select('staff_id, education_name, certificate_url');

  if (isMissingColumnError(completionQuery.error, 'certificate_url')) {
    completionQuery = await db
      .from('education_completions')
      .select('staff_id, education_name');
  }

  if (!completionQuery.error) {
    const rows = (completionQuery.data ?? []) as EducationRecordRow[];
    return {
      rows: rows.map((r) => ({
        staff_id: r.staff_id,
        education_name: r.education_name,
        certificate_url: r.certificate_url ?? null })) as EducationCompletionLikeRow[],
      error: null,
      source: 'education_completions' as const };
  }

  if (!isEducationCompletionQueryRecoverableError(completionQuery.error)) {
    return { rows: [] as EducationCompletionLikeRow[], error: completionQuery.error, source: null };
  }

  const fallbackQuery = await db
    .from('education_records')
    .select('staff_id, education_name, status, completed_at');

  if (fallbackQuery.error) {
    return { rows: [] as EducationCompletionLikeRow[], error: fallbackQuery.error, source: 'education_records' as const };
  }

  const fallbackRows = (fallbackQuery.data ?? []) as EducationRecordRow[];
  return {
    rows: fallbackRows
      .filter((r) => isEducationRecordCompleted(r))
      .map((r) => ({
        staff_id: r.staff_id,
        education_name: r.education_name,
        certificate_url: null })) as EducationCompletionLikeRow[],
    error: null,
    source: 'education_records' as const };
}

export async function upsertEducationCompletionWithFallback(
  db: SupabaseLike,
  payload: EducationCompletionLikeRow,
) {
  let upsertResult = await db.from('education_completions').upsert([
    {
      staff_id: payload.staff_id,
      education_name: payload.education_name,
      certificate_url: payload.certificate_url ?? null },
  ]);

  if (isMissingColumnError(upsertResult.error, 'certificate_url')) {
    upsertResult = await db.from('education_completions').upsert([
      { staff_id: payload.staff_id, education_name: payload.education_name },
    ]);
  }

  if (!upsertResult.error) return { error: null, source: 'education_completions' as const };

  if (!isEducationCompletionQueryRecoverableError(upsertResult.error)) {
    return { error: upsertResult.error, source: null };
  }

  const existing = await db
    .from('education_records')
    .select('id')
    .eq('staff_id', payload.staff_id)
    .eq('education_name', payload.education_name)
    .limit(1)
    .maybeSingle();

  if (existing.error && !isEducationCompletionQueryRecoverableError(existing.error)) {
    return { error: existing.error, source: 'education_records' as const };
  }

  const completedPayload = {
    staff_id: payload.staff_id,
    education_name: payload.education_name,
    status: '완료',
    completed_at: getKoreanTodayString() };

  if (existing.data?.id) {
    const updateResult = await db
      .from('education_records')
      .update(completedPayload)
      .eq('id', existing.data.id);
    return { error: updateResult.error, source: 'education_records' as const };
  }

  const insertResult = await db.from('education_records').insert([completedPayload]);
  return { error: insertResult.error, source: 'education_records' as const };
}

export async function removeEducationCompletionWithFallback(
  db: SupabaseLike,
  staffId: string,
  educationName: string,
) {
  const deleteResult = await db
    .from('education_completions')
    .delete()
    .eq('staff_id', staffId)
    .eq('education_name', educationName);

  if (!deleteResult.error) return { error: null, source: 'education_completions' as const };

  if (!isEducationCompletionQueryRecoverableError(deleteResult.error)) {
    return { error: deleteResult.error, source: null };
  }

  const fallbackDelete = await db
    .from('education_records')
    .delete()
    .eq('staff_id', staffId)
    .eq('education_name', educationName);

  return { error: fallbackDelete.error, source: 'education_records' as const };
}

// ──────────────────────────────────────────────────────────────
// 교육 마감일
// ──────────────────────────────────────────────────────────────
export function getEducationDueDate(educationName: string, year = new Date().getFullYear()) {
  const deadline = EDUCATION_DEADLINES[educationName];
  if (!deadline) return null;
  return new Date(year, deadline.month - 1, deadline.day);
}

// ──────────────────────────────────────────────────────────────
// 직원 부서/직책 추출
// ──────────────────────────────────────────────────────────────
export function getStaffDepartment(staff: StaffLike | null | undefined) {
  return staff?.department || staff?.team || staff?.부서 || '부서 미지정';
}

export function getStaffPosition(staff: StaffLike | null | undefined) {
  return staff?.position || staff?.job_title || staff?.직함 || '';
}

// ──────────────────────────────────────────────────────────────
// 면허 폴백 유틸
// ──────────────────────────────────────────────────────────────
function normalizeOptionalText(value: unknown) {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t || null;
}

function normalizeOptionalDate(value: unknown) {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t ? t.slice(0, 10) : null;
}

export function buildFallbackLicenseRows(staffs: StaffMemberLike[] = []): LicenseLikeRow[] {
  return staffs.flatMap((staff) => {
    const perms = staff?.permissions ?? {};
    const licenseName = normalizeOptionalText(staff?.license);
    const licenseNumber = normalizeOptionalText(perms.license_no);
    const issuedDate = normalizeOptionalDate(perms.license_date);
    const expiryDate =
      normalizeOptionalDate(perms.license_expiry_date) ||
      normalizeOptionalDate(perms.license_expiry) ||
      normalizeOptionalDate(staff?.license_expiry_date);
    const issuingBody =
      normalizeOptionalText(perms.license_issuer) ||
      normalizeOptionalText(perms.license_org) ||
      normalizeOptionalText(staff?.license_issuer);
    const memo = normalizeOptionalText(perms.license_note);

    if (!licenseName && !licenseNumber && !issuedDate && !expiryDate && !issuingBody && !memo) {
      return [];
    }

    return [
      {
        id: `staff-${String(staff?.id ?? '')}-license`,
        staff_id: String(staff?.id ?? ''),
        license_name: licenseName ?? '면허/자격',
        license_number: licenseNumber,
        issued_date: issuedDate,
        expiry_date: expiryDate,
        issuing_body: issuingBody,
        memo,
        source: 'staff_members' as const },
    ];
  });
}

export function isLicenseQueryRecoverableError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const err = error as SupabaseError;
  const code = String(err.code ?? '').toUpperCase();
  const message =
    `${String(err.message ?? '')} ${String(err.details ?? '')} ${String(err.hint ?? '')}`.toLowerCase();
  return (
    code === 'PGRST205' ||
    code === '42P01' ||
    code === '42501' ||
    message.includes('staff_licenses') ||
    message.includes('schema cache') ||
    message.includes('permission denied') ||
    message.includes('relation') ||
    message.includes('does not exist')
  );
}
