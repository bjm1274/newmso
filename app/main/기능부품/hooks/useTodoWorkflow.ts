'use client';

import { toast } from '@/lib/toast';
import { useEffect, useMemo, useState } from 'react';
import { getKoreanTodayString, formatKoreanDateKey } from '@/lib/seoul-time';
import { db } from '@/lib/db-client';
import { subscribeRealtime } from '@/lib/realtime-bus';
import { withMissingColumnsFallback } from '@/lib/db-compat';
import { getStaffLikeId, normalizeStaffLike, resolveStaffLike } from '@/lib/staff-identity';
import { STORAGE_KEYS } from '@/lib/storage-keys';
import { useActionDialog } from '@/app/components/useActionDialog';

export type TodoPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TodoRepeatType = 'none' | 'daily' | 'weekly' | 'monthly';
export type TodoAssigneeKind = 'self' | 'team' | 'follow_up';
export type TodoViewRange = 'day' | 'week' | 'month';

export type TodoRow = {
  id: string | number;
  user_id: string;
  content: string;
  is_complete: boolean;
  task_date: string;
  created_at?: string | null;
  priority?: TodoPriority;
  reminder_at?: string | null;
  repeat_type?: TodoRepeatType;
  assignee_kind?: TodoAssigneeKind;
  repeat_parent_id?: string | null;
  repeat_generated_from_id?: string | null;
  source_message_id?: string | null;
  source_room_id?: string | null;
  [key: string]: unknown;
};

export const OPTIONAL_TODO_COLUMNS = [
  'priority',
  'reminder_at',
  'repeat_type',
  'assignee_kind',
  'repeat_parent_id',
  'repeat_generated_from_id',
  'source_message_id',
  'source_room_id',
] as const;

/** 할일 목록/조회용 컬럼 — select('*') 회피 */
export const TODO_REQUIRED_SELECT_COLUMNS = [
  'id',
  'user_id',
  'content',
  'is_complete',
  'task_date',
  'created_at',
] as const;

export function buildTodoSelect(omittedColumns?: ReadonlySet<string>) {
  return [
    ...TODO_REQUIRED_SELECT_COLUMNS,
    ...OPTIONAL_TODO_COLUMNS.filter((column) => !omittedColumns?.has(column)),
  ].join(', ');
}

export const TODO_LIST_SELECT = buildTodoSelect();

export const PRIORITY_OPTIONS: Array<{ value: TodoPriority; label: string }> = [
  { value: 'urgent', label: '긴급' },
  { value: 'high', label: '높음' },
  { value: 'medium', label: '보통' },
  { value: 'low', label: '낮음' },
];

export const REPEAT_OPTIONS: Array<{ value: TodoRepeatType; label: string }> = [
  { value: 'none', label: '반복 없음' },
  { value: 'daily', label: '매일' },
  { value: 'weekly', label: '매주' },
  { value: 'monthly', label: '매월' },
];

export const ASSIGNEE_OPTIONS: Array<{ value: TodoAssigneeKind; label: string }> = [
  { value: 'self', label: '내 작업' },
  { value: 'team', label: '팀 협업' },
  { value: 'follow_up', label: '후속 확인' },
];

export function getToday() {
  return getKoreanTodayString();
}

export function getDateRange(viewRange: TodoViewRange, selectedDate: string) {
  const baseDate = new Date(`${selectedDate}T12:00:00`);
  if (viewRange === 'day') {
    return { start: selectedDate, end: selectedDate };
  }
  if (viewRange === 'week') {
    const day = baseDate.getDay();
    const sunday = new Date(baseDate);
    sunday.setDate(baseDate.getDate() - (day === 0 ? 7 : day));
    const saturday = new Date(sunday);
    saturday.setDate(sunday.getDate() + 6);
    // 날짜 키는 KST 정본으로 만든다 — toLocaleDateString('en-CA') 은 렌더 환경
    // TZ 를 따라 주 경계가 하루씩 밀렸다.
    return {
      start: formatKoreanDateKey(sunday),
      end: formatKoreanDateKey(saturday) };
  }

  const year = baseDate.getFullYear();
  const month = String(baseDate.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(year, baseDate.getMonth() + 1, 0).getDate();
  return {
    start: `${year}-${month}-01`,
    end: `${year}-${month}-${String(lastDay).padStart(2, '0')}` };
}

export function getPriorityMeta(priority: unknown) {
  switch (String(priority || '').trim()) {
    case 'urgent':
      return { label: '긴급', color: '#FF3B30', className: 'bg-red-500/20 text-red-600 text-red-500' };
    case 'high':
      return { label: '높음', color: '#FF9500', className: 'bg-orange-500/20 text-orange-600 text-orange-500' };
    case 'low':
      return { label: '낮음', color: '#8E8E93', className: 'bg-[var(--muted)] text-[var(--toss-gray-4)] text-gray-400' };
    default:
      // PC·모바일 양쪽에서 쓰이는 값이라 --m-* 토큰을 쓸 수 없다. 토큰과 같은
      // 리터럴(#2563EB)로 맞춘다 — 여기만 iOS 파랑이라 다른 파랑이 섞였다.
      return { label: '보통', color: '#2563EB', className: 'bg-blue-500/20 text-blue-600 text-blue-500' };
  }
}

export function getRepeatLabel(value: unknown) {
  switch (String(value || '').trim()) {
    case 'daily':
      return '매일';
    case 'weekly':
      return '매주';
    case 'monthly':
      return '매월';
    default:
      return '';
  }
}

export function getAssigneeLabel(value: unknown) {
  switch (String(value || '').trim()) {
    case 'team':
      return '팀 협업';
    case 'follow_up':
      return '후속 확인';
    default:
      return '내 작업';
  }
}

export function buildReminderAt(date: string, time: string) {
  if (!date || !time) return null;
  const parsed = new Date(`${date}T${time}:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function formatReminder(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit' });
}

export function getNextTaskDate(taskDate: string, repeatType: TodoRepeatType | undefined) {
  const baseDate = new Date(`${taskDate}T12:00:00`);
  if (Number.isNaN(baseDate.getTime())) return null;

  switch (repeatType) {
    case 'daily':
      baseDate.setDate(baseDate.getDate() + 1);
      break;
    case 'weekly':
      baseDate.setDate(baseDate.getDate() + 7);
      break;
    case 'monthly':
      baseDate.setMonth(baseDate.getMonth() + 1);
      break;
    default:
      return null;
  }

  return formatKoreanDateKey(baseDate);
}

export function shiftReminderAt(value: string | null | undefined, nextTaskDate: string) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;

  const [year, month, day] = nextTaskDate.split('-').map((token) => Number.parseInt(token, 10));
  if (!year || !month || !day) return null;

  const nextReminder = new Date(parsed);
  nextReminder.setFullYear(year, month - 1, day);
  return nextReminder.toISOString();
}

export function getRepeatParentId(task: TodoRow) {
  const raw = String(task.repeat_parent_id || task.id || '').trim();
  return raw || null;
}

export async function resolveTodoChatSource(task: TodoRow) {
  const sourceRoomId = String(task.source_room_id || '').trim();
  const sourceMessageId = String(task.source_message_id || '').trim();
  if (!sourceRoomId && !sourceMessageId) return null;

  if (!sourceMessageId) {
    return {
      roomId: sourceRoomId,
      messageId: '' };
  }

  try {
    const { data, error } = await db
      .from('messages')
      .select('id, room_id')
      .eq('id', sourceMessageId)
      .limit(1);

    if (error) throw error;

    const sourceMessage = Array.isArray(data) ? data[0] : null;
    const resolvedRoomId = String(sourceMessage?.room_id || '').trim();
    return {
      roomId: resolvedRoomId || sourceRoomId,
      messageId: String(sourceMessage?.id || sourceMessageId).trim() };
  } catch {
    if (!sourceRoomId) return null;
    return {
      roomId: sourceRoomId,
      messageId: sourceMessageId };
  }
}

export function normalizeTodoPayload(
  payload: Record<string, unknown>,
  omittedColumns: ReadonlySet<string>
) {
  return Object.fromEntries(
    Object.entries(payload).filter(([key]) => !omittedColumns.has(key))
  );
}

export function sortTasks(rows: TodoRow[]) {
  return [...rows].sort((left, right) => {
    const completeDiff = Number(Boolean(left.is_complete)) - Number(Boolean(right.is_complete));
    if (completeDiff !== 0) return completeDiff;

    const createdDiff = String(left.created_at || '').localeCompare(String(right.created_at || ''));
    if (createdDiff !== 0) return createdDiff;

    return String(left.id || '').localeCompare(String(right.id || ''));
  });
}

export function useTodoWorkflow(
  initialUser: Record<string, unknown> | null | undefined,
  onChatNavigate?: (roomId: string, messageId: string) => void
) {
  const initialUserRecord = (initialUser ?? {}) as Record<string, unknown>;
  const normalizedInitialUser = useMemo(
    () => normalizeStaffLike(initialUserRecord),
    [
      initialUserRecord?.id,
      initialUserRecord?.name,
      initialUserRecord?.employee_no,
      initialUserRecord?.auth_user_id,
      initialUserRecord?.company,
      initialUserRecord?.company_id,
      initialUserRecord?.department,
      initialUserRecord?.position,
      initialUserRecord?.role,
    ],
  );

  const [user, setUser] = useState<Record<string, unknown>>(normalizedInitialUser);
  const [tasks, setTasks] = useState<TodoRow[]>([]);
  const [newTask, setNewTask] = useState('');
  const [selectedDate, setSelectedDate] = useState(getToday());
  const [viewRange, setViewRange] = useState<TodoViewRange>('day');
  const [loading, setLoading] = useState(false);
  const [recoverAttempted, setRecoverAttempted] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState<'all' | TodoPriority>('all');
  const [newPriority, setNewPriority] = useState<TodoPriority>('medium');
  const [newRepeatType, setNewRepeatType] = useState<TodoRepeatType>('none');
  const [newAssigneeKind, setNewAssigneeKind] = useState<TodoAssigneeKind>('self');
  const [newReminderDate, setNewReminderDate] = useState('');
  const [newReminderTime, setNewReminderTime] = useState('');
  const effectiveUserId = getStaffLikeId(user);
  const { dialog, openConfirm } = useActionDialog();

  useEffect(() => {
    const recoverUser = async () => {
      const directId = getStaffLikeId(normalizedInitialUser);
      if (directId) {
        setUser(normalizedInitialUser);
        setRecoverAttempted(true);
        return;
      }

      if ((normalizedInitialUser)?.name || (normalizedInitialUser)?.employee_no || (normalizedInitialUser)?.auth_user_id) {
        setRecoverAttempted(true);
        try {
          const resolvedUser = await resolveStaffLike(normalizedInitialUser);
          if (getStaffLikeId(resolvedUser)) {
            setUser(resolvedUser);
            localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(resolvedUser));
          }
        } catch {
          // ignore recovery failure
        }
        return;
      }

      setRecoverAttempted(true);
    };

    void recoverUser();
  }, [
    normalizedInitialUser?.id,
    normalizedInitialUser?.name,
    normalizedInitialUser?.employee_no,
    normalizedInitialUser?.auth_user_id,
  ]);

  const fetchTasks = async (userId: string) => {
    if (!userId) return;
    const { start, end } = getDateRange(viewRange, selectedDate);

    try {
      setLoading(true);
      const { data, error } = await withMissingColumnsFallback(
        (omittedColumns) => {
          let query = db
            .from('todos')
            .select(buildTodoSelect(omittedColumns))
            .eq('user_id', userId);

          if (viewRange === 'day') {
            query = query.eq('task_date', selectedDate);
          } else {
            query = query.gte('task_date', start).lte('task_date', end);
          }

          return query.order('created_at', { ascending: false });
        },
        [...OPTIONAL_TODO_COLUMNS],
      );
      if (error) throw error;
      setTasks(sortTasks((data || []) as TodoRow[]));
    } catch (error) {
      console.error('할일 로딩 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!effectiveUserId) return;
    void fetchTasks(effectiveUserId);
  }, [effectiveUserId, selectedDate, viewRange]);

  useEffect(() => {
    if (!effectiveUserId) return;
    const unsubscribe = subscribeRealtime(
      `todos-realtime-${effectiveUserId}`,
      [{ table: 'todos', event: '*' }],
      () => { void fetchTasks(effectiveUserId); },
      { pollIntervalMs: 5000 },
    );
    return unsubscribe;
  }, [effectiveUserId, selectedDate, viewRange]);

  const handleAddTask = async () => {
    if (!newTask.trim()) return;
    if (!effectiveUserId) {
      toast('직원 계정 정보를 먼저 확인해 주세요.', 'warning');
      return;
    }

    const reminderAt = buildReminderAt(newReminderDate, newReminderTime);
    const optimisticTask: TodoRow = {
      id: `temp-${Date.now()}`,
      user_id: effectiveUserId,
      content: newTask.trim(),
      is_complete: false,
      task_date: selectedDate,
      created_at: new Date().toISOString(),
      priority: newPriority,
      reminder_at: reminderAt,
      repeat_type: newRepeatType,
      assignee_kind: newAssigneeKind };

    const payload: Record<string, unknown> = {
      user_id: effectiveUserId,
      content: newTask.trim(),
      is_complete: false,
      task_date: selectedDate,
      priority: newPriority,
      reminder_at: reminderAt,
      repeat_type: newRepeatType,
      assignee_kind: newAssigneeKind };

    setTasks((prev) => sortTasks([optimisticTask, ...prev]));
    setNewTask('');
    setNewPriority('medium');
    setNewRepeatType('none');
    setNewAssigneeKind('self');
    setNewReminderDate('');
    setNewReminderTime('');

    try {
      const result = await withMissingColumnsFallback(
        (omittedColumns) =>
          db
            .from('todos')
            .insert([normalizeTodoPayload(payload, omittedColumns)])
            .select()
            .single(),
        [...OPTIONAL_TODO_COLUMNS],
      );

      if (result.error) throw result.error;
      if (result.data) {
        const savedTask = result.data as unknown as TodoRow;
        setTasks((prev) =>
          sortTasks(
            prev.map((task) => (String(task.id) === String(optimisticTask.id) ? savedTask : task))
          )
        );
      }
    } catch (error: unknown) {
      toast(`할일 등록 실패: ${String((error as Error)?.message || error)}`, 'error');
      void fetchTasks(effectiveUserId);
    }
  };

  const toggleTask = async (taskId: string | number, currentStatus: boolean) => {
    const targetTask = tasks.find((task) => String(task.id) === String(taskId)) || null;
    setTasks((prev) =>
      sortTasks(
        prev.map((task) =>
          String(task.id) === String(taskId) ? { ...task, is_complete: !currentStatus } : task
        )
      )
    );

    try {
      const { error } = await db
        .from('todos')
        .update({ is_complete: !currentStatus })
        .eq('id', taskId);
      if (error) throw error;

      if (!currentStatus && effectiveUserId && targetTask && targetTask.repeat_type && targetTask.repeat_type !== 'none') {
        const nextTaskDate = getNextTaskDate(targetTask.task_date, targetTask.repeat_type);
        if (nextTaskDate) {
          const repeatParentId = getRepeatParentId(targetTask);

          let duplicateRows: Array<{ id: string | number }> = [];
          const duplicateQuery = () =>
            db
              .from('todos')
              .select('id')
              .eq('user_id', effectiveUserId)
              .eq('task_date', nextTaskDate)
              .eq('content', targetTask.content)
              .eq('repeat_type', targetTask.repeat_type)
              .limit(5);

          const { data: duplicateWithParent, error: duplicateWithParentError } = repeatParentId
             ? await duplicateQuery().eq('repeat_parent_id', repeatParentId)
             : await duplicateQuery();

          if (duplicateWithParentError) {
            const { data: duplicateFallback } = await duplicateQuery();
            duplicateRows = (duplicateFallback || []) as Array<{ id: string | number }>;
          } else {
            duplicateRows = (duplicateWithParent || []) as Array<{ id: string | number }>;
          }

          if (duplicateRows.length === 0) {
            const recurringPayload: Record<string, unknown> = {
              user_id: effectiveUserId,
              content: targetTask.content,
              is_complete: false,
              task_date: nextTaskDate,
              priority: targetTask.priority || 'medium',
              reminder_at: shiftReminderAt(targetTask.reminder_at, nextTaskDate),
              repeat_type: targetTask.repeat_type,
              assignee_kind: targetTask.assignee_kind || 'self',
              source_message_id: targetTask.source_message_id || null,
              source_room_id: targetTask.source_room_id || null,
              repeat_parent_id: repeatParentId,
              repeat_generated_from_id: String(targetTask.id) };

            const recurringResult = await withMissingColumnsFallback(
              (omittedColumns) =>
                db
                  .from('todos')
                  .insert([normalizeTodoPayload(recurringPayload, omittedColumns)]),
              [...OPTIONAL_TODO_COLUMNS]
            );

            if (recurringResult.error) {
              throw recurringResult.error;
            }

            void fetchTasks(effectiveUserId);
          }
        }
      }
    } catch (error) {
      console.error('[나의할일] 상태 변경 실패:', error);
      toast('할일 상태 변경에 실패했습니다. 다시 시도해 주세요.', 'error');
      if (effectiveUserId) {
        void fetchTasks(effectiveUserId);
      }
    }
  };

  const deleteTask = async (taskId: string | number) => {
    const shouldDelete = await openConfirm({
      title: '할일 삭제',
      description: '이 할일을 삭제할까요?',
      confirmText: '삭제',
      cancelText: '취소',
      tone: 'danger' });
    if (!shouldDelete) return;

    setTasks((prev) => prev.filter((task) => String(task.id) !== String(taskId)));
    try {
      const { error } = await db.from('todos').delete().eq('id', taskId);
      if (error) throw error;
    } catch (error) {
      console.error('[나의할일] 삭제 실패:', error);
      toast('할일 삭제에 실패했습니다. 다시 시도해 주세요.', 'error');
      if (effectiveUserId) {
        void fetchTasks(effectiveUserId);
      }
    }
  };

  const handleOpenChatSource = async (task: TodoRow) => {
    if (!onChatNavigate) return;

    const resolvedSource = await resolveTodoChatSource(task);
    if (!resolvedSource?.roomId) {
      toast('연결된 채팅 메시지를 찾을 수 없습니다.', 'warning');
      return;
    }

    if (String(task.source_room_id || '').trim() !== resolvedSource.roomId) {
      void (async () => {
        await db
          .from('todos')
          .update({ source_room_id: resolvedSource.roomId })
          .eq('id', task.id);
      })();
    }

    onChatNavigate(resolvedSource.roomId, resolvedSource.messageId);
  };

  const filteredTasks = useMemo(
    () =>
      tasks.filter((task) =>
        priorityFilter === 'all' ? true : String(task.priority || 'medium') === priorityFilter
      ),
    [priorityFilter, tasks]
  );

  const priorityCounts = useMemo(
    () =>
      PRIORITY_OPTIONS.reduce<Record<TodoPriority, number>>((acc, option) => {
        acc[option.value] = tasks.filter((task) => String(task.priority || 'medium') === option.value && !task.is_complete).length;
        return acc;
      }, { low: 0, medium: 0, high: 0, urgent: 0 }),
    [tasks]
  );

  const currentRange = getDateRange(viewRange, selectedDate);
  const allOpenCount = tasks.filter((t) => !t.is_complete).length;

  const sortedTasks = useMemo(
    () =>
      [...filteredTasks].sort((a, b) => {
        const ac = Number(Boolean(a.is_complete));
        const bc = Number(Boolean(b.is_complete));
        if (ac !== bc) return ac - bc;
        return String(a.reminder_at || a.task_date || '').localeCompare(String(b.reminder_at || b.task_date || ''));
      }),
    [filteredTasks]
  );

  const rangeLabel = useMemo(
    () =>
      viewRange === 'day'
        ? selectedDate
        : viewRange === 'week'
          ? `${currentRange.start} ~ ${currentRange.end}`
          : `${selectedDate.slice(0, 7)}`,
    [viewRange, selectedDate, currentRange.start, currentRange.end]
  );

  const shiftSelectedDate = (delta: number) => {
    const base = new Date(`${selectedDate}T12:00:00`);
    if (viewRange === 'day') base.setDate(base.getDate() + delta);
    else if (viewRange === 'week') base.setDate(base.getDate() + 7 * delta);
    else base.setMonth(base.getMonth() + delta);
    setSelectedDate(formatKoreanDateKey(base));
  };

  return {
    user,
    tasks,
    newTask,
    setNewTask,
    selectedDate,
    setSelectedDate,
    viewRange,
    setViewRange,
    loading,
    recoverAttempted,
    priorityFilter,
    setPriorityFilter,
    newPriority,
    setNewPriority,
    newRepeatType,
    setNewRepeatType,
    newAssigneeKind,
    setNewAssigneeKind,
    newReminderDate,
    setNewReminderDate,
    newReminderTime,
    setNewReminderTime,
    effectiveUserId,
    dialog,
    handleAddTask,
    toggleTask,
    deleteTask,
    handleOpenChatSource,
    filteredTasks,
    priorityCounts,
    allOpenCount,
    sortedTasks,
    rangeLabel,
    shiftSelectedDate,
  };
}
