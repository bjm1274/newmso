import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  getDepositCompanyScope,
  readAuthorizedDepositUser,
} from '@/lib/server-deposit-access';
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

async function authorizeDepositRequest(request: NextRequest) {
  const access = await readAuthorizedDepositUser(request);
  if (!access.user) {
    return {
      user: null,
      scope: null,
      response: NextResponse.json(
        { error: access.status === 401 ? 'Unauthorized' : '권한이 없습니다.' },
        { status: access.status ?? 401 }
      ),
    };
  }

  const scope = getDepositCompanyScope(access.user);
  if (!scope) {
    return {
      user: null,
      scope: null,
      response: NextResponse.json({ error: '회사 정보가 없습니다.' }, { status: 403 }),
    };
  }

  return {
    user: access.user,
    scope,
    response: null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const access = await authorizeDepositRequest(request);
    if (access.response) return access.response;

    const supabase = getAdminClient();
    const url = new URL(request.url);
    const { companyId, isSystemMaster } = access.scope;
    let query = supabase
      .from('virtual_account_deposits')
      .select('*')
      .order('deposited_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(300);

    if (companyId && !isSystemMaster) {
      query = query.eq('company_id', companyId);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: '입금 목록을 불러오는 중 오류가 발생했습니다.' }, { status: 500 });
    }

    let rows = (data || []) as Array<Record<string, unknown>>;
    rows = applyTextFilter(rows, url.searchParams.get('q'));
    rows = applyStateFilter(rows, 'deposit_status', url.searchParams.get('depositStatus'));
    rows = applyStateFilter(rows, 'match_status', url.searchParams.get('matchStatus'));

    return NextResponse.json({ deposits: rows });
  } catch {
    return NextResponse.json({ error: '입금 목록을 불러오는 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const access = await authorizeDepositRequest(request);
    if (access.response) return access.response;

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: '요청 데이터가 없습니다.' }, { status: 400 });

    const amount = Number(String(body.amount || '0').replace(/,/g, ''));
    if (!amount || amount <= 0) {
      return NextResponse.json({ error: '금액을 올바르게 입력해주세요.' }, { status: 400 });
    }

    const depositorName = String(body.depositor_name || '').trim();
    if (!depositorName) {
      return NextResponse.json({ error: '입금자명을 입력해주세요.' }, { status: 400 });
    }

    const { companyId } = access.scope;
    const now = new Date().toISOString();
    const dedupeKey = `manual:${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from('virtual_account_deposits')
      .insert({
        company_id: companyId,
        provider: 'manual',
        dedupe_key: dedupeKey,
        provider_event_type: 'MANUAL_ENTRY',
        order_id: String(body.order_id || '').trim() || null,
        order_name: String(body.order_name || '').trim() || null,
        payment_key: null,
        transaction_key: null,
        method: 'manual',
        deposit_status: 'deposited',
        match_status: 'unmatched',
        amount,
        currency: 'KRW',
        depositor_name: depositorName,
        customer_name: depositorName,
        patient_name: String(body.patient_name || '').trim() || null,
        patient_id: String(body.patient_id || '').trim() || null,
        transaction_label: String(body.transaction_label || '').trim() || null,
        bank_code: 'TOSS',
        bank_name: '토스뱅크',
        account_number: '1002-4939-3286',
        due_date: null,
        deposited_at: String(body.deposited_at || '').trim() || now,
        matched_target_type: null,
        matched_target_id: null,
        matched_note: String(body.matched_note || '').trim() || null,
        raw_payload: { source: 'manual', entered_by: access.user.id, ...body },
        created_at: now,
        updated_at: now,
      })
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: '수동 입금 등록 중 오류가 발생했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ deposit: data });
  } catch {
    return NextResponse.json({ error: '수동 입금 등록 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const access = await authorizeDepositRequest(request);
    if (access.response) return access.response;

    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID가 필요합니다.' }, { status: 400 });

    const supabase = getAdminClient();
    const { companyId, isSystemMaster } = access.scope;

    // 수동 등록된 건만 삭제 가능
    let q = supabase.from('virtual_account_deposits')
      .delete()
      .eq('id', id)
      .eq('provider', 'manual');

    if (companyId && !isSystemMaster) {
      q = q.eq('company_id', companyId) as typeof q;
    }

    const { error } = await q;
    if (error) return NextResponse.json({ error: '삭제 중 오류가 발생했습니다.' }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: '삭제 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const access = await authorizeDepositRequest(request);
    if (access.response) return access.response;

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const id = String(body?.id || '').trim();
    if (!id) {
      return NextResponse.json({ error: '입금 ID가 필요합니다.' }, { status: 400 });
    }

    const updates = normalizeDepositDraft(body || {});
    const supabase = getAdminClient();
    const { companyId, isSystemMaster } = access.scope;

    let existingQuery = supabase
      .from('virtual_account_deposits')
      .select('id, company_id')
      .eq('id', id);

    if (companyId && !isSystemMaster) {
      existingQuery = existingQuery.eq('company_id', companyId);
    }

    const existing = await existingQuery.limit(1).maybeSingle();
    if (existing.error) {
      return NextResponse.json({ error: '입금 내역 조회 중 오류가 발생했습니다.' }, { status: 500 });
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
      return NextResponse.json({ error: '입금 내역 수정 중 오류가 발생했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ deposit: data });
  } catch {
    return NextResponse.json({ error: '입금 내역 수정 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
