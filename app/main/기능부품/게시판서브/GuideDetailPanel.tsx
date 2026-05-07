'use client';

import type { AttachmentItem } from '@/types';
import {
  buildManagedDownloadUrl,
  handleManagedDownloadClick,
} from '../공통/managed-download';
import type { GuideResource } from './guide-types';
import { formatDate, getGuideAudienceLabel, getGuideKindLabel } from './guide-utils';

type GuideDetailPanelProps = {
  selectedResource: GuideResource | null;
  activeCompanyLabel: string;
  canEditSelected: boolean;
  onEdit: (resource: GuideResource) => void;
  onDelete: (resource: GuideResource) => void;
  onAttachmentPreview: (attachments: AttachmentItem[], clickedAttachment: AttachmentItem) => void;
};

export default function GuideDetailPanel({
  selectedResource,
  activeCompanyLabel,
  canEditSelected,
  onEdit,
  onDelete,
  onAttachmentPreview,
}: GuideDetailPanelProps) {
  if (!selectedResource) {
    return (
      <div className="empty-state rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-8 shadow-sm">
        <p className="text-[13px] font-bold text-[var(--foreground)]">보고 싶은 공유자료를 선택해 주세요</p>
      </div>
    );
  }

  return (
    <article
      data-testid="guide-detail"
      className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] shadow-sm"
    >
      <div className="flex flex-col gap-3 border-b border-[var(--border)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              <span className="badge badge-blue">{getGuideKindLabel(selectedResource.kind)}</span>
              <span className="badge badge-gray">{getGuideAudienceLabel(selectedResource.audience)}</span>
              <span className="badge badge-gray">{selectedResource.teamName || '미지정'}</span>
            </div>
            <h3 className="text-lg font-bold text-[var(--foreground)]">{selectedResource.title}</h3>
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[var(--toss-gray-4)]">
              <span>{selectedResource.author_name || '작성자 미상'}</span>
              <span className="text-[var(--border)]">|</span>
              <span>{selectedResource.companyName || activeCompanyLabel || '기본 기관'}</span>
              <span className="text-[var(--border)]">|</span>
              <span>{formatDate(selectedResource.updated_at || selectedResource.created_at)}</span>
            </div>
          </div>

          {canEditSelected ? (
            <div className="flex gap-1.5">
              <button
                type="button"
                data-testid="guide-edit"
                onClick={() => onEdit(selectedResource)}
                className="btn-premium-secondary"
              >
                수정
              </button>
              <button
                type="button"
                data-testid="guide-delete"
                onClick={() => void onDelete(selectedResource)}
                className="btn-premium-danger"
              >
                삭제
              </button>
            </div>
          ) : null}
        </div>

        {selectedResource.keywords.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {selectedResource.keywords.map((keyword) => (
              <span key={keyword} className="badge badge-gray">
                #{keyword}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="space-y-4 p-4">
        <section className="space-y-2">
          <h4 className="text-xs font-bold text-[var(--toss-gray-5)]">프로세스 설명</h4>
          <div className="whitespace-pre-wrap rounded-[var(--radius-md)] bg-[var(--muted)] p-3 text-[13px] font-medium leading-7 text-[var(--foreground)]">
            {selectedResource.description || '설명 없음'}
          </div>
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-[var(--toss-gray-5)]">첨부 자료</h4>
            <span className="text-[11px] font-semibold text-[var(--toss-gray-4)]">
              {selectedResource.attachments.length}개
            </span>
          </div>
          {selectedResource.attachments.length === 0 ? (
            <div className="empty-state">첨부파일이 없습니다.</div>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-2 md:grid-cols-2">
                {selectedResource.attachments.map((attachment, index) => (
                  <a
                    key={`${attachment.url}-${index}`}
                    href={
                      attachment.type === 'image'
                        ? attachment.url
                        : buildManagedDownloadUrl(attachment.url, attachment.name)
                    }
                    onClick={(event) => {
                      if (attachment.type === 'image') {
                        event.preventDefault();
                        onAttachmentPreview(selectedResource.attachments, attachment);
                        return;
                      }
                      void handleManagedDownloadClick(event, attachment.url, attachment.name, {
                        logLabel: 'guide attachment download',
                      });
                    }}
                    download={attachment.type === 'image' ? undefined : attachment.name}
                    target={attachment.type === 'image' ? undefined : '_blank'}
                    rel={attachment.type === 'image' ? undefined : 'noreferrer'}
                    className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-3 transition-colors hover:border-[var(--accent)]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-bold text-[var(--foreground)]">
                        {attachment.name}
                      </p>
                      <p className="mt-0.5 text-[11px] font-medium text-[var(--toss-gray-4)]">
                        {attachment.type === 'image'
                          ? '이미지'
                          : attachment.type === 'video'
                            ? '동영상'
                            : '파일'}
                      </p>
                    </div>
                    <span className="badge badge-blue shrink-0">열기</span>
                  </a>
                ))}
              </div>

              {selectedResource.attachments.some((attachment) => attachment.type === 'image') ? (
                <div className="grid gap-2 md:grid-cols-2">
                  {selectedResource.attachments
                    .filter((attachment) => attachment.type === 'image')
                    .map((attachment, index) => (
                      <a
                        key={`${attachment.url}-preview-${index}`}
                        href={attachment.url}
                        onClick={(event) => {
                          event.preventDefault();
                          onAttachmentPreview(selectedResource.attachments, attachment);
                        }}
                        className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)]"
                      >
                        <img
                          src={attachment.url}
                          alt={attachment.name}
                          className="h-40 w-full cursor-zoom-in object-cover"
                        />
                      </a>
                    ))}
                </div>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </article>
  );
}
