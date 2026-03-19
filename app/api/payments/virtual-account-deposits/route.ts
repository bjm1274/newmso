import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { readSessionFromRequest } from '@/lib/server-session';
import { normalizeDepositDraft } from '@/lib/virtual-account-deposits';

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

function applyTextFilter(rows: Array<Record<string, unknown>>, query: string | null) {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  if (!normalizedQuery) return rows;

  return rows.filter((row) =>
    [
      row.order_name,
      row.order_id,
      row.transaction_label,
      row.patient_name,
      row.patient_id,
      row.depositor_name,
      row.customer_name,
      row.account_number,
    ]
      .map((value) => String(value || '').toLowerCase())
      .some((value) => value.includes(normalizedQuery)),
  );
}

function applyStateFilter(
  rows: Array<Record<string, unknown>>,
  key: 'deposit_status' | 'match_status',
  expected: string | null,
) {
  const normalized = String(expected || '').trim();
  if (!normalized || normalized === 'all') return rows;
  return rows.filter((row) => String(row[key] || '') === normalized);
}

export async function GET(request: NextRequest) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getAdminClient();
    const url = new URL(request.url);
    const companyId = String(session.user.company_id || '').trim();
    let query = supabase
      .from('virtual_account_deposits')
      .select('*')
      .order('deposited_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(300);

    if (companyId && session.user.is_system_master !== true) {
      query = query.eq('company_id', companyId);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let rows = (data || []) as Array<Record<string, unknown>>;
    rows = applyTextFilter(rows, url.searchParams.get('q'));
    rows = applyStateFilter(rows, 'deposit_status', url.searchParams.get('depositStatus'));
    rows = applyStateFilter(rows, 'match_status', url.searchParams.get('matchStatus'));

    return NextResponse.json({ deposits: rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load deposits.';
    console.error('virtual account deposit list failed:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const id = String(body?.id || '').trim();
    if (!id) {
      return NextResponse.json({ error: '입금 ID가 필요합니다.' }, { status: 400 });
    }

    const updates = normalizeDepositDraft(body || {});
    const supabase = getAdminClient();
    const companyId = String(session.user.company_id || '').trim();

    let existingQuery = supabase
      .from('virtual_account_deposits')
      .select('id, company_id')
      .eq('id', id);

    if (companyId && session.user.is_system_master !== true) {
      existingQuery = existingQuery.eq('company_id', companyId);
    }

    const existing = await existingQuery.limit(1).maybeSingle();
    if (existing.error) {
      return NextResponse.json({ error: existing.error.message }, { status: 500 });
    }

    if (!existing.data) {
      return NextResponse.json({ error: '수정할 입금 내역을 찾을 수 없습니다.' }, { status: 404 });
    }

    const { data, error } = await supabase
      .from('virtual_account_deposits')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ deposit: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update deposit.';
    console.error('virtual account deposit patch failed:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
