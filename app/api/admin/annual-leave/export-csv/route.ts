import { NextRequest, NextResponse } from 'next/server';
import { getD1Binding, getD1Drizzle, staff_members } from '@/lib/db';
import { getUnifiedAnnualLeaveSummary } from '@/lib/unified-leave-ledger';
import { formatKoreanDateKey } from '@/lib/seoul-time';
import {
  isAdminSession,
  isSystemMasterSession,
  readSessionFromRequest } from '@/lib/server-session';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // 전 직원 인사·연차 데이터를 반환하므로 형제 라우트(accrual-run)와 동일한 관리자 게이트 적용.
    // middleware 는 '/main/:path*' 만 검사하므로 API 인증은 라우트가 직접 해야 한다.
    const session = await readSessionFromRequest(req);
    if (!session?.user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (!isAdminSession(session.user) && !isSystemMasterSession(session.user)) {
      return NextResponse.json({ ok: false, error: '관리자만 조회할 수 있습니다.' }, { status: 403 });
    }

    const d1 = await getD1Binding();
    if (!d1) return NextResponse.json({ error: 'No D1' }, { status: 500 });
    const db = getD1Drizzle(d1);

    const staffs = await db.select().from(staff_members);
    // 라벨 연도는 KST 오늘 기준이다.
    //
    // 예전에는 `const year = 2026;` 으로 박혀 있었다. 아래 수치는
    // getUnifiedAnnualLeaveSummary 가 **오늘 기준 주기**로 계산하는데 라벨만 2026 에
    // 고정돼 있어서, 2027년부터는 계산 기준과 라벨이 어긋난 CSV 가 나간다.
    const year = Number(formatKoreanDateKey(new Date()).slice(0, 4));

    const rows = await Promise.all(
      staffs.map(async (s) => {
        let total = 0;
        let used = 0;
        let expired = 0;
        let compensated = 0;
        let remaining = 0;

        try {
          const summary = await getUnifiedAnnualLeaveSummary(String(s.id));
          total = summary.total;
          used = summary.used;
          expired = summary.expired;
          compensated = summary.compensated;
          remaining = summary.remaining;
        } catch {
          // 입사일 미설정 등의 경우 0 처리
        }

        return {
          id: s.id,
          name: s.name,
          department: s.department || '-',
          company: s.company || '-',
          status: s.status || '재직',
          hire_date: s.hire_date || s.join_date || '-',
          year,
          total_days: total,
          used_days: used,
          expired_days: expired,
          compensated_days: compensated,
          remaining_days: remaining,
        };
      })
    );

    return NextResponse.json({ ok: true, count: rows.length, rows });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

