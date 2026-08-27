import { NextResponse } from 'next/server';
import {
  processFinalApprovalEffects,
  readServerProcessingHistoryMarker } from '@/lib/server-approval-processing';
import {
  isFinalApprovalEffectsDone,
  isFinalizedApprovalStatus,
  SERVER_PROCESSING_HISTORY_ACTION_DONE,
  SERVER_PROCESSING_HISTORY_ACTION_PARTIAL } from '@/lib/server-approval-processing-helpers';
import { isAdminSession, readSessionFromRequest } from '@/lib/server-session';
import { normalizeApprovalLineIds as normalizeApprovalLineIdsShared } from '@/lib/approval-shared';
import {
  approvals as approvalsTable,
  approval_history as approvalHistoryTable,
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

/** approval_history 에서 '실제로 결재한' 것으로 인정하는 action. */
const APPROVAL_HISTORY_APPROVE_ACTIONS = new Set(['approved_final', 'approved_step', 'approved']);

/**
 * 결재 이력에서 최종 결재자를 재도출한다.
 *
 * approvals 행의 current_approver_id·approver_line 은 기안자가 게이트웨이 update 로
 * 덮어쓸 수 있던 값이라(10차 DLT-01), 그것만 보고 집행 권한을 주면 안 된다.
 * approval_history 는 게이트웨이에서 관리자 전용이라 위조되지 않는다.
 *
 * 다만 **운영 approval_history 에는 결재 action 행이 0건이다**(2026-08-27 실측).
 * 결재 전이(lib/server-approval-transition.ts)가 이력을 meta_data.edit_history 에만
 * 쌓고 이 표에는 쓰지 않기 때문이다. 그래서 지금 실제로 도는 것은 아래 폴백이고,
 * 이 함수는 전이 경로가 이력을 쓰기 시작하면 곧바로 정본 판정으로 승격된다.
 * (마커 행 srvproc-* 은 결재 행이 아니므로 action 화이트리스트에서 제외된다.)
 */
async function resolveFinalApproverIdsFromHistory(
  db: ReturnType<typeof getD1Drizzle>,
  approvalId: string,
): Promise<string[] | null> {
  try {
    const rows = await db
      .select({
        approver_id: approvalHistoryTable.approver_id,
        action: approvalHistoryTable.action,
        created_at: approvalHistoryTable.created_at })
      .from(approvalHistoryTable)
      .where(eq(approvalHistoryTable.approval_id, approvalId));

    const approveRows = rows.filter((row) => {
      const action = String(row.action || '').trim();
      if (action === SERVER_PROCESSING_HISTORY_ACTION_DONE) return false;
      if (action === SERVER_PROCESSING_HISTORY_ACTION_PARTIAL) return false;
      return APPROVAL_HISTORY_APPROVE_ACTIONS.has(action) && String(row.approver_id || '').trim() !== '';
    });
    if (approveRows.length === 0) return null;

    approveRows.sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
    const finalRow = approveRows[approveRows.length - 1];
    return [String(finalRow.approver_id || '').trim()];
  } catch (err) {
    // 이력 조회 실패를 '권한 없음' 으로 오판하면 정상 결재가 멈춘다 → 폴백으로 넘긴다.
    console.error('[process-final] Failed to read approval_history:', err);
    return null;
  }
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

    /**
     * 결재자 판정에서 meta_data 폴백을 뺐다 (10차 DLT-01).
     *
     * meta_data 는 확정된 문서에도 게이트웨이 update 가 닿을 수 있는 유일한 컬럼이라
     * (물품신청 재고 워크플로 예외), 그 안의 current_approver_id·approver_line 을
     * 권한 판정에 쓰면 스스로 최종 결재자가 될 수 있다.
     * 운영 실측(2026-08-27): 확정 문서 449건 중 current_approver_id 가 빈 행은 0건이고
     * approver_line 이 빈 5건도 current_approver_id 로 그대로 통과하므로,
     * 이 폴백을 빼도 지금 통과하던 사람이 새로 막히지 않는다.
     */
    const currentApproverId = String(approval.current_approver_id || '').trim();
    const approvalLineIds = normalizeApprovalLineIds(approval.approver_line);
    const lastApproverId = approvalLineIds.length > 0 ? approvalLineIds[approvalLineIds.length - 1] : '';

    // 위조 불가능한 결재 이력이 있으면 그쪽을 정본으로 쓴다. 없으면 위 컬럼으로 폴백한다.
    const historyApproverIds = await resolveFinalApproverIdsFromHistory(db, approvalId);

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
      (historyApproverIds
        ? historyApproverIds.includes(sessionUserId)
        : (Boolean(currentApproverId) && sessionUserId === currentApproverId) ||
          (Boolean(lastApproverId) && sessionUserId === lastApproverId));

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

    /**
     * meta_data 마커는 meta_data 를 새로 쓰면 사라진다 — 그것만 보면 재집행된다.
     * 게이트웨이로 지울 수 없는 approval_history 마커를 함께 본다(10차 DLT-01 ②).
     */
    const historyMarker = await readServerProcessingHistoryMarker(approvalId);
    if (historyMarker.done) {
      return NextResponse.json({
        ok: true,
        alreadyProcessed: true,
        processedAt: historyMarker.processedAt,
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
