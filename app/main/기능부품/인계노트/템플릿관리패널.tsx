'use client';

import type { HandoverNote, HandoverNoteScope } from '@/lib/handover-notes';
import type { TemplateFamily } from './handover-types';
import { createdLabel } from './handover-types';

export type TemplatePanelProps = {
  noteScope: HandoverNoteScope;
  saving: boolean;
  content: string;
  filteredTemplateFamilies: TemplateFamily[];
  selectedTemplateFamilyKey: string;
  selectedTemplateNoteId: string;
  selectedTemplateVersions: HandoverNote[];
  selectedTemplateNote: HandoverNote | null;
  selectedTemplateFamily: TemplateFamily | null;
  latestTemplateNote: HandoverNote | null;
  onTemplateFamilyChange: (key: string) => void;
  onTemplateVersionChange: (id: string) => void;
  onApplyTemplate: () => void;
  onSaveAsTemplate: () => void;
};

export default function TemplatePaenl({
  saving,
  content,
  filteredTemplateFamilies,
  selectedTemplateFamilyKey,
  selectedTemplateNoteId,
  selectedTemplateVersions,
  selectedTemplateNote,
  selectedTemplateFamily,
  latestTemplateNote,
  onTemplateFamilyChange,
  onTemplateVersionChange,
  onApplyTemplate,
  onSaveAsTemplate,
}: TemplatePanelProps) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="grid gap-2 md:grid-cols-[minmax(0,180px)_minmax(0,140px)]">
          <label className="space-y-1">
            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">템플릿</span>
            <select
              value={selectedTemplateFamilyKey}
              onChange={(event) => onTemplateFamilyChange(event.target.value)}
              data-testid="handover-template-family-select"
              className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)]"
            >
              {filteredTemplateFamilies.length === 0 ? (
                <option value="">저장된 템플릿 없음</option>
              ) : (
                filteredTemplateFamilies.map((family) => (
                  <option key={family.key} value={family.key}>
                    {family.name}
                  </option>
                ))
              )}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">버전</span>
            <select
              value={selectedTemplateNoteId}
              onChange={(event) => onTemplateVersionChange(event.target.value)}
              data-testid="handover-template-version-select"
              className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)]"
            >
              {selectedTemplateVersions.length === 0 ? (
                <option value="">버전 없음</option>
              ) : (
                selectedTemplateVersions.map((note) => (
                  <option key={note.id} value={note.id}>
                    v{note.template_version || 1} · {createdLabel(note.created_at)}
                  </option>
                ))
              )}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onApplyTemplate}
            data-testid="handover-template-apply"
            disabled={!selectedTemplateNote}
            className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] transition hover:bg-[var(--muted)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            템플릿 불러오기
          </button>
          <button
            type="button"
            onClick={onSaveAsTemplate}
            data-testid="handover-template-save"
            disabled={saving || !content.trim()}
            className="rounded-[var(--radius-md)] bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            현재 내용으로 템플릿 저장
          </button>
        </div>
      </div>

      {selectedTemplateNote ? (
        <div className="mt-2 space-y-3">
          <p className="text-[11px] text-[var(--toss-gray-3)]">
            {selectedTemplateNote.template_name} v{selectedTemplateNote.template_version || 1} ·{' '}
            {selectedTemplateNote.shift} · {selectedTemplateNote.priority}
          </p>
          <div
            className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] px-3 py-3"
            data-testid="handover-template-version-history"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[12px] font-bold text-[var(--foreground)]">템플릿 버전 이력</p>
                <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">
                  {selectedTemplateFamily?.name || selectedTemplateNote.template_name} · 총{' '}
                  {selectedTemplateFamily?.count || selectedTemplateVersions.length}개 버전
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
                {latestTemplateNote ? (
                  <span className="rounded-[var(--radius-md)] bg-[var(--success-light)] px-2.5 py-1 text-[var(--success)]">
                    최신 버전 {latestTemplateNote.template_version || 1}
                  </span>
                ) : null}
                {selectedTemplateFamily?.latestCreatedAt ? (
                  <span className="rounded-[var(--radius-md)] bg-[var(--card)] px-2.5 py-1 text-[var(--toss-gray-3)]">
                    최근 저장 {createdLabel(selectedTemplateFamily.latestCreatedAt)}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="mt-3 grid gap-2 lg:grid-cols-2">
              {selectedTemplateVersions.slice(0, 6).map((note) => {
                const isSelected = note.id === selectedTemplateNote?.id;
                const isLatest = note.id === latestTemplateNote?.id;
                return (
                  <button
                    key={note.id}
                    type="button"
                    onClick={() => onTemplateVersionChange(note.id)}
                    data-testid={`handover-template-version-card-${note.id}`}
                    className={`rounded-[var(--radius-md)] border px-3 py-2 text-left transition ${
                      isSelected
                        ? 'border-[var(--accent)] bg-[var(--card)] shadow-sm'
                        : 'border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]/60'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-bold text-[var(--foreground)]">v{note.template_version || 1}</span>
                      <span className="flex flex-wrap items-center gap-1 text-[10px] font-bold">
                        {isSelected ? (
                          <span className="rounded-full bg-[var(--accent)]/10 px-2 py-0.5 text-[var(--accent)]">
                            선택됨
                          </span>
                        ) : null}
                        {isLatest ? (
                          <span className="rounded-full bg-[var(--success-light)] px-2 py-0.5 text-[var(--success)]">
                            최신
                          </span>
                        ) : null}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">{createdLabel(note.created_at)}</p>
                    <p className="mt-2 text-[11px] text-[var(--toss-gray-3)]">
                      {note.author_name || '작성자 없음'} · {note.shift} · {note.priority}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
