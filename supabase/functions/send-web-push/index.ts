// SY INC. MSO - 채팅 Web Push Edge Function
// Supabase Edge Function: send-web-push
//
// 역할:
// - 메신저에서 새 메시지가 생성되면 (메신저.tsx에서 invoke)
// - 해당 방의 멤버들 중, 발신자를 제외한 인원에게
// - push_subscriptions 테이블에 저장된 브라우저 푸시 구독 정보를 사용해 Web Push 전송
//
// 필요 환경변수 (Supabase Project Settings > Functions > Environment variables):
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY  (절대 클라이언트에 노출 X)
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

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { room_id, message_id } = await req.json();

    if (!room_id || !message_id) {
      return new Response(JSON.stringify({ error: 'room_id and message_id are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
    const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
    const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com';

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      console.error('Supabase 환경 변수 누락');
      return new Response(JSON.stringify({ error: 'Supabase env not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      console.error('VAPID 키 미설정');
      return new Response(JSON.stringify({ error: 'VAPID keys not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Supabase 서비스 롤 클라이언트 (RLS 우회)
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // 1) 메시지 조회
    const { data: message, error: msgError } = await supabase
      .from<MessageRow>('messages')
      .select('id, room_id, sender_id, content, created_at')
      .eq('id', message_id)
      .single();

    if (msgError || !message) {
      console.error('메시지 조회 실패:', msgError);
      return new Response(JSON.stringify({ error: 'message not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2) 채팅방 + 발신자 이름 병렬 조회 (모바일 푸시에 "누가 보냈는지" 바로 표시)
    const [roomRes, senderRes] = await Promise.all([
      supabase.from<ChatRoomRow>('chat_rooms').select('id, name, members').eq('id', room_id).single(),
      message.sender_id
        ? supabase.from('staff_members').select('name').eq('id', message.sender_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const room = roomRes.data;
    const roomError = roomRes.error;
    const senderName = (senderRes.data as { name?: string } | null)?.name ?? '알 수 없음';

    if (roomError || !room) {
      console.error('채팅방 조회 실패:', roomError);
      return new Response(JSON.stringify({ error: 'room not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const members = room.members ?? [];
    if (!Array.isArray(members) || members.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: 'no room members' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 발신자는 푸시 대상에서 제외
    const senderId = message.sender_id ?? '';
    const targetStaffIds = members.filter((id) => id && id !== senderId);

    if (targetStaffIds.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: 'no targets' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 3) room_notification_settings 에서 알림 비활성화한 유저는 제외 (있다면)
    const { data: disabledSettings, error: settingsError } = await supabase
      .from('room_notification_settings')
      .select('user_id')
      .eq('room_id', room_id)
      .eq('notifications_enabled', false);

    if (settingsError) {
      console.error('room_notification_settings 조회 실패:', settingsError);
    }

    const disabledIds = new Set(
      (disabledSettings ?? []).map((row: any) => row.user_id as string).filter(Boolean),
    );
    const finalTargetIds = targetStaffIds.filter((id) => !disabledIds.has(id));

    if (finalTargetIds.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: 'all disabled' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 4) 대상자들의 푸시 구독 정보 조회
    const { data: subscriptions, error: subError } = await supabase
      .from<PushSubscriptionRow>('push_subscriptions')
      .select('id, staff_id, endpoint, p256dh, auth')
      .in('staff_id', finalTargetIds);

    if (subError) {
      console.error('push_subscriptions 조회 실패:', subError);
      return new Response(JSON.stringify({ error: 'failed to load subscriptions' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: 'no subscriptions' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // VAPID 설정
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    const bodyText =
      (message.content && message.content.trim().length > 0
        ? message.content.trim().slice(0, 80)
        : '📎 파일') ?? '새 메시지가 도착했습니다.';
    const title = `💬 ${senderName}`;
    const body = bodyText;

    const payload = JSON.stringify({
      title,
      body,
      tag: 'chat-message',
      data: {
        room_id,
        message_id,
        created_at: message.created_at,
      },
    });

    let successCount = 0;
    let failCount = 0;

    // endpoint 중복 제거 (여러 디바이스 고려)
    const uniqueByEndpoint = new Map<string, PushSubscriptionRow>();
    for (const sub of subscriptions) {
      if (!uniqueByEndpoint.has(sub.endpoint)) {
        uniqueByEndpoint.set(sub.endpoint, sub);
      }
    }

    const toSend = Array.from(uniqueByEndpoint.values()).filter(
      (sub) => sub.staff_id !== senderId && sub.staff_id !== null
    );

    for (const sub of toSend) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            expirationTime: null,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          payload,
        );
        successCount += 1;
      } catch (err: any) {
        failCount += 1;
        console.error('Web Push 전송 실패:', err?.statusCode, err?.body ?? err);

        // 구독이 유효하지 않으면 DB에서 정리 (410 Gone / 404 Not Found 등)
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id);
        }
      }
    }

    return new Response(
      JSON.stringify({
        sent: successCount,
        failed: failCount,
        total_subscriptions: toSend.length,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    console.error('send-web-push 함수 오류:', error);
    return new Response(JSON.stringify({ error: 'internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

