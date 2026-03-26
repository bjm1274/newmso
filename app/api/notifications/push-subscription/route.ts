import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { readSessionFromRequest } from '@/lib/server-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Supabase service role configuration is missing.');
  }

  return createClient(supabaseUrl, serviceKey);
}

type PushSubscriptionPayload = {
  endpoint?: string;
  p256dh?: string;
  auth?: string;
  fcm_token?: string;
};

function parsePayload(body: PushSubscriptionPayload | null) {
  const endpoint = String(body?.endpoint || '').trim();
  const p256dh = String(body?.p256dh || '').trim();
  const auth = String(body?.auth || '').trim();
  const fcm_token = String(body?.fcm_token || '').trim() || null;
  return { endpoint, p256dh, auth, fcm_token };
}

export async function POST(request: NextRequest) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as PushSubscriptionPayload | null;
    const { endpoint, p256dh, auth, fcm_token } = parsePayload(body);

    // FCM token만 있는 경우도 허용 (Web Push 없이 FCM만 등록)
    if (!endpoint && !fcm_token) {
      return NextResponse.json({ error: 'Invalid push subscription payload.' }, { status: 400 });
    }
    if (endpoint && (!p256dh || !auth)) {
      return NextResponse.json({ error: 'Invalid push subscription payload.' }, { status: 400 });
    }

    const supabase = getAdminClient();
    const staffId = String(session.user.id);

    const { error: deleteNullError } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint)
      .is('staff_id', null);

    if (deleteNullError) {
      return NextResponse.json({ error: '구독 정보 처리 중 오류가 발생했습니다.' }, { status: 500 });
    }

    const { error: deleteError } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint)
      .neq('staff_id', staffId);

    if (deleteError) {
      return NextResponse.json({ error: '구독 정보 처리 중 오류가 발생했습니다.' }, { status: 500 });
    }

    // FCM token만 있는 경우 별도 upsert
    if (fcm_token && !endpoint) {
      // 기존 fcm_token 없는(Web Push 전용) 레코드 정리 → 이중 알림 방지
      await supabase.from('push_subscriptions')
        .delete()
        .eq('staff_id', staffId)
        .is('fcm_token', null);
      await supabase.from('push_subscriptions').upsert(
        { staff_id: staffId, endpoint: `fcm:${staffId}`, p256dh: '', auth: '', fcm_token },
        { onConflict: 'staff_id,endpoint' }
      );
      await supabase.from('push_subscriptions')
        .delete()
        .eq('staff_id', staffId)
        .eq('fcm_token', fcm_token)
        .neq('endpoint', `fcm:${staffId}`);
      return NextResponse.json({ ok: true });
    }

    // FCM 토큰이 포함된 Web Push 구독 등록 시: 같은 staff의 fcm_token 없는 다른 레코드 정리
    if (fcm_token && endpoint) {
      await supabase.from('push_subscriptions')
        .delete()
        .eq('staff_id', staffId)
        .is('fcm_token', null)
        .neq('endpoint', endpoint);
    }

    const { error: upsertError } = await supabase.from('push_subscriptions').upsert(
      { staff_id: staffId, endpoint, p256dh, auth, fcm_token },
      { onConflict: 'staff_id,endpoint' }
    );

    if (upsertError) {
      return NextResponse.json({ error: '구독 정보 처리 중 오류가 발생했습니다.' }, { status: 500 });
    }

    if (fcm_token) {
      await supabase.from('push_subscriptions')
        .delete()
        .eq('staff_id', staffId)
        .eq('fcm_token', fcm_token)
        .neq('endpoint', endpoint);
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: '구독 정보 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as PushSubscriptionPayload | null;
    const endpoint = String(body?.endpoint || '').trim();

    if (!endpoint) {
      return NextResponse.json({ error: 'Endpoint is required.' }, { status: 400 });
    }

    const supabase = getAdminClient();
    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('staff_id', String(session.user.id))
      .eq('endpoint', endpoint);

    if (error) {
      return NextResponse.json({ error: '구독 정보 처리 중 오류가 발생했습니다.' }, { status: 500 });
    }

    const { error: deleteNullError } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint)
      .is('staff_id', null);

    if (deleteNullError) {
      return NextResponse.json({ error: '구독 정보 처리 중 오류가 발생했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: '구독 정보 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
