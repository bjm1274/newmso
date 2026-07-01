'use client';

import { useMemo } from 'react';
import { getStaffLikeId } from '@/lib/staff-identity';
import {
  useTodoWorkflow,
  TodoPriority,
  TodoRepeatType,
  TodoAssigneeKind,
  TodoViewRange,
  TodoRow,
  PRIORITY_OPTIONS,
  REPEAT_OPTIONS,
  ASSIGNEE_OPTIONS,
  getPriorityMeta,
  getRepeatLabel,
  getAssigneeLabel,
  formatReminder
} from '../hooks/useTodoWorkflow';

export default function MyTodoList({ user: initialUser, onChatNavigate: _onChatNavigate }: Record<string, unknown>) {
  const onChatNavigate = _onChatNavigate as ((roomId: string, messageId: string) => void) | undefined;
  
  const {
    user,
    newTask,
    setNewTask,
    selectedDate,
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
    priorityCounts,
    allOpenCount,
    sortedTasks,
    rangeLabel,
    shiftSelectedDate,
  } = useTodoWorkflow(initialUser as Record<string, unknown>, onChatNavigate);

  // 라이브 reference: tones[urgent]=danger / high=warn / medium=accent / low=muted
  const priToneMap: Record<TodoPriority | 'all', 'accent' | 'danger' | 'warn' | 'muted'> = {
    all: 'accent',
    urgent: 'danger',
    high: 'warn',
    medium: 'accent',
    low: 'muted'
  };

  return (
    <div className="flex h-full flex-col gap-3 sm:gap-4">
      {dialog}

      {/* 컨트롤 바 — 우선순위 5칩 + 일별/주간/월간 + 날짜 페이저 */}
      <div className="todo-control-card rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3 shadow-[var(--shadow-xs)] sm:p-4">
        <div className="todo-control-row flex flex-wrap items-center justify-between gap-2 sm:gap-3">
          <div className="todo-filter-scroll flex flex-wrap items-center gap-2">
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

          <div className="todo-view-actions flex items-center gap-2">
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
  onChatNavigate }: {
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
      <div className="todo-actions flex shrink-0 items-center gap-1.5">
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
