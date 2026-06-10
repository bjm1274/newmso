import { NextRequest, NextResponse } from 'next/server';
import { syncAnnualLeaveUsedForStaff } from '@/lib/annual-leave-ledger';
import { recalculateLeaveBalance } from '@/lib/annual-leave-balance';
import { readSessionFromRequest } from '@/lib/server-session';

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

    // 서버 측에서 D1 바인딩이 보장된 환경이므로 안전하게 동기화 및 잔액 계산 실행
    await syncAnnualLeaveUsedForStaff(staffId);
    await recalculateLeaveBalance(staffId);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[annual-leave/sync] 실패:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
