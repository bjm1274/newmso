import { createHash } from 'node:crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { NotificationRow } from './notification-utils';
import {
  todo_reminder_logs as todoReminderLogsTable,
  notifications as notificationsTable,
  getD1Binding,
  getD1Drizzle,
  resolveDataBackend,
} from './db';
import { logD1BindingMissing } from './db/mirror-metrics';

// Phase 8-G — notifications/todo_reminder_logs D1 직접 사용 헬퍼
type NotificationsD1Row = typeof notificationsTable.$inferInsert;
function normalizeNotificationForD1(row: NotificationRow): NotificationsD1Row {
  return {
    id: row.id ?? crypto.randomUUID(),
    user_id: row.user_id ?? null,
    type: row.type ?? null,
    title: row.title ?? null,
    body: row.body ?? null,
    metadata:
      row.metadata === null || row.metadata === undefined
        ? null
        : JSON.stringify(row.metadata),
    read_at: row.read_at ?? null,
    created_at: row.created_at ?? new Date().toISOString(),
  };
}

async function requireD1ForTodoReminder(label: string) {
  const backend = await resolveDataBackend();
  const d1 = await getD1Binding();
  if (!d1) {
    logD1BindingMissing({ label, backend });
    throw new Error(`[todo-reminder-cron] D1 binding not available (${label})`);
  }
  return getD1Drizzle(d1);
}

type DueTodoRow = {
  id: string | number;
  user_id: string;
  content?: string | null;
  task_date?: string | null;
  reminder_at?: string | null;
};

type ReminderLogRow = {
  todo_id?: string | null;
  reminder_at?: string | null;
};

export type TodoReminderDispatchResult = {
  ok: boolean;
  scanned: number;
  created: number;
  skipped: number;
  failed: number;
  errors: string[];
};

function getAdminClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Supabase service role configuration is missing.');
  }
  return createClient(supabaseUrl, serviceKey);
}

function buildDeterministicNotificationId(userId: string, dedupeKey: string) {
  const source = `erp-notification:${userId}:${dedupeKey}`;
  const bytes = createHash('sha256').update(source).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function buildReminderBody(todo: DueTodoRow) {
  const content = String(todo.content || '').trim() || '할 일';
  return todo.task_date ? `${content} · ${todo.task_date}` : content;
}

function normalizeScopedUserIds(userIds?: string[] | null) {
  if (!Array.isArray(userIds) || userIds.length === 0) return [];
  return Array.from(new Set(userIds.map((id) => String(id || '').trim()).filter(Boolean)));
}

export async function processDueTodoRemindersServer(
  limit = 100,
  userIds?: string[] | null
): Promise<TodoReminderDispatchResult> {
  const supabase = getAdminClient();
  const nowIso = new Date().toISOString();
  const scopedUserIds = normalizeScopedUserIds(userIds);

  let dueQuery = supabase
    .from('todos')
    .select('id,user_id,content,task_date,reminder_at')
    .eq('is_complete', false)
    .not('reminder_at', 'is', null)
    .lte('reminder_at', nowIso)
    .order('reminder_at', { ascending: true })
    .limit(limit);

  if (scopedUserIds.length > 0) {
    dueQuery = dueQuery.in('user_id', scopedUserIds);
  }

  const { data: dueRows, error: dueError } = await dueQuery;
  if (dueError) {
    throw dueError;
  }

  const todos = (dueRows || []) as DueTodoRow[];
  if (todos.length === 0) {
    return {
      ok: true,
      scanned: 0,
      created: 0,
      skipped: 0,
      failed: 0,
      errors: [],
    };
  }

  const todoIds = todos.map((row) => String(row.id || '')).filter(Boolean);
  const { data: logRows, error: logError } = await supabase
    .from('todo_reminder_logs')
    .select('todo_id,reminder_at')
    .in('todo_id', todoIds);

  if (logError) {
    throw logError;
  }

  const loggedKeys = new Set(
    ((logRows || []) as ReminderLogRow[]).map(
      (row) => `${String(row.todo_id || '')}:${String(row.reminder_at || '')}`
    )
  );

  let created = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const todo of todos) {
    const todoId = String(todo.id || '').trim();
    const userId = String(todo.user_id || '').trim();
    const reminderAt = String(todo.reminder_at || '').trim();

    if (!todoId || !userId || !reminderAt) {
      skipped += 1;
      continue;
    }

    const logKey = `${todoId}:${reminderAt}`;
    if (loggedKeys.has(logKey)) {
      skipped += 1;
      continue;
    }

    const dedupeKey = `todo-reminder:${userId}:${todoId}:${reminderAt}`;
    const notificationId = buildDeterministicNotificationId(userId, dedupeKey);
    const body = buildReminderBody(todo);

    const notificationRow: NotificationRow = {
      id: notificationId,
      user_id: userId,
      type: 'todo',
      title: '할 일 리마인더',
      body,
      metadata: {
        type: 'todo',
        todo_id: todoId,
        task_date: todo.task_date || null,
        reminder_at: reminderAt,
        dedupe_key: dedupeKey,
      },
      read_at: null,
      created_at: nowIso,
    };

    // Phase 8-G — D1 직접 INSERT. notification id가 결정적이므로
    // onConflictDoNothing 결과(returning) 길이로 중복 여부 판정.
    let duplicateNotification = false;
    let notificationInsertFailed = false;
    let notificationErrorMessage = '';
    try {
      const db = await requireD1ForTodoReminder('notifications:insert');
      const result = await db
        .insert(notificationsTable)
        .values(normalizeNotificationForD1(notificationRow))
        .onConflictDoNothing()
        .returning({ id: notificationsTable.id });
      if (result.length === 0) duplicateNotification = true;
    } catch (err) {
      notificationInsertFailed = true;
      notificationErrorMessage = err instanceof Error ? err.message : String(err);
    }

    if (notificationInsertFailed) {
      failed += 1;
      errors.push(`${todoId}: ${notificationErrorMessage}`);
      const failedLogRow = {
        id: crypto.randomUUID(),
        todo_id: todoId,
        user_id: userId,
        reminder_at: reminderAt,
        notification_id: null,
        status: 'failed',
        title: '할 일 리마인더',
        body: String(todo.content || '할 일'),
      };
      try {
        const db = await requireD1ForTodoReminder('todo_reminder_logs:failed-upsert');
        await db
          .insert(todoReminderLogsTable)
          .values(failedLogRow)
          .onConflictDoNothing({
            target: [
              todoReminderLogsTable.user_id,
              todoReminderLogsTable.todo_id,
              todoReminderLogsTable.reminder_at,
            ],
          });
      } catch (logErr) {
        errors.push(`${todoId}: ${logErr instanceof Error ? logErr.message : String(logErr)}`);
      }
      continue;
    }

    const sentLogRow = {
      id: crypto.randomUUID(),
      todo_id: todoId,
      user_id: userId,
      reminder_at: reminderAt,
      notification_id: notificationId,
      status: duplicateNotification ? 'duplicate' : 'sent',
      title: '할 일 리마인더',
      body: String(todo.content || '할 일'),
    };
    try {
      const db = await requireD1ForTodoReminder('todo_reminder_logs:sent-upsert');
      await db
        .insert(todoReminderLogsTable)
        .values(sentLogRow)
        .onConflictDoNothing({
          target: [
            todoReminderLogsTable.user_id,
            todoReminderLogsTable.todo_id,
            todoReminderLogsTable.reminder_at,
          ],
        });
    } catch (logErr) {
      errors.push(`${todoId}: ${logErr instanceof Error ? logErr.message : String(logErr)}`);
    }

    loggedKeys.add(logKey);
    if (duplicateNotification) {
      skipped += 1;
    } else {
      created += 1;
    }
  }

  return {
    ok: true,
    scanned: todos.length,
    created,
    skipped,
    failed,
    errors,
  };
}
