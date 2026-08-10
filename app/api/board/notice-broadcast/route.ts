import { NextRequest, NextResponse } from 'next/server';
import {
  readSessionFromRequest,
  isAdminSession,
  normalizeSessionUser,
  resolveLatestSessionUser } from '@/lib/server-session';
import { dispatchChatPushForMessage } from '@/lib/chat-push-dispatch';
import { NOTICE_ROOM_ID } from '@/lib/constants';
import {
  insertNotificationsOrThrow,
  type NotificationRow } from '@/lib/notification-utils';
import {
  getD1Binding,
  getD1Drizzle,
  resolveDataBackend,
  staff_members as staffMembersTable,
  board_posts as boardPostsTable,
  messages as messagesTable,
  eq } from '@/lib/db';
import { isActiveStaff } from '@/lib/active-staff';
import { logD1BindingMissing } from '@/lib/db/mirror-metrics';

export const dynamic = 'force-dynamic';

const AUTO_BROADCAST_BOARDS = new Set(['공지사항', '경조사']);
const BOARD_ICON: Record<string, string> = {
  공지사항: '📢',
  경조사: '🎉' };
const NOTIFICATION_LABEL: Record<string, string> = {
  공지사항: '📢 새 공지사항',
  경조사: '🎉 새 경조사' };
const PREVIEW_LIMIT = 100;
const TITLE_LIMIT = 120;

type BoardPostRow = {
  id: string;
  title: string | null;
  content: string | null;
  board_type: string | null;
  author_id: string | null;
  scheduled_publish_at: string | null;
};

type StaffSummary = {
  id: string | null;
  name: string | null;
  role?: string | null;
};

// D1 binding 필수 — Phase 8-F: db 의존 제거
async function requireD1ForNoticeBroadcast(label: string) {
  const backend = await resolveDataBackend();
  const d1 = await getD1Binding();
  if (!d1) {
    logD1BindingMissing({ label, backend });
    throw new Error(`[notice-broadcast] D1 binding not available (${label})`);
  }
  return getD1Drizzle(d1);
}

function stripBoardMeta(content: string): string {
  return content
    .replace(/\[\[ATTACHMENTS_META\]\][\s\S]*?\[\[\/ATTACHMENTS_META\]\]/g, '')
    .replace(/\[\[BOARD_META\]\][\s\S]*?\[\[\/BOARD_META\]\]/g, '')
    .replace(/\[\[SCHEDULE_META\]\][\s\S]*?\[\[\/SCHEDULE_META\]\]/g, '')
    .trim();
}

function buildChatContent(boardType: string, title: string, content: string | null): string {
  const icon = BOARD_ICON[boardType] || '📢';
  const safeTitle = String(title || '(제목 없음)').slice(0, TITLE_LIMIT);
  const preview = stripBoardMeta(typeof content === 'string' ? content : '')
    .slice(0, PREVIEW_LIMIT)
    .replace(/\n+/g, ' ')
    .trim();
  return [`${icon} [${boardType}] ${safeTitle}`, preview || null].filter(Boolean).join('\n');
}

function isAdminRole(role: string | null | undefined): boolean {
  const normalized = String(role || '').trim().toLowerCase();
  return normalized === 'admin' || normalized === 'sysadmin' || normalized === 'system_admin';
}

export async function POST(request: NextRequest) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const postId = String((body as { postId?: unknown } | null)?.postId || '').trim();
    // 요청 본문의 useAnonymous 는 읽지 않는다 — 공지 메시지 발신자는 '공지봇' 고정이라
    // 예전에도 이 값이 결과에 전혀 반영되지 않았다(8차 D07-017).
    if (!postId) {
      return NextResponse.json({ error: 'postId is required.' }, { status: 400 });
    }

    const db = await requireD1ForNoticeBroadcast('main');

    // 게시글 조회 — D1 직접
    let post: BoardPostRow | null = null;
    try {
      const rows = await db
        .select({
          id: boardPostsTable.id,
          title: boardPostsTable.title,
          content: boardPostsTable.content,
          board_type: boardPostsTable.board_type,
          author_id: boardPostsTable.author_id,
          scheduled_publish_at: boardPostsTable.scheduled_publish_at })
        .from(boardPostsTable)
        .where(eq(boardPostsTable.id, postId))
        .limit(1);
      post = (rows[0] as BoardPostRow | undefined) ?? null;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        { error: '게시글 조회 실패', detail },
        { status: 500 },
      );
    }

    if (!post) {
      return NextResponse.json({ error: '게시글을 찾을 수 없습니다.' }, { status: 404 });
    }

    const boardType = String(post.board_type || '').trim();
    if (!AUTO_BROADCAST_BOARDS.has(boardType)) {
      return NextResponse.json({ ok: true, skipped: 'not-broadcast-board' });
    }

    // 예약 발행이 미래 시간이면 발송하지 않음 (등록 시점 자동발송 차단; 발행 스케줄러가 별도 처리)
    if (post.scheduled_publish_at) {
      const scheduled = new Date(String(post.scheduled_publish_at));
      if (!Number.isNaN(scheduled.getTime()) && scheduled.getTime() > Date.now()) {
        return NextResponse.json({ ok: true, skipped: 'scheduled-future' });
      }
    }

    // 전사 공지 broadcast 푸시는 오직 관리자(Admin/MSO/HR)만 발송 가능 — 일반 직원 무단 전사 푸시 차단
    const sessionUserId = String(session.user.id);
    let sessionStaff: StaffSummary | null = null;
    try {
      const rows = await db
        .select({
          id: staffMembersTable.id,
          name: staffMembersTable.name,
          role: staffMembersTable.role,
        })
        .from(staffMembersTable)
        .where(eq(staffMembersTable.id, sessionUserId))
        .limit(1);
      sessionStaff = (rows[0] as StaffSummary | undefined) ?? null;
    } catch {
      sessionStaff = null;
    }

    // 권한은 **세션이 아니라 DB** 에서 읽는다.
    //
    // 세션 쿠키는 4096바이트를 넘길 수 없어, 권한이 많은 계정은 토큰을 만들 때
    // 권한 목록이 통째로 빠진다(server-session createSessionToken). 운영에서
    // 실제로 4명이 그 상태였고 — 전부 admin/mso/hr 인 계정이다 — 세션만 보는
    // 이 검사가 그들을 403 으로 막았다. 화면에는 "관리자 전용" 만 떴다.
    //
    // 그리고 이 주석이 말하는 대상은 Admin/MSO/**HR** 인데 코드에는 HR 이 없었다.
    // 경조사·공지를 올리는 사람이 바로 인사담당자다.
    const latestUser = await resolveLatestSessionUser(normalizeSessionUser(session.user));
    const perms = (latestUser.permissions ?? {}) as Record<string, unknown>;
    const isMasterOrAdmin =
      isAdminSession(latestUser) || Boolean(perms.hr) || Boolean(perms.mso) || Boolean(perms.admin);
    const isManagerRole = isAdminRole(sessionStaff?.role);
    const allowed = isMasterOrAdmin || isManagerRole;

    if (!allowed) {
      return NextResponse.json(
        { error: '전사 공지 알림 발송 권한이 없습니다. (관리자 전용)' },
        { status: 403 },
      );
    }

    // 8차 D07-017: 여기 있던 두 번째 staff 조회 블록(위 조회와 인자까지 동일)과 그 결과로
    // 만들던 `senderName` 을 제거했다. 공지 메시지는 sender_name 을 '공지봇' 으로 고정해
    // insert 하므로 senderName 은 계산만 되고 어디에도 쓰이지 않는 죽은 값이었다.
    // (같은 이유로 요청 본문의 useAnonymous 도 이미 무의미한 값이었다.)

    // 1) 공지 채팅방에 메시지 insert — D1 직접
    const chatContent = buildChatContent(boardType, String(post.title || ''), post.content);
    // 8차 D07-017: 예전에는 messageId 가 매번 새 UUID 라 같은 게시글로 이 라우트를 두 번
    // 호출하면(작성 직후 재시도·중복 클릭·오프라인 큐 재전송) 공지방 메시지와 전 직원 알림이
    // 그대로 두 번 쌓였다. messages.id 는 PK 이므로 postId 파생 결정적 키를 쓰면
    // 두 번째 호출이 UNIQUE 로 막힌다 — 멱등 키를 별도 테이블 없이 얻는다.
    const messageId = `notice-broadcast:${postId}`;

    try {
      const existing = await db
        .select({ id: messagesTable.id })
        .from(messagesTable)
        .where(eq(messagesTable.id, messageId))
        .limit(1);
      if (existing.length > 0) {
        return NextResponse.json({ ok: true, skipped: 'already-broadcast', messageId });
      }
    } catch {
      // 선조회 실패는 무시 — 아래 insert 의 PK 충돌이 최종 방어선이다.
    }

    try {
      await db.insert(messagesTable).values({
        id: messageId,
        room_id: NOTICE_ROOM_ID,
        sender_id: null,
        sender_name: '공지봇',
        content: chatContent });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      // 선조회와 insert 사이의 경합은 PK 충돌로 나타난다 — 중복 발송이 아니라 '이미 발송됨'.
      if (/unique|constraint/i.test(detail)) {
        return NextResponse.json({ ok: true, skipped: 'already-broadcast', messageId });
      }
      return NextResponse.json(
        {
          error: '공지 채팅방 메시지 저장에 실패했습니다.',
          detail },
        { status: 500 },
      );
    }

    // 2) 전 직원 알림 행 일괄 insert (board 타입) — D1 직접 사용
    let notificationCount = 0;
    try {
      const staffList = await db
        .select({ id: staffMembersTable.id, status: staffMembersTable.status })
        .from(staffMembersTable);
      // 퇴사자('퇴사'/'퇴직' status) 제외 — 퇴사자에게 알림이 가지 않도록 필터링
      const staffIds = (staffList ?? [])
        .filter((row) => isActiveStaff({ status: row.status }))
        .map((row) => String(row.id || '').trim())
        .filter(Boolean);
      if (staffIds.length > 0) {
        const rows: NotificationRow[] = staffIds.map((userId) => ({
          user_id: userId,
          type: 'board',
          title: NOTIFICATION_LABEL[boardType] || `🔔 ${boardType}`,
          body: String(post.title || '(제목 없음)').slice(0, 80) }));
        await insertNotificationsOrThrow(rows as unknown as Record<string, unknown>[]);
        notificationCount = staffIds.length;
      }
    } catch {
      // 알림 행 실패해도 메시지/푸시는 계속 진행
    }

    // 3) 채팅 푸시 디스패치 (전 직원 대상 — chat-push-dispatch가 공지방 폴백 처리)
    let pushResult: Awaited<ReturnType<typeof dispatchChatPushForMessage>> | null = null;
    let pushError: string | null = null;
    try {
      pushResult = await dispatchChatPushForMessage({
        roomId: NOTICE_ROOM_ID,
        messageId });
    } catch (err) {
      pushError = String((err as Error)?.message || err);
    }

    return NextResponse.json({
      ok: true,
      messageId,
      notificationCount,
      push: pushResult,
      pushError });
  } catch (error) {
    const message = String((error as Error)?.message || '');
    return NextResponse.json(
      { error: '공지 발송 중 오류가 발생했습니다.', detail: message },
      { status: 500 },
    );
  }
}
