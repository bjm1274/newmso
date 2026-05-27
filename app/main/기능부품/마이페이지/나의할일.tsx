'use client';

import { toast } from '@/lib/toast';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { subscribeRealtime } from '@/lib/realtime-bus';
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
      start: sunday.toLocaleDateString('en-CA'),
      end: saturday.toLocaleDateString('en-CA'),
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

  // 라이브 reference: tones[urgent]=danger / high=warn / medium=accent / low=muted
  const priToneMap: Record<TodoPriority | 'all', 'accent' | 'danger' | 'warn' | 'muted'> = {
    all: 'accent',
    urgent: 'danger',
    high: 'warn',
    medium: 'accent',
    low: 'muted',
  };
  const allOpenCount = tasks.filter((t) => !t.is_complete).length;
  const sortedTasks = [...filteredTasks].sort((a, b) => {
    const ac = Number(Boolean(a.is_complete));
    const bc = Number(Boolean(b.is_complete));
    if (ac !== bc) return ac - bc;
    return String(a.reminder_at || a.task_date || '').localeCompare(String(b.reminder_at || b.task_date || ''));
  });
  const rangeLabel =
    viewRange === 'day'
      ? selectedDate
      : viewRange === 'week'
        ? `${currentRange.start} ~ ${currentRange.end}`
        : `${selectedDate.slice(0, 7)}`;

  const shiftSelectedDate = (delta: number) => {
    const base = new Date(`${selectedDate}T12:00:00`);
    if (viewRange === 'day') base.setDate(base.getDate() + delta);
    else if (viewRange === 'week') base.setDate(base.getDate() + 7 * delta);
    else base.setMonth(base.getMonth() + delta);
    setSelectedDate(base.toLocaleDateString('en-CA'));
  };

  return (
    <div className="flex h-full flex-col gap-3 sm:gap-4">
      {dialog}

      {/* 컨트롤 바 — 우선순위 5칩 + 일별/주간/월간 + 날짜 페이저 */}
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3 shadow-[var(--shadow-xs)] sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={`todo-chip tone-${priToneMap.all}${priorityFilter === 'all' ? ' on' : ''}`}
              onClick={() => setPriorityFilter('all')}
            >
              전체 <span className="cnt">{allOpenCount}</span>
            </button>
            {PRIORITY_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`todo-chip tone-${priToneMap[option.value]}${priorityFilter === option.value ? ' on' : ''}`}
                onClick={() => setPriorityFilter(option.value)}
              >
                {option.label} <span className="cnt">{priorityCounts[option.value]}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="seg">
              {(['day', 'week', 'month'] as const).map((range) => (
                <button
                  key={range}
                  type="button"
                  onClick={() => setViewRange(range)}
                  className={viewRange === range ? 'on' : ''}
                >
                  {range === 'day' ? '일별' : range === 'week' ? '주간' : '월간'}
                </button>
              ))}
            </div>
            <div className="att-month">
              <button
                type="button"
                className="att-mo-btn"
                onClick={() => shiftSelectedDate(-1)}
                aria-label="이전 기간"
              >
                ‹
              </button>
              <span className="att-mo-lbl">{rangeLabel}</span>
              <button
                type="button"
                className="att-mo-btn"
                onClick={() => shiftSelectedDate(1)}
                aria-label="다음 기간"
              >
                ›
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 빠른 등록 1줄 + 메타 미리보기 */}
      <div className="todo-quickadd">
        <span aria-hidden="true" className="text-[var(--zinc-400)] text-[18px] leading-none">+</span>
        <input
          type="text"
          className="todo-input"
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
              ? "할 일을 입력하고 Enter — 예: '내일 오후 3시 의료기기 점검 결재'"
              : recoverAttempted
                ? '직원 계정으로 로그인하면 할일을 등록할 수 있습니다.'
                : '사용자 정보를 확인하는 중입니다.'
          }
          disabled={!effectiveUserId}
        />
        <div className="todo-quick-meta">
          <label className="relative inline-flex items-center cursor-pointer">
            <span>⚑ {getPriorityMeta(newPriority).label}</span>
            <select
              value={newPriority}
              onChange={(event) => setNewPriority(event.target.value as TodoPriority)}
              aria-label="우선순위 선택"
              className="absolute inset-0 cursor-pointer opacity-0"
            >
              {PRIORITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="relative inline-flex items-center cursor-pointer">
            <span>↻ {newRepeatType === 'none' ? '반복 없음' : getRepeatLabel(newRepeatType)}</span>
            <select
              value={newRepeatType}
              onChange={(event) => setNewRepeatType(event.target.value as TodoRepeatType)}
              aria-label="반복 유형 선택"
              className="absolute inset-0 cursor-pointer opacity-0"
            >
              {REPEAT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="relative inline-flex items-center cursor-pointer">
            <span>◎ {getAssigneeLabel(newAssigneeKind)}</span>
            <select
              value={newAssigneeKind}
              onChange={(event) => setNewAssigneeKind(event.target.value as TodoAssigneeKind)}
              aria-label="담당 유형 선택"
              className="absolute inset-0 cursor-pointer opacity-0"
            >
              {ASSIGNEE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="relative inline-flex items-center cursor-pointer">
            <span>▦ {newReminderDate || selectedDate}</span>
            <input
              type="date"
              value={newReminderDate}
              onChange={(event) => setNewReminderDate(event.target.value)}
              aria-label="리마인더 날짜"
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
          {newReminderDate ? (
            <label className="relative inline-flex items-center cursor-pointer">
              <span>⏱ {newReminderTime || '시간'}</span>
              <input
                type="time"
                value={newReminderTime}
                onChange={(event) => setNewReminderTime(event.target.value)}
                aria-label="리마인더 시간"
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </label>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void handleAddTask()}
          disabled={!effectiveUserId || !newTask.trim()}
          className="inline-flex h-9 shrink-0 items-center rounded-[var(--radius-md)] bg-[var(--accent)] px-4 text-[12px] font-bold text-white transition-opacity hover:opacity-95 disabled:opacity-50"
        >
          등록
        </button>
      </div>

      {/* 리스트 카드 */}
      <div className="flex-1 min-h-0 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3 shadow-[var(--shadow-xs)] sm:p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-[15px] font-extrabold tracking-tight text-[var(--foreground)]">
              {priorityFilter === 'all' ? '전체' : getPriorityMeta(priorityFilter).label} 할 일
            </div>
            <div className="mt-0.5 text-[11px] font-semibold text-[var(--toss-gray-3)]">
              {sortedTasks.length}건 · 마감 오름차순
            </div>
          </div>
        </div>

        <div className="overflow-y-auto pr-1 custom-scrollbar" style={{ maxHeight: 'calc(100vh - 360px)' }}>
          {loading ? (
            <div className="flex justify-center py-20">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--border)] border-t-[var(--accent)]" />
            </div>
          ) : !effectiveUserId ? (
            <div className="empty-pad">
              <div className="empty-ico" aria-hidden="true">🗂</div>
              <div className="empty-title">로그인이 필요합니다</div>
              <div className="empty-sub">할일은 직원 계정으로 로그인해야 사용할 수 있습니다.</div>
            </div>
          ) : sortedTasks.length === 0 ? (
            <div className="empty-pad">
              <div className="empty-ico" aria-hidden="true">✓</div>
              <div className="empty-title">선택한 우선순위에 할 일이 없습니다.</div>
              <div className="empty-sub">위 빠른 등록으로 추가하거나, 우선순위 필터를 바꿔보세요.</div>
            </div>
          ) : (
            <div className="todo-list">
              {sortedTasks.map((task) => (
                <TodoItem
                  key={String(task.id)}
                  task={task}
                  priToneMap={priToneMap}
                  onToggle={toggleTask}
                  onDelete={deleteTask}
                  onChatNavigate={handleOpenChatSource}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TodoItem({
  task,
  priToneMap,
  onToggle,
  onDelete,
  onChatNavigate,
}: {
  task: TodoRow;
  priToneMap: Record<TodoPriority | 'all', 'accent' | 'danger' | 'warn' | 'muted'>;
  onToggle: (id: string | number, currentStatus: boolean) => void;
  onDelete: (id: string | number) => void;
  onChatNavigate?: (task: TodoRow) => void;
}) {
  const isChatSource = Boolean(task.source_message_id || task.source_room_id);
  const priorityMeta = getPriorityMeta(task.priority);
  const reminderLabel = formatReminder(task.reminder_at);
  const repeatLabel = getRepeatLabel(task.repeat_type);
  const assigneeLabel = getAssigneeLabel(task.assignee_kind);
  const tone = priToneMap[(task.priority as TodoPriority) || 'medium'] || 'accent';
  const dueLabel = reminderLabel || task.task_date;

  return (
    <label className={`todo-row${task.is_complete ? ' is-done' : ''}`}>
      <input
        type="checkbox"
        className="todo-check"
        checked={task.is_complete}
        onChange={() => onToggle(task.id, task.is_complete)}
        aria-label={task.is_complete ? '완료 해제' : '완료 표시'}
      />
      <span className={`pri-pill tone-${tone}`}>{priorityMeta.label}</span>
      <div className="todo-title" title={task.content}>{task.content}</div>
      <div className="todo-meta">
        <span>📅 {dueLabel}</span>
        <span>◎ {assigneeLabel}</span>
        {repeatLabel ? <span>↻ {repeatLabel}</span> : null}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {isChatSource && onChatNavigate ? (
          <button
            type="button"
            data-testid={`todo-open-chat-${task.id}`}
            onClick={(event) => {
              event.preventDefault();
              onChatNavigate(task);
            }}
            className="inline-flex h-7 items-center rounded-md bg-[var(--accent-soft)] px-2 text-[11px] font-bold text-[var(--accent)] hover:brightness-95"
            title="채팅 메시지로 이동"
          >
            ↗
          </button>
        ) : null}
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            void onDelete(task.id);
          }}
          className="inline-flex h-7 items-center rounded-md bg-[var(--muted)] px-2 text-[11px] font-bold text-[var(--toss-gray-3)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
          aria-label="할일 삭제"
        >
          ✕
        </button>
      </div>
    </label>
  );
}
