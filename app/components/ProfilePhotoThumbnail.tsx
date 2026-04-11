'use client';

import React, { type ReactNode, useEffect, useMemo, useState } from 'react';

type ProfilePhotoThumbnailProps = {
  src?: string | null;
  alt?: string;
  name?: string | null;
  className: string;
  imageClassName?: string;
  fallback?: ReactNode;
  previewDisabled?: boolean;
  previewTitle?: string | null;
  previewDescription?: string | null;
  dataTestId?: string;
  loading?: 'eager' | 'lazy';
  decoding?: 'async' | 'sync' | 'auto';
  draggable?: boolean;
};

function resolveAltText(name?: string | null, alt?: string) {
  const trimmedAlt = typeof alt === 'string' ? alt.trim() : '';
  if (trimmedAlt) return trimmedAlt;

  const trimmedName = typeof name === 'string' ? name.trim() : '';
  return trimmedName ? `${trimmedName} 프로필 사진` : '프로필 사진';
}

function ProfilePhotoThumbnail({
  src,
  alt,
  name,
  className,
  imageClassName = '',
  fallback = null,
  previewDisabled = false,
  previewTitle,
  previewDescription,
  dataTestId,
  loading = 'lazy',
  decoding = 'async',
  draggable = false,
}: ProfilePhotoThumbnailProps) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const resolvedAlt = useMemo(() => resolveAltText(name, alt), [alt, name]);
  const resolvedPreviewTitle =
    (typeof previewTitle === 'string' && previewTitle.trim()) ||
    (typeof name === 'string' && name.trim() ? `${name.trim()} 사진` : '등록 사진');
  const resolvedPreviewDescription =
    (typeof previewDescription === 'string' && previewDescription.trim()) || '원본 크기로 확인할 수 있습니다.';

  useEffect(() => {
    if (!isPreviewOpen) return undefined;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsPreviewOpen(false);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isPreviewOpen]);

  useEffect(() => {
    if (!src && isPreviewOpen) {
      setIsPreviewOpen(false);
    }
  }, [isPreviewOpen, src]);

  if (!src) {
    return <div className={className}>{fallback}</div>;
  }

  const imageNode = (
    <img
      src={src}
      alt={resolvedAlt}
      className={`h-full w-full object-cover ${imageClassName}`.trim()}
      loading={loading}
      decoding={decoding}
      draggable={draggable}
    />
  );

  if (previewDisabled) {
    return (
      <div className={className} data-testid={dataTestId}>
        {imageNode}
      </div>
    );
  }

  return (
    <>
      <div
        data-testid={dataTestId}
        className={`${className} cursor-zoom-in transition-transform hover:scale-[1.02]`.trim()}
        onClick={(event) => {
          event.stopPropagation();
          setIsPreviewOpen(true);
        }}
        aria-label={`${resolvedAlt} 크게 보기`}
        title="사진 크게 보기"
      >
        {imageNode}
      </div>

      {isPreviewOpen ? (
        <div
          className="fixed inset-0 z-[180] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setIsPreviewOpen(false)}
        >
          <div
            className="w-full max-w-4xl overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/95 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-white">{resolvedPreviewTitle}</p>
                <p className="mt-1 text-xs font-medium text-slate-300">{resolvedPreviewDescription}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsPreviewOpen(false)}
                className="shrink-0 rounded-full border border-white/15 px-3 py-1.5 text-xs font-bold text-white transition hover:border-white/30 hover:bg-white/10"
              >
                닫기
              </button>
            </div>
            <div className="flex items-center justify-center bg-black/40 p-4 sm:p-6">
              <img
                src={src}
                alt={resolvedAlt}
                className="max-h-[78vh] w-full rounded-2xl object-contain"
                decoding={decoding}
                draggable={draggable}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default React.memo(ProfilePhotoThumbnail);
