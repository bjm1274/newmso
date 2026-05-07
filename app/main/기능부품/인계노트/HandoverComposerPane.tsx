'use client';

import type { HandoverNote, HandoverNoteScope } from '@/lib/handover-notes';
import type { BedOption, TemplateFamily } from './handover-types';
import { dateLabel, DEFAULT_PRIORITY, DEFAULT_SHIFT, fullDateLabel } from './handover-types';
import TemplatePaenl from './템플릿관리패널';

type HandoverComposerPaneProps = {
  noteScope: HandoverNoteScope;
  selectedDate: Date;
  shift: string;
  priority: string;
  saving: boolean;
  content: string;
  selectedBedKey: string;
  bedOptions: BedOption[];
  filteredTemplateFamilies: TemplateFamily[];
  selectedTemplateFamilyKey: string;
  selectedTemplateNoteId: string;
  selectedTemplateVersions: HandoverNote[];
  selectedTemplateNote: HandoverNote | null;
  selectedTemplateFamily: TemplateFamily | null;
  latestTemplateNote: HandoverNote | null;
  onNoteScopeChange: (scope: HandoverNoteScope) => void;
  onSelectedBedKeyChange: (value: string) => void;
  onShiftChange: (value: string) => void;
  onPriorityChange: (value: string) => void;
  onContentChange: (value: string) => void;
  onTemplateFamilyChange: (value: string) => void;
  onTemplateVersionChange: (value: string) => void;
  onApplyTemplate: () => void;
  onSaveAsTemplate: () => void;
  onCreateNote: () => void;
};

export default function HandoverComposerPane({
  noteScope,
  selectedDate,
  shift,
  priority,
  saving,
  content,
  selectedBedKey,
  bedOptions,
  filteredTemplateFamilies,
  selectedTemplateFamilyKey,
  selectedTemplateNoteId,
  selectedTemplateVersions,
  selectedTemplateNote,
  selectedTemplateFamily,
  latestTemplateNote,
  onNoteScopeChange,
  onSelectedBedKeyChange,
  onShiftChange,
  onPriorityChange,
  onContentChange,
  onTemplateFamilyChange,
  onTemplateVersionChange,
  onApplyTemplate,
  onSaveAsTemplate,
  onCreateNote,
}: HandoverComposerPaneProps) {
  return (
    <section className="space-y-3 rounded-[var(--radius-xl)] bg-[var(--page-bg)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            data-testid="handover-scope-general"
            onClick={() => onNoteScopeChange('general')}
            className={`rounded-[var(--radius-md)] px-3 py-2 text-sm font-semibold ${
              noteScope === 'general'
                ? 'bg-[var(--foreground)] text-[var(--card)]'
                : 'bg-[var(--tab-bg)] text-[var(--toss-gray-4)]'
            }`}
          >
            공통 인계
          </button>
          <button
            type="button"
            data-testid="handover-scope-patient"
            onClick={() => onNoteScopeChange('patient')}
            className={`rounded-[var(--radius-md)] px-3 py-2 text-sm font-semibold ${
              noteScope === 'patient'
                ? 'bg-[var(--success)] text-white'
                : 'bg-[var(--success-light)] text-[var(--success)]'
            }`}
          >
            환자별 인계사항
          </button>
        </div>
        <span className="text-xs font-medium text-[var(--toss-gray-3)]">{fullDateLabel(selectedDate)}</span>
      </div>

      <TemplatePaenl
        noteScope={noteScope}
        saving={saving}
        content={content}
        filteredTemplateFamilies={filteredTemplateFamilies}
        selectedTemplateFamilyKey={selectedTemplateFamilyKey}
        selectedTemplateNoteId={selectedTemplateNoteId}
        selectedTemplateVersions={selectedTemplateVersions}
        selectedTemplateNote={selectedTemplateNote}
        selectedTemplateFamily={selectedTemplateFamily}
        latestTemplateNote={latestTemplateNote}
        onTemplateFamilyChange={onTemplateFamilyChange}
        onTemplateVersionChange={onTemplateVersionChange}
        onApplyTemplate={onApplyTemplate}
        onSaveAsTemplate={onSaveAsTemplate}
      />

      {noteScope === 'patient' ? (
        <div className="space-y-3 rounded-[var(--radius-lg)] border border-[var(--success-light)] bg-[var(--success-light)] p-3">
          {bedOptions.length === 0 ? (
            <div className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-3 py-3 text-sm font-medium text-amber-700">
              먼저 병상 설정에서 환자를 지정해주세요.
            </div>
          ) : (
            <>
              <select
                data-testid="handover-patient-select"
                value={selectedBedKey}
                onChange={(event) => onSelectedBedKeyChange(event.target.value)}
                className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm outline-none focus:border-[var(--success)] md:max-w-[320px]"
              >
                <option value="">환자 선택</option>
                {bedOptions.map((option) => (
                  <option key={option.selectionKey} value={option.selectionKey}>
                    {option.label} · 입원 {dateLabel(option.admissionDate)}
                  </option>
                ))}
              </select>
              <div className="flex flex-wrap gap-2">
                {bedOptions.map((option) => (
                  <button
                    key={option.selectionKey}
                    type="button"
                    onClick={() => onSelectedBedKeyChange(option.selectionKey)}
                    className={`rounded-[var(--radius-md)] px-3 py-1.5 text-xs font-semibold transition ${
                      selectedBedKey === option.selectionKey
                        ? 'bg-[var(--success)] text-white'
                        : 'bg-[var(--card)] text-[var(--success)]'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      ) : null}

      {noteScope === 'general' ? (
        <div className="space-y-3 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={shift}
              onChange={(event) => onShiftChange(event.target.value)}
              className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold outline-none transition focus:border-[var(--accent)]"
            >
              <option value="Day">데이</option>
              <option value="Evening">이브닝</option>
              <option value="Night">나이트</option>
            </select>
            <select
              value={priority}
              onChange={(event) => onPriorityChange(event.target.value)}
              className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold outline-none transition focus:border-[var(--accent)]"
            >
              <option value={DEFAULT_PRIORITY}>일반</option>
              <option value="High">중요</option>
            </select>
            <span className="text-xs font-medium text-[var(--toss-gray-3)]">
              미완료 상태면 이후 날짜에도 계속 표시됩니다.
            </span>
          </div>
          <textarea
            data-testid="handover-note-content"
            value={content}
            onChange={(event) => onContentChange(event.target.value)}
            placeholder="공지사항처럼 공통 인계 내용을 자세히 입력해주세요"
            rows={6}
            className="min-h-[180px] w-full rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--page-bg)] px-4 py-3 text-sm leading-6 text-[var(--foreground)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
          />
          <div className="flex justify-end">
            <button
              type="button"
              data-testid="handover-note-add"
              onClick={onCreateNote}
              disabled={saving || !content.trim()}
              className="rounded-[var(--radius-lg)] bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? '저장 중' : '공통 인계 등록'}
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-[140px_140px_minmax(0,1fr)_auto]">
          <select
            value={shift}
            onChange={(event) => onShiftChange(event.target.value)}
            className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold outline-none transition focus:border-[var(--accent)]"
          >
            <option value={DEFAULT_SHIFT}>데이</option>
            <option value="Evening">이브닝</option>
            <option value="Night">나이트</option>
          </select>
          <select
            value={priority}
            onChange={(event) => onPriorityChange(event.target.value)}
            className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold outline-none transition focus:border-[var(--accent)]"
          >
            <option value={DEFAULT_PRIORITY}>일반</option>
            <option value="High">중요</option>
          </select>
          <input
            type="text"
            data-testid="handover-note-content"
            value={content}
            onChange={(event) => onContentChange(event.target.value)}
            placeholder="선택한 환자에게 필요한 인계 내용을 입력해주세요"
            className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
          />
          <button
            type="button"
            data-testid="handover-note-add"
            onClick={onCreateNote}
            disabled={saving || !content.trim()}
            className="rounded-[var(--radius-lg)] bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? '저장 중' : '인계 추가'}
          </button>
        </div>
      )}
    </section>
  );
}
