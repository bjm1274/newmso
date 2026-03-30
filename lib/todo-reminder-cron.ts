import { createHash } from 'node:crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

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

    const { error: notificationError } = await supabase.from('notifications').insert([
      {
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
      },
    ]);

    const duplicateNotification =
      Boolean(notificationError) &&
      (String((notificationError as { code?: string } | null)?.code || '') === '23505' ||
        /duplicate key|unique constraint/i.test(
          String((notificationError as { message?: string } | null)?.message || '')
        ));

    if (notificationError && !duplicateNotification) {
      failed += 1;
      errors.push(`${todoId}: ${String(notificationError.message || notificationError)}`);
      await supabase.from('todo_reminder_logs').upsert(
        [
          {
            todo_id: todoId,
            user_id: userId,
            reminder_at: reminderAt,
            notification_id: null,
            status: 'failed',
            title: '할 일 리마인더',
            body: String(todo.content || '할 일'),
          },
        ],
        { onConflict: 'user_id,todo_id,reminder_at' }
      );
      continue;
    }

    await supabase.from('todo_reminder_logs').upsert(
      [
        {
          todo_id: todoId,
          user_id: userId,
          reminder_at: reminderAt,
          notification_id: notificationId,
          status: duplicateNotification ? 'duplicate' : 'sent',
          title: '할 일 리마인더',
          body: String(todo.content || '할 일'),
        },
      ],
      { onConflict: 'user_id,todo_id,reminder_at' }
    );

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
