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
};

function parsePayload(body: PushSubscriptionPayload | null) {
  const endpoint = String(body?.endpoint || '').trim();
  const p256dh = String(body?.p256dh || '').trim();
  const auth = String(body?.auth || '').trim();
  return { endpoint, p256dh, auth };
}

export async function POST(request: NextRequest) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as PushSubscriptionPayload | null;
    const { endpoint, p256dh, auth } = parsePayload(body);

    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json({ error: 'Invalid push subscription payload.' }, { status: 400 });
    }

    const supabase = getAdminClient();
    const staffId = String(session.user.id);

    const { error: deleteError } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint)
      .neq('staff_id', staffId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    const { error: upsertError } = await supabase.from('push_subscriptions').upsert(
      {
        staff_id: staffId,
        endpoint,
        p256dh,
        auth,
      },
      { onConflict: 'staff_id,endpoint' }
    );

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('push subscription sync failed', error);
    return NextResponse.json({ error: 'Failed to sync push subscription.' }, { status: 500 });
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
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('push subscription delete failed', error);
    return NextResponse.json({ error: 'Failed to delete push subscription.' }, { status: 500 });
  }
}
