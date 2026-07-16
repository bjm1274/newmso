import { NextRequest, NextResponse } from 'next/server';
import { syncAnnualLeaveUsedForStaff } from '@/lib/annual-leave-ledger';
import { recalculateLeaveBalance } from '@/lib/annual-leave-balance';
import { readSessionFromRequest } from '@/lib/server-session';
import { getD1Binding } from '@/lib/db';
import { formatKoreanDateKey } from '@/lib/seoul-time';

export async function POST(req: NextRequest) {
  try {
    // 로그인 여부만 검사 (회사 간 접근은 MSO 설계상 허용).
    const session = await readSessionFromRequest(req);
    if (!session?.user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { staffId } = await req.json();
    if (!staffId) {
      return NextResponse.json({ ok: false, error: 'staffId가 필요합니다.' }, { status: 400 });
    }

    // leave_balances 재계산 — KST 연도 (UTC getFullYear 금지)
    const year = Number(formatKoreanDateKey(new Date()).slice(0, 4));
    await syncAnnualLeaveUsedForStaff(staffId, { year, writeStaffMembers: false });
    await recalculateLeaveBalance(staffId, year);

    return NextResponse.json({ ok: true, year, staffMembersUntouched: true });
  } catch (err: any) {
    console.error('[annual-leave/sync] 실패:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

