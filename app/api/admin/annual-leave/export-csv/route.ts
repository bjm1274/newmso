import { NextRequest, NextResponse } from 'next/server';
import { getD1Binding, getD1Drizzle, staff_members } from '@/lib/db';
import { getUnifiedAnnualLeaveSummary } from '@/lib/unified-leave-ledger';

export async function GET(req: NextRequest) {
  try {
    const d1 = await getD1Binding();
    if (!d1) return NextResponse.json({ error: 'No D1' }, { status: 500 });
    const db = getD1Drizzle(d1);

    const staffs = await db.select().from(staff_members);
    const year = 2026;

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

