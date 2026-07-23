/**
 * 연차 잔액·원장 진단 (읽기 전용 + 선택적 leave_balances 재계산)
 * staff_members 명단/필드는 수정하지 않음.
 */

import { NextRequest, NextResponse } from 'next/server';
import { readSessionFromRequest } from '@/lib/server-session';
import { recalculateLeaveBalance, resolveGrantedDaysFromAccruals } from '@/lib/annual-leave-balance';
import { syncAnnualLeaveUsedForStaff } from '@/lib/annual-leave-ledger';
import { getUnifiedAnnualLeaveSummary } from '@/lib/unified-leave-ledger';
import { isGroupAccount } from '@/types';
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
    const noAccrual: unknown[] = [];

    for (const s of active) {
      const sid = String(s.id);
      try {
        const summary = await getUnifiedAnnualLeaveSummary(sid);
        if (summary.entries.length === 0) {
          noAccrual.push({
            staffId: sid,
            name: s.name,
            department: s.department,
            company: s.company,
          });
        }

        if (summary.used > summary.total + 0.01) {
          overuse.push({
            staffId: sid,
            name: s.name,
            department: s.department,
            company: s.company,
            total_days: summary.total,
            used_days: summary.used,
            remaining_days: summary.remaining,
            excess: Math.round((summary.used - summary.total) * 10) / 10,
          });
        }
      } catch {
        noAccrual.push({
          staffId: sid,
          name: s.name,
          department: s.department,
          company: s.company,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      year,
      summary: {
        activeStaff: active.length,
        overuseCount: overuse.length,
        noAccrualCount: noAccrual.length,
      },
      overuse,
      noAccrual,
      note: '단일 원장(leave_ledger) 기반 읽기 전용 진단입니다.',
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
        .select({ id: staffMembersTable.id, status: staffMembersTable.status, permissions: staffMembersTable.permissions })
        .from(staffMembersTable);
      ids = staffs
        .filter((s) => (!s.status || s.status === '재직') && !isGroupAccount(s as any))
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
