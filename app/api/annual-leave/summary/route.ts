import { NextRequest, NextResponse } from 'next/server';
import { readSessionFromRequest } from '@/lib/server-session';
import { canAccessStaffRecordInCompany } from '@/lib/d1-api-helpers';
import {
  getUnifiedAnnualLeaveSummary,
  syncApprovedLeaveRequestsToLedger,
} from '@/lib/unified-leave-ledger';

export async function GET(request: NextRequest) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const staffId = String(request.nextUrl.searchParams.get('staffId') ?? '').trim();
    if (!staffId) return NextResponse.json({ error: 'staffId is required.' }, { status: 400 });

    // 연차 원장에는 휴가 사유가 포함된다. 본인 외 조회는 인사/관리자 권한 + 같은 회사여야 한다.
    // 예전에는 canAccessStaffRecord 만 통과하면 됐는데 그 판정에는 회사 비교가 없어서,
    // A사 인사담당이 타 회사 직원 id 로 호출하면 사유가 포함된 원장을 200 으로 받았다(D03-D07).
    if (!(await canAccessStaffRecordInCompany(session.user, staffId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await syncApprovedLeaveRequestsToLedger(staffId);
    const summary = await getUnifiedAnnualLeaveSummary(staffId);
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load annual leave.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
