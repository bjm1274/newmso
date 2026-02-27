// SY INC. MSO - 통합 Web Push Edge Function
// Supabase Edge Function: send-web-push
//
// 지원 모드:
//   1. 채팅 메시지 푸시: { room_id, message_id }
//   2. 일반 알림 푸시:   { notification_type, title, body, data, target_user_ids }
//
// 필요 환경변수 (Supabase Project Settings > Functions > Environment variables):
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
// - VAPID_PUBLIC_KEY
// - VAPID_PRIVATE_KEY
// - VAPID_SUBJECT (예: mailto:admin@pchos.kr)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.2';

type PushSubscriptionRow = {
  id: string;
  staff_id: string | null;
  endpoint: string;
  p256dh: string;
  auth: string;
};

type MessageRow = {
  id: string;
  room_id: string;
  sender_id: string | null;
  content: string | null;
  created_at: string;
};

type ChatRoomRow = {
  id: string;
  name: string | null;
  members: string[] | null;
};

// 구독 정보 조회 & 푸시 전송 공통 함수
async function sendPushToUsers(
  supabase: any,
  targetUserIds: string[],
  payload: string,
  senderIdToExclude?: string,
): Promise<{ success: number; fail: number }> {
  if (targetUserIds.length === 0) return { success: 0, fail: 0 };

  const { data: subscriptions, error: subError } = await supabase
    .from<PushSubscriptionRow>('push_subscriptions')
    .select('id, staff_id, endpoint, p256dh, auth')
    .in('staff_id', targetUserIds);

  if (subError || !subscriptions?.length) return { success: 0, fail: 0 };

  // 중복 endpoint 제거
  const uniqueByEndpoint = new Map<string, PushSubscriptionRow>();
  for (const sub of subscriptions) {
    if (!uniqueByEndpoint.has(sub.endpoint)) {
      uniqueByEndpoint.set(sub.endpoint, sub);
    }
  }

  const toSend = Array.from(uniqueByEndpoint.values()).filter(
    (sub) => sub.staff_id !== senderIdToExclude && sub.staff_id !== null,
  );

  let successCount = 0;
  let failCount = 0;

  for (const sub of toSend) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          expirationTime: null,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payload,
      );
      successCount++;
    } catch (err: any) {
      failCount++;
      console.error('Web Push 전송 실패:', err?.statusCode, err?.body ?? err);
      // 만료된 구독 정리
      if (err?.statusCode === 410 || err?.statusCode === 404) {
        await supabase.from('push_subscriptions').delete().eq('id', sub.id);
      }
    }
  }

  return { success: successCount, fail: failCount };
}

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
    const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
    const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com';

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: 'Supabase env not configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return new Response(JSON.stringify({ error: 'VAPID keys not configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    // ─────────────────────────────────────────────
    // 모드 1: 채팅 메시지 푸시 (기존 방식 유지)
    // ─────────────────────────────────────────────
    if (body.room_id && body.message_id) {
      const { room_id, message_id } = body;

      const [msgRes, roomRes] = await Promise.all([
        supabase.from<MessageRow>('messages').select('id, room_id, sender_id, content, created_at').eq('id', message_id).single(),
        supabase.from<ChatRoomRow>('chat_rooms').select('id, name, members').eq('id', room_id).single(),
      ]);

      if (msgRes.error || !msgRes.data || roomRes.error || !roomRes.data) {
        return new Response(JSON.stringify({ error: 'message or room not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
      }

      const message = msgRes.data;
      const room = roomRes.data;
      const senderId = message.sender_id ?? '';

      const senderRes = senderId
        ? await supabase.from('staff_members').select('name').eq('id', senderId).maybeSingle()
        : { data: null };
      const senderName = (senderRes.data as { name?: string } | null)?.name ?? '알 수 없음';

      const members = room.members ?? [];
      const targetIds = members.filter((id: string) => id && id !== senderId);

      if (targetIds.length === 0) {
        return new Response(JSON.stringify({ sent: 0, reason: 'no targets' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      // 알림 비활성화 유저 제외
      const { data: disabledSettings } = await supabase
        .from('room_notification_settings')
        .select('user_id')
        .eq('room_id', room_id)
        .eq('notifications_enabled', false);
      const disabledIds = new Set((disabledSettings ?? []).map((r: any) => r.user_id));
      const finalTargetIds = targetIds.filter((id: string) => !disabledIds.has(id));

      const bodyText = (message.content?.trim().slice(0, 80)) || '📎 파일';
      const payload = JSON.stringify({
        title: `💬 ${senderName}`,
        body: bodyText,
        tag: 'chat-message',
        data: { room_id, message_id, created_at: message.created_at, type: 'message' },
      });

      const result = await sendPushToUsers(supabase, finalTargetIds, payload, senderId);
      return new Response(JSON.stringify({ sent: result.success, failed: result.fail }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // ─────────────────────────────────────────────
    // 모드 2: 일반 알림 푸시 (결재/재고/급여/교육 등)
    // { notification_type, title, body, data, target_user_ids }
    // ─────────────────────────────────────────────
    if (body.notification_type && body.target_user_ids) {
      const { notification_type, title, body: bodyText, data: extraData, target_user_ids } = body;

      if (!Array.isArray(target_user_ids) || target_user_ids.length === 0) {
        return new Response(JSON.stringify({ error: 'target_user_ids required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }

      const payload = JSON.stringify({
        title: title || '알림',
        body: bodyText || '',
        tag: notification_type,
        data: { ...(extraData || {}), type: notification_type },
      });

      const result = await sendPushToUsers(supabase, target_user_ids, payload);
      return new Response(JSON.stringify({ sent: result.success, failed: result.fail }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Invalid request body. Use { room_id, message_id } or { notification_type, title, body, data, target_user_ids }' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('send-web-push 오류:', error);
    return new Response(JSON.stringify({ error: 'internal error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
