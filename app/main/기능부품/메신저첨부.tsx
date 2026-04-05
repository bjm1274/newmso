'use client';

import type { MouseEvent as ReactMouseEvent } from 'react';
import { toast } from '@/lib/toast';
import {
  buildStorageDownloadUrl,
  extractStorageUrlExtension,
  shouldUseManagedBrowserDownload,
  triggerManagedBrowserDownload,
} from '@/lib/object-storage-url';
import type { ChatMessage } from '@/types';

export type AttachmentPreviewKind = 'image' | 'video' | 'file';

export type AttachmentPreviewItem = {
  url: string;
  name: string;
  kind: AttachmentPreviewKind;
};

export type AttachmentPreview = {
  items: AttachmentPreviewItem[];
  activeIndex: number;
};

type AttachmentQuickActionsVariant = 'pill' | 'subtle' | 'overlay';

type AttachmentQuickActionsProps = {
  url: string;
  name: string;
  onPreview: () => void;
  onReply?: (() => void) | null;
  replyTestId?: string;
  variant?: AttachmentQuickActionsVariant;
  className?: string;
};

type AttachmentListCardProps = {
  url: string;
  name: string;
  kind: AttachmentPreviewKind;
  summary?: string | null;
  meta?: string | null;
  badgeLabel?: string | null;
  onPreview: () => void;
  onReply?: (() => void) | null;
  replyTestId?: string;
  onActivate?: (() => void) | null;
  actionVariant?: AttachmentQuickActionsVariant;
  layout?: 'list' | 'bubble';
  tone?: 'default' | 'accent';
  className?: string;
};

export function stripHiddenMessageMetaBlocks(value: unknown): string {
  return String(value || '')
    .replace(/\[\[SCHEDULE_META\]\][\s\S]*?\[\[\/SCHEDULE_META\]\]/g, '')
    .replace(/\[\[BOARD_META\]\][\s\S]*?\[\[\/BOARD_META\]\]/g, '')
    .replace(/\[\[WARD_MESSAGE_META\]\][\s\S]*?\[\[\/WARD_MESSAGE_META\]\]/g, '')
    .trim();
}

export function buildDownloadUrl(fileUrl: string, fileName: string): string {
  return buildStorageDownloadUrl(fileUrl, fileName);
}

export async function handleStorageDownloadLinkClick(
  event: ReactMouseEvent<HTMLAnchorElement>,
  fileUrl: string,
  fileName: string,
) {
  event.stopPropagation();
  const downloadUrl = buildDownloadUrl(fileUrl, fileName);
  if (!downloadUrl) {
    event.preventDefault();
    toast('다운로드 주소를 만들지 못했습니다.', 'error');
    return;
  }
  if (!shouldUseManagedBrowserDownload()) {
    return;
  }
  event.preventDefault();
  try {
    await triggerManagedBrowserDownload(downloadUrl, fileName);
  } catch (error) {
    console.error('managed download failed', error);
    toast('모바일 다운로드에 실패했습니다. 다시 시도해 주세요.', 'error');
  }
}

function isImageUrl(url: string): boolean {
  const ext = extractStorageUrlExtension(url);
  return /^(jpg|jpeg|png|gif|webp|bmp|svg|heic|heif|avif)$/.test(ext || '');
}

function isVideoUrl(url: string): boolean {
  const ext = extractStorageUrlExtension(url);
  return /^(mp4|webm|mov|m4v|avi|mkv)$/.test(ext || '');
}

export function resolveAttachmentKind(
  fileUrl: unknown,
  fileKind: unknown,
): AttachmentPreviewKind {
  const normalizedKind = String(fileKind || '').trim().toLowerCase();
  if (normalizedKind === 'image') return 'image';
  if (normalizedKind === 'video') return 'video';
  const resolvedUrl = String(fileUrl || '');
  return isImageUrl(resolvedUrl) ? 'image' : isVideoUrl(resolvedUrl) ? 'video' : 'file';
}

export function sortAlbumMessages<T extends Pick<ChatMessage, 'album_index' | 'created_at'>>(messages: T[]): T[] {
  return [...messages].sort((a, b) => {
    const aIndex = Number.isFinite(Number(a.album_index)) ? Number(a.album_index) : Number.MAX_SAFE_INTEGER;
    const bIndex = Number.isFinite(Number(b.album_index)) ? Number(b.album_index) : Number.MAX_SAFE_INTEGER;

    if (aIndex !== bIndex) return aIndex - bIndex;

    return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
  });
}

export function extractFirstLinkUrl(value: string | null | undefined): string {
  const urlMatch = String(value || '').match(/https?:\/\/[^\s]+/);
  return urlMatch ? urlMatch[0] : '';
}

export function extractFileNameFromUrl(url: string | null | undefined): string {
  const rawUrl = String(url || '').trim();
  if (!rawUrl) return '첨부파일';
  try {
    const parsed = new URL(rawUrl, 'https://local-storage-proxy.test');
    const keyFromQuery = parsed.searchParams.get('key');
    const source = decodeURIComponent(keyFromQuery || parsed.pathname || '');
    const lastSegment = decodeURIComponent(source.split('/').pop() || '') || '첨부파일';
    const withOriginal = lastSegment.match(/^\d+_[0-9a-f-]{36}__(.+)$/i);
    if (withOriginal) return withOriginal[1];
    const uuidOnly = lastSegment.match(/^\d+_[0-9a-f-]{36}(\.[a-z0-9]+)?$/i);
    if (uuidOnly) return `첨부파일${uuidOnly[1] || ''}`;
    return lastSegment;
  } catch {
    const withoutQuery = rawUrl.split('?')[0] || '';
    const lastSegment = decodeURIComponent(withoutQuery.split('/').pop() || '') || '첨부파일';
    const withOriginal = lastSegment.match(/^\d+_[0-9a-f-]{36}__(.+)$/i);
    if (withOriginal) return withOriginal[1];
    const uuidOnly = lastSegment.match(/^\d+_[0-9a-f-]{36}(\.[a-z0-9]+)?$/i);
    if (uuidOnly) return `첨부파일${uuidOnly[1] || ''}`;
    return lastSegment;
  }
}

function guessFileExtension(file: File): string {
  const rawName = String(file.name || '').trim();
  const lastDotIndex = rawName.lastIndexOf('.');
  if (lastDotIndex > -1 && lastDotIndex < rawName.length - 1) {
    return rawName.slice(lastDotIndex + 1).toLowerCase();
  }

  const mime = String(file.type || '').toLowerCase();
  const mimeMap: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'image/avif': 'avif',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/bmp': 'bmp',
    'image/svg+xml': 'svg',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'application/pdf': 'pdf',
    'text/plain': 'txt',
    'application/zip': 'zip',
  };
  return mimeMap[mime] || 'bin';
}

export function getPendingAttachmentDisplayName(file: File): string {
  const rawName = String(file.name || '').trim();
  if (rawName) return rawName;
  const extension = guessFileExtension(file);
  if (String(file.type || '').startsWith('image/')) return `붙여넣은 이미지.${extension}`;
  if (String(file.type || '').startsWith('video/')) return `붙여넣은 동영상.${extension}`;
  return `첨부파일.${extension}`;
}

export function buildUploadRequestFileName(file: File): string {
  const rawName = String(file.name || '').trim();
  if (rawName) return rawName;
  return getPendingAttachmentDisplayName(file);
}

export function getAttachmentDisplayName(fileName: string | null | undefined, fileUrl?: string | null): string {
  const rawName = String(fileName || '').trim();
  if (rawName) return rawName;
  return extractFileNameFromUrl(fileUrl);
}

export function getMessageDisplayText(
  content: string | null | undefined,
  fileName?: string | null,
  fileUrl?: string | null,
  fallback: unknown = '',
): string {
  const rawContent = stripHiddenMessageMetaBlocks(content);
  if (rawContent) return rawContent;
  if (String(fileName || '').trim() || String(fileUrl || '').trim()) {
    return getAttachmentDisplayName(fileName, fileUrl);
  }
  return String(fallback ?? '');
}

export function getDeletedMessagePreviewText() {
  return '삭제된 메시지입니다.';
}

export function AttachmentQuickActions({
  url,
  name,
  onPreview,
  onReply,
  replyTestId,
  variant = 'pill',
  className = '',
}: AttachmentQuickActionsProps) {
  const handleShare = async (event: { preventDefault?: () => void; stopPropagation?: () => void }) => {
    event.preventDefault?.();
    event.stopPropagation?.();
    try {
      if (!navigator?.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(url);
      toast('공유 링크를 복사했습니다.');
    } catch {
      toast('공유 링크 복사에 실패했습니다.', 'error');
    }
  };

  const actionClassByVariant: Record<AttachmentQuickActionsVariant, string> = {
    pill: 'px-2 py-1 rounded-md text-[10px] font-bold',
    subtle: 'text-[10px] font-bold hover:underline underline-offset-2',
    overlay: 'pointer-events-auto px-2 py-1 rounded-[var(--radius-md)] bg-black/40 hover:bg-black/60 text-white text-[10px] font-bold',
  };

  const previewClassByVariant: Record<AttachmentQuickActionsVariant, string> = {
    pill: `${actionClassByVariant.pill} bg-blue-500/10 dark:bg-blue-900/30 text-[var(--accent)] hover:text-blue-600`,
    subtle: `${actionClassByVariant.subtle} text-[var(--accent)] hover:text-blue-600`,
    overlay: actionClassByVariant.overlay,
  };

  const replyClassByVariant: Record<AttachmentQuickActionsVariant, string> = {
    pill: `${actionClassByVariant.pill} bg-amber-50 dark:bg-amber-900/30 text-amber-700 hover:text-amber-800`,
    subtle: `${actionClassByVariant.subtle} text-amber-700 hover:text-amber-800`,
    overlay: actionClassByVariant.overlay,
  };

  const shareClassByVariant: Record<AttachmentQuickActionsVariant, string> = {
    pill: `${actionClassByVariant.pill} bg-[var(--tab-bg)] dark:bg-zinc-800 text-[var(--toss-gray-4)] hover:text-[var(--toss-gray-4)]`,
    subtle: `${actionClassByVariant.subtle} text-[var(--toss-gray-4)] hover:text-[var(--toss-gray-4)]`,
    overlay: actionClassByVariant.overlay,
  };

  const downloadClassByVariant: Record<AttachmentQuickActionsVariant, string> = {
    pill: `${actionClassByVariant.pill} bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 hover:text-emerald-700`,
    subtle: `${actionClassByVariant.subtle} text-emerald-600 hover:text-emerald-700`,
    overlay: actionClassByVariant.overlay,
  };

  return (
    <div className={`flex items-center gap-1.5 flex-wrap ${className}`}>
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onPreview();
        }}
        className={previewClassByVariant[variant]}
      >
        미리보기
      </button>
      {onReply ? (
        <button
          type="button"
          data-testid={replyTestId}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onReply();
          }}
          className={replyClassByVariant[variant]}
        >
          답글
        </button>
      ) : null}
      <button type="button" onClick={handleShare} className={shareClassByVariant[variant]}>
        공유
      </button>
      <a
        href={buildDownloadUrl(url, name)}
        onClick={(event) => void handleStorageDownloadLinkClick(event, url, name)}
        download={name}
        target="_blank"
        rel="noopener noreferrer"
        className={downloadClassByVariant[variant]}
      >
        다운로드
      </a>
    </div>
  );
}

export function AttachmentListCard({
  url,
  name,
  kind,
  summary,
  meta,
  badgeLabel,
  onPreview,
  onReply,
  replyTestId,
  onActivate,
  actionVariant = 'subtle',
  layout = 'list',
  tone = 'default',
  className = '',
}: AttachmentListCardProps) {
  const isClickable = typeof onActivate === 'function';
  const bubbleAlignmentClass = tone === 'accent' ? 'items-end text-right' : 'items-start text-left';

  if (layout === 'bubble') {
    if (kind === 'image') {
      return (
        <div className={`inline-flex max-w-full flex-col gap-1 ${bubbleAlignmentClass} ${className}`}>
          <div className="relative group inline-block">
            <button
              type="button"
              className="block"
              onClick={onPreview}
              aria-label={`${name || '첨부 이미지'} 미리보기`}
            >
              <img
                src={url}
                alt={name}
                className="max-w-[200px] md:max-w-[240px] max-h-[200px] rounded-[var(--radius-md)] object-cover cursor-zoom-in border border-[var(--border)]"
              />
            </button>
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity bg-black/40 flex items-center justify-center rounded-[var(--radius-md)] pointer-events-none px-2">
              <AttachmentQuickActions
                url={url}
                name={name}
                onPreview={onPreview}
                onReply={onReply}
                replyTestId={replyTestId}
                variant="overlay"
              />
            </div>
          </div>
        </div>
      );
    }

    if (kind === 'video') {
      return (
        <div className={`inline-flex max-w-full flex-col gap-1 ${bubbleAlignmentClass} ${className}`}>
          <video controls className="max-w-[200px] md:max-w-[240px] max-h-[200px] rounded-[var(--radius-md)] bg-black border border-[var(--border)]">
            <source src={url} />
          </video>
          <AttachmentQuickActions
            url={url}
            name={name}
            onPreview={onPreview}
            onReply={onReply}
            replyTestId={replyTestId}
            variant={tone === 'accent' ? 'overlay' : 'subtle'}
            className="mt-2"
          />
          <p className={`max-w-[200px] md:max-w-[240px] truncate text-[10px] font-semibold ${tone === 'accent' ? 'text-white/85' : 'text-[var(--toss-gray-4)]'}`}>
            {name}
          </p>
        </div>
      );
    }

    return (
      <div
        className={`inline-flex max-w-full min-w-0 flex-col p-3 rounded-[var(--radius-md)] border shadow-sm sm:min-w-[200px] ${
          tone === 'accent'
            ? 'bg-white/95 border-white/40 text-slate-900'
            : 'bg-[var(--toss-gray-0)] border-[var(--border)] text-[var(--foreground)]'
        } ${className}`}
      >
        <div className="flex items-start gap-3">
          <div className="text-3xl">📎</div>
          <div className="flex-1 min-w-0 pt-0.5">
            <p className="font-bold text-[12px] truncate mb-1 text-[var(--foreground)]">{name}</p>
            {summary ? (
              <p className="text-[10px] text-[var(--toss-gray-4)] leading-relaxed mb-1 line-clamp-2 break-words">
                {summary}
              </p>
            ) : null}
            <AttachmentQuickActions
              url={url}
              name={name}
              onPreview={onPreview}
              onReply={onReply}
              replyTestId={replyTestId}
              variant="pill"
              className="mt-2"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : -1}
      aria-label={isClickable ? `${name || '첨부 파일'} 열기` : undefined}
      onClick={() => onActivate?.()}
      onKeyDown={(event) => {
        if (!isClickable) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onActivate();
        }
      }}
      className={`p-3 bg-[var(--tab-bg)] dark:bg-zinc-900/50 rounded-xl border border-[var(--border-subtle)] dark:border-zinc-800 ${
        isClickable ? 'cursor-pointer hover:border-[var(--accent)] hover:shadow-sm transition-all' : ''
      } ${className}`}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onPreview();
          }}
          aria-label={`${name || '첨부 파일'} 미리보기`}
          className={`shrink-0 overflow-hidden rounded-xl border border-[var(--border)] ${
            kind === 'image' || kind === 'video'
              ? 'w-14 h-14 bg-black/80'
              : 'w-12 h-12 bg-[var(--card)] dark:bg-zinc-900 flex items-center justify-center text-lg'
          }`}
        >
          {kind === 'image' ? (
            <img src={url} alt={name} className="w-full h-full object-cover" />
          ) : kind === 'video' ? (
            <div className="w-full h-full flex items-center justify-center text-white text-lg">🎬</div>
          ) : (
            <span>📎</span>
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="text-[11px] font-bold text-foreground truncate">{name}</p>
            {badgeLabel ? (
              <span className="px-1.5 py-0.5 rounded bg-[var(--card)] dark:bg-zinc-800 text-[9px] font-bold text-[var(--toss-gray-4)] shrink-0">
                {badgeLabel}
              </span>
            ) : null}
          </div>
          {summary ? (
            <p className="text-[10px] text-[var(--toss-gray-4)] leading-relaxed mt-1 line-clamp-2 break-words">
              {summary}
            </p>
          ) : null}
          {meta ? (
            <p className="text-[10px] text-[var(--toss-gray-3)] mt-1 truncate">{meta}</p>
          ) : null}
          <AttachmentQuickActions
            url={url}
            name={name}
            onPreview={onPreview}
            onReply={onReply}
            replyTestId={replyTestId}
            variant={actionVariant}
            className="mt-2"
          />
        </div>
      </div>
    </div>
  );
}
