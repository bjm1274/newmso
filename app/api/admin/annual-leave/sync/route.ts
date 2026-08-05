import { NextRequest, NextResponse } from 'next/server';
import { syncAnnualLeaveUsedForStaff } from '@/lib/annual-leave-ledger';
import { recalculateLeaveBalance } from '@/lib/annual-leave-balance';
import { readSessionFromRequest } from '@/lib/server-session';
import { canAccessStaffRecord } from '@/lib/d1-api-helpers';
import { getD1Binding } from '@/lib/db';
import { formatKoreanDateKey } from '@/lib/seoul-time';

export async function POST(req: NextRequest) {
  try {
    // 본인 재계산(마이페이지 연차휴가내역)과 타인 재계산(인사관리)이 같은 라우트를 쓴다.
    // 회사 간 접근은 MSO 설계상 허용하되, 타인 대상은 인사/관리자 권한을 요구한다.
    const session = await readSessionFromRequest(req);
    if (!session?.user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { staffId } = await req.json();
    if (!staffId) {
      return NextResponse.json({ ok: false, error: 'staffId가 필요합니다.' }, { status: 400 });
    }

    if (!canAccessStaffRecord(session.user, String(staffId))) {
      return NextResponse.json({ ok: false, error: '본인 또는 인사 권한자만 실행할 수 있습니다.' }, { status: 403 });
    }

    // leave_balances 재계산 — KST 연도 (UTC getFullYear 금지)
    const year = Number(formatKoreanDateKey(new Date()).slice(0, 4));
    await syncAnnualLeaveUsedForStaff(staffId, { year, writeStaffMembers: false });
    await recalculateLeaveBalance(staffId, year);

    // `staffMembersUntouched: true` 를 돌려주던 자리다. 사실이 아니었다 —
    // recalculateLeaveBalance 가 요약을 거치며 staff_members 미러를 원장 값으로
    // 갱신한다. 읽는 쪽이 없어 오해만 남기던 필드라 실제 동작으로 바꾼다.
    return NextResponse.json({ ok: true, year, mirrorsSyncedFromLedger: true });
  } catch (err: any) {
    console.error('[annual-leave/sync] 실패:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

