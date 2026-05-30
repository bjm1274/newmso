import { NextResponse } from 'next/server';
import { runBackup } from '@/lib/backup-cron';
import { processPendingChatPushJobs } from '@/lib/chat-push-dispatch';
import { processDueTodoRemindersServer } from '@/lib/todo-reminder-cron';
import { cleanupPushSubscriptionsInternal } from '../_shared';

export async function handlePostAction(action: string) {
  if (action === 'run_backup_full') {
    const result = await runBackup('24h');
    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error || '백업 실행에 실패했습니다.',
          hint: result.hint || null,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, action, result });
  }

  if (action === 'run_chat_push_dispatch') {
    const result = await processPendingChatPushJobs(50);
    return NextResponse.json({ ok: true, action, result });
  }

  if (action === 'run_todo_reminders') {
    const result = await processDueTodoRemindersServer(150);
    return NextResponse.json({ ok: true, action, result });
  }

  if (action === 'cleanup_push_subscriptions') {
    const result = await cleanupPushSubscriptionsInternal();
    return NextResponse.json({ ok: true, action, result });
  }

  return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
}
