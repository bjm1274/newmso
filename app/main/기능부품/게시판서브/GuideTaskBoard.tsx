'use client';

import type { GuideRow, GuideTask, GuideTaskPriority, TeamScope } from './guide-types';
import {
  formatDate,
  formatDateOnly,
  getTaskPriorityMeta,
  normalizeGuideTaskPriority,
} from './guide-utils';

type GuideTaskBoardProps = {
  activeTeam: TeamScope | null;
  canWrite: boolean;
  loading: boolean;
  taskFilter: 'all' | 'open' | 'done';
  editingTaskId: string | null;
  taskTitle: string;
  taskDueDate: string;
  taskPriority: GuideTaskPriority;
  taskNote: string;
  savingTask: boolean;
  activeTeamTasks: GuideTask[];
  canManagePost: (item?: Pick<GuideRow, 'author_id'> | null) => boolean;
  onTaskFilterChange: (value: 'all' | 'open' | 'done') => void;
  onTaskTitleChange: (value: string) => void;
  onTaskDueDateChange: (value: string) => void;
  onTaskPriorityChange: (value: GuideTaskPriority) => void;
  onTaskNoteChange: (value: string) => void;
  onResetTaskComposer: () => void;
  onSaveTask: () => void;
  onToggleTask: (task: GuideTask) => void;
  onStartTaskEdit: (task: GuideTask) => void;
  onDeleteTask: (task: GuideTask) => void;
};

export default function GuideTaskBoard({
  activeTeam,
  canWrite,
  loading,
  taskFilter,
  editingTaskId,
  taskTitle,
  taskDueDate,
  taskPriority,
  taskNote,
  savingTask,
  activeTeamTasks,
  canManagePost,
  onTaskFilterChange,
  onTaskTitleChange,
  onTaskDueDateChange,
  onTaskPriorityChange,
  onTaskNoteChange,
  onResetTaskComposer,
  onSaveTask,
  onToggleTask,
  onStartTaskEdit,
  onDeleteTask,
}: GuideTaskBoardProps) {
  return (
    <section
      className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] shadow-sm"
      data-testid="guide-team-task-board"
    >
      <div className="flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-[13px] font-bold text-[var(--foreground)]">
              {activeTeam ? `${activeTeam.teamName} 팀별 할일` : '팀별 할일'}
            </h3>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(['open', 'all', 'done'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => onTaskFilterChange(value)}
                className={`rounded-[var(--radius-md)] px-2.5 py-1.5 text-[11px] font-bold transition-colors ${
                  taskFilter === value
                    ? 'bg-[var(--foreground)] text-[var(--card)]'
                    : 'bg-[var(--muted)] text-[var(--toss-gray-4)] hover:text-[var(--foreground)]'
                }`}
              >
                {value === 'open' ? '진행중' : value === 'done' ? '완료' : '전체'}
              </button>
            ))}
          </div>
        </div>

        {canWrite && activeTeam ? (
          <div className="grid gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--tab-bg)] p-3">
            <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_160px_140px]">
              <input
                data-testid="guide-task-title-input"
                value={taskTitle}
                onChange={(event) => onTaskTitleChange(event.target.value)}
                placeholder={`${activeTeam.teamName} 팀 할일 제목`}
                className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[13px] font-semibold outline-none focus:border-[var(--accent)]"
              />
              <input
                data-testid="guide-task-due-date-input"
                type="date"
                value={taskDueDate}
                onChange={(event) => onTaskDueDateChange(event.target.value)}
                className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[13px] font-semibold outline-none focus:border-[var(--accent)]"
              />
              <select
                data-testid="guide-task-priority-select"
                value={taskPriority}
                onChange={(event) => onTaskPriorityChange(normalizeGuideTaskPriority(event.target.value))}
                className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[13px] font-semibold outline-none focus:border-[var(--accent)]"
              >
                <option value="urgent">긴급</option>
                <option value="high">높음</option>
                <option value="medium">보통</option>
                <option value="low">낮음</option>
              </select>
            </div>
            <textarea
              data-testid="guide-task-note-input"
              value={taskNote}
              onChange={(event) => onTaskNoteChange(event.target.value)}
              rows={2}
              placeholder="메모, 준비사항, 전달사항"
              className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[13px] font-semibold leading-6 outline-none focus:border-[var(--accent)]"
            />
            <div className="flex justify-end gap-1.5">
              {editingTaskId ? (
                <button type="button" onClick={onResetTaskComposer} className="btn-premium-secondary">
                  취소
                </button>
              ) : null}
              <button
                type="button"
                data-testid="guide-task-save"
                disabled={savingTask}
                onClick={onSaveTask}
                className="btn-premium-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingTask ? '저장 중...' : editingTaskId ? '할일 수정' : '할일 등록'}
              </button>
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-[var(--radius-md)] bg-[var(--muted)] p-4 text-center text-[13px] font-semibold text-[var(--toss-gray-4)]">
            불러오는 중...
          </div>
        ) : activeTeamTasks.length === 0 ? (
          <div className="empty-state">
            <p className="text-[13px] font-bold text-[var(--foreground)]">공유된 팀 할일이 없습니다</p>
            <p className="mt-1 text-xs text-[var(--toss-gray-4)]">
              {activeTeam ? `${activeTeam.teamName} 팀의 할일을 등록해 보세요.` : '팀을 선택해 주세요.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {activeTeamTasks.map((task) => {
              const priorityMeta = getTaskPriorityMeta(task.priority);
              return (
                <div
                  key={task.id}
                  data-testid={`guide-task-card-${task.id}`}
                  className={`rounded-[var(--radius-md)] border p-3 transition-colors ${
                    task.isDone
                      ? 'border-[var(--success)]/20 bg-[var(--success)]/5'
                      : 'border-[var(--border)] bg-[var(--card)]'
                  }`}
                >
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`badge ${priorityMeta.className}`}>{priorityMeta.label}</span>
                        <span className={`badge ${task.isDone ? 'badge-green' : 'badge-gray'}`}>
                          {task.isDone ? '완료' : '진행중'}
                        </span>
                        {task.dueDate ? (
                          <span className="badge badge-gray">마감 {formatDateOnly(task.dueDate)}</span>
                        ) : null}
                      </div>
                      <p
                        className={`text-[13px] font-bold ${
                          task.isDone
                            ? 'text-[var(--success)] line-through'
                            : 'text-[var(--foreground)]'
                        }`}
                      >
                        {task.title}
                      </p>
                      {task.note ? (
                        <p className="whitespace-pre-wrap text-xs font-medium leading-5 text-[var(--toss-gray-4)]">
                          {task.note}
                        </p>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold text-[var(--toss-gray-4)]">
                        <span>{task.author_name || '작성자 미상'}</span>
                        <span>{formatDate(task.updated_at || task.created_at)}</span>
                        {task.isDone ? (
                          <span>
                            {`완료자: ${task.completedByName || '확인 불가'}${
                              task.completedAt ? ` · ${formatDate(task.completedAt)}` : ''
                            }`}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-1.5">
                      {canWrite ? (
                        <button
                          type="button"
                          data-testid={`guide-task-toggle-${task.id}`}
                          onClick={() => onToggleTask(task)}
                          className={`rounded-[var(--radius-md)] px-2.5 py-1.5 text-[11px] font-bold text-white ${
                            task.isDone ? 'bg-[var(--foreground)]' : 'bg-[var(--success)]'
                          }`}
                        >
                          {task.isDone ? '되돌리기' : '완료'}
                        </button>
                      ) : null}
                      {canManagePost(task) ? (
                        <>
                          <button
                            type="button"
                            onClick={() => onStartTaskEdit(task)}
                            className="btn-premium-secondary !px-2.5 !py-1.5 !text-[11px]"
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteTask(task)}
                            className="btn-premium-danger !px-2.5 !py-1.5 !text-[11px]"
                          >
                            삭제
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
