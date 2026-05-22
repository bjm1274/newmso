import { NextResponse } from 'next/server';
import { isAdminSession, readSessionFromRequest } from '@/lib/server-session';
import { transitionApprovals } from '@/lib/server-approval-transition';


export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session?.user?.id) {
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

    const reason = body?.reason ? String(body.reason) : null;
    const result = await transitionApprovals({
      approvalIds,
      actor: {
        id: String(session.user.id || '').trim() || null,
        name: String(session.user.name || '').trim() || null,
        company: String(session.user.company || '').trim() || null,
        isAdmin: isAdminSession(session.user),
      },
      action,
      rejectReason: action === 'reject' ? reason : null,
      approveComment: action === 'approve' ? reason : null,
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
