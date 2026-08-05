import { NextResponse } from 'next/server';
import { readSessionFromRequest, isAdminSession } from '@/lib/server-session';
import { getD1Binding, getD1Drizzle, approvals, staff_members, salary_change_history, eq, and } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session?.user?.id || !isAdminSession(session.user)) {
      return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const d1 = await getD1Binding();
    if (!d1) {
      return NextResponse.json({ ok: false, error: 'D1 Binding을 사용할 수 없습니다.' }, { status: 500 });
    }
    const db = getD1Drizzle(d1);

    // 승인 완료된 모든 결재문서 조회
    const approvedDocs = await db
      .select()
      .from(approvals)
      .where(eq(approvals.status, '승인'));

    const updatedResults: Array<{ docId: string; staffName: string; newSalary: number }> = [];
    const skipped: Array<{ docId: string; staffName: string | null; reason: string }> = [];

    /**
     * 직원별로 **가장 나중에 승인된 문서 1건만** 반영한다.
     *
     * 예전에는 승인 문서를 정렬 없이 전부 순회하며 그때그때 UPDATE 했다.
     * 한 직원에게 인상 문서가 2건 이상이면 어느 것이 마지막에 쓰이는지가
     * D1 의 행 반환 순서에 달렸고, 2024년 문서가 2025년 문서 뒤에 처리되면
     * **급여가 과거 값으로 되돌아갔다.** 게다가 처리 완료 표시가 없어
     * 이 엔드포인트를 다시 호출할 때마다 같은 일이 반복됐다.
     */
    type Candidate = {
      doc: (typeof approvedDocs)[number];
      effectiveAt: string;
      newSalary: number;
      targetStaffId: string | null;
      targetStaffName: string | null;
    };
    const candidates: Candidate[] = [];

    for (const doc of approvedDocs) {
      let metaData: Record<string, unknown> = {};
      if (typeof doc.meta_data === 'string' && doc.meta_data.length > 0) {
        try {
          metaData = JSON.parse(doc.meta_data) as Record<string, unknown>;
        } catch {
          continue;
        }
      } else if (typeof doc.meta_data === 'object' && doc.meta_data !== null) {
        metaData = doc.meta_data as Record<string, unknown>;
      }

      const isSalaryIncreaseForm =
        String(doc.type || '').trim() === '급여인상평가서' ||
        String(metaData?.form_type || '').trim() === '급여인상평가서' ||
        String(metaData?.form_slug || '').trim() === 'salary_increase_evaluation' ||
        String(metaData?.request_category || '').trim() === 'salary_increase_evaluation' ||
        metaData?.evaluationType === 'salary_increase';

      if (!isSalaryIncreaseForm) continue;

      const targetStaffId = metaData?.targetStaffId ? String(metaData.targetStaffId).trim() : null;
      const targetStaffName = metaData?.targetStaffName
        ? String(metaData.targetStaffName).trim()
        : metaData?.target
          ? String(metaData.target).trim()
          : null;
      const newSalary = typeof metaData?.newSalary === 'number'
        ? metaData.newSalary
        : typeof metaData?.proposedSalary === 'number'
          ? metaData.proposedSalary
          : typeof metaData?.afterSalary === 'number'
            ? metaData.afterSalary
            : typeof metaData?.currentSalary === 'number' && typeof metaData?.raisePercent === 'number'
              ? Math.round(metaData.currentSalary * (1 + metaData.raisePercent / 100))
              : null;

      if (!newSalary || newSalary <= 0) continue;

      // 적용 시점 — 문서에 명시된 시행일이 있으면 그것을, 없으면 최종 수정일·생성일 순으로.
      // (approvals 에는 승인일 컬럼이 따로 없어 updated_at 이 승인 시각에 가장 가깝다.)
      const effectiveAt = String(
        metaData?.effectiveDate ?? doc.updated_at ?? doc.created_at ?? '',
      ).trim();

      candidates.push({
        doc,
        effectiveAt,
        newSalary: Math.round(newSalary),
        targetStaffId,
        targetStaffName });
    }

    // 직원 식별 — 이름 매칭은 동명이인이면 거부한다.
    //
    // 예전에는 limit(1) 로 아무나 하나 골랐다. 같은 회사에 동명이인이 있으면
    // 엉뚱한 직원의 기본급이 바뀌고, 그 사실이 응답에 드러나지도 않았다.
    const resolved: Array<Candidate & { staffId: string }> = [];
    for (const c of candidates) {
      if (c.targetStaffId) {
        resolved.push({ ...c, staffId: c.targetStaffId });
        continue;
      }
      if (!c.targetStaffName) {
        skipped.push({ docId: String(c.doc.id), staffName: null, reason: '대상 직원을 특정할 수 없습니다.' });
        continue;
      }

      const rows = await db
        .select({ id: staff_members.id })
        .from(staff_members)
        .where(
          c.doc.company_id
            ? and(eq(staff_members.name, c.targetStaffName), eq(staff_members.company_id, String(c.doc.company_id)))
            : eq(staff_members.name, c.targetStaffName),
        )
        .limit(2);

      if (rows.length === 0) {
        skipped.push({ docId: String(c.doc.id), staffName: c.targetStaffName, reason: '이름과 일치하는 직원이 없습니다.' });
        continue;
      }
      if (rows.length > 1) {
        skipped.push({
          docId: String(c.doc.id),
          staffName: c.targetStaffName,
          reason: '동명이인이 있어 대상을 확정할 수 없습니다. 결재문서에 targetStaffId 를 지정해 주세요.' });
        continue;
      }
      resolved.push({ ...c, staffId: String(rows[0].id) });
    }

    // 직원별 최신 1건만 남긴다 (effectiveAt 오름차순 → 마지막이 최신).
    const latestByStaff = new Map<string, (typeof resolved)[number]>();
    for (const c of resolved.slice().sort((a, b) => a.effectiveAt.localeCompare(b.effectiveAt))) {
      latestByStaff.set(c.staffId, c);
    }

    const nowIso = new Date().toISOString();
    for (const c of latestByStaff.values()) {
      const before = await db
        .select({ base_salary: staff_members.base_salary, salary: staff_members.salary })
        .from(staff_members)
        .where(eq(staff_members.id, c.staffId))
        .limit(1);
      const previous = Number(before[0]?.base_salary ?? 0) || 0;

      // 이미 같은 값이면 건드리지 않는다 — 재호출해도 이력이 늘지 않게.
      if (previous === c.newSalary) {
        skipped.push({ docId: String(c.doc.id), staffName: c.targetStaffName, reason: '이미 반영된 금액입니다.' });
        continue;
      }

      // salary 도 함께 갱신한다. payroll-fetch 는 salary 가 0 이 아니면 그 값을 쓰므로,
      // base_salary 만 올리면 최저임금 점검·워크센터 KPI 가 인상 전 값을 계속 본다.
      await db
        .update(staff_members)
        .set({
          base_salary: c.newSalary,
          salary: c.newSalary,
          updated_at: nowIso })
        .where(eq(staff_members.id, c.staffId));

      // 일할 계산이 인상 시점을 인식하려면 이력이 있어야 한다
      // (급여정산-utils 의 세그먼트 계산이 salary_change_history 를 읽는다).
      await db.insert(salary_change_history).values({
        id: crypto.randomUUID(),
        staff_id: c.staffId,
        change_type: 'salary_increase',
        before_value: previous,
        after_value: c.newSalary,
        effective_date: (c.effectiveAt || nowIso).slice(0, 10),
        reason: `급여인상평가서 반영 (결재 ${String(c.doc.id)})`,
        created_by: String(session.user.id),
        created_at: nowIso,
        previous_salary: previous });

      updatedResults.push({
        docId: String(c.doc.id),
        staffName: c.targetStaffName || c.staffId,
        newSalary: c.newSalary });
    }

    return NextResponse.json({
      ok: true,
      message:
        `${updatedResults.length}건의 급여 인상이 직원정보에 반영되었습니다.` +
        (skipped.length > 0 ? ` (${skipped.length}건 건너뜀)` : ''),
      results: updatedResults,
      skipped });
  } catch (error) {
    const message = error instanceof Error ? error.message : '처리 중 오류가 발생했습니다.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
