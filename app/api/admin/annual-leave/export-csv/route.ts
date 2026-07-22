import { NextRequest, NextResponse } from 'next/server';
import { getD1Binding, getD1Drizzle, staff_members, leave_balances, eq } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const d1 = await getD1Binding();
    if (!d1) return NextResponse.json({ error: 'No D1' }, { status: 500 });
    const db = getD1Drizzle(d1);

    const staffs = await db.select().from(staff_members);
    const balances = await db.select().from(leave_balances);

    const year = 2026;
    const rows = staffs.map((s) => {
      const bal = balances.find((b) => String(b.staff_id) === String(s.id) && Number(b.year) === year);
      const total = bal?.total_days ?? s.annual_leave_total ?? 0;
      const used = bal?.used_days ?? s.annual_leave_used ?? 0;
      const expired = bal?.expired_days ?? 0;
      const compensated = bal?.compensated_days ?? 0;
      const remaining = bal?.remaining_days ?? Math.max(0, total - used - expired - compensated);

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
    });

    return NextResponse.json({ ok: true, count: rows.length, rows });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
