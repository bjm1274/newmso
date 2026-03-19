import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { normalizeVirtualAccountWebhook } from '@/lib/virtual-account-deposits';

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

function isWebhookAuthorized(request: NextRequest) {
  const expectedToken = process.env.VIRTUAL_ACCOUNT_WEBHOOK_TOKEN?.trim();
  if (!expectedToken) return true;

  const url = new URL(request.url);
  const providedToken =
    request.headers.get('x-webhook-token')?.trim() || url.searchParams.get('token')?.trim();

  return providedToken === expectedToken;
}

export async function POST(request: NextRequest) {
  try {
    if (!isWebhookAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized webhook request.' }, { status: 401 });
    }

    const rawText = await request.text();
    if (!rawText.trim()) {
      return NextResponse.json({ error: 'Webhook payload is empty.' }, { status: 400 });
    }

    const payload = JSON.parse(rawText) as unknown;
    const url = new URL(request.url);
    const normalized = normalizeVirtualAccountWebhook(payload, {
      companyId: url.searchParams.get('companyId'),
      provider: url.searchParams.get('provider'),
    });

    if (!normalized) {
      return NextResponse.json({ error: 'Unsupported webhook payload.' }, { status: 400 });
    }

    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from('virtual_account_deposits')
      .upsert(
        {
          ...normalized,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'dedupe_key' },
      )
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      depositId: data?.id ?? null,
      dedupeKey: normalized.dedupe_key,
      depositStatus: normalized.deposit_status,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Webhook processing failed unexpectedly.';
    console.error('virtual account webhook failed:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
