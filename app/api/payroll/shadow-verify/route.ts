/**
 * 급여 확정 저장 서버 검증 (D04-008)
 *
 * 두 가지를 서버로 옮긴다.
 *
 * 1) **마감 잠금 판정** — 예전에는 클라이언트가 payroll_locks 를 직접 조회했고,
 *    그 조회가 실패하면 `if (lockError) { console.error(...) } else if (isSaveLocked)`
 *    구조 때문에 **차단 없이 그대로 저장이 진행**됐다(코드 주석이 스스로
 *    "조회 실패 시 막지 않음(fail-open)" 이라고 적어 두고 있었다).
 *    잠금 조회 한 번을 실패시키는 것만으로 마감이 무력화된다는 뜻이다.
 *    이제 서버가 판정하고, 판정 자체가 불가능하면 **막는다**(fail-closed).
 *    돈이 걸린 가드에서 "모르겠으면 통과"는 성립하지 않는다.
 *
 * 2) **금액 shadow 재계산** — 서버가 같은 입력으로 4대보험·소득세를 다시 계산해
 *    클라이언트 값과 대조한다. **금액은 바꾸지 않는다.** 어긋나면 감사로그에만
 *    남긴다. 이유는 lib/payroll-shadow-verify.ts 상단 주석 참고 — 강제 교정은
 *    diff 0 을 실측으로 확인한 뒤의 다음 단계다.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';
import {
  getD1Binding,
  getD1Drizzle,
  payroll_locks as payrollLocksTable,
  tax_insurance_rates as taxInsuranceRatesTable } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { hasStaffRecordScope, userId } from '@/lib/d1-api-helpers';
import { normalizeSessionUser, readSessionFromRequest } from '@/lib/server-session';
import {
  hasOfficialWithholdingTable,
  resolveServerTaxInsuranceRates,
  verifyPayrollRecordShadow,
  type ShadowVerifyStaffInput,
  type ShadowVerifyStaffResult } from '@/lib/payroll-shadow-verify';

export const dynamic = 'force-dynamic';

type ShadowVerifyRequest = {
  yearMonth?: string;
  companyName?: string;
  targetStatus?: string;
  staffs?: ShadowVerifyStaffInput[];
};

export type ShadowVerifyResponse = {
  ok: true;
  /** 서버 판정 — true 면 클라이언트는 저장을 중단해야 한다. */
  locked: boolean;
  lockScopes: string[];
  /** 서버가 읽은 간이세액표가 공식 표인지. false 면 소득세 대조 신뢰도가 낮다. */
  officialWithholdingTable: boolean;
  ratesConfigured: boolean;
  /** 불일치가 있는 직원만 담긴다. 비어 있으면 서버 재계산과 완전 일치. */
  mismatches: ShadowVerifyStaffResult[];
};

export async function POST(request: NextRequest) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const sessionUser = normalizeSessionUser(session.user);
    const actorId = userId(sessionUser);
    if (!actorId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // payroll_records 쓰기 정책(ADMIN_OR_MANAGER)과 같은 경계.
    if (!hasStaffRecordScope(sessionUser)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as ShadowVerifyRequest;
    const yearMonth = String(body.yearMonth || '').trim();
    const companyName = String(body.companyName || '전체').trim() || '전체';
    if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
      return NextResponse.json({ error: 'yearMonth(YYYY-MM)가 필요합니다.' }, { status: 400 });
    }

    const d1 = await getD1Binding();
    if (!d1) {
      // 잠금을 확인할 수 없다 → 통과시키지 않는다(위 1번 참고).
      return NextResponse.json(
        { error: '급여 마감 잠금 상태를 확인할 수 없어 저장을 중단합니다.' },
        { status: 503 },
      );
    }
    const db = getD1Drizzle(d1);

    // 1) 마감 잠금
    const lockRows = await db
      .select({ company_name: payrollLocksTable.company_name })
      .from(payrollLocksTable)
      .where(eq(payrollLocksTable.year_month, yearMonth));

    const lockScopes = lockRows.map((row) => String(row.company_name ?? '전체'));
    // 잠금 스코프가 '전체' 면 모든 회사가 잠긴다. 선택 범위가 '전체' 면 어떤 잠금이든 걸린다.
    const locked =
      lockScopes.length > 0 &&
      (companyName === '전체' || lockScopes.some((scope) => scope === '전체' || scope === companyName));

    if (locked) {
      return NextResponse.json({
        ok: true,
        locked: true,
        lockScopes,
        officialWithholdingTable: false,
        ratesConfigured: false,
        mismatches: [] } satisfies ShadowVerifyResponse);
    }

    // 2) shadow 재계산 — 요율은 **서버가 직접** 읽는다. 클라이언트가 보낸 요율을
    //    쓰면 "요율 로드 실패" 라는 원래 잡고 싶은 결함을 그대로 통과시키게 된다.
    const year = Number(yearMonth.slice(0, 4));
    const scopedRows = await db
      .select()
      .from(taxInsuranceRatesTable)
      .where(and(
        eq(taxInsuranceRatesTable.company_name, companyName),
        eq(taxInsuranceRatesTable.effective_year, year),
      ))
      .limit(1);

    let rateRow = scopedRows[0] as Record<string, unknown> | undefined;
    if (!rateRow && companyName !== '전체') {
      const fallbackRows = await db
        .select()
        .from(taxInsuranceRatesTable)
        .where(and(
          eq(taxInsuranceRatesTable.company_name, '전체'),
          eq(taxInsuranceRatesTable.effective_year, year),
        ))
        .limit(1);
      rateRow = fallbackRows[0] as Record<string, unknown> | undefined;
    }

    const rates = resolveServerTaxInsuranceRates(rateRow ?? null);
    const officialWithholdingTable = hasOfficialWithholdingTable(rates);

    const staffs = Array.isArray(body.staffs) ? body.staffs : [];
    const mismatches = staffs
      .map((input) => verifyPayrollRecordShadow(input, rates))
      .filter((result) => result.mismatches.length > 0);

    if (mismatches.length > 0) {
      await logAudit(
        '급여서버재계산불일치',
        'payroll',
        yearMonth,
        {
          year_month: yearMonth,
          company_name: companyName,
          target_status: body.targetStatus ?? null,
          checked_count: staffs.length,
          mismatch_count: mismatches.length,
          rates_configured: rates.configured === true,
          official_withholding_table: officialWithholdingTable,
          // 금액 자체는 바꾸지 않았다는 사실을 로그에 명시해 둔다.
          enforcement: 'shadow-only (금액 미변경)',
          details: mismatches },
        actorId,
        sessionUser.name ?? undefined,
      );
    }

    return NextResponse.json({
      ok: true,
      locked: false,
      lockScopes,
      officialWithholdingTable,
      ratesConfigured: rates.configured === true,
      mismatches } satisfies ShadowVerifyResponse);
  } catch (error) {
    console.error('[payroll/shadow-verify] 검증 실패:', error);
    return NextResponse.json(
      { error: '급여 저장 전 서버 검증에 실패했습니다.' },
      { status: 500 },
    );
  }
}
