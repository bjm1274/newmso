/**
 * POST /api/approval/recall
 * 기안 회수 API — 서버 측 sender_id 검증 + history append + 알림 읽음 처리
 *
 * Body: { approvalId: string; note?: string }
 * 성공: { ok: true; approvalId: string }
 * 실패: { ok: false; error: string }  (HTTP 400/403/404/500)
 *
 * JM(단일 책임), JM3(에러 케이스 명시 분기), JM4(any 금지),
 * JM5(서버 세션으로 sender 검증 — D1 스택)
 */

import { NextResponse, type NextRequest } from 'next/server';
import { readSessionFromRequest } from '@/lib/server-session';
import { appendApprovalHistory } from '@/lib/approval-workflow';
import {
  getD1Binding,
  getD1Drizzle,
  approvals as approvalsTable,
  notifications as notificationsTable,
  eq,
  and,
  isNull,
  sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

type RecallBody = { approvalId?: unknown; note?: unknown };

export async function POST(request: NextRequest) {
  try {
    // ── 1. 파싱 ──
    const body = (await request.json().catch(() => null)) as RecallBody | null;
    const approvalId = typeof body?.approvalId === 'string' ? body.approvalId.trim() : '';
    const note = typeof body?.note === 'string' ? body.note.trim() : null;

    if (!approvalId) {
      return NextResponse.json({ ok: false, error: 'approvalId 필드가 필요합니다.' }, { status: 400 });
    }

    // ── 2. 인증 — 세션에서 actor 식별 ──
    const session = await readSessionFromRequest(request);
    const actorStaffId = session?.user?.id ? String(session.user.id).trim() : '';
    const actorName = session?.user?.name ? String(session.user.name).trim() : null;

    if (!actorStaffId) {
      return NextResponse.json({ ok: false, error: '인증이 필요합니다.' }, { status: 401 });
    }

    const d1 = await getD1Binding();
    if (!d1) throw new Error('[api/approval/recall] D1 binding not available');
    const db = getD1Drizzle(d1);

    // ── 3. 결재 문서 조회 ──
    const [approvalRow] = await db
      .select({
        id: approvalsTable.id,
        type: approvalsTable.type,
        status: approvalsTable.status,
        sender_id: approvalsTable.sender_id,
        meta_data: approvalsTable.meta_data })
      .from(approvalsTable)
      .where(eq(approvalsTable.id, approvalId))
      .limit(1);

    if (!approvalRow) {
      return NextResponse.json({ ok: false, error: '결재 문서를 찾을 수 없습니다.' }, { status: 404 });
    }

    const rowStatus = String(approvalRow.status || '');
    const rowSenderId = String(approvalRow.sender_id || '');

    // ── 4. 권한 검증 — 기안자 본인 + 대기/반려 상태 ──
    if (!rowSenderId || rowSenderId !== actorStaffId) {
      return NextResponse.json({ ok: false, error: '기안자 본인만 회수할 수 있습니다.' }, { status: 403 });
    }
    if (rowStatus !== '대기' && !rowStatus.includes('반려')) {
      const already = rowStatus === '회수' ? '이미 회수된 문서입니다.' : '현재 상태에서는 문서를 회수할 수 없습니다.';
      return NextResponse.json({ ok: false, error: already }, { status: 400 });
    }

    // ── 5. meta_data 이력 파싱 및 결재 진행 여부 검증 ──
    let existingMeta: Record<string, unknown> | null = null;
    if (typeof approvalRow.meta_data === 'string' && approvalRow.meta_data.length > 0) {
      try {
        const parsed = JSON.parse(approvalRow.meta_data) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          existingMeta = parsed as Record<string, unknown>;
        }
      } catch {
        existingMeta = null;
      }
    } else if (approvalRow.meta_data && typeof approvalRow.meta_data === 'object') {
      existingMeta = approvalRow.meta_data as Record<string, unknown>;
    }

    const editHistory = Array.isArray(existingMeta?.edit_history) ? existingMeta.edit_history : [];
    const hasApprovedStep = editHistory.some(
      (entry: unknown) =>
        entry &&
        typeof entry === 'object' &&
        ((entry as Record<string, unknown>).action === 'approved_step' ||
          (entry as Record<string, unknown>).action === 'approved_final'),
    );
    if (hasApprovedStep) {
      return NextResponse.json(
        { ok: false, error: '이미 결재 진행(승인)이 시작된 문서는 회수할 수 없습니다.' },
        { status: 400 },
      );
    }

    const nextMeta = appendApprovalHistory(
      { ...(existingMeta ?? {}), recalled_at: new Date().toISOString(), recalled_by: actorStaffId },
      { action: 'recalled', actor_id: actorStaffId, actor_name: actorName, note: note || '회수' },
    );

    // ── 6. status 업데이트 (기안자 본인 조건 2중 보호) ──
    await db
      .update(approvalsTable)
      .set({
        status: '회수',
        current_approver_id: null,
        meta_data: JSON.stringify(nextMeta),
        updated_at: new Date().toISOString() })
      .where(and(eq(approvalsTable.id, approvalId), eq(approvalsTable.sender_id, rowSenderId)))
      .run();

    // 출결정정 문서인 경우 attendance_corrections 테이블의 '대기' 항목을 '회수'로 갱신 (재신청 허용)
    const correctionDates = Array.isArray(existingMeta?.correction_dates) ? (existingMeta.correction_dates as string[]) : [];
    if (correctionDates.length > 0 && rowSenderId) {
      try {
        const { attendance_corrections } = await import('@/lib/db/schema');
        const { inArray: drizzleInArray } = await import('drizzle-orm');
        await db
          .update(attendance_corrections)
          .set({ status: '회수' })
          .where(
            and(
              eq(attendance_corrections.staff_id, rowSenderId),
              drizzleInArray(attendance_corrections.attendance_date, correctionDates),
              eq(attendance_corrections.status, '대기'),
            ),
          )
          .run();
      } catch (attErr) {
        console.error('[api/approval/recall] attendance_corrections 회수 상태 갱신 실패:', attErr);
      }
    }

    // 모바일 연차신청이 approvals 보다 먼저 넣어둔 leave_requests '대기' 행 정리.
    // 예전에는 이 회수 경로가 attendance_corrections 만 되돌리고 leave_requests 는 손대지
    // 않아서, 회수한 연차가 인사 화면(휴가관리·LeaveWorkcenter·모바일 연차관리자)에는
    // 계속 '대기' 로 떠 있는 유령 신청으로 남았다. 그 화면들은 status 필터 없이 조회한다.
    // 반려 경로와 판정을 공유하려고 server-approval-transition 의 정리 함수를 그대로 쓴다.
    const { cleanupPendingLeaveRequestOnTermination } = await import(
      '@/lib/server-approval-transition'
    );
    await cleanupPendingLeaveRequestOnTermination(
      { type: approvalRow.type, sender_id: approvalRow.sender_id },
      existingMeta,
      '회수',
    );

    // ── 7. 관련 알림 읽음 처리 (실패해도 메인 응답에 영향 없음) ──
    // 정본 notifications 스키마: user_id / read_at / metadata (approval_id·read·staff_id 컬럼 없음)
    // metadata.approval_id === approvalId 인 미열람 알림을 읽음 처리한다.
    try {
      const readAt = new Date().toISOString();
      await db
        .update(notificationsTable)
        .set({ read_at: readAt })
        .where(
          and(
            eq(notificationsTable.type, 'approval'),
            isNull(notificationsTable.read_at),
            sql`json_extract(${notificationsTable.metadata}, '$.approval_id') = ${approvalId}`
          )
        )
        .run();
    } catch (err) {
      console.error('[api/approval/recall] 알림 읽음 처리 실패:', err);
    }

    return NextResponse.json({ ok: true, approvalId });
  } catch (err) {
    console.error('[api/approval/recall] 오류:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : '서버 오류' },
      { status: 500 }
    );
  }
}
