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

function normalizeApprovalLineIds(line: unknown): string[] {
  if (!Array.isArray(line)) return [];
  return Array.from(
    new Set(
      line
        .map((entry) => {
          if (entry == null) return null;
          if (typeof entry === 'string' || typeof entry === 'number') return String(entry).trim();
          if (typeof entry === 'object' && 'id' in (entry as Record<string, unknown>)) {
            const value = (entry as Record<string, unknown>).id;
            return value != null ? String(value).trim() : null;
          }
          return null;
        })
        .filter(Boolean) as string[]
    )
  );
}

function normalizeApprovalCcUserIds(ccUsers: unknown): string[] {
  if (!Array.isArray(ccUsers)) return [];
  return Array.from(
    new Set(
      ccUsers
        .map((entry) => {
          if (!entry || typeof entry !== 'object') return null;
          const value = (entry as Record<string, unknown>).id;
          return value != null ? String(value).trim() : null;
        })
        .filter(Boolean) as string[]
    )
  );
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

    const metaData =
      approval.meta_data && typeof approval.meta_data === 'object'
        ? (approval.meta_data as Record<string, unknown>)
        : null;
    const sessionUserId = String(session.user.id || '').trim();
    const currentApproverId = String(
      approval.current_approver_id || metaData?.current_approver_id || ''
    ).trim();
    const approvalLineIds = normalizeApprovalLineIds(approval.approver_line ?? metaData?.approver_line);
    const referenceUserIds = normalizeApprovalCcUserIds(metaData?.cc_users);
    const canAccess =
      isAdminSession(session.user) ||
      sessionUserId === String(approval.sender_id || '').trim() ||
      sessionUserId === currentApproverId ||
      approvalLineIds.includes(sessionUserId) ||
      referenceUserIds.includes(sessionUserId);

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
