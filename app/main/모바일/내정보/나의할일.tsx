'use client';

/**
 * 나의할일 (모바일) — macOS Reminders 스타일 테마 개편 버전.
 * 기존의 데이터 페칭, 등록, 상태 토글, 삭제 비즈니스 로직을 100% 완벽하게 보존하면서
 * 모바일 화면에서 macOS 미리 알림(Reminders) 앱과 동일한 미니멀하고 세련된 화이트/블랙 레이아웃을 제공합니다.
 */

import { useEffect, useMemo, useState } from 'react';
import type { ErpUser } from '@/types';
import type { MTab } from '../셸/m-routes';
import MFeatureScreen from '../공통/MFeatureScreen';
import { toast } from '@/lib/toast';
import { getKoreanTodayString, formatKoreanDateKey } from '@/lib/seoul-time';
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
  return getKoreanTodayString();
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
      return { label: '긴급', color: '#FF3B30', className: 'text-red-500' };
    case 'high':
      return { label: '높음', color: '#FF9500', className: 'text-orange-500' };
    case 'low':
      return { label: '낮음', color: '#8E8E93', className: 'text-gray-400' };
    default:
      return { label: '보통', color: '#007AFF', className: 'text-blue-500' };
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
    timeZone: 'Asia/Seoul',
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

  return formatKoreanDateKey(baseDate);
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

export type 나의할일Props = {
  user: ErpUser;
  onBack: () => void;
  onSwitchTab?: (tab: MTab, sub?: string) => void;
};

export default function 나의할일({ user: initialUser, onBack, onSwitchTab }: 나의할일Props) {
  const handleChatNavigate = onSwitchTab
    ? (roomId: string, messageId: string) => onSwitchTab('chat')
    : undefined;

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
      tone: 'danger',
    });
    if (!shouldDelete) return;

    setTasks((prev) => prev.filter((task) => String(task.id) !== String(taskId)));
    try {
      const { error } = await supabase.from('todos').delete().eq('id', taskId);
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
    if (!handleChatNavigate) return;

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

    handleChatNavigate(resolvedSource.roomId, resolvedSource.messageId);
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
    <MFeatureScreen title="나의 할 일" onBack={onBack}>
      {/* 스타일 주입 */}
      <style>{`
        .macos-reminders-container {
          display: flex;
          flex-direction: column;
          height: 100%;
          gap: 14px;
          padding: 14px;
          background: transparent;
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif;
          color: var(--foreground);
        }

        /* 우선순위 칩 필터 가로 스크롤 연동 */
        .macos-filter-wrapper {
          overflow-x: auto;
          display: flex;
          gap: 8px;
          padding: 2px 2px 6px 2px;
          -webkit-overflow-scrolling: touch;
        }
        .macos-filter-wrapper::-webkit-scrollbar {
          display: none;
        }

        .macos-filter-chip {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 12px;
          font-size: 13px;
          font-weight: 600;
          color: var(--z-700);
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .dark .macos-filter-chip {
          color: var(--z-300);
        }
        .macos-filter-chip.active {
          background: #007AFF !important;
          color: #ffffff !important;
          border-color: #007AFF !important;
          box-shadow: 0 4px 12px rgba(0, 122, 255, 0.2);
        }
        .macos-filter-chip .cnt {
          font-size: 11px;
          opacity: 0.7;
          background: rgba(120, 120, 128, 0.12);
          padding: 1px 6px;
          border-radius: 10px;
        }
        .macos-filter-chip.active .cnt {
          background: rgba(255, 255, 255, 0.25);
          color: #ffffff;
        }

        /* 컨트롤 바 (세그먼트 & 날짜) */
        .macos-control-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          margin-top: 2px;
        }

        .macos-segment {
          display: inline-flex;
          padding: 2px;
          background: rgba(120, 120, 128, 0.12);
          border-radius: 8px;
          flex-shrink: 0;
        }
        .macos-segment button {
          padding: 4px 10px;
          font-size: 11px;
          font-weight: 600;
          border-radius: 6px;
          border: none;
          background: transparent;
          color: var(--z-600);
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .dark .macos-segment button {
          color: var(--z-400);
        }
        .macos-segment button.active {
          background: var(--card);
          color: var(--foreground);
          box-shadow: 0 1px 3px rgba(0,0,0,0.08);
        }

        .macos-date-navigator {
          display: flex;
          align-items: center;
          gap: 4px;
          background: rgba(120, 120, 128, 0.08);
          padding: 4px 8px;
          border-radius: 8px;
        }
        .macos-date-nav-btn {
          background: transparent;
          border: none;
          font-size: 12px;
          padding: 0 4px;
          cursor: pointer;
          color: var(--z-700);
        }
        .dark .macos-date-nav-btn {
          color: var(--z-300);
        }
        .macos-date-label {
          font-size: 11px;
          font-weight: 600;
          min-width: 70px;
          text-align: center;
        }

        /* 빠른 등록 영역 */
        .macos-quick-add-card {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 12px;
          transition: all 0.2s ease;
        }
        .macos-quick-add-input-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .macos-quick-add-plus {
          font-size: 18px;
          color: #007AFF;
          font-weight: 300;
          user-select: none;
        }
        .macos-quick-add-input {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          font-size: 14px;
          color: var(--foreground);
        }
        .macos-quick-add-input::placeholder {
          color: var(--z-400);
        }
        
        .macos-quick-add-meta-row {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          align-items: center;
        }
        .macos-quick-add-meta-badge {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 8px;
          font-size: 11px;
          font-weight: 500;
          background: rgba(120, 120, 128, 0.08);
          border-radius: 6px;
          color: var(--z-700);
          cursor: pointer;
          transition: background 0.15s ease;
        }
        .dark .macos-quick-add-meta-badge {
          color: var(--z-300);
          background: rgba(255, 255, 255, 0.06);
        }
        .macos-quick-add-meta-badge:hover {
          background: rgba(120, 120, 128, 0.15);
        }

        .macos-quick-add-submit-btn {
          margin-left: auto;
          background: #007AFF;
          color: #ffffff;
          border: none;
          padding: 5px 12px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: opacity 0.15s ease;
        }
        .macos-quick-add-submit-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        /* 할일 목록 카드 */
        .macos-todo-list-card {
          flex: 1;
          display: flex;
          flex-direction: column;
          padding: 14px;
          min-height: 0;
        }

        .macos-list-header {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          margin-bottom: 10px;
        }
        .macos-list-title {
          font-size: 16px;
          font-weight: 700;
          color: #007AFF;
        }
        .macos-list-subtitle {
          font-size: 11px;
          color: var(--z-500);
        }

        .macos-todo-items-scroll {
          flex: 1;
          overflow-y: auto;
          padding-right: 4px;
        }
        .macos-todo-items-scroll::-webkit-scrollbar {
          width: 4px;
        }
        .macos-todo-items-scroll::-webkit-scrollbar-thumb {
          background: rgba(120, 120, 128, 0.15);
          border-radius: 2px;
        }

        .macos-todo-item {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 10px 4px;
          border-bottom: 1px solid rgba(120, 120, 128, 0.08);
          transition: background 0.15s ease;
        }

        /* 커스텀 서클 체크박스 */
        .macos-checkbox-container {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 18px;
          height: 18px;
          flex-shrink: 0;
          margin-top: 2px;
          cursor: pointer;
        }
        .macos-checkbox-hidden {
          position: absolute;
          opacity: 0;
          width: 0;
          height: 0;
        }
        .macos-checkbox-custom {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          border: 1.5px solid #8E8E93;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .macos-checkbox-custom::after {
          content: '';
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: transparent;
          transition: all 0.2s ease;
        }

        /* 우선순위별 체크박스 테두리색 및 활성색 */
        .macos-checkbox-container.urgent .macos-checkbox-custom { border-color: #FF3B30; }
        .macos-checkbox-container.high .macos-checkbox-custom { border-color: #FF9500; }
        .macos-checkbox-container.medium .macos-checkbox-custom { border-color: #007AFF; }
        .macos-checkbox-container.low .macos-checkbox-custom { border-color: #8E8E93; }

        .macos-checkbox-container.urgent:hover .macos-checkbox-custom { background: rgba(255, 59, 48, 0.08); }
        .macos-checkbox-container.high:hover .macos-checkbox-custom { background: rgba(255, 149, 0, 0.08); }
        .macos-checkbox-container.medium:hover .macos-checkbox-custom { background: rgba(0, 122, 255, 0.08); }

        /* 완료(checked) 상태 */
        .macos-checkbox-hidden:checked + .macos-checkbox-custom {
          background: #8E8E93 !important;
          border-color: #8E8E93 !important;
        }
        .macos-checkbox-hidden:checked + .macos-checkbox-custom::after {
          background: #ffffff;
          width: 6px;
          height: 6px;
        }
        .macos-checkbox-container.urgent .macos-checkbox-hidden:checked + .macos-checkbox-custom {
          background: #FF3B30 !important;
          border-color: #FF3B30 !important;
        }
        .macos-checkbox-container.high .macos-checkbox-hidden:checked + .macos-checkbox-custom {
          background: #FF9500 !important;
          border-color: #FF9500 !important;
        }
        .macos-checkbox-container.medium .macos-checkbox-hidden:checked + .macos-checkbox-custom {
          background: #007AFF !important;
          border-color: #007AFF !important;
        }

        /* 할일 타이틀 & 메타 */
        .macos-todo-content-box {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .macos-todo-title {
          font-size: 13px;
          font-weight: 500;
          color: var(--foreground);
          line-height: 1.4;
          word-break: break-all;
          transition: all 0.2s ease;
        }
        .macos-todo-item.is-done .macos-todo-title {
          text-decoration: line-through;
          color: var(--z-400);
          opacity: 0.6;
        }
        .macos-todo-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          font-size: 10px;
          color: var(--z-500);
        }
        .macos-todo-meta-item {
          display: inline-flex;
          align-items: center;
          gap: 2px;
        }

        /* 우측 액션 영역 */
        .macos-todo-actions {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .macos-action-btn {
          background: transparent;
          border: none;
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          color: var(--z-400);
          transition: all 0.15s ease;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .macos-action-btn:hover {
          background: rgba(120, 120, 128, 0.12);
          color: var(--foreground);
        }
        .macos-action-btn.delete:hover {
          background: rgba(255, 59, 48, 0.1);
          color: #FF3B30;
        }

        /* 빈 상태 */
        .macos-empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 60px 16px;
          text-align: center;
          color: var(--z-400);
        }
        .macos-empty-icon {
          font-size: 28px;
          margin-bottom: 6px;
        }
        .macos-empty-title {
          font-size: 13px;
          font-weight: 600;
          color: var(--z-600);
        }
        .macos-empty-sub {
          font-size: 11px;
          margin-top: 2px;
        }
      `}</style>

      <div className="macos-reminders-container">
        {dialog}

        {/* 1. 카테고리/우선순위 칩 필터 영역 (가로 스크롤) */}
        <div className="macos-filter-wrapper">
          <button
            type="button"
            className={`macos-filter-chip macos-glass macos-squircle-sm ${priorityFilter === 'all' ? 'active' : ''}`}
            onClick={() => setPriorityFilter('all')}
          >
            📋 전체 <span className="cnt">{allOpenCount}</span>
          </button>
          {PRIORITY_OPTIONS.map((option) => {
            const priMeta = getPriorityMeta(option.value);
            const count = priorityCounts[option.value];
            let emoji = '⚪';
            if (option.value === 'urgent') emoji = '🔴';
            else if (option.value === 'high') emoji = '🟠';
            else if (option.value === 'medium') emoji = '🔵';

            return (
              <button
                key={option.value}
                type="button"
                className={`macos-filter-chip macos-glass macos-squircle-sm ${priorityFilter === option.value ? 'active' : ''}`}
                onClick={() => setPriorityFilter(option.value)}
              >
                {emoji} {option.label} <span className="cnt">{count}</span>
              </button>
            );
          })}
        </div>

        {/* 2. 세그먼트 컨트롤 및 날짜 이동 바 */}
        <div className="macos-control-bar">
          <div className="macos-segment">
            {(['day', 'week', 'month'] as const).map((range) => (
              <button
                key={range}
                type="button"
                onClick={() => setViewRange(range)}
                className={viewRange === range ? 'active' : ''}
              >
                {range === 'day' ? '일별' : range === 'week' ? '주간' : '월간'}
              </button>
            ))}
          </div>

          <div className="macos-date-navigator">
            <button
              type="button"
              className="macos-date-nav-btn"
              onClick={() => shiftSelectedDate(-1)}
              aria-label="이전 기간"
            >
              ◀
            </button>
            <span className="macos-date-label">{rangeLabel}</span>
            <button
              type="button"
              className="macos-date-nav-btn"
              onClick={() => shiftSelectedDate(1)}
              aria-label="다음 기간"
            >
              ▶
            </button>
          </div>
        </div>

        {/* 3. 빠른 등록 영역 */}
        <div className="macos-quick-add-card macos-glass macos-squircle">
          <div className="macos-quick-add-input-row">
            <span className="macos-quick-add-plus" aria-hidden="true">+</span>
            <input
              type="text"
              className="macos-quick-add-input"
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
                  ? "새로운 할 일 입력..."
                  : recoverAttempted
                    ? '직원 계정 로그인이 필요합니다.'
                    : '사용자 정보 확인 중...'
              }
              disabled={!effectiveUserId}
            />
          </div>

          {/* 메타데이터 빠른 연동 영역 */}
          <div className="macos-quick-add-meta-row">
            <label className="macos-quick-add-meta-badge">
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

            <label className="macos-quick-add-meta-badge">
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

            <label className="macos-quick-add-meta-badge">
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

            <label className="macos-quick-add-meta-badge">
              <span>📅 {newReminderDate || selectedDate}</span>
              <input
                type="date"
                value={newReminderDate}
                onChange={(event) => setNewReminderDate(event.target.value)}
                aria-label="리마인더 날짜"
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </label>

            {newReminderDate ? (
              <label className="macos-quick-add-meta-badge">
                <span>⏱ {newReminderTime || '시간 지정'}</span>
                <input
                  type="time"
                  value={newReminderTime}
                  onChange={(event) => setNewReminderTime(event.target.value)}
                  aria-label="리마인더 시간"
                  className="absolute inset-0 cursor-pointer opacity-0"
                />
              </label>
            ) : null}

            <button
              type="button"
              onClick={() => void handleAddTask()}
              disabled={!effectiveUserId || !newTask.trim()}
              className="macos-quick-add-submit-btn"
            >
              추가
            </button>
          </div>
        </div>

        {/* 4. 할일 목록 카드 */}
        <div className="macos-todo-list-card macos-glass macos-squircle">
          <div className="macos-list-header">
            <div>
              <div className="macos-list-title">
                {priorityFilter === 'all' ? '전체' : getPriorityMeta(priorityFilter).label} 미리 알림
              </div>
              <div className="macos-list-subtitle">
                총 {sortedTasks.length}개 항목 · 마감순 정렬
              </div>
            </div>
          </div>

          <div className="macos-todo-items-scroll">
            {loading ? (
              <div className="flex justify-center py-20">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--border)] border-t-[#007AFF]" />
              </div>
            ) : !effectiveUserId ? (
              <div className="macos-empty-state">
                <div className="macos-empty-icon" aria-hidden="true">👤</div>
                <div className="macos-empty-title">로그인이 필요한 기능입니다.</div>
                <div className="macos-empty-sub">직원 계정 정보가 확인되면 할일 서비스가 시작됩니다.</div>
              </div>
            ) : sortedTasks.length === 0 ? (
              <div className="macos-empty-state">
                <div className="macos-empty-icon" aria-hidden="true">✓</div>
                <div className="macos-empty-title">해당 항목에 할 일이 없습니다.</div>
                <div className="macos-empty-sub">위에 새 할 일을 등록하거나 필터를 해제해보세요.</div>
              </div>
            ) : (
              <div>
                {sortedTasks.map((task) => {
                  const isChatSource = Boolean(task.source_message_id || task.source_room_id);
                  const priorityMeta = getPriorityMeta(task.priority);
                  const reminderLabel = formatReminder(task.reminder_at);
                  const repeatLabel = getRepeatLabel(task.repeat_type);
                  const assigneeLabel = getAssigneeLabel(task.assignee_kind);
                  const dueLabel = reminderLabel || task.task_date;

                  return (
                    <div
                      key={String(task.id)}
                      className={`macos-todo-item ${task.is_complete ? 'is-done' : ''}`}
                    >
                      {/* 커스텀 서클 체크박스 */}
                      <label className={`macos-checkbox-container ${task.priority || 'medium'}`}>
                        <input
                          type="checkbox"
                          className="macos-checkbox-hidden"
                          checked={task.is_complete}
                          onChange={() => toggleTask(task.id, task.is_complete)}
                        />
                        <span className="macos-checkbox-custom" />
                      </label>

                      {/* 할일 상세 정보 */}
                      <div className="macos-todo-content-box">
                        <div className="macos-todo-title">{task.content}</div>
                        <div className="macos-todo-meta">
                          <span className="macos-todo-meta-item" style={{ color: priorityMeta.color }}>
                            ⚑ {priorityMeta.label}
                          </span>
                          <span className="macos-todo-meta-item">
                            📅 {dueLabel}
                          </span>
                          <span className="macos-todo-meta-item">
                            👤 {assigneeLabel}
                          </span>
                          {repeatLabel ? (
                            <span className="macos-todo-meta-item">
                              ↻ {repeatLabel}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {/* 액션 버튼 영역 */}
                      <div className="macos-todo-actions">
                        {isChatSource ? (
                          <button
                            type="button"
                            onClick={() => void handleOpenChatSource(task)}
                            className="macos-action-btn"
                            title="연결된 채팅으로 이동"
                          >
                            💬
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => void deleteTask(task.id)}
                          className="macos-action-btn delete"
                          aria-label="할일 삭제"
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </MFeatureScreen>
  );
}
