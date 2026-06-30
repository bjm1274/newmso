/**
 * 정기 보고서 자동 생성
 * 인사/급여/재고 보고서를 크론 스케줄로 자동 생성
 *
 * staff_members / payroll_records 조회와 notifications.insert를 D1 binding
 * 직접 사용으로 처리한다.
 */

import { getStaffEmploymentType } from './staff-meta';
import { insertNotificationsOrThrow, type NotificationRow } from './notification-utils';
import {
  getD1Binding,
  getD1Drizzle,
  staff_members as staffMembersTable,
  payroll_records as payrollRecordsTable,
  eq,
  and,
  inArray } from './db';
import { logD1BindingMissing } from './db/mirror-metrics';

export type ReportType = 'monthly_hr' | 'monthly_payroll' | 'quarterly_inventory' | 'quarterly_business';

export type ReportSchedule = {
  id: string;
  company_id: string;
  report_type: ReportType;
  schedule_cron: string;
  recipients: string[];
  enabled: boolean;
  last_generated_at: string | null;
};

export type GeneratedReport = {
  id: string;
  schedule_id: string;
  report_type: ReportType;
  period: string;
  status: 'generating' | 'completed' | 'failed';
  summary: Record<string, unknown>;
  created_at: string;
};

// D1 binding 필수 — Workers env 가 없으면 throw. (서버 라우트 안에서만 호출)
async function requireD1ForAutoReport(label: string) {
  const d1 = await getD1Binding();
  if (!d1) {
    logD1BindingMissing({ label, backend: 'd1' });
    throw new Error(`[auto-report-generator] D1 binding not available (${label})`);
  }
  return getD1Drizzle(d1);
}

/**
 * 인사현황 보고서 데이터 생성
 */
export async function generateMonthlyHRReport(
  companyId: string | null,
  period: string, // YYYY-MM
): Promise<{ summary: Record<string, unknown> }> {
  const db = await requireD1ForAutoReport('generateMonthlyHRReport');

  const rows = companyId
    ? await db
        .select({
          id: staffMembersTable.id,
          department: staffMembersTable.department,
          position: staffMembersTable.position,
          status: staffMembersTable.status,
          permissions: staffMembersTable.permissions })
        .from(staffMembersTable)
        .where(eq(staffMembersTable.company, companyId))
    : await db
        .select({
          id: staffMembersTable.id,
          department: staffMembersTable.department,
          position: staffMembersTable.position,
          status: staffMembersTable.status,
          permissions: staffMembersTable.permissions })
        .from(staffMembersTable);

  const list = rows ?? [];
  const byDept: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const byType: Record<string, number> = {};

  for (const s of list) {
    const dept = String(s.department || '미지정');
    const status = String(s.status || '기타');
    // getStaffEmploymentType는 permissions(jsonb/text) 등을 보고 판정
    const empType = getStaffEmploymentType(s as Record<string, unknown>, '정규직');
    byDept[dept] = (byDept[dept] || 0) + 1;
    byStatus[status] = (byStatus[status] || 0) + 1;
    byType[empType] = (byType[empType] || 0) + 1;
  }

  return {
    summary: {
      period,
      totalStaff: list.length,
      byDepartment: byDept,
      byStatus,
      byEmploymentType: byType,
      generatedAt: new Date().toISOString() } };
}

/**
 * 급여 요약 보고서 데이터 생성
 */
export async function generateMonthlyPayrollReport(
  _companyId: string | null,
  period: string,
): Promise<{ summary: Record<string, unknown> }> {
  const db = await requireD1ForAutoReport('generateMonthlyPayrollReport');

  const records = await db
    .select({
      base_salary: payrollRecordsTable.base_salary,
      total_taxable: payrollRecordsTable.total_taxable,
      total_deduction: payrollRecordsTable.total_deduction,
      net_pay: payrollRecordsTable.net_pay,
      status: payrollRecordsTable.status })
    .from(payrollRecordsTable)
    .where(
      and(
        eq(payrollRecordsTable.year_month, period),
        inArray(payrollRecordsTable.status, ['확정', 'finalized']),
      ),
    );

  const list = records ?? [];

  const totalBaseSalary = list.reduce((s, r) => s + (Number(r.base_salary) || 0), 0);
  const totalTaxable = list.reduce((s, r) => s + (Number(r.total_taxable) || 0), 0);
  const totalDeduction = list.reduce((s, r) => s + (Number(r.total_deduction) || 0), 0);
  const totalNetPay = list.reduce((s, r) => s + (Number(r.net_pay) || 0), 0);

  return {
    summary: {
      period,
      recordCount: list.length,
      totalBaseSalary: Math.round(totalBaseSalary),
      totalTaxable: Math.round(totalTaxable),
      totalDeduction: Math.round(totalDeduction),
      totalNetPay: Math.round(totalNetPay),
      generatedAt: new Date().toISOString() } };
}

/**
 * 보고서 생성 후 알림 발송 — notifications 테이블 직접 INSERT
 */
export async function notifyRecipients(
  recipients: string[],
  reportType: string,
  period: string,
): Promise<void> {
  if (recipients.length === 0) return;

  const typeLabels: Record<string, string> = {
    monthly_hr: '월간 인사현황',
    monthly_payroll: '월간 급여 요약',
    quarterly_inventory: '분기 재고 현황',
    quarterly_business: '분기 경영 보고서' };

  const label = typeLabels[reportType] || reportType;

  const rows: NotificationRow[] = recipients.map((userId) => ({
    user_id: userId,
    type: '보고서',
    title: `${label} 보고서 생성 완료`,
    body: `${period} ${label} 보고서가 자동 생성되었습니다. 관리자 메뉴에서 확인하세요.`,
    read_at: null }));

  // D1 직접 insert — insertNotificationsOrThrow 가 metadata jsonb→text 변환 처리
  await insertNotificationsOrThrow(rows as unknown as Record<string, unknown>[]);
}
