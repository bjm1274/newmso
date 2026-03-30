import { NextRequest, NextResponse } from 'next/server';
import { readSessionFromRequest } from '@/lib/server-session';
import { processUnreadNotificationRepushServer } from '@/lib/notification-repush';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const limit = Math.min(Math.max(Number(body?.limit || 20), 1), 50);
    const result = await processUnreadNotificationRepushServer(limit, [String(session.user.id)]);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to repush unread notifications';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
