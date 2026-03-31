import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { readAuthorizedDepositUser } from '@/lib/server-deposit-access';
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

async function authorizeWebhookRequest(request: NextRequest) {
  const expectedToken = process.env.VIRTUAL_ACCOUNT_WEBHOOK_TOKEN?.trim() || '';
  const url = new URL(request.url);
  const providedToken =
    request.headers.get('x-webhook-token')?.trim() || url.searchParams.get('token')?.trim();

  if (expectedToken && providedToken === expectedToken) {
    return {
      allowed: true,
      userCompanyId: null as string | null,
      response: null as NextResponse<unknown> | null,
    };
  }

  const access = await readAuthorizedDepositUser(request);
  if (access.user) {
    return {
      allowed: true,
      userCompanyId: String(access.user.company_id || '').trim() || null,
      response: null as NextResponse<unknown> | null,
    };
  }

  if (!expectedToken) {
    const response =
      access.status === 403
        ? NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
        : NextResponse.json(
            { error: 'VIRTUAL_ACCOUNT_WEBHOOK_TOKEN is not configured.' },
            { status: 503 }
          );
    return {
      allowed: false,
      userCompanyId: null as string | null,
      response,
    };
  }

  const response = NextResponse.json(
    { error: access.status === 403 ? '권한이 없습니다.' : 'Unauthorized webhook request.' },
    { status: access.status ?? 401 }
  );
  return {
    allowed: false,
    userCompanyId: null as string | null,
    response,
  };
}

export async function POST(request: NextRequest) {
  try {
    const authorization = await authorizeWebhookRequest(request);
    if (!authorization.allowed) {
      return (
        authorization.response ||
        NextResponse.json({ error: 'Unauthorized webhook request.' }, { status: 401 })
      );
    }

    const rawText = await request.text();
    if (!rawText.trim()) {
      return NextResponse.json({ error: 'Webhook payload is empty.' }, { status: 400 });
    }

    const payload = JSON.parse(rawText) as unknown;
    const url = new URL(request.url);
    const normalized = normalizeVirtualAccountWebhook(payload, {
      companyId: url.searchParams.get('companyId') || authorization.userCompanyId,
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
      return NextResponse.json({ error: '웹훅 처리 중 오류가 발생했습니다.' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      depositId: data?.id ?? null,
      dedupeKey: normalized.dedupe_key,
      depositStatus: normalized.deposit_status,
    });
  } catch (error) {
    return NextResponse.json({ error: '웹훅 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
