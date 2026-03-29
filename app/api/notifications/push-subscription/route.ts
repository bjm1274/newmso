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
  device_id?: string;
  platform?: string;
  user_agent?: string;
};

function isMissingColumnError(error: unknown, columnName: string) {
  const payload = error as { code?: string; message?: string; details?: string } | null;
  const message = `${payload?.message || ''} ${payload?.details || ''}`.toLowerCase();
  return String(payload?.code || '') === '42703' && message.includes(columnName.toLowerCase());
}

function parsePayload(body: PushSubscriptionPayload | null) {
  const endpoint = String(body?.endpoint || '').trim();
  const p256dh = String(body?.p256dh || '').trim();
  const auth = String(body?.auth || '').trim();
  const fcmToken = String(body?.fcm_token || '').trim() || null;
  const deviceId = String(body?.device_id || '').trim() || null;
  const platform = String(body?.platform || '').trim() || null;
  const userAgent = String(body?.user_agent || '').trim() || null;
  return { endpoint, p256dh, auth, fcmToken, deviceId, platform, userAgent };
}

async function detectExtendedColumnSupport(supabase: ReturnType<typeof getAdminClient>) {
  const { error } = await supabase.from('push_subscriptions').select('device_id').limit(1);
  if (!error) return true;
  if (isMissingColumnError(error, 'device_id')) return false;
  throw error;
}

async function upsertPushSubscription(
  supabase: ReturnType<typeof getAdminClient>,
  record: Record<string, unknown>,
  supportsExtendedColumns: boolean
) {
  const baseRecord = {
    staff_id: record.staff_id,
    endpoint: record.endpoint,
    p256dh: record.p256dh,
    auth: record.auth,
    fcm_token: record.fcm_token,
  };
  const payload = supportsExtendedColumns ? record : baseRecord;
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(payload, { onConflict: 'staff_id,endpoint' });
  return error;
}

export async function POST(request: NextRequest) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as PushSubscriptionPayload | null;
    const { endpoint, p256dh, auth, fcmToken, deviceId, platform, userAgent } = parsePayload(body);

    if (!endpoint && !fcmToken) {
      return NextResponse.json({ error: 'Invalid push subscription payload.' }, { status: 400 });
    }
    if (endpoint && (!p256dh || !auth)) {
      return NextResponse.json({ error: 'Invalid push subscription payload.' }, { status: 400 });
    }

    const supabase = getAdminClient();
    const staffId = String(session.user.id);
    const supportsExtendedColumns = await detectExtendedColumnSupport(supabase);
    const effectiveEndpoint = endpoint || (deviceId ? `fcm:${staffId}:${deviceId}` : `fcm:${staffId}`);

    if (endpoint) {
      const { error: deleteNullError } = await supabase
        .from('push_subscriptions')
        .delete()
        .eq('endpoint', endpoint)
        .is('staff_id', null);

      if (deleteNullError) {
        return NextResponse.json({ error: '구독 정보를 처리하는 중 오류가 발생했습니다.' }, { status: 500 });
      }

      const { error: deleteError } = await supabase
        .from('push_subscriptions')
        .delete()
        .eq('endpoint', endpoint)
        .neq('staff_id', staffId);

      if (deleteError) {
        return NextResponse.json({ error: '구독 정보를 처리하는 중 오류가 발생했습니다.' }, { status: 500 });
      }
    }

    if (fcmToken && !endpoint) {
      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('staff_id', staffId)
        .is('fcm_token', null);
    }

    if (fcmToken && endpoint) {
      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('staff_id', staffId)
        .is('fcm_token', null)
        .neq('endpoint', endpoint);
    }

    if (supportsExtendedColumns && deviceId) {
      const cleanupQuery = supabase
        .from('push_subscriptions')
        .delete()
        .eq('staff_id', staffId)
        .eq('device_id', deviceId)
        .neq('endpoint', effectiveEndpoint);
      const { error: cleanupError } = await cleanupQuery;
      if (cleanupError) {
        return NextResponse.json({ error: '구독 정보를 처리하는 중 오류가 발생했습니다.' }, { status: 500 });
      }
    }

    const upsertError = await upsertPushSubscription(
      supabase,
      {
        staff_id: staffId,
        endpoint: effectiveEndpoint,
        p256dh,
        auth,
        fcm_token: fcmToken,
        device_id: deviceId,
        platform,
        user_agent: userAgent,
      },
      supportsExtendedColumns
    );

    if (upsertError) {
      return NextResponse.json({ error: '구독 정보를 처리하는 중 오류가 발생했습니다.' }, { status: 500 });
    }

    if (fcmToken) {
      let dedupeQuery = supabase
        .from('push_subscriptions')
        .delete()
        .eq('staff_id', staffId)
        .eq('fcm_token', fcmToken)
        .neq('endpoint', effectiveEndpoint);
      if (supportsExtendedColumns && deviceId) {
        dedupeQuery = dedupeQuery.eq('device_id', deviceId);
      }
      await dedupeQuery;
    }

    // 사용자당 구독 최대 10개 초과 시 오래된 것부터 정리
    const MAX_SUBSCRIPTIONS_PER_USER = 10;
    const { data: allSubs } = await supabase
      .from('push_subscriptions')
      .select('id, created_at')
      .eq('staff_id', staffId)
      .order('created_at', { ascending: true });

    if (allSubs && allSubs.length > MAX_SUBSCRIPTIONS_PER_USER) {
      const excessIds = allSubs
        .slice(0, allSubs.length - MAX_SUBSCRIPTIONS_PER_USER)
        .map((s: { id: string }) => s.id);
      if (excessIds.length > 0) {
        await supabase.from('push_subscriptions').delete().in('id', excessIds);
      }
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: '구독 정보를 처리하는 중 오류가 발생했습니다.' }, { status: 500 });
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
      return NextResponse.json({ error: '구독 정보를 처리하는 중 오류가 발생했습니다.' }, { status: 500 });
    }

    const { error: deleteNullError } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint)
      .is('staff_id', null);

    if (deleteNullError) {
      return NextResponse.json({ error: '구독 정보를 처리하는 중 오류가 발생했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: '구독 정보를 처리하는 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
