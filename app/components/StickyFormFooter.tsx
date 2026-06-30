'use client';

/**
 * StickyFormFooter.tsx — 모바일 폼 하단 고정 푸터
 *
 * 모바일(<768px): position: fixed, 바텀탭 위에 고정
 * 데스크톱(≥768px): position: static, 일반 흐름 배치
 *
 * 사용 예시:
 * ```tsx
 * // 본문 마지막에 spacer를 추가하면 고정 푸터가 콘텐츠를 가리지 않는다.
 * // (StickyFormFooter가 자동으로 spacer를 함께 렌더한다)
 *
 * <StickyFormFooter
 *   primary={<button onClick={handleSave}>저장</button>}
 *   secondary={<button onClick={handleCancel}>취소</button>}
 * />
 * ```
 *
 * z-index: --z-sticky (100) — 드롭다운(50) 위, 모달(1000) 아래
 * safe-area: --safe-pb (globals.css P0-1) 적용
 * 바텀탭: --mobile-bottomtab-height (globals.css P0-1) 만큼 bottom 오프셋
 *
 * JM: 단일 책임 — 폼 하단 액션 영역 레이아웃만 담당
 * JM2: 이펙트·리렌더 없음, 순수 레이아웃 컴포넌트
 * JM4: any 금지, props 타입 명시
 * JM6: <footer> 시맨틱 태그, 내부 버튼은 사용처에서 접근성 처리
 */

import React from 'react';
import { useVisualViewportOffset } from '../hooks/useVisualViewportOffset';

// ── Props ──────────────────────────────────────────────────────────────────────

export interface StickyFormFooterProps {
  /** 우측 primary 액션 (저장 / 제출 등) */
  primary: React.ReactNode;
  /** 좌측 secondary 액션 (취소 / 초기화 등). 생략 가능 */
  secondary?: React.ReactNode;
  /** primary/secondary 외 추가 액션이 필요할 때 */
  children?: React.ReactNode;
  /**
   * spacer 자동 렌더 여부 (default: true).
   * 모바일에서 고정 푸터가 콘텐츠를 가리지 않도록 본문 하단에 여백을 추가한다.
   * 부모 레이아웃이 이미 충분한 padding-bottom을 갖고 있다면 false로 끈다.
   */
  withSpacer?: boolean;
  /** 추가 className (sticky-form-footer 클래스 뒤에 병합) */
  className?: string;
}

// ── 컴포넌트 ───────────────────────────────────────────────────────────────────

export default function StickyFormFooter({
  primary,
  secondary,
  children,
  withSpacer = true,
  className }: StickyFormFooterProps) {
  const footerClass = ['sticky-form-footer', className].filter(Boolean).join(' ');

  // 모바일 키보드(IME) 가 떴을 때, fixed 푸터를 visual viewport 안으로 끌어올린다.
  // 데스크톱(min-width:768px)에서는 position:static 이므로 transform이 시각적으로 무해.
  const kbOffset = useVisualViewportOffset();
  const footerStyle: React.CSSProperties | undefined =
    kbOffset > 0 ? { transform: `translateY(-${kbOffset}px)` } : undefined;

  return (
    <>
      {/* 고정 푸터가 본문 콘텐츠를 가리지 않도록 모바일에서만 높이를 확보 */}
      {withSpacer && <div className="sticky-form-footer-spacer" aria-hidden="true" />}

      <footer className={footerClass} style={footerStyle} aria-label="폼 액션">
        <div className="flex items-center justify-between gap-3">
          {/* 좌측: secondary 액션 */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {secondary}
          </div>

          {/* 우측: primary + 추가 액션 */}
          <div className="flex items-center gap-2 flex-1 justify-end">
            {children}
            {primary}
          </div>
        </div>
      </footer>
    </>
  );
}
