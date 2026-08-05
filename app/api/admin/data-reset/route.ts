/**
 * 관리자 전용 — 데이터 초기화 통합 API
 *
 * 처리 흐름:
 *   1) 세션 + admin 권한 검증 (isAdminSession).
 *   2) 보안암호(RESET_SECRET_HASH) + 확인 문구를 **서버에서** 재검증.
 *      화면(데이터초기화.tsx)이 강제하는 2단계 확인은 클라이언트 UI 일 뿐이라
 *      curl 로 우회 가능했다 — 서버가 같은 조건을 다시 요구한다.
 *   3) type별 D1 delete를 서버에서 직접 수행 — RLS 우회 없이 D1 바인딩 사용.
 *   4) 삭제 완료 후 audit_logs 에 실행 기록을 남긴다.
 *      (system_logs 초기화가 audit_logs 를 비우므로 기록은 반드시 삭제 '뒤'에 쓴다.)
 *   5) 응답 { ok: true, deleted? } 반환.
 *
 * 지원 type:
 *   - chat        : messages / message_reads / room_notification_settings / chat_rooms
 *   - inventory   : inventory_logs / inventory
 *   - board       : posts / board_post_comments / board_posts (수술일정·MRI일정표·mri 제외)
 *   - schedule    : board_posts (board_type IN ['수술일정','MRI일정표','mri'])
 *   - system_logs : audit_logs
 *   - expired_contracts : employment_contracts (status=pending, created_at < 30일 전)
 *   - expired_popups    : popups (is_active=0)
 *   - force_logout      : system_configs upsert (min_auth_time)
 */
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { isAdminSession, readSessionFromRequest } from '@/lib/server-session';
import {
  getD1Binding,
  getD1Drizzle,
  // 테이블
  messages as messagesTable,
  message_reads as messageReadsTable,
  room_notification_settings as roomNotificationSettingsTable,
  chat_rooms as chatRoomsTable,
  inventory_logs as inventoryLogsTable,
  inventory as inventoryTable,
  posts as postsTable,
  board_post_comments as boardPostCommentsTable,
  board_posts as boardPostsTable,
  audit_logs as auditLogsTable,
  employment_contracts as employmentContractsTable,
  popups as popupsTable,
  system_configs as systemConfigsTable,
  leave_ledger as leaveLedgerTable,
  leave_requests as leaveRequestsTable,
  leave_accruals as leaveAccrualsTable,
  leave_balances as leaveBalancesTable,
  staff_members as staffMembersTable,
  // 연산자
  ne,
  eq,
  lt,
  inArray,
  notInArray } from '@/lib/db';
import { sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

const VALID_TYPES = [
  'chat',
  'inventory',
  'board',
  'schedule',
  'system_logs',
  'expired_contracts',
  'expired_popups',
  'force_logout',
  'sync_chat_rooms',
  'annual_leave',
] as const;

type DataResetType = (typeof VALID_TYPES)[number];

function isValidType(v: unknown): v is DataResetType {
  return typeof v === 'string' && (VALID_TYPES as readonly string[]).includes(v);
}

/**
 * type 별 확인 문구 — 화면(데이터초기화.tsx RESET_ACTIONS)의 confirmationText 와 동일해야 한다.
 * 두 곳이 어긋나면 실행이 400 으로 막히므로, 문구를 바꿀 때는 양쪽을 함께 수정할 것.
 *
 * sync_chat_rooms 는 파괴적 삭제가 아닌 정합 보정이라 확인 문구를 요구하지 않는다.
 */
const CONFIRMATION_TEXTS: Record<DataResetType, string | null> = {
  chat: '채팅 초기화',
  inventory: '재고 초기화',
  board: '게시판 초기화',
  schedule: '일정 초기화',
  annual_leave: '연차 초기화',
  system_logs: '로그 초기화',
  expired_contracts: '계약 초안 삭제',
  expired_popups: '팝업 정리',
  force_logout: '전체 로그아웃',
  sync_chat_rooms: null,
};

export async function POST(req: Request) {
  try {
    // 1) 세션 + 관리자 권한 검증
    const session = await readSessionFromRequest(req);
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (!isAdminSession(session.user)) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    // 2) 요청 body 파싱
    const body = await req.json().catch(() => null) as {
      type?: unknown;
      password?: unknown;
      confirm?: unknown;
    } | null;
    const type = body?.type;

    if (!isValidType(type)) {
      return NextResponse.json(
        { ok: false, error: `지원하지 않는 type입니다. 허용값: ${VALID_TYPES.join(', ')}` },
        { status: 400 },
      );
    }

    // 2-1) 파괴적 작업은 보안암호 + 확인 문구를 서버에서 재검증한다.
    //      (reset-staff 라우트와 동일한 RESET_SECRET_HASH 를 사용)
    const requiredConfirmation = CONFIRMATION_TEXTS[type];
    if (requiredConfirmation !== null) {
      const resetHash = process.env.RESET_SECRET_HASH;
      if (!resetHash) {
        return NextResponse.json(
          { ok: false, error: 'RESET_SECRET_HASH 환경변수가 설정되지 않아 초기화를 실행할 수 없습니다.' },
          { status: 500 },
        );
      }

      const password = body?.password;
      if (typeof password !== 'string' || !(await bcrypt.compare(password, resetHash))) {
        return NextResponse.json(
          { ok: false, error: '보안 암호가 올바르지 않습니다.' },
          { status: 401 },
        );
      }

      const confirm = typeof body?.confirm === 'string' ? body.confirm.trim() : '';
      if (confirm !== requiredConfirmation) {
        return NextResponse.json(
          {
            ok: false,
            error: '확인 문구가 일치하지 않습니다.',
            requiredConfirmation },
          { status: 400 },
        );
      }
    }

    // 3) D1 바인딩
    const d1 = await getD1Binding();
    if (!d1) {
      return NextResponse.json(
        { ok: false, error: 'D1 binding not available' },
        { status: 500 },
      );
    }
    const db = getD1Drizzle(d1);

    /**
     * 삭제 완료 후 감사 기록을 남기고 응답한다.
     *
     * 반드시 삭제 '뒤'에 호출해야 한다 — system_logs 초기화가 audit_logs 를 비우므로
     * 먼저 쓰면 그 기록까지 함께 지워진다.
     * 감사 기록 실패가 초기화 자체를 실패로 만들지는 않도록 오류는 삼키고 로그만 남긴다.
     */
    const finish = async (payload: Record<string, unknown>) => {
      try {
        await db.insert(auditLogsTable).values({
          id: crypto.randomUUID(),
          user_id: String(session.user?.id ?? ''),
          user_name: String(session.user?.name ?? ''),
          actor_name: String(session.user?.name ?? ''),
          action: 'data_reset',
          target_type: 'data_reset',
          target_id: type,
          // created_at 을 빼면 SQLite DEFAULT (CURRENT_TIMESTAMP) 가 공백형(UTC)을 채운다.
          // 다른 감사 경로는 전부 toISOString() 을 넣으므로 같은 TEXT 컬럼에 두 형식이 섞이고,
          // 사전순에서 ' '(0x20) < 'T'(0x54) 라 같은 날짜의 이 행이 목록 뒤로 밀리며
          // `gte(created_at, todayIso)` 필터에서도 항상 탈락했다 — 가장 파괴적인 작업의
          // 기록이 오늘 집계에서 통째로 사라진 것이다(8차 D08-012).
          created_at: new Date().toISOString(),
          details: JSON.stringify({ type, payload }) });
      } catch (auditErr) {
        console.error('[admin/data-reset] audit 기록 실패:', auditErr);
      }
      return NextResponse.json(payload);
    };

    // 4) type별 D1 삭제 수행
    if (type === 'chat') {
      // 순서: 의존 레코드 먼저 삭제 → 채팅방 마지막
      await db.delete(messagesTable).where(ne(messagesTable.id, '00000000-0000-0000-0000-000000000000'));
      await db.delete(messageReadsTable).where(ne(messageReadsTable.id, '00000000-0000-0000-0000-000000000000'));
      await db.delete(roomNotificationSettingsTable).where(ne(roomNotificationSettingsTable.id, '00000000-0000-0000-0000-000000000000'));
      await db.delete(chatRoomsTable).where(ne(chatRoomsTable.id, '00000000-0000-0000-0000-000000000000'));
      return await finish({ ok: true });
    }

    if (type === 'inventory') {
      await db.delete(inventoryLogsTable).where(ne(inventoryLogsTable.id, '00000000-0000-0000-0000-000000000000'));
      await db.delete(inventoryTable).where(ne(inventoryTable.id, '00000000-0000-0000-0000-000000000000'));
      return await finish({ ok: true });
    }

    if (type === 'board') {
      // board_type이 수술일정/MRI일정표/mri인 것은 제외하고 삭제
      const SCHEDULE_TYPES = ['수술일정', 'MRI일정표', 'mri'];
      await db.delete(postsTable).where(ne(postsTable.id, '00000000-0000-0000-0000-000000000000'));
      await db.delete(boardPostCommentsTable).where(ne(boardPostCommentsTable.id, '00000000-0000-0000-0000-000000000000'));
      await db
        .delete(boardPostsTable)
        .where(notInArray(boardPostsTable.board_type, SCHEDULE_TYPES));
      return await finish({ ok: true });
    }

    if (type === 'schedule') {
      const SCHEDULE_TYPES = ['수술일정', 'MRI일정표', 'mri'];
      await db
        .delete(boardPostsTable)
        .where(inArray(boardPostsTable.board_type, SCHEDULE_TYPES));
      return await finish({ ok: true });
    }

    if (type === 'system_logs') {
      await db.delete(auditLogsTable).where(ne(auditLogsTable.id, '00000000-0000-0000-0000-000000000000'));
      return await finish({ ok: true });
    }

    if (type === 'expired_contracts') {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      await db
        .delete(employmentContractsTable)
        .where(
          sql`${employmentContractsTable.status} = 'pending' AND ${employmentContractsTable.created_at} < ${thirtyDaysAgo}`,
        );
      return await finish({ ok: true });
    }

    if (type === 'expired_popups') {
      await db
        .delete(popupsTable)
        .where(eq(popupsTable.is_active, 0));
      return await finish({ ok: true });
    }

    if (type === 'force_logout') {
      const now = new Date().toISOString();
      await db
        .insert(systemConfigsTable)
        .values({ key: 'min_auth_time', value: now, description: '전체 로그아웃 시점' })
        .onConflictDoUpdate({
          target: systemConfigsTable.key,
          set: { value: now, description: '전체 로그아웃 시점' } });
      return await finish({ ok: true });
    }

    if (type === 'sync_chat_rooms') {
      const { refreshChatRoomLastMessage } = await import('@/lib/db/functions/triggers');
      const rooms = await db.select({ id: chatRoomsTable.id }).from(chatRoomsTable);
      for (const r of rooms) {
        await refreshChatRoomLastMessage(db, r.id);
      }
      return await finish({ ok: true, count: rooms.length });
    }

    if (type === 'annual_leave') {
      await Promise.all([
        db.delete(leaveLedgerTable),
        db.delete(leaveRequestsTable),
        db.delete(leaveAccrualsTable),
        db.delete(leaveBalancesTable),
        db.update(staffMembersTable).set({
          annual_leave_total: 0,
          annual_leave_used: 0,
        }),
      ]);
      return await finish({ ok: true, message: 'All annual leave ledger and request records cleared.' });
    }

    // 여기까지 도달하면 isValidType 검사에서 걸렸어야 하므로 unreachable
    return NextResponse.json({ ok: false, error: 'Unknown type' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '데이터 초기화 중 오류가 발생했습니다.';
    console.error('[admin/data-reset] failed:', error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
