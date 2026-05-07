'use client';

import { formatPatientBedLabel, type HandoverNote } from '@/lib/handover-notes';
import { createdLabel } from './handover-types';

type HandoverNoteCardProps = {
  note: HandoverNote;
  isEditing: boolean;
  isMutating: boolean;
  editingContent: string;
  actionValue: string;
  onEditingContentChange: (value: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (note: HandoverNote) => void;
  onAction: (note: HandoverNote, action: string) => void;
};

export default function HandoverNoteCard({
  note,
  isEditing,
  isMutating,
  editingContent,
  actionValue,
  onEditingContentChange,
  onCancelEdit,
  onSaveEdit,
  onAction,
}: HandoverNoteCardProps) {
  return (
    <div
      key={note.id}
      className={`rounded-[var(--radius-xl)] border px-4 py-3 shadow-sm ${
        note.is_completed
          ? 'border-[var(--border)] bg-[var(--page-bg)]'
          : note.priority === 'High'
            ? 'border-red-500/20 bg-red-500/10/60'
            : 'border-[var(--border)] bg-[var(--card)]'
      }`}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className="rounded-[var(--radius-md)] bg-[var(--toss-blue-light)] px-2.5 py-1 text-[var(--accent)]">
              {note.shift}
            </span>
            <span
              className={`rounded-[var(--radius-md)] px-2.5 py-1 ${
                note.priority === 'High'
                  ? 'bg-red-500/20 text-red-600'
                  : 'bg-[var(--tab-bg)] text-[var(--toss-gray-3)]'
              }`}
            >
              {note.priority === 'High' ? '중요' : '일반'}
            </span>
            <span
              className={`rounded-[var(--radius-md)] px-2.5 py-1 ${
                note.note_scope === 'patient'
                  ? 'bg-[var(--success-light)] text-[var(--success)]'
                  : 'bg-[var(--tab-bg)] text-[var(--toss-gray-4)]'
              }`}
            >
              {note.note_scope === 'patient' ? '환자별' : '공통'}
            </span>
            {note.note_scope === 'patient' ? (
              <span className="rounded-[var(--radius-md)] bg-[var(--success-light)] px-2.5 py-1 text-[var(--success)]">
                {formatPatientBedLabel(note)}
              </span>
            ) : null}
            <span className="text-[var(--toss-gray-3)]">
              {note.author_name || '이름 없음'} · {createdLabel(note.created_at)}
            </span>
          </div>
          {isEditing ? (
            <div className="space-y-2">
              <textarea
                value={editingContent}
                onChange={(event) => onEditingContentChange(event.target.value)}
                rows={4}
                data-testid={`handover-note-edit-content-${note.id}`}
                className="w-full rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm leading-6 text-[var(--foreground)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
              />
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={onCancelEdit}
                  className="rounded-[var(--radius-md)] bg-[var(--page-bg)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] transition hover:bg-[var(--muted)]"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={() => onSaveEdit(note)}
                  disabled={isMutating}
                  className="rounded-[var(--radius-md)] bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isMutating ? '저장 중' : '수정 저장'}
                </button>
              </div>
            </div>
          ) : (
            <p
              className={`whitespace-pre-wrap text-sm leading-6 ${
                note.is_completed ? 'text-[var(--toss-gray-3)] line-through' : 'text-[var(--foreground)]'
              }`}
            >
              {note.content}
            </p>
          )}
        </div>
        <div className="shrink-0">
          <select
            value={actionValue}
            onChange={(event) => onAction(note, event.target.value)}
            data-testid={`handover-note-action-${note.id}`}
            disabled={isMutating}
            className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] outline-none transition focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="">없음</option>
            <option value="edit">수정</option>
            <option value="delete">삭제</option>
            <option value="complete">완료</option>
          </select>
        </div>
      </div>
    </div>
  );
}
