'use client';

import type { AttachmentItem } from '@/types';
import type { GuideAudience,GuideKind,TeamScope } from './guide-types';
import { normalizeGuideAudience,normalizeGuideKind } from './guide-utils';

type GuideComposerSectionProps = {
  activeCompanyLabel: string;
  activeTeam: TeamScope | null;
  editingResourceId: string | null;
  companyTeams: TeamScope[];
  teamName: string;
  divisionName: string;
  kind: GuideKind;
  audience: GuideAudience;
  title: string;
  description: string;
  keywordsInput: string;
  existingAttachments: AttachmentItem[];
  pendingFiles: File[];
  savingResource: boolean;
  onClose: () => void;
  onTeamChange: (teamName: string) => void;
  onDivisionNameChange: (value: string) => void;
  onKindChange: (value: GuideKind) => void;
  onAudienceChange: (value: GuideAudience) => void;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onKeywordsChange: (value: string) => void;
  onAddPendingFiles: (files: File[]) => void;
  onRemoveExistingAttachment: (index: number) => void;
  onRemovePendingFile: (index: number) => void;
  onSave: () => void;
};

export default function GuideComposerSection({
  activeCompanyLabel,
  editingResourceId,
  companyTeams,
  teamName,
  divisionName,
  kind,
  audience,
  title,
  description,
  keywordsInput,
  existingAttachments,
  pendingFiles,
  savingResource,
  onClose,
  onTeamChange,
  onDivisionNameChange,
  onKindChange,
  onAudienceChange,
  onTitleChange,
  onDescriptionChange,
  onKeywordsChange,
  onAddPendingFiles,
  onRemoveExistingAttachment,
  onRemovePendingFile,
  onSave,
}: GuideComposerSectionProps) {
  return (
    <section
      data-testid="guide-form"
      className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm"
    >
      <div className="flex flex-col gap-3">
        <div className="section-header">
          <h3 className="section-title">{editingResourceId ? '게시글 수정' : '게시글 등록'}</h3>
          <button type="button" onClick={onClose} className="btn-premium-secondary">
            닫기
          </button>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-[var(--toss-gray-5)]">회사</span>
            <input
              value={activeCompanyLabel}
              readOnly
              className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-[13px] font-semibold text-[var(--foreground)]"
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-[var(--toss-gray-5)]">팀</span>
            <select
              data-testid="guide-team-select"
              value={teamName}
              onChange={(event) => onTeamChange(event.target.value)}
              className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[13px] font-semibold outline-none focus:border-[var(--accent)]"
            >
              <option value="">팀 선택</option>
              {companyTeams.map((team) => (
                <option key={team.key} value={team.teamName}>
                  {team.divisionName} / {team.teamName}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-[var(--toss-gray-5)]">제목</span>
            <input
              data-testid="guide-title-input"
              value={title}
              onChange={(event) => onTitleChange(event.target.value)}
              placeholder="예: 수술팀 신규 직원 준비 가이드"
              className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[13px] font-semibold outline-none focus:border-[var(--accent)]"
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-[var(--toss-gray-5)]">소속 부문</span>
            <input
              value={divisionName}
              onChange={(event) => onDivisionNameChange(event.target.value)}
              placeholder="예: 간호부"
              className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[13px] font-semibold outline-none focus:border-[var(--accent)]"
            />
          </label>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-[var(--toss-gray-5)]">공유 유형</span>
            <select
              data-testid="guide-kind-select"
              value={kind}
              onChange={(event) => onKindChange(normalizeGuideKind(event.target.value))}
              className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[13px] font-semibold outline-none focus:border-[var(--accent)]"
            >
              <option value="education">업무자료</option>
              <option value="handover">업무 인수인계</option>
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-[var(--toss-gray-5)]">대상 직원</span>
            <select
              data-testid="guide-audience-select"
              value={audience}
              onChange={(event) => onAudienceChange(normalizeGuideAudience(event.target.value))}
              className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[13px] font-semibold outline-none focus:border-[var(--accent)]"
            >
              <option value="new_hire">신규직원</option>
              <option value="current_staff">기존직원</option>
              <option value="all_staff">전체직원</option>
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-[var(--toss-gray-5)]">검색 키워드</span>
            <input
              data-testid="guide-keywords-input"
              value={keywordsInput}
              onChange={(event) => onKeywordsChange(event.target.value)}
              placeholder="예: 신규교육, 체크리스트"
              className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[13px] font-semibold outline-none focus:border-[var(--accent)]"
            />
          </label>
        </div>

        <label className="space-y-1.5">
          <span className="text-xs font-semibold text-[var(--toss-gray-5)]">설명 / 프로세스</span>
          <textarea
            data-testid="guide-description-input"
            value={description}
            onChange={(event) => onDescriptionChange(event.target.value)}
            rows={6}
            placeholder={
              '1. 준비 전 확인\n- 환자, 일정, 재고 확인\n\n2. 준비물 세팅\n- 필수 기구와 소모품 준비\n\n3. 진행 순서\n- 실제 업무 순서를 단계별로 작성\n\n4. 주의사항\n- 신규 직원이 헷갈리기 쉬운 포인트 정리'
            }
            className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[13px] font-semibold leading-6 outline-none focus:border-[var(--accent)]"
          />
        </label>

        <label className="space-y-1.5">
          <span className="text-xs font-semibold text-[var(--toss-gray-5)]">첨부파일</span>
          <input
            data-testid="guide-file-input"
            type="file"
            multiple
            onChange={(event) => {
              const files = event.target.files ? Array.from(event.target.files) : [];
              onAddPendingFiles(files);
              event.currentTarget.value = '';
            }}
            className="block w-full rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[13px] font-semibold"
          />
        </label>

        {(existingAttachments.length > 0 || pendingFiles.length > 0) && (
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-[var(--radius-md)] bg-[var(--muted)] p-3">
              <p className="text-xs font-semibold text-[var(--toss-gray-5)]">저장된 첨부</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {existingAttachments.map((attachment, index) => (
                  <button
                    key={`${attachment.url}-${index}`}
                    type="button"
                    onClick={() => onRemoveExistingAttachment(index)}
                    className="rounded-[var(--radius-sm)] bg-[var(--card)] px-2.5 py-1 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--danger)]/10 hover:text-[var(--danger)]"
                  >
                    {attachment.name} ×
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[var(--radius-md)] bg-[var(--muted)] p-3">
              <p className="text-xs font-semibold text-[var(--toss-gray-5)]">새로 올릴 파일</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {pendingFiles.map((file, index) => (
                  <button
                    key={`${file.name}-${file.size}-${index}`}
                    type="button"
                    onClick={() => onRemovePendingFile(index)}
                    className="rounded-[var(--radius-sm)] bg-[var(--card)] px-2.5 py-1 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--danger)]/10 hover:text-[var(--danger)]"
                  >
                    {file.name} ×
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-premium-secondary">
            취소
          </button>
          <button
            type="button"
            data-testid="guide-save"
            disabled={savingResource}
            onClick={onSave}
            className="btn-premium-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {savingResource ? '저장 중...' : editingResourceId ? '수정 저장' : '게시글 등록'}
          </button>
        </div>
      </div>
    </section>
  );
}
