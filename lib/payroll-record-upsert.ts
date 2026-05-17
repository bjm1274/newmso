import { sql } from 'drizzle-orm';
import { supabase } from '@/lib/supabase';
import { withMissingColumnsFallback } from '@/lib/supabase-compat';
import { mirrorRowsToD1, payroll_records as payrollRecordsTable } from '@/lib/db';

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

// jsonb 컬럼 목록 — D1에선 text라 JSON.stringify 필요
const PAYROLL_JSONB_COLUMNS: ReadonlySet<string> = new Set([
  'attendance_deduction_detail',
  'deduction_detail',
  'settlement_reason',
]);

// D1 컬럼이 아닌 키들 (supabase에만 존재) — D1 미러에서 제외
const PAYROLL_D1_OMIT_COLUMNS: ReadonlySet<string> = new Set([
  'company_id',
  'company_name',
  'updated_at',
]);

function normalizePayrollRecordForD1(record: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (PAYROLL_D1_OMIT_COLUMNS.has(key)) continue;
    if (PAYROLL_JSONB_COLUMNS.has(key) && value !== null && typeof value === 'object') {
      next[key] = JSON.stringify(value);
    } else {
      next[key] = value;
    }
  }
  if (typeof next.id !== 'string' || next.id === '') {
    next.id = crypto.randomUUID();
  }
  if (typeof next.record_type !== 'string' || (next.record_type as string).trim() === '') {
    next.record_type = 'regular';
  }
  return next;
}

async function mirrorPayrollUpsertToD1(payload: PayrollRecordPayload): Promise<void> {
  const records = Array.isArray(payload) ? payload : [payload];
  if (records.length === 0) return;
  const normalized = records.map(normalizePayrollRecordForD1);
  await mirrorRowsToD1(payrollRecordsTable, normalized as never, {
    label: 'mirror:payroll_records',
    onConflict: 'update',
    target: [
      payrollRecordsTable.staff_id,
      payrollRecordsTable.year_month,
      payrollRecordsTable.record_type,
    ],
    set: {
      base_salary: sql`excluded.base_salary`,
      meal_allowance: sql`excluded.meal_allowance`,
      vehicle_allowance: sql`excluded.vehicle_allowance`,
      childcare_allowance: sql`excluded.childcare_allowance`,
      research_allowance: sql`excluded.research_allowance`,
      other_taxfree: sql`excluded.other_taxfree`,
      extra_allowance: sql`excluded.extra_allowance`,
      overtime_pay: sql`excluded.overtime_pay`,
      bonus: sql`excluded.bonus`,
      night_duty_allowance: sql`excluded.night_duty_allowance`,
      total_taxable: sql`excluded.total_taxable`,
      total_taxfree: sql`excluded.total_taxfree`,
      total_deduction: sql`excluded.total_deduction`,
      net_pay: sql`excluded.net_pay`,
      gross_pay: sql`excluded.gross_pay`,
      attendance_deduction: sql`excluded.attendance_deduction`,
      attendance_deduction_detail: sql`excluded.attendance_deduction_detail`,
      deduction_detail: sql`excluded.deduction_detail`,
      status: sql`excluded.status`,
      severance_pay: sql`excluded.severance_pay`,
      settlement_reason: sql`excluded.settlement_reason`,
      settlement_date: sql`excluded.settlement_date`,
      advance_pay: sql`excluded.advance_pay`,
      national_pension: sql`excluded.national_pension`,
      health_insurance: sql`excluded.health_insurance`,
      long_term_care: sql`excluded.long_term_care`,
      employment_insurance: sql`excluded.employment_insurance`,
      income_tax: sql`excluded.income_tax`,
      local_tax: sql`excluded.local_tax`,
    },
  });
}

async function runPayrollRecordUpsert(
  payload: PayrollRecordPayload,
  conflictTarget: string,
  optionalColumns: readonly string[],
  cacheKey?: string,
): Promise<SupabaseMutationResult> {
  return withMissingColumnsFallback(
    async (omittedColumns) => {
      if (
        omittedColumns.has('record_type') &&
        conflictTarget.includes('record_type') &&
        hasNonRegularPayrollRecordType(payload)
      ) {
        return {
          data: null,
          error: PAYROLL_RECORD_TYPE_MIGRATION_REQUIRED_ERROR,
        };
      }

      const nextPayload = omitPayloadColumns(payload, omittedColumns);
      const nextConflictTarget =
        omittedColumns.has('record_type') && conflictTarget.includes('record_type')
          ? PAYROLL_RECORD_LEGACY_CONFLICT_TARGET
          : conflictTarget;

      const result = await supabase.from('payroll_records').upsert(nextPayload, {
        onConflict: nextConflictTarget,
      });

      // Supabase 성공한 경우에만 D1 미러 (실패한 row를 미러하지 않음)
      if (!result.error) {
        await mirrorPayrollUpsertToD1(nextPayload);
      }

      return result;
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
