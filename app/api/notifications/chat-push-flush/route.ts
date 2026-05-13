import { NextRequest, NextResponse } from 'next/server';
import { readSessionFromRequest } from '@/lib/server-session';
import { isAdminUser, isPrivilegedUser } from '@/lib/access-control';
import { processPendingChatPushJobs } from '@/lib/chat-push-dispatch';


export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isAdminUser(session.user) && !isPrivilegedUser(session.user)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const limit = Math.min(Math.max(Number(body?.limit || 10), 1), 25);
    const result = await processPendingChatPushJobs(limit);

    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Failed to flush pending chat push jobs' },
      { status: 500 },
    );
  }
}
