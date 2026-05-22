import { NextRequest, NextResponse } from 'next/server';
import { readSessionFromRequest } from '@/lib/server-session';
import { dispatchChatPushForMessage } from '@/lib/chat-push-dispatch';
import { NOTICE_ROOM_ID } from '@/lib/constants';
import {
  insertNotificationsOrThrow,
  type NotificationRow,
} from '@/lib/notification-utils';
import {
  getD1Binding,
  getD1Drizzle,
  resolveDataBackend,
  staff_members as staffMembersTable,
  board_posts as boardPostsTable,
  messages as messagesTable,
  eq,
} from '@/lib/db';
import { isActiveStaff } from '@/lib/active-staff';
import { logD1BindingMissing } from '@/lib/db/mirror-metrics';

export const dynamic = 'force-dynamic';

const AUTO_BROADCAST_BOARDS = new Set(['공지사항', '경조사']);
const BOARD_ICON: Record<string, string> = {
  공지사항: '📢',
  경조사: '🎉',
};
const NOTIFICATION_LABEL: Record<string, string> = {
  공지사항: '📢 새 공지사항',
  경조사: '🎉 새 경조사',
};
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

// D1 binding 필수 — Phase 8-F: supabase 의존 제거
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
    const useAnonymous = Boolean((body as { useAnonymous?: unknown } | null)?.useAnonymous);
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
          scheduled_publish_at: boardPostsTable.scheduled_publish_at,
        })
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

    // 작성자 본인 또는 관리자만 발송 가능 — sender_id 일관성 확보
    const sessionUserId = String(session.user.id);
    const isAuthor = String(post.author_id || '') === sessionUserId;
    let allowed = isAuthor;
    let sessionStaff: StaffSummary | null = null;
    if (!allowed) {
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
      allowed = isAdminRole(sessionStaff?.role);
    }
    if (!allowed) {
      return NextResponse.json(
        { error: '본인이 작성한 게시글이거나 관리자만 발송할 수 있습니다.' },
        { status: 403 },
      );
    }

    if (!sessionStaff) {
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
    }
    const senderName = useAnonymous ? '관리자' : String(sessionStaff?.name || '관리자');

    // 1) 공지 채팅방에 메시지 insert — D1 직접
    const chatContent = buildChatContent(boardType, String(post.title || ''), post.content);
    const messageId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      await db.insert(messagesTable).values({
        id: messageId,
        room_id: NOTICE_ROOM_ID,
        sender_id: sessionUserId,
        sender_name: senderName,
        content: chatContent,
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        {
          error: '공지 채팅방 메시지 저장에 실패했습니다.',
          detail,
        },
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
          body: String(post.title || '(제목 없음)').slice(0, 80),
        }));
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
        messageId,
        expectedSenderId: sessionUserId,
      });
    } catch (err) {
      pushError = String((err as Error)?.message || err);
    }

    return NextResponse.json({
      ok: true,
      messageId,
      notificationCount,
      push: pushResult,
      pushError,
    });
  } catch (error) {
    const message = String((error as Error)?.message || '');
    return NextResponse.json(
      { error: '공지 발송 중 오류가 발생했습니다.', detail: message },
      { status: 500 },
    );
  }
}
