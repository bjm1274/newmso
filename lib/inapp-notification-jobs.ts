/**
 * Phase 8-A — 사라진 7가지 인앱 알림을 서버 cron 으로 보강하는 통합 진입점.
 *
 * Phase 5에서 클라이언트 supabase Realtime 채널이 polling 으로 대체되면서
 * 알림시스템.tsx 의 7개 트리거 채널(approvals/inventory/payroll/education/
 * messages/attendance/word-filter)이 비활성화됐다. payload 기반 즉시 알림 생성이
 * 사라졌으므로, 서버가 주기적으로 후보 row 를 검사해 notifications 테이블에
 * insert 하면 클라이언트 polling 이 받아 처리한다.
 *
 * 각 검사 함수는 단일 책임 원칙(JM)에 따라 lib/inapp-notification-jobs/*
 * 모듈로 분리되어 있다. 본 파일은 통합 export + 통합 실행기만 담당.
 *
 * 호출자: app/api/cron/inapp-notifications/route.ts
 */
import 'server-only';
import type { CheckJobResult } from './inapp-notification-jobs/types';
import { checkApprovalQueue } from './inapp-notification-jobs/check-approval';
import { checkInventoryLowStock } from './inapp-notification-jobs/check-inventory';
import { checkPayrollSettled } from './inapp-notification-jobs/check-payroll';
import {
  checkEducationDeadline,
  checkRecentMessages,
} from './inapp-notification-jobs/check-education';
import { checkAttendanceEvents } from './inapp-notification-jobs/check-attendance';
import { checkWordFilter } from './inapp-notification-jobs/check-word-filter';

export type { CheckJobResult } from './inapp-notification-jobs/types';
export {
  checkApprovalQueue,
  checkInventoryLowStock,
  checkPayrollSettled,
  checkEducationDeadline,
  checkRecentMessages,
  checkAttendanceEvents,
  checkWordFilter,
};

export type InappNotificationJobsResult = {
  approval: CheckJobResult;
  inventory: CheckJobResult;
  payroll: CheckJobResult;
  education: CheckJobResult;
  messages: CheckJobResult;
  attendance: CheckJobResult;
  wordFilter: CheckJobResult;
};

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

async function runIsolated(
  label: string,
  fn: () => Promise<CheckJobResult>,
): Promise<CheckJobResult> {
  try {
    return await fn();
  } catch (err) {
    const msg = errorMessage(err);
    console.error(`[inapp-notification-jobs] ${label} failed:`, err);
    return { detected: 0, created: 0, errors: [msg] };
  }
}

export async function runInappNotificationJobs(): Promise<InappNotificationJobsResult> {
  const [
    approval,
    inventory,
    payroll,
    education,
    messages,
    attendance,
    wordFilter,
  ] = await Promise.all([
    runIsolated('approval', () => checkApprovalQueue()),
    runIsolated('inventory', () => checkInventoryLowStock()),
    runIsolated('payroll', () => checkPayrollSettled()),
    runIsolated('education', () => checkEducationDeadline()),
    runIsolated('messages', () => checkRecentMessages()),
    runIsolated('attendance', () => checkAttendanceEvents()),
    runIsolated('wordFilter', () => checkWordFilter()),
  ]);

  return {
    approval,
    inventory,
    payroll,
    education,
    messages,
    attendance,
    wordFilter,
  };
}
