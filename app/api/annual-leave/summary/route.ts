import { NextRequest, NextResponse } from 'next/server';
import { readSessionFromRequest } from '@/lib/server-session';
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

    await syncApprovedLeaveRequestsToLedger(staffId);
    const summary = await getUnifiedAnnualLeaveSummary(staffId);
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load annual leave.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
