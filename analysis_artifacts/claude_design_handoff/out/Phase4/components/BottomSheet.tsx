'use client';

/**
 * BottomSheet.tsx — Phase 4 모바일 바텀시트
 *
 * drag handle, snap points (half | full)
 * JM6: role="dialog", aria-modal, aria-labelledby, ESC 닫기
 * JM2: touchstart/touchmove/touchend 직접 핸들링 (framer-motion 불필요)
 */

import React, { useEffect, useRef, useId, useState, useCallback } from 'react';
import { X } from 'lucide-react';

export type SnapPoint = 'half' | 'full';

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  snapPoints?: SnapPoint[];
  initialSnap?: SnapPoint;
  showHandle?: boolean;
  showCloseButton?: boolean;
  children: React.ReactNode;
}

// ── snap → CSS height ────────────────────────────────────────────────────────

const SNAP_HEIGHT: Record<SnapPoint, string> = {
  half: '50vh',
  full: '92vh',
};

// ── 컴포넌트 ─────────────────────────────────────────────────────────────────

export default function BottomSheet({
  open,
  onClose,
  title,
  snapPoints = ['half', 'full'],
  initialSnap = 'half',
  showHandle = true,
  showCloseButton = true,
  children,
}: BottomSheetProps) {
  const titleId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  const [snap, setSnap] = useState<SnapPoint>(initialSnap);
  const [dragging, setDragging] = useState(false);

  // snap 초기화
  useEffect(() => { if (open) setSnap(initialSnap); }, [open, initialSnap]);

  // ESC 닫기 + 스크롤 락
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);

    const focusable = sheetRef.current?.querySelector<HTMLElement>(
      'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])',
    );
    focusable?.focus();

    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  // 드래그 핸들 — touch
  const touchStartY = useRef(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    setDragging(true);
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      setDragging(false);
      const delta = e.changedTouches[0].clientY - touchStartY.current;
      const threshold = 60;

      if (delta > threshold) {
        // 아래로 드래그
        const currentIdx = snapPoints.indexOf(snap);
        if (currentIdx === 0) {
          onClose();
        } else {
          setSnap(snapPoints[currentIdx - 1]);
        }
      } else if (delta < -threshold) {
        // 위로 드래그
        const currentIdx = snapPoints.indexOf(snap);
        if (currentIdx < snapPoints.length - 1) {
          setSnap(snapPoints[currentIdx + 1]);
        }
      }
    },
    [snap, snapPoints, onClose],
  );

  if (!open) return null;

  return (
    <>
      {/* 오버레이 */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.45)' }}
      />

      {/* 시트 */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className="fixed bottom-0 left-0 right-0 z-50 flex flex-col bg-[var(--card)] rounded-t-[var(--radius-2xl)] overflow-hidden"
        style={{
          height: SNAP_HEIGHT[snap],
          transition: dragging ? 'none' : 'height 0.3s cubic-bezier(0.32,0.72,0,1)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {/* 드래그 핸들 */}
        {showHandle && (
          <div
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            aria-hidden="true"
            className="flex justify-center items-center py-3 cursor-grab active:cursor-grabbing shrink-0"
            style={{ touchAction: 'none' }}
          >
            <div className="w-8 h-1 rounded-full bg-[var(--border)]" />
          </div>
        )}

        {/* 헤더 */}
        {(title || showCloseButton) && (
          <div className="flex items-center justify-between px-4 pb-3 shrink-0">
            {title && (
              <h2 id={titleId} className="text-base font-semibold text-[var(--foreground)]">
                {title}
              </h2>
            )}
            {showCloseButton && (
              <button
                type="button"
                onClick={onClose}
                aria-label="닫기"
                className="ml-auto p-1.5 rounded-[var(--radius-md)] hover:bg-[var(--muted)] focus-visible:outline-2 focus-visible:outline-[var(--accent)] text-[var(--toss-gray-4)]"
              >
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </div>
        )}

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {children}
        </div>
      </div>
    </>
  );
}
