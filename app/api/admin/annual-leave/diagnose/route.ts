/**
 * 연차 잔액·원장 진단 (읽기 전용 + 선택적 leave_balances 재계산)
 * staff_members 명단/필드는 수정하지 않음.
 */

import { NextRequest, NextResponse } from 'next/server';
import { readSessionFromRequest } from '@/lib/server-session';
import { recalculateLeaveBalance, resolveGrantedDaysFromAccruals } from '@/lib/annual-leave-balance';
import { syncAnnualLeaveUsedForStaff } from '@/lib/annual-leave-ledger';
import {
  getD1Binding,
  getD1Drizzle,
  staff_members as staffMembersTable,
  leave_balances as leaveBalancesTable,
  leave_accruals as leaveAccrualsTable,
  eq,
} from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const session = await readSessionFromRequest(req);
    if (!session?.user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const year = Number(req.nextUrl.searchParams.get('year')) || new Date().getFullYear();
    const d1 = await getD1Binding();
    if (!d1) {
      return NextResponse.json({ ok: false, error: 'D1 unavailable' }, { status: 500 });
    }
    const db = getD1Drizzle(d1);

    const staffs = await db
      .select({
        id: staffMembersTable.id,
        name: staffMembersTable.name,
        department: staffMembersTable.department,
        company: staffMembersTable.company,
        status: staffMembersTable.status,
        annual_leave_total: staffMembersTable.annual_leave_total,
        annual_leave_used: staffMembersTable.annual_leave_used,
        hire_date: staffMembersTable.hire_date,
        join_date: staffMembersTable.join_date,
      })
      .from(staffMembersTable);

    const active = staffs.filter((s) => !s.status || s.status === '재직');

    const overuse: unknown[] = [];
    const totalAccrualGaps: unknown[] = [];
    const noAccrual: unknown[] = [];
    const formulaMismatch: unknown[] = [];

    for (const s of active) {
      const sid = String(s.id);
      const balRows = await db
        .select()
        .from(leaveBalancesTable)
        .where(eq(leaveBalancesTable.staff_id, sid));
      const bal = balRows.find((b) => Number(b.year) === year) ?? balRows[0];

      const accrualRows = await db
        .select({
          kind: leaveAccrualsTable.kind,
          period_key: leaveAccrualsTable.period_key,
          days: leaveAccrualsTable.days,
        })
        .from(leaveAccrualsTable)
        .where(eq(leaveAccrualsTable.staff_id, sid));

      const accrualSum = accrualRows.reduce((n, r) => n + (Number(r.days) || 0), 0);
      const granted = await resolveGrantedDaysFromAccruals(
        sid,
        Number(s.annual_leave_total) || 0,
      );

      if (accrualRows.length === 0) {
        noAccrual.push({
          staffId: sid,
          name: s.name,
          department: s.department,
          company: s.company,
        });
      }

      const staffTotal = Number(s.annual_leave_total) || 0;
      const gap = Math.abs(staffTotal - accrualSum);
      if (gap > 0.5) {
        totalAccrualGaps.push({
          staffId: sid,
          name: s.name,
          department: s.department,
          company: s.company,
          staffTotal,
          accrualSum,
          grantedForBalance: granted.totalDays,
          grantSource: granted.source,
          gap: Math.round(gap * 10) / 10,
        });
      }

      if (bal) {
        const total = Number(bal.total_days) || 0;
        const used = Number(bal.used_days) || 0;
        const remaining = Number(bal.remaining_days) || 0;
        const expired = Number(bal.expired_days) || 0;
        const compensated = Number(bal.compensated_days) || 0;
        const expected = Math.max(0, total - used - expired - compensated);
        if (used > total + 0.01) {
          overuse.push({
            staffId: sid,
            name: s.name,
            department: s.department,
            company: s.company,
            year: bal.year,
            total_days: total,
            used_days: used,
            remaining_days: remaining,
            excess: Math.round((used - total) * 10) / 10,
          });
        }
        if (Math.abs(remaining - expected) > 0.01 && used <= total + 0.01) {
          formulaMismatch.push({
            staffId: sid,
            name: s.name,
            remaining,
            expected,
          });
        }
      }
    }

    totalAccrualGaps.sort(
      (a, b) => Number((b as { gap: number }).gap) - Number((a as { gap: number }).gap),
    );

    return NextResponse.json({
      ok: true,
      year,
      summary: {
        activeStaff: active.length,
        overuseCount: overuse.length,
        totalAccrualGapCount: totalAccrualGaps.length,
        noAccrualCount: noAccrual.length,
        formulaMismatchCount: formulaMismatch.length,
      },
      overuse,
      totalAccrualGaps: totalAccrualGaps.slice(0, 30),
      noAccrual,
      formulaMismatch,
      note: '읽기 전용 진단. staff_members 는 수정하지 않습니다. rebalance=1 POST 로 leave_balances 만 재계산 가능.',
    });
  } catch (err) {
    console.error('[annual-leave/diagnose]', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

/** leave_balances 일괄 재계산 (staff_members 미수정) */
export async function POST(req: NextRequest) {
  try {
    const session = await readSessionFromRequest(req);
    if (!session?.user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      staffIds?: string[];
      year?: number;
      allActive?: boolean;
    };
    const year = body.year || new Date().getFullYear();
    const d1 = await getD1Binding();
    if (!d1) {
      return NextResponse.json({ ok: false, error: 'D1 unavailable' }, { status: 500 });
    }
    const db = getD1Drizzle(d1);

    let ids = Array.isArray(body.staffIds) ? body.staffIds.map(String) : [];
    if (body.allActive || ids.length === 0) {
      const staffs = await db
        .select({ id: staffMembersTable.id, status: staffMembersTable.status })
        .from(staffMembersTable);
      ids = staffs
        .filter((s) => !s.status || s.status === '재직')
        .map((s) => String(s.id));
    }

    const results: Array<{ staffId: string; ok: boolean; error?: string }> = [];
    for (const staffId of ids) {
      try {
        await syncAnnualLeaveUsedForStaff(staffId, {
          year,
          writeStaffMembers: false,
        });
        await recalculateLeaveBalance(staffId, year);
        results.push({ staffId, ok: true });
      } catch (e) {
        results.push({
          staffId,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return NextResponse.json({
      ok: true,
      year,
      processed: results.length,
      failed: results.filter((r) => !r.ok).length,
      results,
      note: 'leave_balances 만 갱신. staff_members 미수정.',
    });
  } catch (err) {
    console.error('[annual-leave/diagnose POST]', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
