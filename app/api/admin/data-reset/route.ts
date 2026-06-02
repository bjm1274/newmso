/**
 * 관리자 전용 — 데이터 초기화 통합 API
 *
 * 처리 흐름:
 *   1) 세션 + admin 권한 검증 (isAdminSession).
 *   2) type별 D1 delete를 서버에서 직접 수행 — RLS 우회 없이 D1 바인딩 사용.
 *   3) 응답 { ok: true, deleted? } 반환.
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
  // 연산자
  ne,
  eq,
  lt,
  inArray,
  notInArray,
} from '@/lib/db';
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
] as const;

type DataResetType = (typeof VALID_TYPES)[number];

function isValidType(v: unknown): v is DataResetType {
  return typeof v === 'string' && (VALID_TYPES as readonly string[]).includes(v);
}

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
    const body = await req.json().catch(() => null) as { type?: unknown } | null;
    const type = body?.type;

    if (!isValidType(type)) {
      return NextResponse.json(
        { ok: false, error: `지원하지 않는 type입니다. 허용값: ${VALID_TYPES.join(', ')}` },
        { status: 400 },
      );
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

    // 4) type별 D1 삭제 수행
    if (type === 'chat') {
      // 순서: 의존 레코드 먼저 삭제 → 채팅방 마지막
      await db.delete(messagesTable).where(ne(messagesTable.id, '00000000-0000-0000-0000-000000000000'));
      await db.delete(messageReadsTable).where(ne(messageReadsTable.id, '00000000-0000-0000-0000-000000000000'));
      await db.delete(roomNotificationSettingsTable).where(ne(roomNotificationSettingsTable.id, '00000000-0000-0000-0000-000000000000'));
      await db.delete(chatRoomsTable).where(ne(chatRoomsTable.id, '00000000-0000-0000-0000-000000000000'));
      return NextResponse.json({ ok: true });
    }

    if (type === 'inventory') {
      await db.delete(inventoryLogsTable).where(ne(inventoryLogsTable.id, '00000000-0000-0000-0000-000000000000'));
      await db.delete(inventoryTable).where(ne(inventoryTable.id, '00000000-0000-0000-0000-000000000000'));
      return NextResponse.json({ ok: true });
    }

    if (type === 'board') {
      // board_type이 수술일정/MRI일정표/mri인 것은 제외하고 삭제
      const SCHEDULE_TYPES = ['수술일정', 'MRI일정표', 'mri'];
      await db.delete(postsTable).where(ne(postsTable.id, '00000000-0000-0000-0000-000000000000'));
      await db.delete(boardPostCommentsTable).where(ne(boardPostCommentsTable.id, '00000000-0000-0000-0000-000000000000'));
      await db
        .delete(boardPostsTable)
        .where(notInArray(boardPostsTable.board_type, SCHEDULE_TYPES));
      return NextResponse.json({ ok: true });
    }

    if (type === 'schedule') {
      const SCHEDULE_TYPES = ['수술일정', 'MRI일정표', 'mri'];
      await db
        .delete(boardPostsTable)
        .where(inArray(boardPostsTable.board_type, SCHEDULE_TYPES));
      return NextResponse.json({ ok: true });
    }

    if (type === 'system_logs') {
      await db.delete(auditLogsTable).where(ne(auditLogsTable.id, '00000000-0000-0000-0000-000000000000'));
      return NextResponse.json({ ok: true });
    }

    if (type === 'expired_contracts') {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      await db
        .delete(employmentContractsTable)
        .where(
          sql`${employmentContractsTable.status} = 'pending' AND ${employmentContractsTable.created_at} < ${thirtyDaysAgo}`,
        );
      return NextResponse.json({ ok: true });
    }

    if (type === 'expired_popups') {
      await db
        .delete(popupsTable)
        .where(eq(popupsTable.is_active, 0));
      return NextResponse.json({ ok: true });
    }

    if (type === 'force_logout') {
      const now = new Date().toISOString();
      await db
        .insert(systemConfigsTable)
        .values({ key: 'min_auth_time', value: now, description: '전체 로그아웃 시점' })
        .onConflictDoUpdate({
          target: systemConfigsTable.key,
          set: { value: now, description: '전체 로그아웃 시점' },
        });
      return NextResponse.json({ ok: true });
    }

    // 여기까지 도달하면 isValidType 검사에서 걸렸어야 하므로 unreachable
    return NextResponse.json({ ok: false, error: 'Unknown type' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '데이터 초기화 중 오류가 발생했습니다.';
    console.error('[admin/data-reset] failed:', error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
