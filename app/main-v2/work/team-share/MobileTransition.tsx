'use client';

/**
 * MobileTransition.tsx — 모바일 마스터↔디테일 전환 컨테이너
 *
 * JM:  500줄 이내, 모바일 전환 로직 단일 책임
 * JM2: CSS transition + state 전환, 페이지 이동 0회
 * JM6: 뒤로가기 버튼 aria-label
 *
 * 전환 패턴:
 *   master: translateX(0)  → show-detail: translateX(-30%) + opacity:0
 *   detail: translateX(100%) → show-detail: translateX(0) + opacity:1
 *   will-change:transform 으로 GPU 합성층 확보
 */

import { useEffect, type ReactNode } from 'react';

interface MobileTransitionProps {
  showDetail: boolean;
  onBack: () => void;
  masterContent: ReactNode;
  detailContent: ReactNode;
}

export function MobileTransition({
  showDetail,
  onBack,
  masterContent,
  detailContent,
}: MobileTransitionProps) {
  // popstate(안드로이드 뒤로가기 제스처) 처리
  useEffect(() => {
    if (showDetail) {
      window.history.pushState({ teamShareDetail: true }, '');
    }
  }, [showDetail]);

  useEffect(() => {
    const handler = (e: PopStateEvent) => {
      const state = e.state as { teamShareDetail?: boolean } | null;
      if (!state?.teamShareDetail) {
        onBack();
      }
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, [onBack]);

  return (
    <div className="flex-1 overflow-hidden relative">
      {/* ── 마스터 뷰 ─────────────────────────────── */}
      <div
        className="absolute inset-0 overflow-y-auto bg-[var(--page-bg)]"
        style={{
          transform: showDetail ? 'translateX(-30%)' : 'translateX(0)',
          opacity:   showDetail ? 0 : 1,
          pointerEvents: showDetail ? 'none' : undefined,
          transition: 'transform 220ms ease, opacity 220ms ease',
          willChange: 'transform',
        }}
        aria-hidden={showDetail}
      >
        {masterContent}
      </div>

      {/* ── 디테일 뷰 ─────────────────────────────── */}
      <div
        className="absolute inset-0 overflow-y-auto bg-[var(--card)]"
        style={{
          transform: showDetail ? 'translateX(0)' : 'translateX(100%)',
          opacity:   showDetail ? 1 : 0,
          pointerEvents: showDetail ? undefined : 'none',
          transition: 'transform 220ms ease, opacity 220ms ease',
          willChange: 'transform',
        }}
        aria-hidden={!showDetail}
      >
        {/* 모바일 디테일 헤더 — 뒤로가기 */}
        <div className="flex items-center gap-2 px-4 h-12 border-b border-[var(--border)] bg-[var(--card)] sticky top-0 z-10 shrink-0">
          <button
            type="button"
            onClick={onBack}
            aria-label="목록으로 돌아가기"
            className="w-11 h-11 -ml-2 flex items-center justify-center rounded-[var(--radius-md)] text-[var(--toss-gray-5)] hover:bg-[var(--muted)] transition-colors"
          >
            <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <span className="text-[15px] font-bold text-[var(--foreground)]">상세</span>
        </div>

        {detailContent}
      </div>
    </div>
  );
}
