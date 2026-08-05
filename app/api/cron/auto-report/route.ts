import { NextResponse } from 'next/server';
import {
  generateMonthlyHRReport,
  generateMonthlyPayrollReport,
  notifyRecipients } from '@/lib/auto-report-generator';
import {
  generated_reports as generatedReportsTable,
  report_schedules as reportSchedulesTable,
  getD1Binding,
  getD1Drizzle,
  eq } from '@/lib/db';
import { logD1BindingMissing } from '@/lib/db/mirror-metrics';
import { getKoreanMonthString } from '@/lib/seoul-time';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CRON_SECRET = process.env.CRON_SECRET || '';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 보고서 대상 월은 KST 기준이어야 한다. 예전에는 런타임 로컬(=워커 UTC) 달력을 썼고,
    // KST 1일 00:00~08:59 에 실행되면 UTC 로는 아직 전월이라 전월 period 로 보고서를
    // 만들었다(8차 D10-008).
    const period = getKoreanMonthString();

    // 활성 스케줄 조회
    type ScheduleRow = { id: string; report_type: string; company_id: string | null; recipients: string[] | string | null; enabled: number | boolean };
    let schedules: ScheduleRow[] | null = null;

    {
      const d1 = await getD1Binding();
      if (!d1) {
        logD1BindingMissing({ label: 'auto-report:report_schedules', backend: 'd1' });
        throw new Error('[auto-report] D1 binding not available (report_schedules)');
      }
      const db = getD1Drizzle(d1);
      const rows = await db
        .select({
          id: reportSchedulesTable.id,
          report_type: reportSchedulesTable.report_type,
          company_id: reportSchedulesTable.company_id,
          recipients: reportSchedulesTable.recipients,
          enabled: reportSchedulesTable.enabled })
        .from(reportSchedulesTable)
        .where(eq(reportSchedulesTable.enabled, 1));
      schedules = rows as ScheduleRow[];
    }

    if (!schedules || schedules.length === 0) {
      return NextResponse.json({ ok: true, message: '활성 스케줄 없음', generated: 0 });
    }

    const results: Array<{ type: string; period: string; status: string }> = [];

    for (const schedule of schedules) {
      try {
        const reportType = String(schedule.report_type);
        const companyId = schedule.company_id || null;
        // D1에서 recipients는 TEXT(JSON) → 파싱
        let recipientsRaw = schedule.recipients;
        if (typeof recipientsRaw === 'string') {
          try { recipientsRaw = JSON.parse(recipientsRaw) as string[]; } catch { recipientsRaw = []; }
        }
        const recipients = Array.isArray(recipientsRaw) ? recipientsRaw : [];

        let summary: Record<string, unknown> = {};

        if (reportType === 'monthly_hr') {
          const report = await generateMonthlyHRReport(companyId, period);
          summary = report.summary;
        } else if (reportType === 'monthly_payroll') {
          const report = await generateMonthlyPayrollReport(companyId, period);
          summary = report.summary;
        }

        // Phase 8-G — generated_reports D1 직접 INSERT
        const reportRow = {
          schedule_id: schedule.id,
          report_type: reportType,
          period,
          status: 'completed',
          summary };
        {
          const d1 = await getD1Binding();
          if (!d1) {
            logD1BindingMissing({ label: 'auto-report:generated_reports', backend: 'd1' });
            throw new Error('[auto-report] D1 binding not available');
          }
          const db = getD1Drizzle(d1);
          await db.insert(generatedReportsTable).values({
            id: crypto.randomUUID(),
            schedule_id: reportRow.schedule_id,
            report_type: reportRow.report_type,
            period: reportRow.period,
            status: reportRow.status,
            summary: JSON.stringify(reportRow.summary),
            created_at: new Date().toISOString() });
        }

        // 스케줄 last_generated_at 업데이트
        {
          const d1 = await getD1Binding();
          if (d1) {
            const db = getD1Drizzle(d1);
            await db
              .update(reportSchedulesTable)
              .set({ last_generated_at: new Date().toISOString() })
              .where(eq(reportSchedulesTable.id, schedule.id));
          }
        }

        // 수신자 알림
        if (recipients.length > 0) {
          await notifyRecipients(recipients as string[], reportType, period);
        }

        results.push({ type: reportType, period, status: 'completed' });
      } catch (err) {
        results.push({
          type: String(schedule.report_type),
          period,
          status: `failed: ${err instanceof Error ? err.message : 'unknown'}` });
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
