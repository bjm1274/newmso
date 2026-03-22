import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { readSessionFromRequest } from '@/lib/server-session';
import { ensureWebPushConfigured, sendWebPushNotification } from '@/lib/web-push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NOTICE_ROOM_ID = '00000000-0000-0000-0000-000000000000';

type MessageRow = {
  id: string;
  room_id: string;
  sender_id: string | null;
  content: string | null;
  created_at: string;
  file_url: string | null;
  file_kind: string | null;
};

type ChatRoomRow = {
  id: string;
  name: string | null;
  type: string | null;
  members: string[] | null;
};

type PushSubscriptionRow = {
  id: string;
  staff_id: string | null;
  endpoint: string;
  p256dh: string;
  auth: string;
};

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Supabase service role configuration is missing.');
  }

  return createClient(supabaseUrl, serviceKey);
}

function buildPreview(message: MessageRow) {
  const content = String(message.content || '').trim();
  if (content) return content.slice(0, 80);
  if (message.file_kind === 'image') return '사진을 보냈습니다.';
  if (message.file_kind === 'video') return '동영상을 보냈습니다.';
  if (message.file_url) return '파일을 보냈습니다.';
  return '새 메시지가 도착했습니다.';
}

async function getMutedUserIds(supabase: ReturnType<typeof getAdminClient>, roomId: string) {
  try {
    const { data, error } = await supabase
      .from('room_notification_settings')
      .select('user_id')
      .eq('room_id', roomId)
      .eq('notifications_enabled', false);

    if (error) {
      return new Set<string>();
    }

    return new Set((data || []).map((row: { user_id: string }) => String(row.user_id)));
  } catch {
    return new Set<string>();
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const roomId = String(body?.roomId || body?.room_id || '').trim();
    const messageId = String(body?.messageId || body?.message_id || '').trim();

    if (!roomId || !messageId) {
      return NextResponse.json({ error: 'roomId and messageId are required.' }, { status: 400 });
    }

    ensureWebPushConfigured();

    const supabase = getAdminClient();
    const [messageRes, roomRes] = await Promise.all([
      supabase
        .from('messages')
        .select('id, room_id, sender_id, content, created_at, file_url, file_kind')
        .eq('id', messageId)
        .single(),
      supabase
        .from('chat_rooms')
        .select('id, name, type, members')
        .eq('id', roomId)
        .single(),
    ]);

    if (messageRes.error || roomRes.error || !messageRes.data || !roomRes.data) {
      return NextResponse.json({ error: 'Message or room not found.' }, { status: 404 });
    }

    const message = messageRes.data as MessageRow;
    const room = roomRes.data as ChatRoomRow;
    const senderId = String(message.sender_id || '');
    const sessionUserId = String(session.user.id || '');

    if (!senderId || senderId !== sessionUserId) {
      return NextResponse.json({ error: 'Only the message sender can trigger chat push.' }, { status: 403 });
    }

    const members = Array.isArray(room.members) ? room.members.map((id) => String(id)) : [];
    if (members.length === 0) {
      return NextResponse.json({ sent: 0, failed: 0, reason: 'no-room-members' });
    }

    const mutedIds = await getMutedUserIds(supabase, roomId);
    const targetIds = members.filter((id) => id && id !== senderId && !mutedIds.has(id));

    if (targetIds.length === 0) {
      return NextResponse.json({ sent: 0, failed: 0, reason: 'no-targets' });
    }

    const [subscriptionRes, senderRes] = await Promise.all([
      supabase
        .from('push_subscriptions')
        .select('id, staff_id, endpoint, p256dh, auth')
        .in('staff_id', targetIds),
      supabase
        .from('staff_members')
        .select('name')
        .eq('id', senderId)
        .maybeSingle(),
    ]);

    if (subscriptionRes.error) {
      return NextResponse.json({ error: '알림 발송 중 오류가 발생했습니다.' }, { status: 500 });
    }

    const senderName = String((senderRes.data as { name?: string } | null)?.name || session.user.name || '새 메시지');
    const title =
      room.id === NOTICE_ROOM_ID || room.type === 'notice'
        ? '공지 메시지'
        : room.name
          ? `${senderName} - ${room.name}`
          : senderName;
    const payload = JSON.stringify({
      title,
      body: buildPreview(message),
      tag: 'chat-message',
      data: {
        room_id: roomId,
        message_id: messageId,
        created_at: message.created_at,
        type: 'message',
      },
    });

    const uniqueSubscriptions = new Map<string, PushSubscriptionRow>();
    for (const row of (subscriptionRes.data || []) as PushSubscriptionRow[]) {
      if (!row.endpoint || !row.staff_id || row.staff_id === senderId) continue;
      if (!uniqueSubscriptions.has(row.endpoint)) {
        uniqueSubscriptions.set(row.endpoint, row);
      }
    }

    let sent = 0;
    let failed = 0;
    const expiredIds: string[] = [];

    for (const subscription of uniqueSubscriptions.values()) {
      try {
        await sendWebPushNotification(subscription, payload);
        sent += 1;
      } catch (error: any) {
        failed += 1;
        const statusCode = Number(error?.statusCode || error?.status || 0);
        if (statusCode === 404 || statusCode === 410) {
          expiredIds.push(subscription.id);
        }
        // 실패한 구독 기록 (로깅 없이 처리)
      }
    }

    if (expiredIds.length > 0) {
      await supabase.from('push_subscriptions').delete().in('id', expiredIds);
    }

    return NextResponse.json({ sent, failed });
  } catch (error: any) {
    return NextResponse.json(
      { error: '알림 발송 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
