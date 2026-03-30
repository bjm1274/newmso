'use client';

import { toast } from '@/lib/toast';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { withMissingColumnsFallback } from '@/lib/supabase-compat';
import { getStaffLikeId, normalizeStaffLike, resolveStaffLike } from '@/lib/staff-identity';
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

const OPTIONAL_TODO_COLUMNS = ['priority', 'reminder_at', 'repeat_type', 'assignee_kind', 'repeat_parent_id', 'repeat_generated_from_id'] as const;
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

function priorityRank(value: unknown) {
  switch (String(value || '').trim()) {
    case 'urgent':
      return 4;
    case 'high':
      return 3;
    case 'medium':
      return 2;
    case 'low':
      return 1;
    default:
      return 0;
  }
}

function getPriorityMeta(priority: unknown) {
  switch (String(priority || '').trim()) {
    case 'urgent':
      return { label: '긴급', className: 'bg-red-100 text-red-600' };
    case 'high':
      return { label: '높음', className: 'bg-orange-100 text-orange-600' };
    case 'low':
      return { label: '낮음', className: 'bg-slate-100 text-slate-500' };
    default:
      return { label: '보통', className: 'bg-blue-100 text-blue-600' };
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

    const leftDate = String(left.task_date || '');
    const rightDate = String(right.task_date || '');
    if (leftDate !== rightDate) return leftDate.localeCompare(rightDate);

    const priorityDiff = priorityRank(right.priority) - priorityRank(left.priority);
    if (priorityDiff !== 0) return priorityDiff;

    const leftReminder = String(left.reminder_at || '');
    const rightReminder = String(right.reminder_at || '');
    if (leftReminder !== rightReminder) return leftReminder.localeCompare(rightReminder);

    return String(right.created_at || '').localeCompare(String(left.created_at || ''));
  });
}

export default function MyTodoList({ user: initialUser, onChatNavigate: _onChatNavigate }: Record<string, unknown>) {
  const onChatNavigate = _onChatNavigate as ((roomId: string, messageId: string) => void) | undefined;
  const normalizedInitialUser = normalizeStaffLike((initialUser ?? {}) as Record<string, unknown>);
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
            localStorage.setItem('erp_user', JSON.stringify(resolvedUser));
          }
        } catch {
          // ignore recovery failure
        }
        return;
      }

      setRecoverAttempted(true);
    };

    void recoverUser();
  }, [normalizedInitialUser]);

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
        query = query.lte('task_date', selectedDate);
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
    <div className="flex h-full flex-col space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
      {dialog}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--toss-gray-3)]">나의 할일 관리</h3>
            <p className="mt-1 text-[12px] font-semibold text-[var(--toss-gray-4)]">
              우선순위와 리마인더를 함께 관리할 수 있습니다.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex gap-1 rounded-[var(--radius-md)] bg-[var(--muted)] p-1">
              {(['day', 'week', 'month'] as const).map((range) => (
                <button
                  key={range}
                  type="button"
                  onClick={() => setViewRange(range)}
                  className={`rounded-md px-3 py-1.5 text-[11px] font-bold ${viewRange === range ? 'bg-[var(--card)] text-[var(--accent)] shadow-sm' : 'text-[var(--toss-gray-3)]'}`}
                >
                  {range === 'day' ? '일별' : range === 'week' ? '주간' : '월간'}
                </button>
              ))}
            </div>

            <input
              type={viewRange === 'month' ? 'month' : 'date'}
              value={viewRange === 'month' ? selectedDate.slice(0, 7) : selectedDate}
              onChange={(event) => setSelectedDate(viewRange === 'month' ? `${event.target.value}-01` : event.target.value)}
              className="cursor-pointer rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
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

      <div className="space-y-2 rounded-[24px] border border-[var(--border)] bg-[var(--background)]/40 p-3">
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
            className="flex-1 rounded-[18px] border border-[var(--border)] bg-[var(--input-bg)] px-4 py-3 text-sm font-bold text-[var(--foreground)] outline-none transition-colors focus:border-[var(--accent)] focus:bg-[var(--card)] disabled:bg-[var(--muted)]"
          />
          <button
            type="button"
            onClick={() => void handleAddTask()}
            disabled={!effectiveUserId || !newTask.trim()}
            className="rounded-[18px] bg-[var(--foreground)] px-4 py-3 text-sm font-bold text-white transition-opacity hover:opacity-95 disabled:opacity-50"
          >
            등록
          </button>
        </div>

        <div className="grid gap-2 md:grid-cols-4">
          <select
            value={newPriority}
            onChange={(event) => setNewPriority(event.target.value as TodoPriority)}
            className="h-11 rounded-[16px] border border-[var(--border)] bg-[var(--card)] px-3 text-[12px] font-semibold text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
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
            className="h-11 rounded-[16px] border border-[var(--border)] bg-[var(--card)] px-3 text-[12px] font-semibold text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
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
            className="h-11 rounded-[16px] border border-[var(--border)] bg-[var(--card)] px-3 text-[12px] font-semibold text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
          >
            {ASSIGNEE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                성격 · {option.label}
              </option>
            ))}
          </select>

          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={newReminderDate}
              onChange={(event) => setNewReminderDate(event.target.value)}
              className="h-11 rounded-[16px] border border-[var(--border)] bg-[var(--card)] px-3 text-[12px] font-semibold text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
            />
            <input
              type="time"
              value={newReminderTime}
              onChange={(event) => setNewReminderTime(event.target.value)}
              className="h-11 rounded-[16px] border border-[var(--border)] bg-[var(--card)] px-3 text-[12px] font-semibold text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
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
                    onChatNavigate={onChatNavigate}
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
                    onChatNavigate={onChatNavigate}
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
  onChatNavigate?: (roomId: string, messageId: string) => void;
}) {
  const isChatSource = Boolean(task.source_message_id && task.source_room_id);
  const priorityMeta = getPriorityMeta(task.priority);
  const reminderLabel = formatReminder(task.reminder_at);
  const repeatLabel = getRepeatLabel(task.repeat_type);
  const assigneeLabel = getAssigneeLabel(task.assignee_kind);

  return (
    <div className="group flex items-start gap-3 rounded-[20px] border border-[var(--border)] bg-[var(--card)] p-4 transition-all hover:border-[var(--accent)] hover:shadow-sm">
      <button
        type="button"
        onClick={() => onToggle(task.id, task.is_complete)}
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--radius-md)] border-2 transition-all ${task.is_complete ? 'border-green-500 bg-green-500 text-white' : 'border-[var(--border)] hover:border-[var(--accent)]'}`}
      >
        {task.is_complete ? <span className="text-[11px] font-bold">V</span> : null}
      </button>

      <div className="min-w-0 flex-1 space-y-2">
        <span className={`block whitespace-normal break-words text-sm font-bold leading-snug ${task.is_complete ? 'text-[var(--toss-gray-3)] line-through decoration-2' : 'text-[var(--foreground)]'}`}>
          {task.content}
        </span>

        <div className="flex flex-wrap gap-1.5 text-[11px] font-bold">
          <span className={`rounded-full px-2.5 py-1 ${priorityMeta.className}`}>{priorityMeta.label}</span>
          <span className="rounded-full bg-[var(--muted)] px-2.5 py-1 text-[var(--toss-gray-4)]">{assigneeLabel}</span>
          {repeatLabel ? (
            <span className="rounded-full bg-violet-100 px-2.5 py-1 text-violet-600">{repeatLabel}</span>
          ) : null}
          {reminderLabel ? (
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-600">알림 {reminderLabel}</span>
          ) : null}
          <span className="rounded-full bg-[var(--background)] px-2.5 py-1 text-[var(--toss-gray-3)]">{task.task_date}</span>
        </div>
      </div>

      {isChatSource && onChatNavigate ? (
        <button
          type="button"
          onClick={() => onChatNavigate(task.source_room_id as string, task.source_message_id as string)}
          className="shrink-0 rounded-md bg-[var(--toss-blue-light)] px-2 py-1 text-[11px] font-semibold text-[var(--accent)] transition-all hover:bg-[var(--accent)] hover:text-white"
          title="채팅 메시지로 이동"
        >
          ↗ 채팅
        </button>
      ) : null}

      <button
        type="button"
        onClick={() => void onDelete(task.id)}
        className="rounded-md bg-[var(--muted)] px-2 py-1 text-[11px] font-semibold text-[var(--toss-gray-3)] transition-all hover:bg-red-50 hover:text-red-500 md:opacity-0 md:group-hover:opacity-100"
      >
        삭제
      </button>
    </div>
  );
}
