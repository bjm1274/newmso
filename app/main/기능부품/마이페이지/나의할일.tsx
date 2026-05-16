'use client';

import { toast } from '@/lib/toast';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { withMissingColumnsFallback } from '@/lib/supabase-compat';
import { getStaffLikeId, normalizeStaffLike, resolveStaffLike } from '@/lib/staff-identity';
import { STORAGE_KEYS } from '@/lib/storage-keys';
import { useActionDialog } from '@/app/components/useActionDialog';

type TodoPriority = 'low' | 'medium' | 'high' | 'urgent';
type TodoRepeatType = 'none' | 'daily' | 'weekly' | 'monthly';
type TodoAssigneeKind = 'self' | 'team' | 'follow_up';
type TodoViewRange = 'day' | 'week' | 'month';

type TodoRow = {
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

const OPTIONAL_TODO_COLUMNS = [
  'priority',
  'reminder_at',
  'repeat_type',
  'assignee_kind',
  'repeat_parent_id',
  'repeat_generated_from_id',
  'source_message_id',
  'source_room_id',
] as const;
const PRIORITY_OPTIONS: Array<{ value: TodoPriority; label: string }> = [
  { value: 'urgent', label: '긴급' },
  { value: 'high', label: '높음' },
  { value: 'medium', label: '보통' },
  { value: 'low', label: '낮음' },
];
const REPEAT_OPTIONS: Array<{ value: TodoRepeatType; label: string }> = [
  { value: 'none', label: '반복 없음' },
  { value: 'daily', label: '매일' },
  { value: 'weekly', label: '매주' },
  { value: 'monthly', label: '매월' },
];
const ASSIGNEE_OPTIONS: Array<{ value: TodoAssigneeKind; label: string }> = [
  { value: 'self', label: '내 작업' },
  { value: 'team', label: '팀 협업' },
  { value: 'follow_up', label: '후속 확인' },
];

function getToday() {
  const now = new Date();
  const krTime = new Date(now.getTime() + (9 * 60 * 60 * 1000));
  return krTime.toISOString().split('T')[0];
}

function getDateRange(viewRange: TodoViewRange, selectedDate: string) {
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
    return {
      start: sunday.toISOString().slice(0, 10),
      end: saturday.toISOString().slice(0, 10),
    };
  }

  const year = baseDate.getFullYear();
  const month = String(baseDate.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(year, baseDate.getMonth() + 1, 0).getDate();
  return {
    start: `${year}-${month}-01`,
    end: `${year}-${month}-${String(lastDay).padStart(2, '0')}`,
  };
}

function getPriorityMeta(priority: unknown) {
  switch (String(priority || '').trim()) {
    case 'urgent':
      return { label: '긴급', className: 'bg-red-500/20 text-red-600' };
    case 'high':
      return { label: '높음', className: 'bg-orange-500/20 text-orange-600' };
    case 'low':
      return { label: '낮음', className: 'bg-[var(--muted)] text-[var(--toss-gray-4)]' };
    default:
      return { label: '보통', className: 'bg-blue-500/20 text-blue-600' };
  }
}

function getRepeatLabel(value: unknown) {
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

function getAssigneeLabel(value: unknown) {
  switch (String(value || '').trim()) {
    case 'team':
      return '팀 협업';
    case 'follow_up':
      return '후속 확인';
    default:
      return '내 작업';
  }
}

function buildReminderAt(date: string, time: string) {
  if (!date || !time) return null;
  const parsed = new Date(`${date}T${time}:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function formatReminder(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getNextTaskDate(taskDate: string, repeatType: TodoRepeatType | undefined) {
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

  return baseDate.toISOString().slice(0, 10);
}

function shiftReminderAt(value: string | null | undefined, nextTaskDate: string) {
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

function getRepeatParentId(task: TodoRow) {
  const raw = String(task.repeat_parent_id || task.id || '').trim();
  return raw || null;
}

async function resolveTodoChatSource(task: TodoRow) {
  const sourceRoomId = String(task.source_room_id || '').trim();
  const sourceMessageId = String(task.source_message_id || '').trim();
  if (!sourceRoomId && !sourceMessageId) return null;

  if (!sourceMessageId) {
    return {
      roomId: sourceRoomId,
      messageId: '',
    };
  }

  try {
    const { data, error } = await supabase
      .from('messages')
      .select('id, room_id')
      .eq('id', sourceMessageId)
      .limit(1);

    if (error) throw error;

    const sourceMessage = Array.isArray(data) ? data[0] : null;
    const resolvedRoomId = String(sourceMessage?.room_id || '').trim();
    return {
      roomId: resolvedRoomId || sourceRoomId,
      messageId: String(sourceMessage?.id || sourceMessageId).trim(),
    };
  } catch {
    if (!sourceRoomId) return null;
    return {
      roomId: sourceRoomId,
      messageId: sourceMessageId,
    };
  }
}

function normalizeTodoPayload(
  payload: Record<string, unknown>,
  omittedColumns: ReadonlySet<string>
) {
  return Object.fromEntries(
    Object.entries(payload).filter(([key]) => !omittedColumns.has(key))
  );
}

function sortTasks(rows: TodoRow[]) {
  return [...rows].sort((left, right) => {
    const completeDiff = Number(Boolean(left.is_complete)) - Number(Boolean(right.is_complete));
    if (completeDiff !== 0) return completeDiff;

    const createdDiff = String(left.created_at || '').localeCompare(String(right.created_at || ''));
    if (createdDiff !== 0) return createdDiff;

    return String(left.id || '').localeCompare(String(right.id || ''));
  });
}

export default function MyTodoList({ user: initialUser, onChatNavigate: _onChatNavigate }: Record<string, unknown>) {
  const onChatNavigate = _onChatNavigate as ((roomId: string, messageId: string) => void) | undefined;
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
      let query = supabase
        .from('todos')
        .select('*')
        .eq('user_id', userId);

      if (viewRange === 'day') {
        query = query.eq('task_date', selectedDate);
      } else {
        query = query.gte('task_date', start).lte('task_date', end);
      }

      const { data, error } = await query.order('created_at', { ascending: false });
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
    const channel = supabase
      .channel(`todos-realtime-${effectiveUserId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'todos', filter: `user_id=eq.${effectiveUserId}` }, () => {
        void fetchTasks(effectiveUserId);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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
      assignee_kind: newAssigneeKind,
    };

    const payload: Record<string, unknown> = {
      user_id: effectiveUserId,
      content: newTask.trim(),
      is_complete: false,
      task_date: selectedDate,
      priority: newPriority,
      reminder_at: reminderAt,
      repeat_type: newRepeatType,
      assignee_kind: newAssigneeKind,
    };

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
          supabase
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
      const { error } = await supabase
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
            supabase
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
              repeat_generated_from_id: String(targetTask.id),
            };

            const recurringResult = await withMissingColumnsFallback(
              (omittedColumns) =>
                supabase
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
    } catch {
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
      tone: 'danger',
    });
    if (!shouldDelete) return;

    setTasks((prev) => prev.filter((task) => String(task.id) !== String(taskId)));
    try {
      const { error } = await supabase.from('todos').delete().eq('id', taskId);
      if (error) throw error;
    } catch {
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
        await supabase
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

  const inProgressTasks = filteredTasks.filter((task) => !task.is_complete);
  const completedTasks =
    viewRange === 'day'
      ? filteredTasks.filter((task) => task.is_complete && task.task_date === selectedDate)
      : filteredTasks.filter((task) => task.is_complete);

  const priorityCounts = useMemo(
    () =>
      PRIORITY_OPTIONS.reduce<Record<TodoPriority, number>>((acc, option) => {
        acc[option.value] = tasks.filter((task) => String(task.priority || 'medium') === option.value && !task.is_complete).length;
        return acc;
      }, { low: 0, medium: 0, high: 0, urgent: 0 }),
    [tasks]
  );

  const currentRange = getDateRange(viewRange, selectedDate);

  return (
    <div className="flex h-full flex-col space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 shadow-sm sm:space-y-4 sm:p-5">
      {dialog}

      <div className="space-y-2 sm:space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
          <div className="w-full sm:w-auto">
            <h3 className="text-[11px] font-semibold uppercase tracking-widest text-[var(--toss-gray-3)] sm:text-xs">나의 할일 관리</h3>
            <p className="mt-0.5 text-[11px] font-semibold text-[var(--toss-gray-4)] sm:mt-1 sm:text-[12px]">
              우선순위와 리마인더를 함께 관리할 수 있습니다.
            </p>
          </div>

          <div className="flex w-full items-center gap-2 sm:w-auto">
            <div className="flex flex-1 gap-1 rounded-[var(--radius-md)] bg-[var(--muted)] p-1 sm:flex-none">
              {(['day', 'week', 'month'] as const).map((range) => (
                <button
                  key={range}
                  type="button"
                  onClick={() => setViewRange(range)}
                  className={`flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-[11px] font-bold sm:flex-none ${viewRange === range ? 'bg-[var(--card)] text-[var(--accent)] shadow-sm' : 'text-[var(--toss-gray-3)]'}`}
                >
                  {range === 'day' ? '일별' : range === 'week' ? '주간' : '월간'}
                </button>
              ))}
            </div>

            <input
              type={viewRange === 'month' ? 'month' : 'date'}
              value={viewRange === 'month' ? selectedDate.slice(0, 7) : selectedDate}
              onChange={(event) => setSelectedDate(viewRange === 'month' ? `${event.target.value}-01` : event.target.value)}
              className="min-w-0 flex-1 cursor-pointer rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-2 py-1.5 text-xs font-semibold text-[var(--foreground)] outline-none focus:border-[var(--accent)] sm:flex-none sm:px-3"
            />
          </div>
        </div>

        {viewRange !== 'day' ? (
          <p className="text-[11px] font-semibold text-[var(--toss-gray-3)]">
            {viewRange === 'week' ? `${currentRange.start} ~ ${currentRange.end}` : `${selectedDate.slice(0, 7)} 전체`}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <FilterChip
            active={priorityFilter === 'all'}
            label={`전체 ${tasks.filter((task) => !task.is_complete).length}`}
            onClick={() => setPriorityFilter('all')}
          />
          {PRIORITY_OPTIONS.map((option) => (
            <FilterChip
              key={option.value}
              active={priorityFilter === option.value}
              label={`${option.label} ${priorityCounts[option.value]}`}
              onClick={() => setPriorityFilter(option.value)}
            />
          ))}
        </div>
      </div>

      <div className="space-y-2 rounded-[16px] border border-[var(--border)] bg-[var(--background)]/40 p-2.5 sm:rounded-[24px] sm:p-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={newTask}
            onChange={(event) => setNewTask(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void handleAddTask();
              }
            }}
            placeholder={
              effectiveUserId
                ? `${selectedDate} 일정이나 할일을 입력해 주세요.`
                : recoverAttempted
                  ? '직원 계정으로 로그인하면 할일을 등록할 수 있습니다.'
                  : '사용자 정보를 확인하는 중입니다.'
            }
            disabled={!effectiveUserId}
            className="min-w-0 flex-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2.5 text-[13px] font-bold text-[var(--foreground)] outline-none transition-colors focus:border-[var(--accent)] focus:bg-[var(--card)] disabled:bg-[var(--muted)] sm:rounded-[18px] sm:px-4 sm:py-3 sm:text-sm"
          />
          <button
            type="button"
            onClick={() => void handleAddTask()}
            disabled={!effectiveUserId || !newTask.trim()}
            className="shrink-0 rounded-[var(--radius-md)] bg-[var(--foreground)] px-3 py-2.5 text-[13px] font-bold text-white transition-opacity hover:opacity-95 disabled:opacity-50 sm:rounded-[18px] sm:px-4 sm:py-3 sm:text-sm"
          >
            등록
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <select
            value={newPriority}
            onChange={(event) => setNewPriority(event.target.value as TodoPriority)}
            className="h-9 min-w-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 text-[11px] font-semibold text-[var(--foreground)] outline-none focus:border-[var(--accent)] sm:h-11 sm:rounded-[16px] sm:px-3 sm:text-[12px]"
          >
            {PRIORITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                우선순위 · {option.label}
              </option>
            ))}
          </select>

          <select
            value={newRepeatType}
            onChange={(event) => setNewRepeatType(event.target.value as TodoRepeatType)}
            className="h-9 min-w-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 text-[11px] font-semibold text-[var(--foreground)] outline-none focus:border-[var(--accent)] sm:h-11 sm:rounded-[16px] sm:px-3 sm:text-[12px]"
          >
            {REPEAT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                반복 · {option.label}
              </option>
            ))}
          </select>

          <select
            value={newAssigneeKind}
            onChange={(event) => setNewAssigneeKind(event.target.value as TodoAssigneeKind)}
            className="h-9 min-w-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 text-[11px] font-semibold text-[var(--foreground)] outline-none focus:border-[var(--accent)] sm:h-11 sm:rounded-[16px] sm:px-3 sm:text-[12px]"
          >
            {ASSIGNEE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                성격 · {option.label}
              </option>
            ))}
          </select>

          <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
            <input
              type="date"
              value={newReminderDate}
              onChange={(event) => setNewReminderDate(event.target.value)}
              className="h-9 min-w-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 text-[11px] font-semibold text-[var(--foreground)] outline-none focus:border-[var(--accent)] sm:h-11 sm:rounded-[16px] sm:px-3 sm:text-[12px]"
            />
            <input
              type="time"
              value={newReminderTime}
              onChange={(event) => setNewReminderTime(event.target.value)}
              className="h-9 min-w-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 text-[11px] font-semibold text-[var(--foreground)] outline-none focus:border-[var(--accent)] sm:h-11 sm:rounded-[16px] sm:px-3 sm:text-[12px]"
            />
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto pr-2 custom-scrollbar">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--border)] border-t-[var(--accent)]" />
          </div>
        ) : !effectiveUserId ? (
          <div className="flex h-60 flex-col items-center justify-center gap-3 px-4 text-center text-[var(--toss-gray-3)]">
            <span className="text-3xl">🗂</span>
            <p className="text-xs font-bold">할일은 직원 계정으로 로그인해야 사용할 수 있습니다.</p>
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex h-60 flex-col items-center justify-center gap-3 rounded-[var(--radius-lg)] border-2 border-dashed border-[var(--border)] text-[var(--toss-gray-3)]">
            <span className="text-4xl opacity-50">📝</span>
            <p className="text-xs font-bold">{selectedDate} 일정이 비어 있습니다.</p>
          </div>
        ) : (
          <>
            <section className="space-y-3">
              <h4 className="flex items-center gap-2 text-[11px] font-semibold uppercase text-[var(--accent)]">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
                진행 중 ({inProgressTasks.length})
              </h4>
              {inProgressTasks.length > 0 ? (
                inProgressTasks.map((task) => (
                  <TodoItem
                    key={String(task.id)}
                    task={task}
                    onToggle={toggleTask}
                    onDelete={deleteTask}
                    onChatNavigate={handleOpenChatSource}
                  />
                ))
              ) : (
                <p className="pl-3 text-[11px] italic text-[var(--toss-gray-3)]">진행 중인 할일이 없습니다.</p>
              )}
            </section>

            {completedTasks.length > 0 ? (
              <section className="space-y-3 opacity-65">
                <h4 className="flex items-center gap-2 text-[11px] font-semibold uppercase text-[var(--toss-gray-3)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--toss-gray-3)]" />
                  완료 이력 ({completedTasks.length})
                </h4>
                {completedTasks.map((task) => (
                  <TodoItem
                    key={String(task.id)}
                    task={task}
                    onToggle={toggleTask}
                    onDelete={deleteTask}
                    onChatNavigate={handleOpenChatSource}
                  />
                ))}
              </section>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function FilterChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors ${active ? 'bg-[var(--accent)] text-white' : 'bg-[var(--muted)] text-[var(--toss-gray-4)] hover:bg-[var(--border)]'}`}
    >
      {label}
    </button>
  );
}

function TodoItem({
  task,
  onToggle,
  onDelete,
  onChatNavigate,
}: {
  task: TodoRow;
  onToggle: (id: string | number, currentStatus: boolean) => void;
  onDelete: (id: string | number) => void;
  onChatNavigate?: (task: TodoRow) => void;
}) {
  const isChatSource = Boolean(task.source_message_id || task.source_room_id);
  const priorityMeta = getPriorityMeta(task.priority);
  const reminderLabel = formatReminder(task.reminder_at);
  const repeatLabel = getRepeatLabel(task.repeat_type);
  const assigneeLabel = getAssigneeLabel(task.assignee_kind);

  const chatButton = isChatSource && onChatNavigate ? (
    <button
      type="button"
      data-testid={`todo-open-chat-${task.id}`}
      onClick={() => onChatNavigate(task)}
      className="shrink-0 rounded-md bg-[var(--toss-blue-light)] px-2 py-1 text-[11px] font-semibold text-[var(--accent)] transition-all hover:bg-[var(--accent)] hover:text-white"
      title="채팅 메시지로 이동"
    >
      ↗ 채팅
    </button>
  ) : null;

  const deleteButton = (
    <button
      type="button"
      onClick={() => void onDelete(task.id)}
      className="shrink-0 rounded-md bg-[var(--muted)] px-2 py-1 text-[11px] font-semibold text-[var(--toss-gray-3)] transition-all hover:bg-red-500/10 hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100"
    >
      삭제
    </button>
  );

  return (
    <div className="group rounded-[14px] border border-[var(--border)] bg-[var(--card)] p-2.5 transition-all hover:border-[var(--accent)] hover:shadow-sm sm:rounded-[20px] sm:p-4">
      <div className="flex items-start gap-2 sm:gap-3">
        <button
          type="button"
          onClick={() => onToggle(task.id, task.is_complete)}
          aria-label={task.is_complete ? '완료 해제' : '완료 표시'}
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[var(--radius-md)] border-2 transition-all sm:h-6 sm:w-6 ${task.is_complete ? 'border-green-500 bg-green-500/100 text-white' : 'border-[var(--border)] hover:border-[var(--accent)]'}`}
        >
          {task.is_complete ? <span className="text-[10px] font-bold sm:text-[11px]">V</span> : null}
        </button>

        <div className="min-w-0 flex-1 space-y-1.5 sm:space-y-2">
          <span className={`block whitespace-normal break-words text-[13px] font-bold leading-snug sm:text-sm ${task.is_complete ? 'text-[var(--toss-gray-3)] line-through decoration-2' : 'text-[var(--foreground)]'}`}>
            {task.content}
          </span>

          <div className="flex flex-wrap gap-1 text-[10px] font-bold sm:gap-1.5 sm:text-[11px]">
            <span className={`rounded-full px-2 py-0.5 sm:px-2.5 sm:py-1 ${priorityMeta.className}`}>{priorityMeta.label}</span>
            <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-[var(--toss-gray-4)] sm:px-2.5 sm:py-1">{assigneeLabel}</span>
            {repeatLabel ? (
              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-violet-600 sm:px-2.5 sm:py-1">{repeatLabel}</span>
            ) : null}
            {reminderLabel ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-600 sm:px-2.5 sm:py-1">알림 {reminderLabel}</span>
            ) : null}
            <span className="rounded-full bg-[var(--background)] px-2 py-0.5 text-[var(--toss-gray-3)] sm:px-2.5 sm:py-1">{task.task_date}</span>
          </div>
        </div>

        <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
          {chatButton}
          {deleteButton}
        </div>
      </div>

      <div className="mt-2 flex justify-end gap-1.5 sm:hidden">
        {chatButton}
        {deleteButton}
      </div>
    </div>
  );
}
