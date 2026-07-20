'use client';

import { buildStorageInlineUrl, triggerManagedBrowserDownload } from '@/lib/object-storage-url';
import { logger } from '@/lib/logger';
import { toast } from '@/lib/toast';
import {
  useCallback,
  useEffect,
  useState } from 'react';
import {
  buildDownloadUrl,
  handleStorageDownloadLinkClick,
  type AttachmentPreviewItem } from './메신저첨부';
import type { ChatAttachmentPreviewController } from './메신저첨부미리보기훅';

type ChatAttachmentPreviewModalProps = {
  controller: ChatAttachmentPreviewController;
  onForwardAttachment?: (item: AttachmentPreviewItem & { messageId?: string | number | null }) => void;
};

const btnCls = 'h-10 min-w-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/25 text-white transition-colors';

export function ChatAttachmentPreviewModal({ controller }: ChatAttachmentPreviewModalProps) {
  const {
    preview, activeItem, previewCount, canNavigate,
    zoom, offset, isDragging, rotation,
    closePreview, movePreview, jumpToIndex, rotateImage, nudgeZoom,
    handleImageWheel, handleImagePointerDown, handleImagePointerMove,
    handleImagePointerUp, handleImageDoubleClick } = controller;

  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [downloadingAll, setDownloadingAll] = useState(false);

  useEffect(() => { setImageLoadFailed(false); }, [activeItem?.url]);
  useEffect(() => { setShowDownloadMenu(false); }, [activeItem?.url]);

  const handleDownloadAll = useCallback(async () => {
    if (!preview || downloadingAll) return;
    setDownloadingAll(true);
    setShowDownloadMenu(false);
    try {
      for (const item of preview.items) {
        await triggerManagedBrowserDownload(buildDownloadUrl(item.url, item.name ?? 'download'), item.name ?? 'download');
        await new Promise((r) => setTimeout(r, 400));
      }
      toast(`${preview.items.length}개 파일을 저장했습니다.`);
    } catch (err) {
      logger.error('download all failed', err);
      toast('일부 파일 저장에 실패했습니다.', 'error');
    } finally {
      setDownloadingAll(false);
    }
  }, [preview, downloadingAll]);

  if (!preview || !activeItem) return null;
  const activeViewUrl = buildStorageInlineUrl(activeItem.url, activeItem.name ?? '') || activeItem.url;
  const isImage = activeItem.kind === 'image';
  const hasThumbs = previewCount > 1;

  return (
    <div
      data-testid="chat-attachment-preview-modal"
      className="fixed inset-0 z-[var(--z-modal)] bg-black/92 flex flex-col"
      onClick={closePreview}
    >
      {/* 상단 바 */}
      <div
        className="flex items-center justify-between gap-2 px-3 pt-3 pb-2 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 좌: 파일명 + 카운터 */}
        <div className="flex flex-col min-w-0">
          <p className="text-white text-xs font-semibold truncate max-w-[200px] md:max-w-[320px]">
            {activeItem.name || '파일'}
          </p>
          {previewCount > 1 ? (
            <p className="text-white/60 text-[10px]">{preview.activeIndex + 1} / {previewCount}</p>
          ) : null}
        </div>

        {/* 우: 액션 버튼 */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* 줌 (이미지만) — 모바일에서도 노출 */}
          {isImage ? (
            <div className="flex items-center gap-0.5 rounded-full bg-white/10 px-1">
              <button type="button" onClick={() => nudgeZoom(-0.25)} className={btnCls} aria-label="축소">
                <span className="text-base leading-none">−</span>
              </button>
              <span className="text-white text-[10px] font-semibold w-9 text-center">{Math.round(zoom * 100)}%</span>
              <button type="button" onClick={() => nudgeZoom(0.25)} className={btnCls} aria-label="확대">
                <span className="text-base leading-none">+</span>
              </button>
            </div>
          ) : null}

          {/* 회전 (이미지만) */}
          {isImage ? (
            <>
              <button type="button" onClick={() => rotateImage('ccw')} className={btnCls} aria-label="왼쪽 회전" title="왼쪽 회전 (↺)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                  <path d="M3 3v5h5"/>
                </svg>
              </button>
              <button type="button" onClick={() => rotateImage('cw')} className={btnCls} aria-label="오른쪽 회전" title="오른쪽 회전 (↻)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                  <path d="M21 3v5h-5"/>
                </svg>
              </button>
            </>
          ) : null}

          {/* 새 창 */}
          <a href={activeViewUrl} target="_blank" rel="noopener noreferrer" className={btnCls} title="새 창으로 열기" onClick={(e) => e.stopPropagation()}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </a>

          {/* 다운로드 드롭다운 */}
          <div className="relative">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShowDownloadMenu((v) => !v); }}
              className={`${btnCls} gap-1 px-2 text-xs font-semibold`}
              aria-label="저장"
              title="저장"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            {showDownloadMenu ? (
              <div
                className="absolute right-0 top-12 z-10 min-w-[140px] rounded-[var(--radius-md)] bg-[var(--card)] border border-[var(--border)] shadow-lg py-1 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <a
                  href={buildDownloadUrl(activeItem.url, activeItem.name ?? '')}
                  onClick={(event) => { setShowDownloadMenu(false); void handleStorageDownloadLinkClick(event, activeItem.url, activeItem.name ?? 'download'); }}
                  download={activeItem.name ?? 'download'}
                  className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
                >
                  이것만 저장
                </a>
                {hasThumbs ? (
                  <button
                    type="button"
                    disabled={downloadingAll}
                    onClick={handleDownloadAll}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors disabled:opacity-50"
                  >
                    {downloadingAll ? '저장 중...' : `모두 저장 (${previewCount}개)`}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* 닫기 */}
          <button type="button" className={`${btnCls} text-lg`} onClick={closePreview} aria-label="닫기">✕</button>
        </div>
      </div>

      {/* 메인 콘텐츠 */}
      <div className="flex-1 relative flex items-center justify-center min-h-0" onClick={closePreview}>
        {/* 이전/다음 화살표 */}
        {canNavigate ? (
          <>
            <button
              type="button"
              data-testid="chat-attachment-preview-prev-button"
              onClick={(e) => { e.stopPropagation(); movePreview(-1); }}
              className="absolute left-2 top-1/2 z-10 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-black/40 hover:bg-black/60 text-white text-2xl transition-colors"
              aria-label="이전"
            >‹</button>
            <button
              type="button"
              data-testid="chat-attachment-preview-next-button"
              onClick={(e) => { e.stopPropagation(); movePreview(1); }}
              className="absolute right-2 top-1/2 z-10 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-black/40 hover:bg-black/60 text-white text-2xl transition-colors"
              aria-label="다음"
            >›</button>
          </>
        ) : null}

        {isImage ? (
          imageLoadFailed ? (
            <div
              className="flex min-h-[220px] w-full max-w-md items-center justify-center rounded-xl border border-white/15 bg-white/10 px-6 text-center text-sm font-semibold text-white"
              onClick={(e) => e.stopPropagation()}
            >
              이미지를 불러올 수 없습니다
            </div>
          ) : (
            // 줌 영역을 본문 전체로 채워, 확대 시 사진이 작은 박스에 갇히지 않고
            // 화면 전체로 확대되도록 한다(overflow-hidden 은 상·하단 바를 침범하지 않게 유지).
            <div
              className={`flex h-full w-full items-center justify-center overflow-hidden p-2 ${zoom > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'}`}
              style={{ touchAction: zoom > 1 ? 'none' : 'manipulation' }}
              onWheel={handleImageWheel}
              onPointerDown={handleImagePointerDown}
              onPointerMove={handleImagePointerMove}
              onPointerUp={handleImagePointerUp}
              onPointerCancel={handleImagePointerUp}
              onDoubleClick={handleImageDoubleClick}
              onClick={(e) => { if (e.target === e.currentTarget) closePreview(); }}
            >
              <img
                src={activeViewUrl}
                alt={activeItem.name || '미리보기'}
                data-testid="chat-attachment-preview-image"
                className="rounded-xl object-contain shadow-sm select-none"
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${zoom}) rotate(${rotation}deg)`,
                  transformOrigin: 'center center',
                  transition: isDragging ? 'none' : 'transform 160ms ease' }}
                draggable={false}
                onClick={(e) => e.stopPropagation()}
                onError={() => setImageLoadFailed(true)}
              />
            </div>
          )
        ) : (
          <div className="flex max-h-full max-w-[92vw] items-center justify-center p-2" onClick={(e) => e.stopPropagation()}>
            {activeItem.kind === 'video' ? (
              <video src={activeViewUrl} controls autoPlay playsInline className="max-w-[92vw] max-h-[calc(100vh-160px)] rounded-xl bg-black shadow-sm" />
            ) : /\.pdf(\?|#|$)/i.test(activeItem.url) ? (
              <iframe src={activeViewUrl} title={activeItem.name} className="w-[92vw] h-[calc(100vh-160px)] rounded-xl bg-[var(--card)] shadow-sm" />
            ) : (
              <div className="w-full max-w-md rounded-[var(--radius-xl)] bg-[var(--card)] p-6 shadow-sm text-left">
                <p className="text-sm font-bold text-[var(--foreground)] break-all">{activeItem.name}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <a href={activeViewUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-bold text-white">새 창 열기</a>
                  <a
                    href={buildDownloadUrl(activeItem.url, activeItem.name ?? '')}
                    onClick={(event) => void handleStorageDownloadLinkClick(event, activeItem.url, activeItem.name ?? 'download')}
                    download={activeItem.name ?? 'download'}
                    className="inline-flex items-center rounded-lg bg-[var(--tab-bg)] px-3 py-2 text-xs font-bold text-[var(--foreground)]"
                  >다운로드</a>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 하단 썸네일 스트립 */}
      {hasThumbs ? (
        <div className="shrink-0 pb-3 pt-2 px-3" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-center gap-1.5 overflow-x-auto scrollbar-none">
            {preview.items.map((item, idx) => {
              const thumbUrl = buildStorageInlineUrl(item.url, item.name ?? '');
              const isActive = idx === preview.activeIndex;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => jumpToIndex(idx)}
                  className={`shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-all ${isActive ? 'border-white scale-105' : 'border-transparent opacity-50 hover:opacity-80'}`}
                  aria-label={`${idx + 1}번째 파일로 이동`}
                >
                  {item.kind === 'image' ? (
                    <img src={thumbUrl} alt="" loading="lazy" className="w-full h-full object-cover" />
                  ) : item.kind === 'video' ? (
                    <div className="w-full h-full bg-white/15 flex items-center justify-center text-white text-lg">▶</div>
                  ) : (
                    <div className="w-full h-full bg-white/15 flex items-center justify-center text-white text-[9px] font-bold px-1 text-center leading-tight">
                      {(item.name || '').split('.').pop()?.toUpperCase() || 'FILE'}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
