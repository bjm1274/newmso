'use client';

import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type SyntheticEvent,
} from 'react';
import { Paperclip, Video } from './lucide-shim';
import { toast } from '@/lib/toast';
import {
  buildManagedDownloadUrl,
  handleManagedDownloadClick,
} from './공통/managed-download';
import type { AttachmentPreviewKind } from './메신저첨부';

export type AttachmentQuickActionsVariant = 'pill' | 'subtle' | 'overlay';

type AttachmentQuickActionsProps = {
  url: string;
  name: string;
  onPreview: () => void;
  onReply?: (() => void) | null;
  replyTestId?: string;
  variant?: AttachmentQuickActionsVariant;
  className?: string;
};

export type AttachmentListCardProps = {
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
  onMediaLoad?: (() => void) | null;
};

export type DeferredAttachmentImageProps = {
  src: string;
  alt: string;
  className?: string;
  wrapperClassName?: string;
  placeholderClassName?: string;
  fetchPriority?: 'high' | 'low' | 'auto';
  rootMargin?: string;
  onLoad?: (() => void) | null;
  onError?: ((event: SyntheticEvent<HTMLImageElement>) => void) | null;
};

function buildDownloadUrl(fileUrl: string, fileName: string): string {
  return buildManagedDownloadUrl(fileUrl, fileName);
}

async function handleStorageDownloadLinkClick(
  event: ReactMouseEvent<HTMLAnchorElement>,
  fileUrl: string,
  fileName: string,
) {
  await handleManagedDownloadClick(event, fileUrl, fileName, {
    logLabel: 'managed download',
    stopPropagation: true,
  });
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
    pill: `${actionClassByVariant.pill} bg-[var(--tab-bg)] text-[var(--toss-gray-4)] hover:text-[var(--toss-gray-4)]`,
    subtle: `${actionClassByVariant.subtle} text-[var(--toss-gray-4)] hover:text-[var(--toss-gray-4)]`,
    overlay: actionClassByVariant.overlay,
  };

  const downloadClassByVariant: Record<AttachmentQuickActionsVariant, string> = {
    pill: `${actionClassByVariant.pill} bg-[var(--success-light)] text-[var(--success)] hover:opacity-80`,
    subtle: `${actionClassByVariant.subtle} text-[var(--success)] hover:opacity-80`,
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

export function DeferredAttachmentImage({
  src,
  alt,
  className = '',
  wrapperClassName = '',
  placeholderClassName = '',
  fetchPriority = 'auto',
  rootMargin = '160px',
  onLoad,
  onError,
}: DeferredAttachmentImageProps) {
  const hostRef = useRef<HTMLSpanElement | null>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    setShouldLoad(false);
  }, [src]);

  useEffect(() => {
    const normalizedSrc = String(src || '').trim();
    if (!normalizedSrc) return;

    const host = hostRef.current;
    if (!host) return;

    if (typeof window === 'undefined' || typeof window.IntersectionObserver === 'undefined') {
      setShouldLoad(true);
      return;
    }

    let active = true;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!active) return;
        if (!entries.some((entry) => entry.isIntersecting || entry.intersectionRatio > 0)) return;
        setShouldLoad(true);
        observer.disconnect();
      },
      { rootMargin },
    );

    observer.observe(host);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [rootMargin, src]);

  return (
    <span ref={hostRef} className={`block ${wrapperClassName}`}>
      {shouldLoad ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          fetchPriority={fetchPriority}
          onLoad={() => onLoad?.()}
          onError={(event) => onError?.(event)}
          className={className}
        />
      ) : (
        <span
          aria-hidden="true"
          className={`block ${placeholderClassName || className}`}
        />
      )}
    </span>
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
  onMediaLoad,
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
              <DeferredAttachmentImage
                src={url}
                alt={name}
                wrapperClassName="w-[200px] md:w-[240px]"
                placeholderClassName="aspect-[4/3] w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] animate-pulse"
                onLoad={onMediaLoad}
                onError={(event) => {
                  const target = event.currentTarget;
                  target.style.display = 'none';
                  const parent = target.parentElement;
                  if (!parent || parent.querySelector('[data-chat-image-error="true"]')) return;
                  const fallback = document.createElement('div');
                  fallback.dataset.chatImageError = 'true';
                  fallback.className = 'flex items-center justify-center w-full aspect-[4/3] rounded-[var(--radius-md)] bg-[var(--muted)] border border-[var(--border)] text-xs text-[var(--toss-gray-3)]';
                  fallback.textContent = '이미지를 불러올 수 없습니다';
                  parent.appendChild(fallback);
                }}
                className="block h-auto max-h-[200px] w-full rounded-[var(--radius-md)] border border-[var(--border)] object-cover cursor-zoom-in"
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
          <video
            controls
            preload="metadata"
            onLoadedMetadata={() => onMediaLoad?.()}
            className="max-w-[200px] md:max-w-[240px] max-h-[200px] rounded-[var(--radius-md)] bg-black border border-[var(--border)]"
          >
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
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent-light)] text-[var(--accent)]">
            <Paperclip size={20} strokeWidth={2} />
          </div>
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
      className={`p-3 bg-[var(--tab-bg)] rounded-[var(--radius-lg)] border border-[var(--border)] ${
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
          className={`shrink-0 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] ${
            kind === 'image' || kind === 'video'
              ? 'w-14 h-14 bg-black/80'
              : 'w-12 h-12 bg-[var(--card)] flex items-center justify-center text-lg'
          }`}
        >
          {kind === 'image' ? (
            <DeferredAttachmentImage
              src={url}
              alt={name}
              onLoad={onMediaLoad}
              wrapperClassName="h-full w-full"
              placeholderClassName="h-full w-full rounded-[inherit] bg-[var(--muted)] animate-pulse"
              className="h-full w-full object-cover"
            />
          ) : kind === 'video' ? (
            <div className="flex h-full w-full items-center justify-center text-white">
              <Video size={20} strokeWidth={2} />
            </div>
          ) : (
            <Paperclip size={18} strokeWidth={2} />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="text-[11px] font-bold text-foreground truncate">{name}</p>
            {badgeLabel ? (
              <span className="px-1.5 py-0.5 rounded bg-[var(--card)] text-[9px] font-bold text-[var(--toss-gray-4)] shrink-0">
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
