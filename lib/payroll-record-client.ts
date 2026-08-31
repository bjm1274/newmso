import { db } from '@/lib/db-client';

export const PAYROLL_RECORD_TYPE_CONFLICT_TARGET = 'staff_id,year_month,record_type';
export const PAYROLL_RECORD_LEGACY_CONFLICT_TARGET = 'staff_id,year_month';

type SupabaseMutationResult<T = unknown> = {
  data: T | null;
  error: any;
};

export async function upsertPayrollRecordWithFallback({
  record,
  conflictTarget = PAYROLL_RECORD_TYPE_CONFLICT_TARGET,
}: {
  record: Record<string, unknown>;
  optionalColumns?: readonly string[];
  conflictTarget?: string;
  cacheKey?: string;
  retryWithoutColumnsOnStringTooLong?: readonly string[];
}): Promise<SupabaseMutationResult> {
  try {
    const { data, error } = await db
      .from('payroll_records')
      .upsert([record], { onConflict: conflictTarget, ignoreDuplicates: false });
    return { data, error };
  } catch (err) {
    return { data: null, error: err };
  }
}

export async function upsertPayrollRecordsWithFallback({
  records,
  conflictTarget = PAYROLL_RECORD_TYPE_CONFLICT_TARGET,
}: {
  records: Record<string, unknown>[];
  optionalColumns?: readonly string[];
  conflictTarget?: string;
  cacheKey?: string;
}): Promise<SupabaseMutationResult> {
  if (records.length === 0) return { data: [], error: null };
  try {
    const { data, error } = await db
      .from('payroll_records')
      .upsert(records, { onConflict: conflictTarget, ignoreDuplicates: false });
    return { data, error };
  } catch (err) {
    return { data: null, error: err };
  }
}
