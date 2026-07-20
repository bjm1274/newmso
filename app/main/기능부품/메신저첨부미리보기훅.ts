'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent } from 'react';
import {
  getAttachmentDisplayName,
  resolveAttachmentKind,
  type AttachmentPreview as AttachmentPreviewState,
  type AttachmentPreviewItem,
  type AttachmentPreviewKind } from './메신저첨부';

type AttachmentDragState = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
} | null;

type PinchState = {
  pointers: Map<number, { x: number; y: number }>;
  startDistance: number;
  startZoom: number;
} | null;

export function useChatAttachmentPreview() {
  const [preview, setPreview] = useState<AttachmentPreviewState | null>(null);
  const activeItem = preview ? preview.items[preview.activeIndex] ?? null : null;
  const previewCount = preview?.items.length ?? 0;
  const canNavigate = previewCount > 1;

  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [rotation, setRotation] = useState(0);

  const zoomRef = useRef(1);
  const offsetRef = useRef({ x: 0, y: 0 });
  const dragRef = useRef<AttachmentDragState>(null);
  const pinchRef = useRef<PinchState>(null);
  const swipeStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const closePreview = useCallback(() => setPreview(null), []);

  const resetTransform = useCallback(() => {
    dragRef.current = null;
    setIsDragging(false);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setRotation(0);
  }, []);

  const buildPreviewItem = useCallback(
    (url: string | null | undefined, fileName?: string | null, forcedKind?: AttachmentPreviewKind): AttachmentPreviewItem | null => {
      const resolvedUrl = String(url || '').trim();
      if (!resolvedUrl) return null;
      return {
        url: resolvedUrl,
        name: getAttachmentDisplayName(fileName, resolvedUrl),
        kind: forcedKind || resolveAttachmentKind(resolvedUrl, null) };
    },
    []
  );

  const openPreviewGallery = useCallback((items: AttachmentPreviewItem[], startIndex = 0) => {
    const normalizedItems = items.filter((item) => String(item?.url || '').trim());
    if (!normalizedItems.length) return;
    const normalizedIndex = Math.max(0, Math.min(normalizedItems.length - 1, startIndex));
    setPreview({ items: normalizedItems, activeIndex: normalizedIndex });
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
      return { ...prev, activeIndex: nextIndex };
    });
  }, []);

  const jumpToIndex = useCallback((index: number) => {
    setPreview((prev) => {
      if (!prev || index < 0 || index >= prev.items.length || index === prev.activeIndex) return prev;
      return { ...prev, activeIndex: index };
    });
  }, []);

  const rotateImage = useCallback((direction: 'cw' | 'ccw') => {
    setRotation((prev) => (prev + (direction === 'cw' ? 90 : -90) + 360) % 360);
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

  const nudgeZoom = useCallback((delta: number) => { applyZoom(zoomRef.current + delta); }, [applyZoom]);

  const handleImageWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    nudgeZoom(event.deltaY < 0 ? 0.25 : -0.25);
  }, [nudgeZoom]);

  const handleImagePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    // 두 번째 손가락이 닿으면 핀치 줌 모드로 진입 (모바일/터치패드 멀티터치)
    if (event.pointerType === 'touch') {
      const pinch = pinchRef.current;
      if (!pinch) {
        pinchRef.current = {
          pointers: new Map([[event.pointerId, { x: event.clientX, y: event.clientY }]]),
          startDistance: 0,
          startZoom: zoomRef.current };
      } else {
        pinch.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pinch.pointers.size === 2) {
          const [a, b] = Array.from(pinch.pointers.values());
          pinch.startDistance = Math.hypot(a.x - b.x, a.y - b.y) || 1;
          pinch.startZoom = zoomRef.current;
          // 핀치 시작 시 드래그는 종료
          dragRef.current = null;
          setIsDragging(false);
        }
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        return;
      }
    }

    if (zoomRef.current <= 1) {
      // 줌 1x 상태에서 터치 단일 포인터 → 스와이프 내비게이션 감지 시작
      if (event.pointerType === 'touch') {
        swipeStartRef.current = { x: event.clientX, y: event.clientY, time: Date.now() };
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: offsetRef.current.x,
      originY: offsetRef.current.y };
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const handleImagePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const pinch = pinchRef.current;
    if (pinch && pinch.pointers.has(event.pointerId)) {
      pinch.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pinch.pointers.size >= 2 && pinch.startDistance > 0) {
        const [a, b] = Array.from(pinch.pointers.values());
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        const ratio = distance / pinch.startDistance;
        applyZoom(pinch.startZoom * ratio);
        event.preventDefault();
      }
      return;
    }

    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    setOffset({ x: drag.originX + (event.clientX - drag.startX), y: drag.originY + (event.clientY - drag.startY) });
  }, [applyZoom]);

  const handleImagePointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const pinch = pinchRef.current;
    if (pinch && pinch.pointers.has(event.pointerId)) {
      pinch.pointers.delete(event.pointerId);
      if (pinch.pointers.size < 2) {
        pinchRef.current = null;
      }
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      swipeStartRef.current = null;
      return;
    }

    // 스와이프 내비게이션 감지 (줌 1x, 터치, 수평 60px 이상, 500ms 이내)
    const swipeStart = swipeStartRef.current;
    if (swipeStart && event.pointerType === 'touch' && zoomRef.current <= 1) {
      swipeStartRef.current = null;
      const diffX = event.clientX - swipeStart.x;
      const diffY = event.clientY - swipeStart.y;
      const elapsed = Date.now() - swipeStart.time;
      if (Math.abs(diffX) > 60 && Math.abs(diffY) < 80 && elapsed < 500) {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        movePreview(diffX > 0 ? -1 : 1);
        return;
      }
    }
    swipeStartRef.current = null;

    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, [movePreview]);

  const handleImageDoubleClick = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    applyZoom(zoomRef.current > 1 ? 1 : 2);
  }, [applyZoom]);

  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { offsetRef.current = offset; }, [offset]);

  useEffect(() => {
    dragRef.current = null;
    setIsDragging(false);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setRotation(0);
  }, [activeItem?.url]);

  useEffect(() => {
    if (!preview) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closePreview(); return; }
      if (!canNavigate) return;
      if (event.key === 'ArrowLeft') { event.preventDefault(); movePreview(-1); }
      else if (event.key === 'ArrowRight') { event.preventDefault(); movePreview(1); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [preview, canNavigate, closePreview, movePreview]);

  useEffect(() => {
    if (!activeItem || activeItem.kind !== 'image') return;
    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key === '+' || event.key === '=') { event.preventDefault(); nudgeZoom(0.25); }
      else if (event.key === '-') { event.preventDefault(); nudgeZoom(-0.25); }
      else if (event.key === '0') { event.preventDefault(); applyZoom(1); }
    };
    window.addEventListener('keydown', handleWindowKeyDown);
    return () => window.removeEventListener('keydown', handleWindowKeyDown);
  }, [activeItem, applyZoom, nudgeZoom]);

  return {
    preview, activeItem, previewCount, canNavigate,
    zoom, offset, isDragging, rotation,
    buildPreviewItem, openPreviewGallery, openPreview,
    closePreview, movePreview, jumpToIndex, rotateImage, resetTransform, nudgeZoom,
    handleImageWheel, handleImagePointerDown, handleImagePointerMove,
    handleImagePointerUp, handleImageDoubleClick };
}

export type ChatAttachmentPreviewController = ReturnType<typeof useChatAttachmentPreview>;
