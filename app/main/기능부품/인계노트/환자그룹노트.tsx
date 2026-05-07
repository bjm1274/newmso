'use client';

import type { HandoverNote } from '@/lib/handover-notes';
import type { PatientGroup } from './handover-types';
import { dateLabel, createdLabel } from './handover-types';
import { formatPatientBedLabel } from '@/lib/handover-notes';

export type PatientGroupNoteProps = {
  selectedPatientGroup: PatientGroup;
  noteMutationId: string | null;
  editingNoteId: string | null;
  editingContent: string;
  noteActionValues: Record<string, string>;
  onClose: () => void;
  onEditingContentChange: (value: string) => void;
  onNoteAction: (note: HandoverNote, action: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (note: HandoverNote) => void;
};

export default function PatientGroupNote({
  selectedPatientGroup,
  noteMutationId,
  editingNoteId,
  editingContent,
  noteActionValues,
  onClose,
  onEditingContentChange,
  onNoteAction,
  onCancelEdit,
  onSaveEdit,
}: PatientGroupNoteProps) {
  function renderNote(note: HandoverNote) {
    const isEditing = editingNoteId === note.id;
    const isMutating = noteMutationId === note.id;

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
              value={noteActionValues[note.id] ?? ''}
              onChange={(event) => onNoteAction(note, event.target.value)}
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

  return (
    <div
      className="fixed inset-0 z-[119] flex items-center justify-center bg-slate-950/45 px-4 py-4"
      data-testid="handover-patient-history-modal"
    >
      <div className="max-h-[82vh] w-full max-w-[860px] overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] shadow-sm">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <div>
            <h3 className="text-base font-bold text-[var(--foreground)]">{selectedPatientGroup.label}</h3>
            <p className="mt-1 text-xs text-[var(--toss-gray-3)]">
              입원 {dateLabel(selectedPatientGroup.startDate)}
              {selectedPatientGroup.endDate
                ? ` · 종료 ${dateLabel(selectedPatientGroup.endDate)}`
                : ' · 현재 입원 중'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="handover-patient-history-close"
            className="rounded-[var(--radius-md)] bg-[var(--page-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] transition hover:bg-[var(--muted)]"
          >
            닫기
          </button>
        </div>
        <div className="max-h-[calc(82vh-70px)] overflow-y-auto p-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--page-bg)] p-3">
              <div className="text-xs font-bold text-[var(--toss-gray-3)]">입원 병실</div>
              <div className="mt-2 text-lg font-black text-[var(--foreground)]">
                {selectedPatientGroup.roomNumber}호 {selectedPatientGroup.bedNumber}번
              </div>
            </div>
            <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--page-bg)] p-3">
              <div className="text-xs font-bold text-[var(--toss-gray-3)]">입원 시작일</div>
              <div className="mt-2 text-lg font-black text-[var(--foreground)]">
                {dateLabel(selectedPatientGroup.startDate)}
              </div>
            </div>
            <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--page-bg)] p-3">
              <div className="text-xs font-bold text-[var(--toss-gray-3)]">누적 인계사항</div>
              <div className="mt-2 text-lg font-black text-[var(--success)]">{selectedPatientGroup.notes.length}건</div>
            </div>
          </div>

          <div className="mt-4 rounded-[var(--radius-xl)] border border-[var(--success-light)] bg-[var(--success-light)]/60 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-bold text-[var(--foreground)]">입원 구간 전체 인계 이력</h4>
              <span className="text-xs text-[var(--success)]">
                {dateLabel(selectedPatientGroup.startDate)}부터{' '}
                {selectedPatientGroup.endDate ? dateLabel(selectedPatientGroup.endDate) : '현재'}까지
              </span>
            </div>
            {selectedPatientGroup.notes.length === 0 ? (
              <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--success-light)] px-4 py-10 text-center text-sm text-[var(--success)]">
                이 입원 구간에는 아직 등록된 환자별 인계사항이 없습니다.
              </div>
            ) : (
              <div className="space-y-3">{selectedPatientGroup.notes.map(renderNote)}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
