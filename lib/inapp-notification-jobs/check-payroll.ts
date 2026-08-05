/**
 * Phase 8-A — 급여 정산 알림 보강.
 * payroll_records 최근 PAYROLL_LOOKBACK_MIN 분 내 created → staff_id 에게 'payroll' 알림.
 * dedupe key: `payroll:{record_id}`
 *
 * lookback: 인앱 cron 일 1회 piggyback 누락 방지용 26시간. dedupe(7일)로 중복 차단.
 */
import 'server-only';
import { toUtcSqlTimestamp } from '@/lib/chat-read-cursors';
import {
  type CheckJobResult,
  type NotificationInsertRow,
  emptyResult,
  errorMessage,
  loadExistingDedupeKeys,
  insertNotificationsChunked } from './types';
import {
  getD1Binding,
  getD1Drizzle,
  payroll_records as payrollRecordsTable,
  gte } from '@/lib/db';

type PayrollRow = {
  id: string;
  staff_id: string | null;
  year_month: string | null;
  net_pay: number | null;
};

/** 일 1회 piggyback 실행 시 누락 방지 — 26h (dedupe로 중복 차단) */
const PAYROLL_LOOKBACK_MIN = 26 * 60;

export async function checkPayrollSettled(): Promise<CheckJobResult> {
  // cutoff 를 ISO 로 만들면 공백형(UTC) created_at 행이 사전순 비교에서 전부 탈락해
  // 26시간 lookback 이 3시간으로 줄어들었다(8차 D02-001). 공백형으로 통일한다.
  const cutoff = toUtcSqlTimestamp(
    new Date(Date.now() - PAYROLL_LOOKBACK_MIN * 60 * 1000).toISOString(),
  );
  const d1 = await getD1Binding();
  if (!d1) return { detected: 0, created: 0, errors: ['[check-payroll] D1 binding not available'] };
  const db = getD1Drizzle(d1);
  const d1Rows = await db
    .select({
      id: payrollRecordsTable.id,
      staff_id: payrollRecordsTable.staff_id,
      year_month: payrollRecordsTable.year_month,
      net_pay: payrollRecordsTable.net_pay })
    .from(payrollRecordsTable)
    .where(gte(payrollRecordsTable.created_at, cutoff))
    .limit(500);
  const rows = d1Rows as PayrollRow[];
  if (rows.length === 0) return emptyResult();

  const userIds = Array.from(
    new Set(rows.map((r) => String(r.staff_id ?? '')).filter(Boolean)),
  );
  let sentKeys: Set<string>;
  try {
    sentKeys = await loadExistingDedupeKeys('payroll', userIds);
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
        dedupe_key: dedupeKey },
      read_at: null });
  }

  if (toInsert.length === 0) {
    return { detected: rows.length, created: 0, errors: [] };
  }
  const { created, errors } = await insertNotificationsChunked(toInsert);
  return { detected: rows.length, created, errors };
}
