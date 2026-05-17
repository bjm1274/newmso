import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readSessionFromRequest } from '@/lib/server-session';
import { dispatchChatPushForMessage } from '@/lib/chat-push-dispatch';
import { NOTICE_ROOM_ID } from '@/lib/constants';
import { insertNotificationsOrThrow, type NotificationRow } from '@/lib/notification-utils';
import {
  getD1Binding,
  getD1Drizzle,
  resolveDataBackend,
  staff_members as staffMembersTable,
} from '@/lib/db';
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

function getAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase service role configuration is missing.');
  }
  return createClient(url, key);
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

    const supabase = getAdminClient();

    const { data: postRaw, error: postError } = await supabase
      .from('board_posts')
      .select('id, title, content, board_type, author_id, scheduled_publish_at')
      .eq('id', postId)
      .maybeSingle();
    if (postError) {
      return NextResponse.json({ error: '게시글 조회 실패', detail: postError.message }, { status: 500 });
    }
    const post = postRaw as BoardPostRow | null;
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
      const { data: staffRow } = await supabase
        .from('staff_members')
        .select('id, name, role')
        .eq('id', sessionUserId)
        .maybeSingle();
      sessionStaff = (staffRow as StaffSummary | null) || null;
      allowed = isAdminRole(sessionStaff?.role);
    }
    if (!allowed) {
      return NextResponse.json(
        { error: '본인이 작성한 게시글이거나 관리자만 발송할 수 있습니다.' },
        { status: 403 },
      );
    }

    if (!sessionStaff) {
      const { data: staffRow } = await supabase
        .from('staff_members')
        .select('id, name, role')
        .eq('id', sessionUserId)
        .maybeSingle();
      sessionStaff = (staffRow as StaffSummary | null) || null;
    }
    const senderName = useAnonymous ? '관리자' : String(sessionStaff?.name || '관리자');

    // 1) 공지 채팅방에 메시지 insert
    const chatContent = buildChatContent(boardType, String(post.title || ''), post.content);
    const { data: insertedMsgRaw, error: msgError } = await supabase
      .from('messages')
      .insert([
        {
          room_id: NOTICE_ROOM_ID,
          sender_id: sessionUserId,
          sender_name: senderName,
          content: chatContent,
        },
      ])
      .select('id')
      .single();

    if (msgError || !insertedMsgRaw) {
      return NextResponse.json(
        {
          error: '공지 채팅방 메시지 저장에 실패했습니다.',
          detail: msgError?.message || 'insert returned null',
        },
        { status: 500 },
      );
    }
    const messageId = String((insertedMsgRaw as { id?: string }).id || '');
    if (!messageId) {
      return NextResponse.json(
        { error: '공지 채팅방 메시지 ID를 확인할 수 없습니다.' },
        { status: 500 },
      );
    }

    // 2) 전 직원 알림 행 일괄 insert (board 타입) — D1 직접 사용
    let notificationCount = 0;
    try {
      const backend = await resolveDataBackend();
      const d1 = await getD1Binding();
      if (!d1) {
        logD1BindingMissing({ label: 'notice-broadcast:staff_lookup', backend });
        throw new Error('[notice-broadcast] D1 binding not available');
      }
      const db = getD1Drizzle(d1);
      const staffList = await db
        .select({ id: staffMembersTable.id })
        .from(staffMembersTable);
      const staffIds = (staffList ?? [])
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
        supabase,
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
