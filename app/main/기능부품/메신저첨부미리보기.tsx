'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import {
  buildDownloadUrl,
  getAttachmentDisplayName,
  handleStorageDownloadLinkClick,
  resolveAttachmentKind,
  type AttachmentPreview as AttachmentPreviewState,
  type AttachmentPreviewItem,
  type AttachmentPreviewKind,
} from './메신저첨부';

type AttachmentDragState = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
} | null;

export function useChatAttachmentPreview() {
  const [preview, setPreview] = useState<AttachmentPreviewState | null>(null);
  const activeItem = preview ? preview.items[preview.activeIndex] ?? null : null;
  const previewCount = preview?.items.length ?? 0;
  const canNavigate = previewCount > 1;

  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const zoomRef = useRef(1);
  const offsetRef = useRef({ x: 0, y: 0 });
  const dragRef = useRef<AttachmentDragState>(null);

  const closePreview = useCallback(() => {
    setPreview(null);
  }, []);

  const resetTransform = useCallback(() => {
    dragRef.current = null;
    setIsDragging(false);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  const buildPreviewItem = useCallback(
    (
      url: string | null | undefined,
      fileName?: string | null,
      forcedKind?: AttachmentPreviewKind,
    ): AttachmentPreviewItem | null => {
      const resolvedUrl = String(url || '').trim();
      if (!resolvedUrl) return null;

      return {
        url: resolvedUrl,
        name: getAttachmentDisplayName(fileName, resolvedUrl),
        kind: forcedKind || resolveAttachmentKind(resolvedUrl, null),
      };
    },
    []
  );

  const openPreviewGallery = useCallback((items: AttachmentPreviewItem[], startIndex = 0) => {
    const normalizedItems = items.filter((item) => String(item?.url || '').trim());
    if (!normalizedItems.length) return;

    const normalizedIndex = Math.max(0, Math.min(normalizedItems.length - 1, startIndex));
    setPreview({
      items: normalizedItems,
      activeIndex: normalizedIndex,
    });
  }, []);

  const openPreview = useCallback(
    (url: string | null | undefined, fileName?: string | null, forcedKind?: AttachmentPreviewKind) => {
      const previewItem = buildPreviewItem(url, fileName, forcedKind);
      if (!previewItem) return;

      openPreviewGallery([previewItem], 0);
    },
    [buildPreviewItem, openPreviewGallery]
  );

  const movePreview = useCallback((delta: number) => {
    setPreview((prev) => {
      if (!prev || prev.items.length <= 1) return prev;

      const nextIndex = (prev.activeIndex + delta + prev.items.length) % prev.items.length;
      if (nextIndex === prev.activeIndex) return prev;

      return {
        ...prev,
        activeIndex: nextIndex,
      };
    });
  }, []);

  const applyZoom = useCallback((nextZoom: number) => {
    const clamped = Math.max(1, Math.min(4, Number(nextZoom.toFixed(2))));
    setZoom(clamped);
    if (clamped <= 1) {
      dragRef.current = null;
      setIsDragging(false);
      setOffset({ x: 0, y: 0 });
    }
  }, []);

  const nudgeZoom = useCallback(
    (delta: number) => {
      applyZoom(zoomRef.current + delta);
    },
    [applyZoom]
  );

  const handleImageWheel = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      nudgeZoom(event.deltaY < 0 ? 0.25 : -0.25);
    },
    [nudgeZoom]
  );

  const handleImagePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (zoomRef.current <= 1) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: offsetRef.current.x,
      originY: offsetRef.current.y,
    };
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const handleImagePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    setOffset({
      x: drag.originX + (event.clientX - drag.startX),
      y: drag.originY + (event.clientY - drag.startY),
    });
  }, []);

  const handleImagePointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const handleImageDoubleClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      applyZoom(zoomRef.current > 1 ? 1 : 2);
    },
    [applyZoom]
  );

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  useEffect(() => {
    resetTransform();
  }, [activeItem?.kind, activeItem?.url, resetTransform]);

  useEffect(() => {
    if (!preview) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closePreview();
        return;
      }

      if (!canNavigate) return;

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        movePreview(-1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        movePreview(1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [preview, canNavigate, closePreview, movePreview]);

  useEffect(() => {
    if (!activeItem) return;

    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (activeItem.kind !== 'image') return;
      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        nudgeZoom(0.25);
      } else if (event.key === '-') {
        event.preventDefault();
        nudgeZoom(-0.25);
      } else if (event.key === '0') {
        event.preventDefault();
        applyZoom(1);
      }
    };

    window.addEventListener('keydown', handleWindowKeyDown);
    return () => window.removeEventListener('keydown', handleWindowKeyDown);
  }, [activeItem, applyZoom, nudgeZoom]);

  return {
    preview,
    activeItem,
    previewCount,
    canNavigate,
    zoom,
    offset,
    isDragging,
    buildPreviewItem,
    openPreviewGallery,
    openPreview,
    closePreview,
    movePreview,
    resetTransform,
    nudgeZoom,
    handleImageWheel,
    handleImagePointerDown,
    handleImagePointerMove,
    handleImagePointerUp,
    handleImageDoubleClick,
  };
}

export type ChatAttachmentPreviewController = ReturnType<typeof useChatAttachmentPreview>;

type ChatAttachmentPreviewModalProps = {
  controller: ChatAttachmentPreviewController;
  onForwardAttachment?: (item: AttachmentPreviewItem & { messageId?: string | number | null }) => void;
};

export function ChatAttachmentPreviewModal({ controller }: ChatAttachmentPreviewModalProps) {
  const {
    preview,
    activeItem,
    previewCount,
    canNavigate,
    zoom,
    offset,
    isDragging,
    closePreview,
    movePreview,
    resetTransform,
    nudgeZoom,
    handleImageWheel,
    handleImagePointerDown,
    handleImagePointerMove,
    handleImagePointerUp,
    handleImageDoubleClick,
  } = controller;
  const [imageLoadFailed, setImageLoadFailed] = useState(false);

  useEffect(() => {
    setImageLoadFailed(false);
  }, [activeItem?.url]);

  if (!preview || !activeItem) return null;

  return (
    <div
      data-testid="chat-attachment-preview-modal"
      className="fixed inset-0 z-[140] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={closePreview}
    >
      <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-3 p-3 text-white">
        <div className="flex items-center gap-2">
          {activeItem.kind === 'image' ? (
            <div className="flex items-center gap-1 rounded-full bg-white/10 p-1">
              <button
                type="button"
                onClick={() => nudgeZoom(-0.25)}
                className="h-11 min-w-11 rounded-full px-2 text-sm font-bold transition-colors hover:bg-white/15"
                aria-label="축소"
              >
                -
              </button>
              <button
                type="button"
                onClick={resetTransform}
                className="h-11 min-w-[72px] rounded-full px-3 text-[11px] font-bold transition-colors hover:bg-white/15"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                onClick={() => nudgeZoom(0.25)}
                className="h-11 min-w-11 rounded-full px-2 text-sm font-bold transition-colors hover:bg-white/15"
                aria-label="확대"
              >
                +
              </button>
            </div>
          ) : null}
          {previewCount > 1 ? (
            <div
              data-testid="chat-attachment-preview-counter"
              className="rounded-full bg-white/15 px-3 py-2 text-[11px] font-semibold shadow-sm"
            >
              {preview.activeIndex + 1} / {previewCount}
            </div>
          ) : null}
        </div>
        <a
          href={activeItem.url}
          target="_blank"
          rel="noopener noreferrer"
          className="h-11 inline-flex items-center justify-center rounded-full bg-white/15 hover:bg-white/30 px-4 text-white text-xs font-semibold transition-colors"
        >
          새 창
        </a>
        <a
          href={buildDownloadUrl(activeItem.url, activeItem.name ?? '')}
          onClick={(event) =>
            void handleStorageDownloadLinkClick(
              event,
              activeItem.url,
              activeItem.name ?? 'download',
            )
          }
          download={activeItem.name ?? 'download'}
          target="_blank"
          rel="noopener noreferrer"
          className="h-11 inline-flex items-center justify-center rounded-full bg-white/15 hover:bg-white/30 px-4 text-white text-xs font-semibold transition-colors"
          aria-label="다운로드"
        >
          다운로드
        </a>
        <button
          type="button"
          className="w-11 h-11 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/30 text-white text-2xl font-light transition-colors"
          onClick={closePreview}
          aria-label="닫기"
        >
          ✕
        </button>
      </div>
      {canNavigate && activeItem.kind === 'image' ? (
        <>
          <button
            type="button"
            data-testid="chat-attachment-preview-prev-button"
            onClick={(event) => {
              event.stopPropagation();
              movePreview(-1);
            }}
            className="absolute top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-2xl text-white transition-colors hover:bg-white/30"
            style={{ left: 'max(12px, calc(var(--sidebar-width, 72px) + 12px))' }}
            aria-label="이전 사진"
          >
            ‹
          </button>
          <button
            type="button"
            data-testid="chat-attachment-preview-next-button"
            onClick={(event) => {
              event.stopPropagation();
              movePreview(1);
            }}
            className="absolute right-3 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-2xl text-white transition-colors hover:bg-white/30 md:right-6"
            aria-label="다음 사진"
          >
            ›
          </button>
        </>
      ) : null}
      <div
        className="max-w-[92vw] max-h-[88vh] w-full flex items-center justify-center"
        onClick={(event) => event.stopPropagation()}
      >
        {activeItem.kind === 'image' ? (
          imageLoadFailed ? (
            <div className="flex min-h-[220px] w-full max-w-md items-center justify-center rounded-xl border border-white/15 bg-white/10 px-6 text-center text-sm font-semibold text-white">
              이미지를 불러올 수 없습니다
            </div>
          ) : (
          <div
            className={`flex max-w-[92vw] max-h-[80vh] items-center justify-center overflow-hidden rounded-xl ${zoom > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'}`}
            style={{ touchAction: zoom > 1 ? 'none' : 'manipulation' }}
            onWheel={handleImageWheel}
            onPointerDown={handleImagePointerDown}
            onPointerMove={handleImagePointerMove}
            onPointerUp={handleImagePointerUp}
            onPointerCancel={handleImagePointerUp}
            onDoubleClick={handleImageDoubleClick}
          >
            <img
              src={activeItem.url}
              alt={activeItem.name || '미리보기'}
              data-testid="chat-attachment-preview-image"
              className="max-w-[92vw] max-h-[80vh] rounded-xl object-contain shadow-sm select-none"
              style={{
                transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${zoom})`,
                transformOrigin: 'center center',
                transition: isDragging ? 'none' : 'transform 160ms ease',
              }}
              draggable={false}
              onError={() => setImageLoadFailed(true)}
            />
          </div>
          )
        ) : activeItem.kind === 'video' ? (
          <video
            src={activeItem.url}
            controls
            autoPlay
            playsInline
            className="max-w-[92vw] max-h-[88vh] rounded-xl bg-black shadow-sm"
          />
        ) : /\.pdf(\?|#|$)/i.test(activeItem.url) ? (
          <iframe
            src={activeItem.url}
            title={activeItem.name}
            className="w-[92vw] h-[88vh] rounded-xl bg-[var(--card)] shadow-sm"
          />
        ) : (
          <div className="w-full max-w-md rounded-[var(--radius-xl)] bg-[var(--card)] p-6 shadow-sm text-left">
            <p className="text-sm font-bold text-[var(--foreground)] break-all">{activeItem.name}</p>
            <p className="mt-2 text-xs text-[var(--toss-gray-4)] break-all">{activeItem.url}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <a
                href={activeItem.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-bold text-white"
              >
                새 창 열기
              </a>
              <a
                href={buildDownloadUrl(activeItem.url, activeItem.name ?? '')}
                onClick={(event) =>
                  void handleStorageDownloadLinkClick(
                    event,
                    activeItem.url,
                    activeItem.name ?? 'download',
                  )
                }
                download={activeItem.name ?? 'download'}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-lg bg-[var(--tab-bg)] px-3 py-2 text-xs font-bold text-[var(--foreground)]"
              >
                다운로드
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
