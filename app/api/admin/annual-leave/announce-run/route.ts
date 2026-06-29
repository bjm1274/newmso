import { NextRequest, NextResponse } from 'next/server';
import {
  getD1Binding,
  getD1Drizzle,
  approvals as approvalsTable,
  eq,
  and,
  inArray,
} from '@/lib/db';
import { announceLeaveApprovalIfNeeded } from '@/lib/leave-notice-cron';
import {
  isAdminSession,
  isSystemMasterSession,
  readSessionFromRequest,
} from '@/lib/server-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const session = await readSessionFromRequest(req);
    if (!session?.user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (!isAdminSession(session.user) && !isSystemMasterSession(session.user)) {
      return NextResponse.json({ ok: false, error: '관리자만 실행할 수 있습니다.' }, { status: 403 });
    }

    const d1 = await getD1Binding();
    if (!d1) {
      return NextResponse.json({ ok: false, error: 'D1 binding not available' }, { status: 500 });
    }
    const db = getD1Drizzle(d1);

    // 6월 1일 이후 승인된 모든 연차/휴가 결재 건 조회
    const approvals = await db
      .select({
        id: approvalsTable.id,
        sender_id: approvalsTable.sender_id,
        sender_name: approvalsTable.sender_name,
        sender_company: approvalsTable.sender_company,
        company_id: approvalsTable.company_id,
        title: approvalsTable.title,
        meta_data: approvalsTable.meta_data,
        created_at: approvalsTable.created_at,
      })
      .from(approvalsTable)
      .where(
        and(
          eq(approvalsTable.status, '승인'),
          inArray(approvalsTable.type, [
            '연차/휴가',
            '휴가신청',
            '경조사',
            '경조사신청',
            '경조휴가',
            '병가',
            '병가신청',
            '특별휴가',
          ]),
        ),
      );

    let announcedCount = 0;
    const details = [];

    for (const app of approvals) {
      let meta = null;
      if (typeof app.meta_data === 'string') {
        try {
          meta = JSON.parse(app.meta_data);
        } catch {
          // ignore
        }
      } else if (app.meta_data && typeof app.meta_data === 'object') {
        meta = app.meta_data;
      }

      const startDate = meta?.startDate || meta?.start_date;
      if (startDate && startDate >= '2026-06-01') {
        const approvalRow = {
          id: String(app.id),
          sender_id: app.sender_id,
          sender_name: app.sender_name,
          sender_company: app.sender_company,
          company_id: app.company_id,
          title: app.title,
          meta_data: meta,
          created_at: app.created_at,
        };

        const announced = await announceLeaveApprovalIfNeeded(db, approvalRow);
        if (announced) {
          announcedCount++;
          details.push({
            name: app.sender_name,
            startDate,
            status: 'announced'
          });
        }
      }
    }

    return NextResponse.json({
      ok: true,
      announcedCount,
      details
    });
  } catch (err) {
    console.error('[admin/annual-leave/announce-run] 실패:', err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : '연차 공지 소급 실행 중 오류가 발생했습니다.',
      },
      { status: 500 },
    );
  }
}
