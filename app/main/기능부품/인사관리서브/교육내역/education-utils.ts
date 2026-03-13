import { isMissingColumnError } from '@/lib/supabase-compat';

export type EducationCategory = 'hospital' | 'company' | 'common';

export interface EducationItem {
  name: string;
  category: EducationCategory;
}

export interface EducationCompletionEntry {
  is_completed: boolean;
  certificate_url?: string | null;
}

export interface EducationCompletionLikeRow {
  staff_id: string | number;
  education_name: string;
  certificate_url?: string | null;
}

export interface EducationAlert {
  id: string | number;
  name: string;
  education: string;
  dueDate: string;
  daysLeft: number;
  type: 'URGENT' | 'PENDING';
}

export interface EducationSummary {
  totalStaffCount: number;
  totalRequiredCount: number;
  completedCount: number;
  pendingAssignmentCount: number;
  pendingStaffCount: number;
  urgentStaffCount: number;
  completionRate: number;
  focusItems: Array<{ name: string; count: number }>;
}

export interface LicenseLikeRow {
  id: string | number;
  staff_id: string | number;
  license_name: string;
  license_number?: string | null;
  issued_date?: string | null;
  expiry_date?: string | null;
  issuing_body?: string | null;
  memo?: string | null;
  source?: 'staff_licenses' | 'staff_members';
}

const MEDICAL_COMPANY_PATTERN = /병원|의원|정형외과|내과|소아과|치과|한의원|요양|재활|산부인과|피부과|성형외과|외과|안과/i;

export const EDUCATION_ITEMS: EducationItem[] = [
  { name: '성희롱예방', category: 'common' },
  { name: '개인정보보호', category: 'common' },
  { name: '직장 내 장애인 인식개선', category: 'company' },
  { name: '직장 내 괴롭힘 방지', category: 'company' },
  { name: '산업안전보건(일반)', category: 'company' },
  { name: '감염관리 교육', category: 'hospital' },
  { name: '환자안전·의료사고 예방', category: 'hospital' },
  { name: '의료법·의료윤리 교육', category: 'hospital' },
  { name: '마약류 취급자 교육(해당자)', category: 'hospital' },
  { name: '아동학대신고', category: 'hospital' },
  { name: '노인학대신고', category: 'hospital' },
];

export const EDUCATION_DEADLINES: Record<string, { month: number; day: number }> = {
  성희롱예방: { month: 6, day: 30 },
  개인정보보호: { month: 6, day: 30 },
  '직장 내 장애인 인식개선': { month: 6, day: 30 },
  '직장 내 괴롭힘 방지': { month: 6, day: 30 },
  '산업안전보건(일반)': { month: 9, day: 30 },
  '감염관리 교육': { month: 3, day: 31 },
  '환자안전·의료사고 예방': { month: 3, day: 31 },
  '의료법·의료윤리 교육': { month: 3, day: 31 },
  '마약류 취급자 교육(해당자)': { month: 5, day: 31 },
  아동학대신고: { month: 3, day: 31 },
  노인학대신고: { month: 3, day: 31 },
};

export function isMedicalCompany(companyName?: string) {
  return MEDICAL_COMPANY_PATTERN.test(companyName || '');
}

export function getApplicableEducationItems(companyName?: string) {
  const medicalCompany = isMedicalCompany(companyName);
  return EDUCATION_ITEMS.filter((item) => {
    if (item.category === 'common') return true;
    return medicalCompany ? item.category === 'hospital' : item.category === 'company';
  });
}

export function getScopedActiveStaffs(staffs: any[] = [], selectedCo = '전체') {
  return staffs.filter((staff) => {
    const companyMatched = selectedCo === '전체' || staff?.company === selectedCo;
    const status = staff?.status ?? staff?.상태;
    return companyMatched && status !== '퇴사';
  });
}

export function getEducationCompletionKey(staffId: string | number | null | undefined, educationName: string) {
  return `${String(staffId ?? '')}_${educationName}`;
}

export function buildEducationCompletionMap(rows: any[] = []) {
  const next: Record<string, EducationCompletionEntry> = {};

  rows.forEach((row) => {
    next[getEducationCompletionKey(row?.staff_id, row?.education_name)] = {
      is_completed: true,
      certificate_url: row?.certificate_url ?? null,
    };
  });

  return next;
}

function hasMeaningfulDate(value: unknown) {
  if (typeof value !== 'string') return false;
  const normalized = value.trim();
  if (!normalized) return false;
  return !Number.isNaN(new Date(normalized).getTime());
}

function isEducationRecordCompleted(row: any) {
  if (hasMeaningfulDate(row?.completed_at)) return true;

  const normalizedStatus = String(row?.status ?? '')
    .trim()
    .toLowerCase();

  if (!normalizedStatus) return false;

  return (
    normalizedStatus.includes('완료') ||
    normalizedStatus.includes('수료') ||
    normalizedStatus.includes('이수') ||
    normalizedStatus.includes('complete') ||
    normalizedStatus.includes('completed') ||
    normalizedStatus.includes('done')
  );
}

export function isEducationCompletionQueryRecoverableError(error: any) {
  if (!error) return false;

  const code = String(error?.code || '').toUpperCase();
  const message = `${String(error?.message || '')} ${String(error?.details || '')} ${String(error?.hint || '')}`.toLowerCase();

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

export function serializeEducationQueryError(error: any) {
  if (!error || typeof error !== 'object') return error;
  return {
    code: error?.code ?? null,
    message: error?.message ?? null,
    details: error?.details ?? null,
    hint: error?.hint ?? null,
  };
}

export async function selectEducationCompletionRowsWithFallback(supabase: any) {
  let completionQuery = await supabase
    .from('education_completions')
    .select('staff_id, education_name, certificate_url');

  if (isMissingColumnError(completionQuery.error, 'certificate_url')) {
    completionQuery = await supabase
      .from('education_completions')
      .select('staff_id, education_name');
  }

  if (!completionQuery.error) {
    return {
      rows: (completionQuery.data || []).map((row: any) => ({
        staff_id: row.staff_id,
        education_name: row.education_name,
        certificate_url: row.certificate_url ?? null,
      })) as EducationCompletionLikeRow[],
      error: null,
      source: 'education_completions' as const,
    };
  }

  if (!isEducationCompletionQueryRecoverableError(completionQuery.error)) {
    return {
      rows: [] as EducationCompletionLikeRow[],
      error: completionQuery.error,
      source: null,
    };
  }

  const fallbackQuery = await supabase
    .from('education_records')
    .select('staff_id, education_name, status, completed_at');

  if (fallbackQuery.error) {
    return {
      rows: [] as EducationCompletionLikeRow[],
      error: fallbackQuery.error,
      source: 'education_records' as const,
    };
  }

  return {
    rows: (fallbackQuery.data || [])
      .filter((row: any) => isEducationRecordCompleted(row))
      .map((row: any) => ({
        staff_id: row.staff_id,
        education_name: row.education_name,
        certificate_url: null,
      })) as EducationCompletionLikeRow[],
    error: null,
    source: 'education_records' as const,
  };
}

export async function upsertEducationCompletionWithFallback(
  supabase: any,
  payload: EducationCompletionLikeRow,
) {
  let upsertResult = await supabase
    .from('education_completions')
    .upsert([
      {
        staff_id: payload.staff_id,
        education_name: payload.education_name,
        certificate_url: payload.certificate_url ?? null,
      },
    ]);

  if (isMissingColumnError(upsertResult.error, 'certificate_url')) {
    upsertResult = await supabase
      .from('education_completions')
      .upsert([
        {
          staff_id: payload.staff_id,
          education_name: payload.education_name,
        },
      ]);
  }

  if (!upsertResult.error) {
    return { error: null, source: 'education_completions' as const };
  }

  if (!isEducationCompletionQueryRecoverableError(upsertResult.error)) {
    return { error: upsertResult.error, source: null };
  }

  const existingRecordQuery = await supabase
    .from('education_records')
    .select('id')
    .eq('staff_id', payload.staff_id)
    .eq('education_name', payload.education_name)
    .limit(1)
    .maybeSingle();

  if (existingRecordQuery.error && !isEducationCompletionQueryRecoverableError(existingRecordQuery.error)) {
    return { error: existingRecordQuery.error, source: 'education_records' as const };
  }

  const completedPayload = {
    staff_id: payload.staff_id,
    education_name: payload.education_name,
    status: '완료',
    completed_at: new Date().toISOString().slice(0, 10),
  };

  if (existingRecordQuery.data?.id) {
    const updateResult = await supabase
      .from('education_records')
      .update(completedPayload)
      .eq('id', existingRecordQuery.data.id);

    return { error: updateResult.error, source: 'education_records' as const };
  }

  const insertResult = await supabase
    .from('education_records')
    .insert([completedPayload]);

  return { error: insertResult.error, source: 'education_records' as const };
}

export async function removeEducationCompletionWithFallback(
  supabase: any,
  staffId: string,
  educationName: string,
) {
  const deleteResult = await supabase
    .from('education_completions')
    .delete()
    .eq('staff_id', staffId)
    .eq('education_name', educationName);

  if (!deleteResult.error) {
    return { error: null, source: 'education_completions' as const };
  }

  if (!isEducationCompletionQueryRecoverableError(deleteResult.error)) {
    return { error: deleteResult.error, source: null };
  }

  const fallbackDelete = await supabase
    .from('education_records')
    .delete()
    .eq('staff_id', staffId)
    .eq('education_name', educationName);

  return { error: fallbackDelete.error, source: 'education_records' as const };
}

export function getEducationDueDate(educationName: string, year = new Date().getFullYear()) {
  const deadline = EDUCATION_DEADLINES[educationName];
  if (!deadline) return null;
  return new Date(year, deadline.month - 1, deadline.day);
}

export function getStaffDepartment(staff: any) {
  return staff?.department || staff?.team || staff?.부서 || '부서 미지정';
}

export function getStaffPosition(staff: any) {
  return staff?.position || staff?.job_title || staff?.직함 || '';
}

function normalizeOptionalText(value: unknown) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
}

function normalizeOptionalDate(value: unknown) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized) return null;
  return normalized.slice(0, 10);
}

export function buildFallbackLicenseRows(staffs: any[] = []): LicenseLikeRow[] {
  return staffs.flatMap((staff) => {
    const permissions = staff?.permissions || {};
    const licenseName = normalizeOptionalText(staff?.license);
    const licenseNumber = normalizeOptionalText(permissions.license_no);
    const issuedDate = normalizeOptionalDate(permissions.license_date);
    const expiryDate =
      normalizeOptionalDate(permissions.license_expiry_date) ||
      normalizeOptionalDate(permissions.license_expiry) ||
      normalizeOptionalDate(staff?.license_expiry_date);
    const issuingBody =
      normalizeOptionalText(permissions.license_issuer) ||
      normalizeOptionalText(permissions.license_org) ||
      normalizeOptionalText(staff?.license_issuer);
    const memo = normalizeOptionalText(permissions.license_note);

    if (!licenseName && !licenseNumber && !issuedDate && !expiryDate && !issuingBody && !memo) {
      return [];
    }

    return [
      {
        id: `staff-${String(staff?.id ?? '')}-license`,
        staff_id: String(staff?.id ?? ''),
        license_name: licenseName || '면허/자격',
        license_number: licenseNumber,
        issued_date: issuedDate,
        expiry_date: expiryDate,
        issuing_body: issuingBody,
        memo,
        source: 'staff_members',
      },
    ];
  });
}

export function isLicenseQueryRecoverableError(error: any) {
  if (!error) return false;

  const code = String(error?.code || '').toUpperCase();
  const message = `${String(error?.message || '')} ${String(error?.details || '')} ${String(error?.hint || '')}`.toLowerCase();

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
