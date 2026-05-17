/**
 * Phase 8-A — 급여 정산 알림 보강.
 * payroll_records 최근 PAYROLL_LOOKBACK_MIN(60) 분 내 created → staff_id 에게 'payroll' 알림.
 * dedupe key: `payroll:{record_id}`
 */
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  type CheckJobResult,
  type NotificationInsertRow,
  emptyResult,
  errorMessage,
  loadExistingDedupeKeys,
  insertNotificationsChunked,
} from './types';

type PayrollRow = {
  id: string;
  staff_id: string | null;
  year_month: string | null;
  net_pay: number | null;
};

const PAYROLL_LOOKBACK_MIN = 60;

export async function checkPayrollSettled(
  supabase: SupabaseClient,
): Promise<CheckJobResult> {
  const cutoff = new Date(Date.now() - PAYROLL_LOOKBACK_MIN * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('payroll_records')
    .select('id, staff_id, year_month, net_pay')
    .gte('created_at', cutoff)
    .limit(500);
  if (error) return { detected: 0, created: 0, errors: [error.message] };

  const rows = (data ?? []) as PayrollRow[];
  if (rows.length === 0) return emptyResult();

  const userIds = Array.from(
    new Set(rows.map((r) => String(r.staff_id ?? '')).filter(Boolean)),
  );
  let sentKeys: Set<string>;
  try {
    sentKeys = await loadExistingDedupeKeys(supabase, 'payroll', userIds);
  } catch (err) {
    return { detected: rows.length, created: 0, errors: [errorMessage(err)] };
  }

  const toInsert: NotificationInsertRow[] = [];
  for (const row of rows) {
    const staffId = String(row.staff_id ?? '');
    if (!staffId) continue;
    const dedupeKey = `payroll:${row.id}`;
    if (sentKeys.has(`${staffId}|${dedupeKey}`)) continue;

    const ym = row.year_month || '';
    const net = Number(row.net_pay ?? 0);
    toInsert.push({
      user_id: staffId,
      type: 'payroll',
      title: '급여 명세서 발행',
      body: ym
        ? `${ym} 급여 명세서가 발행되었습니다.${net ? ` 실수령액 ${net.toLocaleString()}원.` : ''}`
        : '급여 명세서가 발행되었습니다. 마이페이지에서 확인해 주세요.',
      metadata: {
        type: 'payroll',
        record_id: row.id,
        year_month: ym,
        dedupe_key: dedupeKey,
      },
      read_at: null,
    });
  }

  if (toInsert.length === 0) {
    return { detected: rows.length, created: 0, errors: [] };
  }
  const { created, errors } = await insertNotificationsChunked(supabase, toInsert);
  return { detected: rows.length, created, errors };
}
