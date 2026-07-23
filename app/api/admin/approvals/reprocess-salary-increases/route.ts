import { NextResponse } from 'next/server';
import { readSessionFromRequest, isAdminSession } from '@/lib/server-session';
import { getD1Binding, getD1Drizzle, approvals, staff_members, eq, and } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session?.user?.id || !isAdminSession(session.user)) {
      return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const d1 = await getD1Binding();
    if (!d1) {
      return NextResponse.json({ ok: false, error: 'D1 Binding을 사용할 수 없습니다.' }, { status: 500 });
    }
    const db = getD1Drizzle(d1);

    // 승인 완료된 모든 결재문서 조회
    const approvedDocs = await db
      .select()
      .from(approvals)
      .where(eq(approvals.status, '승인'));

    const updatedResults: Array<{ docId: string; staffName: string; newSalary: number }> = [];

    for (const doc of approvedDocs) {
      let metaData: Record<string, unknown> = {};
      if (typeof doc.meta_data === 'string' && doc.meta_data.length > 0) {
        try {
          metaData = JSON.parse(doc.meta_data) as Record<string, unknown>;
        } catch {
          continue;
        }
      } else if (typeof doc.meta_data === 'object' && doc.meta_data !== null) {
        metaData = doc.meta_data as Record<string, unknown>;
      }

      const isSalaryIncreaseForm =
        String(doc.type || '').trim() === '급여인상평가서' ||
        String(metaData?.form_type || '').trim() === '급여인상평가서' ||
        String(metaData?.form_slug || '').trim() === 'salary_increase_evaluation' ||
        String(metaData?.request_category || '').trim() === 'salary_increase_evaluation' ||
        metaData?.evaluationType === 'salary_increase';

      if (!isSalaryIncreaseForm) continue;

      const targetStaffId = metaData?.targetStaffId ? String(metaData.targetStaffId).trim() : null;
      const targetStaffName = metaData?.targetStaffName
        ? String(metaData.targetStaffName).trim()
        : metaData?.target
          ? String(metaData.target).trim()
          : null;
      const newSalary = typeof metaData?.newSalary === 'number'
        ? metaData.newSalary
        : typeof metaData?.proposedSalary === 'number'
          ? metaData.proposedSalary
          : typeof metaData?.afterSalary === 'number'
            ? metaData.afterSalary
            : typeof metaData?.currentSalary === 'number' && typeof metaData?.raisePercent === 'number'
              ? Math.round(metaData.currentSalary * (1 + metaData.raisePercent / 100))
              : null;

      if (!newSalary || newSalary <= 0) continue;

      let matchedStaffId = targetStaffId;
      if (!matchedStaffId && targetStaffName) {
        const rows = await db
          .select({ id: staff_members.id, base_salary: staff_members.base_salary })
          .from(staff_members)
          .where(
            doc.company_id
              ? and(eq(staff_members.name, targetStaffName), eq(staff_members.company_id, String(doc.company_id)))
              : eq(staff_members.name, targetStaffName)
          )
          .limit(1);

        if (rows[0]?.id) {
          matchedStaffId = String(rows[0].id);
        }
      }

      if (matchedStaffId) {
        await db
          .update(staff_members)
          .set({
            base_salary: Math.round(newSalary),
            updated_at: new Date().toISOString()
          })
          .where(eq(staff_members.id, matchedStaffId));

        updatedResults.push({
          docId: String(doc.id),
          staffName: targetStaffName || matchedStaffId,
          newSalary: Math.round(newSalary)
        });
      }
    }

    return NextResponse.json({
      ok: true,
      message: `${updatedResults.length}건의 급여 인상이 직원정보에 반영되었습니다.`,
      results: updatedResults
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '처리 중 오류가 발생했습니다.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
