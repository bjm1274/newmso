import { NextRequest, NextResponse } from 'next/server';
import { readSessionFromRequest } from '@/lib/server-session';
import {
  getD1Binding,
  getD1Drizzle,
  notifications as notificationsTable,
  eq,
  and,
} from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as
      | { notification_id?: string; id?: string }
      | null;
    const notificationId = String(body?.notification_id || body?.id || '').trim();

    if (!notificationId) {
      return NextResponse.json({ error: 'notification_id is required.' }, { status: 400 });
    }

    const userId = String(session.user.id);
    const readAt = new Date().toISOString();

    const d1 = await getD1Binding();
    if (!d1) throw new Error('[mark-read] D1 binding not available');
    const db = getD1Drizzle(d1);
    await db
      .update(notificationsTable)
      .set({ read_at: readAt })
      .where(
        and(
          eq(notificationsTable.id, notificationId),
          eq(notificationsTable.user_id, userId),
        ),
      );
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Failed to update notification.' }, { status: 500 });
  }
}
