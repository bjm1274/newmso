/**
 * 관리자 제외 전 직원 삭제
 * D1 binding 직접 사용 — RLS 없이 직접 SQL 실행 (service-role 우회 동등).
 * Phase 8-F: db 의존 제거. 모든 24개 의존 테이블이 D1 schema에 존재함을 확인.
 */
import { NextResponse } from 'next/server';
import { SQL } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { isAdminSession, readSessionFromRequest } from '@/lib/server-session';
import {
  getD1Binding,
  getD1Drizzle,
  resolveDataBackend,
  // 의존 테이블 import
  approvals as approvalsTable,
  employment_contracts as employmentContractsTable,
  attendance as attendanceTable,
  shift_assignments as shiftAssignmentsTable,
  leave_requests as leaveRequestsTable,
  staff_certifications as staffCertificationsTable,
  todos as todosTable,
  notifications as notificationsTable,
  handover_notes as handoverNotesTable,
  pinned_messages as pinnedMessagesTable,
  message_reactions as messageReactionsTable,
  message_reads as messageReadsTable,
  messages as messagesTable,
  room_notification_settings as roomNotificationSettingsTable,
  polls as pollsTable,
  poll_votes as pollVotesTable,
  chat_rooms as chatRoomsTable,
  board_post_likes as boardPostLikesTable,
  board_post_comments as boardPostCommentsTable,
  board_posts as boardPostsTable,
  posts as postsTable,
  document_repository as documentRepositoryTable,
  audit_logs as auditLogsTable,
  staff_members as staffMembersTable,
  // 연산자
  eq,
  ne,
  or,
  isNull,
  and,
  inArray } from '@/lib/db';
import { logD1BindingMissing } from '@/lib/db/mirror-metrics';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// D1 binding 필수
async function requireD1ForResetStaff(label: string) {
  const backend = await resolveDataBackend();
  const d1 = await getD1Binding();
  if (!d1) {
    logD1BindingMissing({ label, backend });
    throw new Error(`[reset-staff] D1 binding not available (${label})`);
  }
  return getD1Drizzle(d1);
}

// 의존 테이블 → (table, where(ids) builder) 매핑
// inArray bind 한도 가드를 위해 chunk(<=100) 호출
type DepDeletion = {
  label: string;
  delete: (ids: string[]) => Promise<void>;
};

function buildDeletions(db: ReturnType<typeof getD1Drizzle>): DepDeletion[] {
  const wrap = <T>(
    label: string,
    runner: (chunk: string[]) => Promise<T>,
  ): DepDeletion => ({
    label,
    delete: async (ids) => {
      const BATCH = 100;
      for (let i = 0; i < ids.length; i += BATCH) {
        const chunk = ids.slice(i, i + BATCH);
        if (chunk.length === 0) continue;
        await runner(chunk);
      }
    } });

  return [
    // 전자결재
    wrap('approvals.sender_id', (c) =>
      db.delete(approvalsTable).where(inArray(approvalsTable.sender_id, c)),
    ),
    // 근로계약
    wrap('employment_contracts.staff_id', (c) =>
      db
        .delete(employmentContractsTable)
        .where(inArray(employmentContractsTable.staff_id, c)),
    ),
    // 근태/출퇴근
    wrap('attendance.staff_id', (c) =>
      db.delete(attendanceTable).where(inArray(attendanceTable.staff_id, c)),
    ),
    wrap('shift_assignments.staff_id', (c) =>
      db
        .delete(shiftAssignmentsTable)
        .where(inArray(shiftAssignmentsTable.staff_id, c)),
    ),
    // 휴가
    wrap('leave_requests.staff_id', (c) =>
      db
        .delete(leaveRequestsTable)
        .where(inArray(leaveRequestsTable.staff_id, c)),
    ),
    // 자격면허
    wrap('staff_certifications.staff_id', (c) =>
      db
        .delete(staffCertificationsTable)
        .where(inArray(staffCertificationsTable.staff_id, c)),
    ),
    // 할일
    wrap('todos.user_id', (c) =>
      db.delete(todosTable).where(inArray(todosTable.user_id, c)),
    ),
    // 알림
    wrap('notifications.user_id', (c) =>
      db
        .delete(notificationsTable)
        .where(inArray(notificationsTable.user_id, c)),
    ),
    // 인수인계
    wrap('handover_notes.author_id', (c) =>
      db
        .delete(handoverNotesTable)
        .where(inArray(handoverNotesTable.author_id, c)),
    ),
    // 채팅
    wrap('pinned_messages.pinned_by', (c) =>
      db
        .delete(pinnedMessagesTable)
        .where(inArray(pinnedMessagesTable.pinned_by, c)),
    ),
    wrap('message_reactions.user_id', (c) =>
      db
        .delete(messageReactionsTable)
        .where(inArray(messageReactionsTable.user_id, c)),
    ),
    wrap('message_reads.user_id', (c) =>
      db
        .delete(messageReadsTable)
        .where(inArray(messageReadsTable.user_id, c)),
    ),
    wrap('messages.sender_id', (c) =>
      db.delete(messagesTable).where(inArray(messagesTable.sender_id, c)),
    ),
    wrap('room_notification_settings.user_id', (c) =>
      db
        .delete(roomNotificationSettingsTable)
        .where(inArray(roomNotificationSettingsTable.user_id, c)),
    ),
    wrap('polls.creator_id', (c) =>
      db.delete(pollsTable).where(inArray(pollsTable.creator_id, c)),
    ),
    wrap('poll_votes.user_id', (c) =>
      db.delete(pollVotesTable).where(inArray(pollVotesTable.user_id, c)),
    ),
    wrap('chat_rooms.created_by', (c) =>
      db.delete(chatRoomsTable).where(inArray(chatRoomsTable.created_by, c)),
    ),
    // 게시판
    wrap('board_post_likes.user_id', (c) =>
      db
        .delete(boardPostLikesTable)
        .where(inArray(boardPostLikesTable.user_id, c)),
    ),
    wrap('board_post_comments.author_id', (c) =>
      db
        .delete(boardPostCommentsTable)
        .where(inArray(boardPostCommentsTable.author_id, c)),
    ),
    wrap('board_posts.author_id', (c) =>
      db
        .delete(boardPostsTable)
        .where(inArray(boardPostsTable.author_id, c)),
    ),
    wrap('posts.author_id', (c) =>
      db.delete(postsTable).where(inArray(postsTable.author_id, c)),
    ),
    // 문서/감사
    wrap('document_repository.created_by', (c) =>
      db
        .delete(documentRepositoryTable)
        .where(inArray(documentRepositoryTable.created_by, c)),
    ),
    // ⚠ audit_logs 는 여기서 지우지 않는다.
    //
    // 예전에는 삭제 대상 직원이 행위자이거나 대상인 감사로그를 전부 지웠다.
    // 그 결과 가장 파괴적인 작업(전 직원 삭제)이 스스로 흔적을 없애,
    // "누가 언제 무엇을 지웠는가" 를 사후에 확인할 방법이 남지 않았다.
    // 감사로그는 삭제된 직원을 참조하더라도 보존한다 — 그게 감사로그의 목적이다.
  ];
}

export async function POST(req: Request) {
  try {
    const session = await readSessionFromRequest(req);
    if (!session || !isAdminSession(session.user)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const password = (body as { password?: unknown } | null)?.password;
    const resetHash = process.env.RESET_SECRET_HASH;
    if (
      !resetHash ||
      typeof password !== 'string' ||
      !(await bcrypt.compare(password, resetHash))
    ) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = await requireD1ForResetStaff('staff_lookup');

    // 관리자(role='admin') 및 시스템마스터(is_system_master=1)는 항상 제외하고 삭제
    // D1: boolean is_system_master는 integer(0/1). NULL 또는 0 이면 일반 직원.
    const condition = and(
      ne(staffMembersTable.role, 'admin'),
      or(
        isNull(staffMembersTable.is_system_master),
        eq(staffMembersTable.is_system_master, 0),
      ),
    ) as SQL<unknown>;

    const toDelete = await db
      .select({ id: staffMembersTable.id })
      .from(staffMembersTable)
      .where(condition);

    const ids = (toDelete ?? [])
      .map((r) => String(r.id || '').trim())
      .filter(Boolean);

    if (ids.length === 0) {
      return NextResponse.json({
        deleted: 0,
        message: '삭제할 직원이 없습니다. (관리자만 있음)' });
    }

    // 삭제 **전에** 감사로그를 남긴다.
    // 실행 후에 남기면, 도중에 실패하거나 아이솔레이트가 죽었을 때
    // 데이터는 사라졌는데 기록은 없는 상태가 된다.
    // 행위자는 클라이언트 값이 아니라 서버 세션에서 가져온다.
    await logAudit(
      'delete',
      'staff_members',
      null,
      {
        operation: 'reset-staff',
        target_count: ids.length,
        target_ids: ids.slice(0, 200),
        target_ids_truncated: ids.length > 200,
      },
      String(session.user?.id ?? '') || undefined,
      String(session.user?.name ?? '') || undefined,
    ).catch((err) => {
      // 감사 기록 실패는 파괴적 작업을 막는 사유다 — 조용히 넘어가지 않는다.
      console.error('[reset-staff] 감사로그 기록 실패:', err);
      throw new Error('감사 기록에 실패해 초기화를 중단했습니다.');
    });

    // 종속 테이블 데이터 먼저 삭제 (외래키 제약조건 해소)
    const deletions = buildDeletions(db);
    for (const dep of deletions) {
      try {
        await dep.delete(ids);
      } catch (err) {
        // 일부 의존 테이블이 비어 있거나 컬럼 누락이어도 다음 단계 진행
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[reset-staff] ${dep.label} 삭제 실패:`, msg);
      }
    }

    // 직원 데이터 삭제 (chunked)
    const BATCH = 100;
    for (let i = 0; i < ids.length; i += BATCH) {
      const chunk = ids.slice(i, i + BATCH);
      await db
        .delete(staffMembersTable)
        .where(inArray(staffMembersTable.id, chunk));
    }

    return NextResponse.json({
      deleted: ids.length,
      message: '관리자 제외 전 직원이 삭제되었습니다.' });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
