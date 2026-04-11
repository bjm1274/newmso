import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  generateMonthlyHRReport,
  generateMonthlyPayrollReport,
  notifyRecipients,
} from '@/lib/auto-report-generator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CRON_SECRET = process.env.CRON_SECRET || '';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // 활성 스케줄 조회
    const { data: schedules } = await supabase
      .from('report_schedules')
      .select('id, report_type, company_id, recipients, enabled')
      .eq('enabled', true);

    if (!schedules || schedules.length === 0) {
      return NextResponse.json({ ok: true, message: '활성 스케줄 없음', generated: 0 });
    }

    const results: Array<{ type: string; period: string; status: string }> = [];

    for (const schedule of schedules) {
      try {
        const reportType = String(schedule.report_type);
        const companyId = schedule.company_id || null;
        const recipients = Array.isArray(schedule.recipients) ? schedule.recipients : [];

        let summary: Record<string, unknown> = {};

        if (reportType === 'monthly_hr') {
          const report = await generateMonthlyHRReport(supabase, companyId, period);
          summary = report.summary;
        } else if (reportType === 'monthly_payroll') {
          const report = await generateMonthlyPayrollReport(supabase, companyId, period);
          summary = report.summary;
        }

        // generated_reports에 기록
        await supabase.from('generated_reports').insert({
          schedule_id: schedule.id,
          report_type: reportType,
          period,
          status: 'completed',
          summary,
        });

        // 스케줄 last_generated_at 업데이트
        await supabase
          .from('report_schedules')
          .update({ last_generated_at: now.toISOString() })
          .eq('id', schedule.id);

        // 수신자 알림
        if (recipients.length > 0) {
          await notifyRecipients(supabase, recipients as string[], reportType, period);
        }

        results.push({ type: reportType, period, status: 'completed' });
      } catch (err) {
        results.push({
          type: String(schedule.report_type),
          period,
          status: `failed: ${err instanceof Error ? err.message : 'unknown'}`,
        });
      }
    }

    return NextResponse.json({ ok: true, generated: results.length, results });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '보고서 생성 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
