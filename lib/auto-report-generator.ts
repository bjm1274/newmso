/**
 * 정기 보고서 자동 생성
 * 인사/급여/재고 보고서를 크론 스케줄로 자동 생성
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getStaffEmploymentType } from './staff-meta';

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

/**
 * 인사현황 보고서 데이터 생성
 */
export async function generateMonthlyHRReport(
  supabase: SupabaseClient,
  companyId: string | null,
  period: string, // YYYY-MM
): Promise<{ summary: Record<string, unknown> }> {
  let query = supabase.from('staff_members').select('id, department, position, status, permissions');
  if (companyId) query = query.eq('company', companyId);

  const { data: staffs } = await query;
  const list = staffs || [];

  const byDept: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const byType: Record<string, number> = {};

  for (const s of list) {
    const dept = String((s as Record<string, unknown>).department || '미지정');
    const status = String((s as Record<string, unknown>).status || '기타');
    const empType = getStaffEmploymentType(s, '정규직');
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
      generatedAt: new Date().toISOString(),
    },
  };
}

/**
 * 급여 요약 보고서 데이터 생성
 */
export async function generateMonthlyPayrollReport(
  supabase: SupabaseClient,
  companyId: string | null,
  period: string,
): Promise<{ summary: Record<string, unknown> }> {
  const { data: records } = await supabase
    .from('payroll_records')
    .select('base_salary, total_taxable, total_deduction, net_pay, status')
    .eq('year_month', period)
    .in('status', ['확정', 'finalized']);

  const list = (records || []) as Record<string, unknown>[];

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
      generatedAt: new Date().toISOString(),
    },
  };
}

/**
 * 보고서 생성 후 알림 발송
 */
export async function notifyRecipients(
  supabase: SupabaseClient,
  recipients: string[],
  reportType: string,
  period: string,
): Promise<void> {
  const typeLabels: Record<string, string> = {
    monthly_hr: '월간 인사현황',
    monthly_payroll: '월간 급여 요약',
    quarterly_inventory: '분기 재고 현황',
    quarterly_business: '분기 경영 보고서',
  };

  const label = typeLabels[reportType] || reportType;

  for (const userId of recipients) {
    await supabase.from('notifications').insert({
      user_id: userId,
      type: '보고서',
      title: `${label} 보고서 생성 완료`,
      body: `${period} ${label} 보고서가 자동 생성되었습니다. 관리자 메뉴에서 확인하세요.`,
      read_at: null,
    });
  }
}
