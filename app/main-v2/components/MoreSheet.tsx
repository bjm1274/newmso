'use client';

/**
 * MoreSheet.tsx — Phase 2 모바일 더보기 바텀시트
 *
 * - "더보기" 탭 클릭 시 표시되는 전체 화면 목록 모달
 * - 검색 박스 + debounce 300ms 필터링
 * - ESC 키 / 오버레이 클릭으로 닫힘
 * - 포커스 트랩 (인라인 useFocusTrap)
 * - JM6: role="dialog", aria-modal, aria-labelledby, 포커스 복귀
 * - JM2: useMemo로 검색 결과 캐싱, 불필요한 리렌더 방지
 * - JM4: any 금지, MoreSheetProps 명시
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, ChevronRight } from 'lucide-react';

import type { MenuId, MoreSheetProps, MoreSheetScreen } from './types';
import { MENU_CONFIG } from './menu-config';

// ── 인라인 훅 ──────────────────────────────────────────────────────────────────

function useDebounced(value: string, delayMs = 300): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function useFocusTrap(ref: React.RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (!container) return;

    const prev = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => Boolean(el.offsetWidth || el.offsetHeight),
      );
      if (!focusable.length) { e.preventDefault(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };

    document.addEventListener('keydown', handler, true);
    // 시트 열릴 때 첫 번째 포커스 가능 요소로 이동
    const first = container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    first?.focus();

    return () => {
      document.removeEventListener('keydown', handler, true);
      prev?.focus();
    };
  }, [active, ref]);
}

// ── 검색 필터 유틸 ────────────────────────────────────────────────────────────

function matchesQuery(screen: MoreSheetScreen, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  if (screen.label.toLowerCase().includes(q)) return true;
  return screen.keywords?.some((k) => k.toLowerCase().includes(q)) ?? false;
}

// ── 그룹별 화면 목록 ──────────────────────────────────────────────────────────

interface ScreenGroupProps {
  menuId: MenuId;
  menuLabel: string;
  screens: readonly MoreSheetScreen[];
  onSelect: (screen: MoreSheetScreen) => void;
}

function ScreenGroup({ menuId, menuLabel, screens, onSelect }: ScreenGroupProps) {
  if (screens.length === 0) return null;

  return (
    <section aria-labelledby={`more-group-${menuId}`}>
      <h3
        id={`more-group-${menuId}`}
        className="section-title px-4 py-2 text-xs font-semibold uppercase tracking-wide"
        style={{ color: 'var(--toss-gray-4)' }}
      >
        {menuLabel}
      </h3>
      <ul role="list">
        {screens.map((screen) => (
          <li key={screen.id} role="none">
            <button
              type="button"
              onClick={() => onSelect(screen)}
              className="flex items-center justify-between w-full px-4 py-3 transition-colors hover:bg-[var(--muted)] focus-visible:outline-2 focus-visible:outline-offset-1 rounded-[var(--radius-md)]"
              style={{ outlineColor: 'var(--accent)' }}
              aria-label={`${screen.label} 화면으로 이동`}
            >
              <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                {screen.label}
              </span>
              <ChevronRight
                size={16}
                aria-hidden={true}
                style={{ color: 'var(--toss-gray-4)', flexShrink: 0 }}
              />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── MoreSheet 본체 ────────────────────────────────────────────────────────────

const TITLE_ID = 'more-sheet-title';

export default function MoreSheet({ isOpen, onClose, screens, onScreenSelect }: MoreSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounced(query);

  useFocusTrap(sheetRef, isOpen);

  // ESC로 닫기
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // 시트 닫힐 때 검색어 초기화
  useEffect(() => {
    if (!isOpen) setQuery('');
  }, [isOpen]);

  const filteredByGroup = useMemo(() => {
    return MENU_CONFIG.map((menu) => ({
      menuId: menu.id,
      menuLabel: menu.ariaLabel.replace(' 메뉴', ''),
      screens: screens.filter(
        (s) => s.menuId === menu.id && matchesQuery(s, debouncedQuery),
      ),
    }));
  }, [screens, debouncedQuery]);

  const hasResults = filteredByGroup.some((g) => g.screens.length > 0);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  const handleScreenSelect = useCallback(
    (screen: MoreSheetScreen) => {
      onScreenSelect(screen);
      onClose();
    },
    [onScreenSelect, onClose],
  );

  if (!isOpen) return null;

  return (
    /* 오버레이 */
    <div
      aria-hidden="false"
      onClick={handleOverlayClick}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
      }}
    >
      {/* 시트 */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        className="flex flex-col"
        style={{
          background: 'var(--card)',
          borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0',
          maxHeight: '82dvh',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          overflowY: 'hidden',
        }}
      >
        {/* 헤더 */}
        <div
          className="flex items-center justify-between px-4 py-4"
          style={{ borderBottom: '1px solid var(--border)', flexShrink: 0 }}
        >
          <h2
            id={TITLE_ID}
            className="text-base font-semibold"
            style={{ color: 'var(--foreground)' }}
          >
            전체 메뉴
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="더보기 시트 닫기"
            className="rounded-[var(--radius-md)] p-1.5 transition-colors hover:bg-[var(--muted)] focus-visible:outline-2 focus-visible:outline-offset-1"
            style={{ outlineColor: 'var(--accent)', color: 'var(--toss-gray-4)' }}
          >
            <X size={20} aria-hidden={true} />
          </button>
        </div>

        {/* 검색 */}
        <div className="px-4 py-3" style={{ flexShrink: 0 }}>
          <div
            className="flex items-center gap-2 rounded-[var(--radius-md)] px-3"
            style={{
              background: 'var(--muted)',
              border: '1px solid var(--border)',
              height: 40,
            }}
          >
            <Search
              size={16}
              aria-hidden={true}
              style={{ color: 'var(--toss-gray-4)', flexShrink: 0 }}
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="메뉴 검색"
              aria-label="메뉴 검색"
              className="flex-1 bg-transparent text-sm outline-none"
              style={{ color: 'var(--foreground)', minWidth: 0 }}
              autoComplete="off"
              spellCheck={false}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="검색어 지우기"
                className="rounded-full p-0.5 focus-visible:outline-2"
                style={{ color: 'var(--toss-gray-4)', outlineColor: 'var(--accent)' }}
              >
                <X size={12} aria-hidden={true} />
              </button>
            )}
          </div>
        </div>

        {/* 목록 */}
        <div
          className="overflow-y-auto flex-1 pb-4"
          role="region"
          aria-label="메뉴 목록"
          aria-live="polite"
          aria-atomic="false"
        >
          {hasResults ? (
            filteredByGroup.map((group) => (
              <ScreenGroup
                key={group.menuId}
                menuId={group.menuId}
                menuLabel={group.menuLabel}
                screens={group.screens}
                onSelect={handleScreenSelect}
              />
            ))
          ) : (
            <div
              className="empty-state py-12"
              aria-live="polite"
              role="status"
            >
              <p className="text-sm" style={{ color: 'var(--toss-gray-4)' }}>
                &ldquo;{debouncedQuery}&rdquo; 에 해당하는 메뉴가 없습니다.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
