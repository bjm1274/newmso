'use client';

// OP체크 템플릿 관리 탭 (좌: 편집기, 우: 저장된 템플릿 라이브러리)
// 순수 프레젠테이션 — 모든 상태/저장 로직은 부모(OP체크.tsx)가 보유.
// OP체크.tsx 의 templates 탭 JSX 를 그대로 추출 (동작 보존).

import { EmptyState } from '@/app/components/StatePanel';
import type { OpCheckTemplate } from '@/types';
import { ANESTHESIA_OPTIONS } from './constants';
import { buildTemplateLabel } from './schedule-helpers';
import type { SurgeryTemplateRow } from './schedule-helpers';
import {
  createChecklistItem,
  emptyTemplateEditor,
  normalizeChecklistItems } from './checklist-helpers';
import type { ChecklistItemDraft, TemplateEditorState } from './checklist-helpers';
import { OpCheckTemplateChecklistItemRows } from './ChecklistItemRows';

type TemplatesByScope = {
  surgery: OpCheckTemplate[];
  anesthesia: OpCheckTemplate[];
};

type OpCheckTemplateManagerPanelProps = {
  templateEditor: TemplateEditorState;
  setTemplateEditor: React.Dispatch<React.SetStateAction<TemplateEditorState>>;
  surgeryTemplates: SurgeryTemplateRow[];
  templatesByScope: TemplatesByScope;
  savingTemplate: boolean;
  updateTemplateEditorList: (
    key: 'prep_items' | 'consumable_items',
    updater: (items: ChecklistItemDraft[]) => ChecklistItemDraft[],
  ) => void;
  onSaveTemplate: () => void;
  onLoadTemplate: (template: OpCheckTemplate) => void;
  onRemoveTemplate: (templateId: string) => void;
};

export function OpCheckTemplateManagerPanel({
  templateEditor,
  setTemplateEditor,
  surgeryTemplates,
  templatesByScope,
  savingTemplate,
  updateTemplateEditorList,
  onSaveTemplate,
  onLoadTemplate,
  onRemoveTemplate }: OpCheckTemplateManagerPanelProps) {
  return (
    <div
      data-testid="op-check-template-layout"
      className="grid gap-4 xl:grid-cols-[1fr,0.95fr]"
    >
      <section className="space-y-2.5">
        <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setTemplateEditor((prev) => ({ ...prev, template_scope: 'surgery', anesthesia_type: '' }))
              }
              className={`rounded-[var(--radius-md)] px-3 py-1.5 text-xs font-bold ${
                templateEditor.template_scope === 'surgery'
                  ? 'bg-[var(--accent)] text-white'
                  : 'border border-[var(--border)] text-[var(--toss-gray-4)]'
              }`}
            >
              수술 템플릿
            </button>
            <button
              type="button"
              onClick={() =>
                setTemplateEditor((prev) => ({
                  ...prev,
                  template_scope: 'anesthesia',
                  surgery_template_id: '',
                  surgery_name: '' }))
              }
              className={`rounded-[var(--radius-md)] px-3 py-1.5 text-xs font-bold ${
                templateEditor.template_scope === 'anesthesia'
                  ? 'bg-[var(--accent)] text-white'
                  : 'border border-[var(--border)] text-[var(--toss-gray-4)]'
              }`}
            >
              마취 템플릿
            </button>
            <button
              type="button"
              onClick={() => setTemplateEditor(emptyTemplateEditor())}
              className="ml-auto rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-1.5 text-xs font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
            >
              새 템플릿
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="text-[11px] font-semibold text-[var(--toss-gray-3)]">
              템플릿 이름
              <input
                value={templateEditor.template_name}
                onChange={(event) =>
                  setTemplateEditor((prev) => ({ ...prev, template_name: event.target.value }))
                }
                placeholder="예: 무릎 관절경 기본 준비"
                className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm font-medium"
              />
            </label>

            {templateEditor.template_scope === 'surgery' ? (
              <label className="text-[11px] font-semibold text-[var(--toss-gray-3)]">
                연동 수술명
                <select
                  value={templateEditor.surgery_template_id}
                  onChange={(event) => {
                    const selectedTemplate =
                      surgeryTemplates.find((template) => String(template.id) === event.target.value) || null;
                    setTemplateEditor((prev) => ({
                      ...prev,
                      surgery_template_id: event.target.value,
                      surgery_name: selectedTemplate?.name || prev.surgery_name,
                      template_name: prev.template_name || selectedTemplate?.name || '' }));
                  }}
                  className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm font-medium"
                >
                  <option value="">직접 입력</option>
                  {surgeryTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="text-[11px] font-semibold text-[var(--toss-gray-3)]">
                마취 유형
                <select
                  value={templateEditor.anesthesia_type}
                  onChange={(event) =>
                    setTemplateEditor((prev) => ({
                      ...prev,
                      anesthesia_type: event.target.value,
                      template_name: prev.template_name || event.target.value }))
                  }
                  className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none cursor-pointer"
                >
                  <option value="">선택 안 함</option>
                  {ANESTHESIA_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {templateEditor.template_scope === 'surgery' ? (
            <label className="mt-3 block text-[11px] font-semibold text-[var(--toss-gray-3)]">
              수술명 직접 입력
              <input
                value={templateEditor.surgery_name}
                onChange={(event) =>
                  setTemplateEditor((prev) => ({ ...prev, surgery_name: event.target.value }))
                }
                placeholder="수술일정표 제목과 동일하게 입력"
                className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm font-medium"
              />
            </label>
          ) : null}

          <div className="mt-2.5 rounded-[var(--radius-md)] bg-[var(--muted)]/30 p-2">
            <div className="mb-1.5 flex items-center justify-between">
              <h4 className="text-xs font-bold text-[var(--foreground)]">기본 준비사항</h4>
              <button
                type="button"
                onClick={() =>
                  updateTemplateEditorList('prep_items', (items) => [
                    ...items,
                    createChecklistItem('template-prep'),
                  ])
                }
                className="rounded-[var(--radius-md)] border border-[var(--border)] px-2 py-1 text-[10px] font-bold text-[var(--toss-gray-4)] hover:bg-[var(--card)]"
              >
                준비항목 추가
              </button>
            </div>
            <OpCheckTemplateChecklistItemRows
              items={templateEditor.prep_items}
              kind="prep"
              onChange={(next) => updateTemplateEditorList('prep_items', () => next)}
            />
          </div>

          <div className="mt-2.5 rounded-[var(--radius-md)] bg-[var(--muted)]/30 p-2">
            <div className="mb-1.5 flex items-center justify-between">
              <h4 className="text-xs font-bold text-[var(--foreground)]">기본 의료소모품</h4>
              <button
                type="button"
                onClick={() =>
                  updateTemplateEditorList('consumable_items', (items) => [
                    ...items,
                    createChecklistItem('template-consumable'),
                  ])
                }
                className="rounded-[var(--radius-md)] border border-[var(--border)] px-2 py-1 text-[10px] font-bold text-[var(--toss-gray-4)] hover:bg-[var(--card)]"
              >
                소모품 추가
              </button>
            </div>
            <OpCheckTemplateChecklistItemRows
              items={templateEditor.consumable_items}
              kind="consumable"
              onChange={(next) => updateTemplateEditorList('consumable_items', () => next)}
            />
          </div>

          <label className="mt-2.5 block text-[11px] font-semibold text-[var(--toss-gray-3)]">
            템플릿 메모
            <textarea
              value={templateEditor.notes}
              onChange={(event) =>
                setTemplateEditor((prev) => ({ ...prev, notes: event.target.value }))
              }
              placeholder="수술팀 공통 지침, 마취 준비 참고사항 등을 메모해 주세요."
              className="mt-1 min-h-[56px] w-full rounded-[var(--radius-md)] border border-[var(--border)] px-2.5 py-1.5 text-xs font-semibold"
            />
          </label>

          <label className="mt-2 inline-flex items-center gap-2 text-xs font-semibold text-[var(--foreground)]">
            <input
              type="checkbox"
              checked={templateEditor.is_active}
              onChange={(event) =>
                setTemplateEditor((prev) => ({ ...prev, is_active: event.target.checked }))
              }
              className="h-3.5 w-3.5 rounded border-[var(--border)] text-[var(--accent)]"
            />
            활성 템플릿으로 사용
          </label>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="op-check-template-save"
              onClick={onSaveTemplate}
              disabled={savingTemplate}
              className="rounded-[var(--radius-md)] bg-[var(--accent)] px-3.5 py-1.5 text-xs font-bold text-white disabled:opacity-60"
            >
              {savingTemplate ? '저장 중...' : '템플릿 저장'}
            </button>
            <button
              type="button"
              onClick={() => setTemplateEditor(emptyTemplateEditor())}
              className="rounded-[var(--radius-md)] border border-[var(--border)] px-3.5 py-1.5 text-xs font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
            >
              입력 초기화
            </button>
          </div>
        </div>
      </section>

      <aside className="space-y-4">
        <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-bold text-[var(--foreground)]">저장된 OP체크 템플릿</h3>
            <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">
              수술 {templatesByScope.surgery.length} / 마취 {templatesByScope.anesthesia.length}
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {(['surgery', 'anesthesia'] as const).map((scope) => (
              <div key={scope} className="rounded-[var(--radius-lg)] bg-[var(--muted)]/20 p-3 border border-[var(--border)]/40 flex flex-col min-w-0">
                <div className="mb-2.5 flex items-center justify-between border-b border-[var(--border)]/60 pb-1.5 shrink-0">
                  <p className="text-[11px] font-extrabold text-[var(--accent)] flex items-center gap-1">
                    <span>{scope === 'surgery' ? '🏥' : '💉'}</span>
                    {scope === 'surgery' ? '수술 템플릿' : '마취 템플릿'}
                  </p>
                  <span className="rounded-full bg-[var(--card)] px-1.5 py-0.5 text-[8px] font-black text-[var(--toss-gray-4)] border border-[var(--border)]/45">
                    {templatesByScope[scope].length}개
                  </span>
                </div>

                <div className="space-y-2 max-h-[500px] overflow-y-auto pr-0.5 custom-scrollbar flex-1 min-h-[120px]">
                  {templatesByScope[scope].length === 0 ? (
                    <EmptyState
                      title="등록된 템플릿 없음"
                      description={`${scope === 'surgery' ? '수술' : '마취'} 템플릿이 비어 있습니다.`}
                      compact
                    />
                  ) : (
                    templatesByScope[scope].map((template) => (
                      <div
                        key={template.id}
                        className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-2.5 shadow-2xs hover:border-[var(--accent)]/45 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[12px] font-bold text-[var(--foreground)]" title={buildTemplateLabel(template)}>
                              {buildTemplateLabel(template)}
                            </p>
                            <p className="mt-0.5 text-[10px] font-medium text-[var(--toss-gray-3)]">
                              준비 {normalizeChecklistItems(template.prep_items, 'list').length}개 · 소모품{' '}
                              {normalizeChecklistItems(template.consumable_items, 'list').length}개
                            </p>
                          </div>
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-[8px] font-black shrink-0 ${
                              template.is_active === false
                                ? 'bg-[var(--muted)] text-[var(--toss-gray-4)]'
                                : 'bg-emerald-50 text-emerald-700'
                            }`}
                          >
                            {template.is_active === false ? '비활성' : '활성'}
                          </span>
                        </div>
                        {template.notes ? (
                          <p className="mt-1.5 line-clamp-2 text-[10px] font-medium text-[var(--toss-gray-3)] leading-relaxed bg-[var(--muted)]/30 p-1.5 rounded">
                            {template.notes}
                          </p>
                        ) : null}
                        <div className="mt-2.5 flex flex-wrap gap-1.5 justify-end border-t border-[var(--border)]/40 pt-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => onLoadTemplate(template)}
                            className="rounded-full border border-[var(--border)] px-2 py-1 text-[9px] font-black text-[var(--accent)] hover:bg-[var(--toss-blue-light)]"
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            onClick={() => onRemoveTemplate(String(template.id || ''))}
                            className="rounded-full border border-red-500/20 px-2 py-1 text-[9px] font-black text-red-600 hover:bg-red-500/10"
                          >
                            삭제
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
