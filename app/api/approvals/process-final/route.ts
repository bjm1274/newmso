import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { processFinalApprovalEffects } from '@/lib/server-approval-processing';
import { isAdminSession, readSessionFromRequest } from '@/lib/server-session';

function createAdminSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Supabase server configuration is missing.');
  }

  return createClient(supabaseUrl, serviceKey);
}

export async function POST(request: Request) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session?.user?.id && !session?.user?.name) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const approvalId = String(body?.approvalId || '').trim();
    if (!approvalId) {
      return NextResponse.json({ ok: false, error: 'approvalId is required' }, { status: 400 });
    }

    const supabase = createAdminSupabase();
    const { data: approval, error } = await supabase
      .from('approvals')
      .select('*')
      .eq('id', approvalId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    if (!approval) {
      return NextResponse.json({ ok: false, error: 'Approval not found' }, { status: 404 });
    }
    if (String(approval.status || '').trim() !== '승인') {
      return NextResponse.json({ ok: false, error: 'Approval is not finalized yet' }, { status: 409 });
    }

    const canAccess =
      isAdminSession(session.user) ||
      String(session.user.id || '') === String(approval.sender_id || '') ||
      String(session.user.company || '') === String(approval.sender_company || '');

    if (!canAccess) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const result = await processFinalApprovalEffects(
      supabase,
      approval as Record<string, unknown>,
      String(session.user.id || '').trim() || null,
    );

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to process approval';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
