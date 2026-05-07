import { supabase } from '@/lib/supabase';
import { withMissingColumnsFallback } from '@/lib/supabase-compat';

type SupabaseMutationResult<T = unknown> = {
  data: T | null;
  error: any;
};

type PayrollRecordPayload = Record<string, unknown> | Record<string, unknown>[];

export const PAYROLL_RECORD_TYPE_CONFLICT_TARGET = 'staff_id,year_month,record_type';
export const PAYROLL_RECORD_LEGACY_CONFLICT_TARGET = 'staff_id,year_month';
const PAYROLL_RECORD_TYPE_MIGRATION_REQUIRED_ERROR = {
  code: 'PAYROLL_RECORD_TYPE_MIGRATION_REQUIRED',
  message:
    'payroll_records.record_type and unique(staff_id,year_month,record_type) are required before saving interim or daily payroll records.',
};

export function isPayrollStringTooLongError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as Record<string, unknown>;
  const joined = [
    candidate.code,
    candidate.message,
    candidate.details,
    candidate.hint,
  ]
    .map((value) => String(value || '').toLowerCase())
    .join(' ');

  return joined.includes('22001') || joined.includes('value too long') || joined.includes('character varying');
}

export function isPayrollConflictTargetError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as Record<string, unknown>;
  const joined = [
    candidate.code,
    candidate.message,
    candidate.details,
    candidate.hint,
  ]
    .map((value) => String(value || '').toLowerCase())
    .join(' ');

  return joined.includes('42p10') || joined.includes('no unique') || joined.includes('on conflict');
}

function omitColumns(record: Record<string, unknown>, omittedColumns: ReadonlySet<string>) {
  const nextRecord = { ...record };
  omittedColumns.forEach((columnName) => {
    delete nextRecord[columnName];
  });
  return nextRecord;
}

function omitPayloadColumns(payload: PayrollRecordPayload, omittedColumns: ReadonlySet<string>) {
  if (Array.isArray(payload)) {
    return payload.map((record) => omitColumns(record, omittedColumns));
  }
  return omitColumns(payload, omittedColumns);
}

function hasNonRegularPayrollRecordType(payload: PayrollRecordPayload) {
  const records = Array.isArray(payload) ? payload : [payload];
  return records.some((record) => {
    const type = String(record.record_type ?? '').trim().toLowerCase();
    return type !== '' && type !== 'regular';
  });
}

async function runPayrollRecordUpsert(
  payload: PayrollRecordPayload,
  conflictTarget: string,
  optionalColumns: readonly string[],
  cacheKey?: string,
): Promise<SupabaseMutationResult> {
  return withMissingColumnsFallback(
    (omittedColumns) => {
      if (
        omittedColumns.has('record_type') &&
        conflictTarget.includes('record_type') &&
        hasNonRegularPayrollRecordType(payload)
      ) {
        return Promise.resolve({
          data: null,
          error: PAYROLL_RECORD_TYPE_MIGRATION_REQUIRED_ERROR,
        });
      }

      const nextPayload = omitPayloadColumns(payload, omittedColumns);
      const nextConflictTarget =
        omittedColumns.has('record_type') && conflictTarget.includes('record_type')
          ? PAYROLL_RECORD_LEGACY_CONFLICT_TARGET
          : conflictTarget;

      return supabase.from('payroll_records').upsert(nextPayload, {
        onConflict: nextConflictTarget,
      });
    },
    [...optionalColumns],
    cacheKey ? { cacheKey } : undefined,
  );
}

async function upsertPayrollPayloadWithFallback({
  payload,
  optionalColumns,
  conflictTarget = PAYROLL_RECORD_TYPE_CONFLICT_TARGET,
  cacheKey,
  retryWithoutColumnsOnStringTooLong = [],
}: {
  payload: PayrollRecordPayload;
  optionalColumns: readonly string[];
  conflictTarget?: string;
  cacheKey?: string;
  retryWithoutColumnsOnStringTooLong?: readonly string[];
}): Promise<SupabaseMutationResult> {
  const attempts: PayrollRecordPayload[] = [payload];

  if (retryWithoutColumnsOnStringTooLong.length > 0) {
    attempts.push(omitPayloadColumns(payload, new Set(retryWithoutColumnsOnStringTooLong)));
  }

  let lastError: any = null;

  for (const attemptPayload of attempts) {
    let result = await runPayrollRecordUpsert(attemptPayload, conflictTarget, optionalColumns, cacheKey);

    if (isPayrollConflictTargetError(result.error) && conflictTarget !== PAYROLL_RECORD_LEGACY_CONFLICT_TARGET) {
      if (hasNonRegularPayrollRecordType(attemptPayload)) {
        return {
          data: null,
          error: PAYROLL_RECORD_TYPE_MIGRATION_REQUIRED_ERROR,
        };
      }
      result = await runPayrollRecordUpsert(
        attemptPayload,
        PAYROLL_RECORD_LEGACY_CONFLICT_TARGET,
        optionalColumns,
        cacheKey ? `${cacheKey}:legacy` : undefined,
      );
    }

    if (!result.error) return result;

    lastError = result.error;
    if (!isPayrollStringTooLongError(result.error)) return result;
  }

  return { data: null, error: lastError };
}

export async function upsertPayrollRecordWithFallback({
  record,
  optionalColumns,
  conflictTarget = PAYROLL_RECORD_TYPE_CONFLICT_TARGET,
  cacheKey,
  retryWithoutColumnsOnStringTooLong = [],
}: {
  record: Record<string, unknown>;
  optionalColumns: readonly string[];
  conflictTarget?: string;
  cacheKey?: string;
  retryWithoutColumnsOnStringTooLong?: readonly string[];
}): Promise<SupabaseMutationResult> {
  return upsertPayrollPayloadWithFallback({
    payload: record,
    optionalColumns,
    conflictTarget,
    cacheKey,
    retryWithoutColumnsOnStringTooLong,
  });
}

export async function upsertPayrollRecordsWithFallback({
  records,
  optionalColumns,
  conflictTarget = PAYROLL_RECORD_TYPE_CONFLICT_TARGET,
  cacheKey,
}: {
  records: Record<string, unknown>[];
  optionalColumns: readonly string[];
  conflictTarget?: string;
  cacheKey?: string;
}): Promise<SupabaseMutationResult> {
  return upsertPayrollPayloadWithFallback({
    payload: records,
    optionalColumns,
    conflictTarget,
    cacheKey,
  });
}
