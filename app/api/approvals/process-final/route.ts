import { NextResponse } from 'next/server';
import { processFinalApprovalEffects } from '@/lib/server-approval-processing';
import {
  isFinalApprovalEffectsDone,
  isFinalizedApprovalStatus } from '@/lib/server-approval-processing-helpers';
import { isAdminSession, readSessionFromRequest } from '@/lib/server-session';
import { normalizeApprovalLineIds as normalizeApprovalLineIdsShared } from '@/lib/approval-shared';
import {
  approvals as approvalsTable,
  eq,
  getD1Binding,
  getD1Drizzle } from '@/lib/db';

// 공용 정규화(lib/approval-shared)로 통일하되, 이 라우트는 권한 검증에서
// trim된 sessionUserId와 비교하므로 기존 trim 동작을 보존하기 위해 출력만 trim/재dedup한다.
// (공용 함수 자체는 trim 없음 — server-approval-transition 등 다른 호출부 동작 불변)
function normalizeApprovalLineIds(line: unknown): string[] {
  const ids = normalizeApprovalLineIdsShared(line).map((id) => id.trim()).filter(Boolean);
  return Array.from(new Set(ids));
}

export async function POST(request: Request) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const approvalId = String(body?.approvalId || '').trim();
    if (!approvalId) {
      return NextResponse.json({ ok: false, error: 'approvalId is required' }, { status: 400 });
    }

    // approvals 조회 (D1)
    /**
     * 후속 처리에 필요한 컬럼을 모두 읽는다.
     *
     * 예전에는 권한 판정에 쓰는 몇 개만 골라 읽었는데, processFinalApprovalEffects
     * 는 `item.type` 으로 어떤 후속 처리를 돌릴지 갈라진다. 즉 이 라우트로 들어온
     * 요청은 **type 이 undefined 라 인사명령·연차·증명서 같은 집행이 통째로
     * 건너뛰어졌고**, 문서보관함 본문도 반쪽짜리로 저장됐다.
     */
    type ApprovalFetchRow = {
      id: string;
      status: string | null;
      meta_data: unknown;
      current_approver_id: string | null;
      approver_line: unknown;
      doc_number: string | null;
      sender_id: string | null;
      sender_name: string | null;
      sender_company: string | null;
      sender_department: string | null;
      company_id: string | null;
      type: string | null;
      title: string;
      content: string | null;
      created_at: string | null;
      updated_at: string | null;
    };

    let approval: ApprovalFetchRow | null = null;

    const d1 = await getD1Binding();
    if (!d1) {
      return NextResponse.json({ ok: false, error: 'D1 binding not available' }, { status: 500 });
    }
    const db = getD1Drizzle(d1);
    const rows = await db
      .select({
        id: approvalsTable.id,
        status: approvalsTable.status,
        meta_data: approvalsTable.meta_data,
        current_approver_id: approvalsTable.current_approver_id,
        approver_line: approvalsTable.approver_line,
        doc_number: approvalsTable.doc_number,
        sender_id: approvalsTable.sender_id,
        sender_name: approvalsTable.sender_name,
        sender_company: approvalsTable.sender_company,
        sender_department: approvalsTable.sender_department,
        company_id: approvalsTable.company_id,
        type: approvalsTable.type,
        title: approvalsTable.title,
        content: approvalsTable.content,
        created_at: approvalsTable.created_at,
        updated_at: approvalsTable.updated_at })
      .from(approvalsTable)
      .where(eq(approvalsTable.id, approvalId));
    const row = rows[0] ?? null;
    if (row) {
      // D1 JSON 컬럼 파싱
      let parsedMetaData: unknown = null;
      if (typeof row.meta_data === 'string' && row.meta_data.length > 0) {
        try { parsedMetaData = JSON.parse(row.meta_data); } catch { parsedMetaData = null; }
      }
      let parsedApproverLine: unknown = null;
      if (typeof row.approver_line === 'string' && row.approver_line.length > 0) {
        try { parsedApproverLine = JSON.parse(row.approver_line); } catch { parsedApproverLine = null; }
      }
      approval = { ...row, meta_data: parsedMetaData, approver_line: parsedApproverLine };
    }

    if (!approval) {
      return NextResponse.json({ ok: false, error: 'Approval not found' }, { status: 404 });
    }
    // 최종 확정(승인/완료) 전 호출은 거부
    if (!isFinalizedApprovalStatus(approval.status)) {
      return NextResponse.json({ ok: false, error: 'Approval is not finalized yet' }, { status: 409 });
    }

    const metaData =
      approval.meta_data && typeof approval.meta_data === 'object'
        ? (approval.meta_data as Record<string, unknown>)
        : null;
    const sessionUserId = String(session.user.id || '').trim();
    const currentApproverId = String(
      approval.current_approver_id || metaData?.current_approver_id || ''
    ).trim();
    const approvalLineIds = normalizeApprovalLineIds(approval.approver_line ?? metaData?.approver_line);
    const lastApproverId = approvalLineIds.length > 0 ? approvalLineIds[approvalLineIds.length - 1] : '';

    /**
     * 후속 처리 실행 권한은 관리자와 최종 결재자에게만 준다.
     *
     * 예전에는 **기안자와 참조자, 결재선의 모든 구성원** 까지 이 엔드포인트를 호출할 수
     * 있었다. 이 라우트는 연차 차감·인사명령 반영·기본급 갱신 같은 실제 집행을
     * 돌리므로, 상태 위조 경로와 엮이면 기안자가 자기 문서의 급여 인상을 스스로
     * 집행하는 체인이 된다. 조회가 필요한 사람은 결재 상세 화면을 쓰면 된다.
     */
    const canAccess =
      isAdminSession(session.user) ||
      (Boolean(currentApproverId) && sessionUserId === currentApproverId) ||
      (Boolean(lastApproverId) && sessionUserId === lastApproverId);

    if (!canAccess) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    // 멱등: 권한 확인 후, 이미 후처리 완료 마커가 있으면 side effect 없이 성공 반환
    const prior = isFinalApprovalEffectsDone(metaData);
    if (prior.done) {
      return NextResponse.json({
        ok: true,
        alreadyProcessed: true,
        processedAt: prior.processedAt,
        steps: [],
        warnings: [],
        supplySummary: null });
    }

    const result = await processFinalApprovalEffects(
      approval as Record<string, unknown>,
      String(session.user.id || '').trim() || null,
    );

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to process approval';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
