import { NextResponse } from 'next/server';
import { readSessionFromRequest } from '@/lib/server-session';
import { processDueTodoRemindersServer } from '@/lib/todo-reminder-cron';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const session = await readSessionFromRequest(request);
    const userId = String(session?.user?.id || '').trim();

    if (!userId) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const result = await processDueTodoRemindersServer(30, [userId]);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to dispatch todo reminders';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
