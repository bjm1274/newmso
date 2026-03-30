import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isAdminSession, readSessionFromRequest } from '@/lib/server-session';
import { transitionApprovals } from '@/lib/server-approval-transition';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
    const action = String(body?.action || '').trim();
    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json({ ok: false, error: 'action must be approve or reject' }, { status: 400 });
    }

    const approvalIds = Array.isArray(body?.approvalIds)
      ? body.approvalIds.map((id: unknown) => String(id || '').trim()).filter(Boolean)
      : String(body?.approvalId || '').trim()
        ? [String(body?.approvalId || '').trim()]
        : [];

    if (approvalIds.length === 0) {
      return NextResponse.json({ ok: false, error: 'approvalIds are required' }, { status: 400 });
    }

    const supabase = createAdminSupabase();
    const result = await transitionApprovals({
      supabase,
      approvalIds,
      actor: {
        id: String(session.user.id || '').trim() || null,
        name: String(session.user.name || '').trim() || null,
        company: String(session.user.company || '').trim() || null,
        isAdmin: isAdminSession(session.user),
      },
      action,
      rejectReason: body?.reason ? String(body.reason) : null,
    });

    return NextResponse.json({
      ok: true,
      action,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to transition approvals';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
