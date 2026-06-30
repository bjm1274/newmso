'use client';

import { useState } from 'react';
import type { AttachmentItem } from '@/types';
import { EmptyState } from '@/app/components/StatePanel';
import {
  buildManagedDownloadUrl,
  handleManagedDownloadClick } from '../공통/managed-download';
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
  onAttachmentPreview }: GuideDetailPanelProps) {
  // 모바일/데스크톱 공용 집중 몰입 모드 (Focus Mode)
  const [isFocusMode, setIsFocusMode] = useState(false);
  // 본문 폰트 크기 상태 (가독성 사용성 개선)
  const [fontSize, setFontSize] = useState<'sm' | 'base' | 'lg'>('base');

  if (!selectedResource) {
    return (
      <EmptyState
        title="공유자료를 선택해 주세요"
        description="왼쪽 목록에서 자료를 선택하면 상세 정보와 첨부 자료를 확인할 수 있습니다."
      />
    );
  }

  const fontClass =
    fontSize === 'sm'
      ? 'text-[12px] leading-6'
      : fontSize === 'lg'
        ? 'text-[15px] leading-8'
        : 'text-[13.5px] leading-7';

  return (
    <article
      data-testid="guide-detail"
      className={`overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] shadow-sm transition-all duration-300 ${
        isFocusMode ? 'ring-2 ring-[var(--accent)] shadow-md' : ''
      }`}
    >
      {/* ─────────────────────────────────────────────────────────────
          헤더 및 프리미엄 메타데이터 영역 (Sleek Gradient & Typography)
          ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 border-b border-[var(--border)] p-5 bg-gradient-to-br from-[var(--accent-light)]/30 via-transparent to-transparent">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="badge badge-blue !px-2.5 !py-1 !text-[10px] font-bold tracking-wide">
                {getGuideKindLabel(selectedResource.kind)}
              </span>
              <span className="badge badge-gray !px-2.5 !py-1 !text-[10px] font-bold tracking-wide">
                {getGuideAudienceLabel(selectedResource.audience)}
              </span>
              <span className="badge badge-gray !px-2.5 !py-1 !text-[10px] font-bold tracking-wide">
                {selectedResource.teamName || '미지정'}
              </span>
            </div>
            
            <h3 className="text-xl font-bold tracking-tight text-[var(--foreground)] leading-snug">
              {selectedResource.title}
            </h3>
            
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[var(--toss-gray-4)]">
              <span className="text-[var(--foreground)] font-bold">
                {selectedResource.author_name || '작성자 미상'}
              </span>
              <span className="text-[var(--border)]">|</span>
              <span>{selectedResource.companyName || activeCompanyLabel || '기본 기관'}</span>
              <span className="text-[var(--border)]">|</span>
              <span>{formatDate(selectedResource.updated_at || selectedResource.created_at)}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* 사용성 개선: 독서 편의용 폰트 제어 바 */}
            <div className="flex rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)]/50 p-0.5 text-xs font-bold shrink-0">
              {(['sm', 'base', 'lg'] as const).map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => setFontSize(sz)}
                  className={`rounded-[var(--radius-sm)] px-2 py-1 text-[10px] transition-colors ${
                    fontSize === sz
                      ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm'
                      : 'text-[var(--toss-gray-4)] hover:text-[var(--foreground)]'
                  }`}
                >
                  {sz === 'sm' ? '작게' : sz === 'lg' ? '크게' : '보통'}
                </button>
              ))}
            </div>

            {/* 사용성 개선: 몰입 독서 모드 토글 */}
            <button
              type="button"
              onClick={() => setIsFocusMode(!isFocusMode)}
              className={`rounded-[var(--radius-md)] px-3 py-1.5 text-[11px] font-bold transition-all shrink-0 ${
                isFocusMode
                  ? 'bg-[var(--accent)] text-white shadow-sm'
                  : 'bg-[var(--muted)] text-[var(--toss-gray-4)] border border-[var(--border)] hover:text-[var(--foreground)]'
              }`}
            >
              {isFocusMode ? '📖 집중모드 켬' : '📖 집중모드'}
            </button>

            {canEditSelected && (
              <div className="flex gap-1.5 border-l border-[var(--border)] pl-2">
                <button
                  type="button"
                  data-testid="guide-edit"
                  onClick={() => onEdit(selectedResource)}
                  className="btn-premium-secondary !py-1.5 !px-3 !text-[11px]"
                >
                  수정
                </button>
                <button
                  type="button"
                  data-testid="guide-delete"
                  onClick={() => void onDelete(selectedResource)}
                  className="btn-premium-danger !py-1.5 !px-3 !text-[11px]"
                >
                  삭제
                </button>
              </div>
            )}
          </div>
        </div>

        {selectedResource.keywords.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {selectedResource.keywords.map((keyword) => (
              <span key={keyword} className="badge badge-gray !bg-[var(--muted)] hover:!bg-[var(--border)] transition-colors cursor-default">
                #{keyword}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          가이드 가독성 본문 영역 (Sleek Typography & Focus Frame)
          ───────────────────────────────────────────────────────────── */}
      <div className="p-5 space-y-5">
        {selectedResource.mobileSummary && (
          <div className="bg-[var(--accent-light)]/40 border border-[var(--accent)]/15 rounded-[var(--radius-md)] p-3 text-xs font-bold text-[var(--accent)] flex items-center gap-2">
            <span className="text-sm shrink-0">📱</span>
            <span>한 줄 핵심 요약: {selectedResource.mobileSummary}</span>
          </div>
        )}

        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h4 className="text-[11px] font-bold text-[var(--toss-gray-4)] uppercase tracking-wider">📖 프로세스 가이드 설명</h4>
            <span className="text-[10px] font-medium text-[var(--toss-gray-4)]">드래그 및 확대 가능</span>
          </div>
          
          <div className={`whitespace-pre-wrap rounded-[var(--radius-lg)] border border-[var(--border)]/70 bg-[var(--muted)]/20 p-5 font-semibold text-[var(--foreground)] transition-all ${fontClass}`}>
            {selectedResource.description || '설명 없음'}
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────────────
            첨부자료 아카이브 카드 덱 디자인 (비주얼 기능성 & R2 스토리지)
            ───────────────────────────────────────────────────────────── */}
        <section className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h4 className="text-[11px] font-bold text-[var(--toss-gray-4)] uppercase tracking-wider">📎 고화질 첨부파일 및 참고도면</h4>
            <span className="badge badge-gray !px-2">{selectedResource.attachments.length}건</span>
          </div>

          {selectedResource.attachments.length === 0 ? (
            <EmptyState
              title="첨부된 자료가 없습니다"
              description="이 가이드와 연동된 참고 도면이나 PDF 문서가 없습니다."
              compact
            />
          ) : (
            <div className="space-y-4">
              {/* 문서/파일용 Toss 디자인 퀵 카드 덱 */}
              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
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
                        logLabel: 'guide attachment download' });
                    }}
                    className="flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3.5 transition-all hover:-translate-y-0.5 hover:border-[var(--accent)] hover:shadow-md group"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-bold text-[var(--foreground)] group-hover:text-[var(--accent)] transition-colors">
                        {attachment.name}
                      </p>
                      <p className="mt-0.5 text-[10px] font-bold tracking-wide text-[var(--toss-gray-4)] uppercase">
                        {attachment.type === 'image'
                          ? '참고도면 이미지'
                          : attachment.type === 'video'
                            ? '교육 동영상'
                            : '참조 문서'}
                      </p>
                    </div>
                    <span className="badge badge-blue shrink-0 !px-2.5 !py-1 !text-[10px] group-hover:bg-[var(--accent)] group-hover:text-white transition-colors">
                      열기
                    </span>
                  </a>
                ))}
              </div>

              {/* 이미지/도면용 전용 갤러리 프리미엄 슬롯 */}
              {selectedResource.attachments.some((attachment) => attachment.type === 'image') && (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                        className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)]/50 group block"
                      >
                        <img
                          src={attachment.url}
                          alt={attachment.name}
                          className="h-44 w-full cursor-zoom-in object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      </a>
                    ))}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </article>
  );
}
