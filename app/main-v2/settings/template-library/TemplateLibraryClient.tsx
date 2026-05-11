'use client';

/**
 * TemplateLibraryClient.tsx — 템플릿 라이브러리 (#87~#89)
 *
 * 카테고리 필터 + 검색(debounce 300ms) + 카드 그리드 + 미리보기 모달
 *
 * JM : 500줄 이내
 * JM2: 필터링은 클라이언트 메모, 검색 debounce 300ms, API 재호출 없음
 * JM4: any 금지, TemplateCategory union
 * JM6: 카드 keyboard Enter, 모달 포커스 트랩, Esc 닫기, aria-label
 */

import React, { useState, useMemo, useCallback, useEffect, useRef, useId } from 'react';
import {
  LIBRARY_TEMPLATES, TEMPLATE_CATEGORIES,
  formatFileSize, type LibraryTemplate, type TemplateCategory,
} from '../_shared/dummy-data';

// ── useDebouncedSearch ────────────────────────────────────────────────────────

function useDebouncedSearch(delay = 300) {
  const [query, setQuery]       = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), delay);
    return () => clearTimeout(t);
  }, [query, delay]);

  return { query, setQuery, debounced };
}

// ── 미리보기 모달 ─────────────────────────────────────────────────────────────

interface PreviewModalProps {
  template: LibraryTemplate;
  onClose: () => void;
}

function PreviewModal({ template, onClose }: PreviewModalProps) {
  const id        = useId();
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const modalRef    = useRef<HTMLDivElement>(null);

  // 포커스 트랩
  useEffect(() => {
    closeBtnRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab') return;

      const focusables = modalRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables || focusables.length === 0) return;

      const first = focusables[0];
      const last  = focusables[focusables.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${id}-title`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={modalRef}
        className="app-card w-full max-w-lg p-6 flex flex-col gap-4"
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 id={`${id}-title`} className="text-base font-bold text-[var(--foreground)]">{template.title}</h2>
            <p className="mt-0.5 text-sm text-[var(--toss-gray-4)]">{template.description}</p>
          </div>
          <button
            ref={closeBtnRef}
            onClick={onClose}
            aria-label="미리보기 닫기"
            className="ml-4 rounded-[var(--radius-md)] p-1.5 text-[var(--toss-gray-4)] hover:bg-[var(--muted)] focus-visible:outline-2 focus-visible:outline-[var(--accent)] min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div>
            <dt className="text-xs text-[var(--toss-gray-4)]">카테고리</dt>
            <dd className="font-medium text-[var(--foreground)]">{template.category}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--toss-gray-4)]">형식</dt>
            <dd><span className="badge badge-blue text-xs">{template.fileType}</span></dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--toss-gray-4)]">파일 크기</dt>
            <dd className="font-medium text-[var(--foreground)]">{formatFileSize(template.fileSizeKB)}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--toss-gray-4)]">다운로드</dt>
            <dd className="font-medium text-[var(--foreground)]">{template.downloadCount}회</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--toss-gray-4)]">최종 수정</dt>
            <dd className="font-medium text-[var(--foreground)]">{template.updatedAt}</dd>
          </div>
        </dl>

        <div className="flex flex-wrap gap-1.5">
          {template.tags.map((tag) => (
            <span key={tag} className="badge badge-gray text-xs">{tag}</span>
          ))}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="btn-ghost text-sm px-4 py-2 rounded-[var(--radius-md)]"
          >
            닫기
          </button>
          <button
            className="btn-accent text-sm px-4 py-2 rounded-[var(--radius-md)]"
            aria-label={`${template.title} 다운로드`}
          >
            다운로드
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 템플릿 카드 ───────────────────────────────────────────────────────────────

interface TemplateCardProps {
  template: LibraryTemplate;
  onPreview: (t: LibraryTemplate) => void;
}

function TemplateCard({ template, onPreview }: TemplateCardProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onPreview(template);
    }
  };

  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={`${template.title} 미리보기 열기`}
      onClick={() => onPreview(template)}
      onKeyDown={handleKeyDown}
      className="app-card flex flex-col gap-3 p-4 cursor-pointer transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2"
    >
      {/* 카드 헤더 */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-[var(--foreground)] truncate">{template.title}</h3>
          <p className="mt-0.5 text-xs text-[var(--toss-gray-4)] line-clamp-2">{template.description}</p>
        </div>
        <span className={['badge text-xs shrink-0', template.fileType === 'PDF' ? 'badge-red' : 'badge-blue'].join(' ')}>
          {template.fileType}
        </span>
      </div>

      {/* 메타 */}
      <div className="flex items-center justify-between text-xs text-[var(--toss-gray-4)]">
        <span>{formatFileSize(template.fileSizeKB)}</span>
        <span>{template.downloadCount}회 다운로드</span>
      </div>

      {/* 태그 */}
      <div className="flex flex-wrap gap-1">
        {template.tags.map((tag) => (
          <span key={tag} className="badge badge-gray text-xs">{tag}</span>
        ))}
      </div>

      {/* 수정일 */}
      <p className="text-xs text-[var(--toss-gray-4)]">수정: {template.updatedAt}</p>
    </article>
  );
}

// ── 메인 클라이언트 ────────────────────────────────────────────────────────────

export default function TemplateLibraryClient() {
  const [activeCategory, setActiveCategory] = useState<TemplateCategory>('전체');
  const [preview, setPreview]               = useState<LibraryTemplate | null>(null);
  const { query, setQuery, debounced }      = useDebouncedSearch(300);
  const searchId = useId();

  // JM2: 클라이언트 메모 필터링, API 재호출 없음
  const filtered = useMemo(() => {
    const q = debounced.toLowerCase().trim();
    return LIBRARY_TEMPLATES.filter((t) => {
      const matchCat = activeCategory === '전체' || t.category === activeCategory;
      const matchQ   = !q || t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.tags.some((tag) => tag.toLowerCase().includes(q));
      return matchCat && matchQ;
    });
  }, [activeCategory, debounced]);

  const handlePreview = useCallback((t: LibraryTemplate) => setPreview(t), []);
  const handleClose   = useCallback(() => setPreview(null), []);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* 헤더 */}
      <header className="flex flex-col gap-3 border-b border-[var(--border)] bg-[var(--card)] px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-lg font-bold text-[var(--foreground)]">템플릿 라이브러리</h1>
        <div className="flex items-center gap-3">
          {/* 검색 — debounce 300ms, JM2 */}
          <div className="relative">
            <label htmlFor={searchId} className="sr-only">템플릿 검색</label>
            <input
              id={searchId}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="검색…"
              className="input-base w-48 pr-8 text-sm"
              aria-label="템플릿 검색"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                aria-label="검색어 지우기"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--toss-gray-4)] hover:text-[var(--foreground)]"
              >
                ✕
              </button>
            )}
          </div>
          <button className="btn-accent text-sm px-3 py-2 rounded-[var(--radius-md)] min-h-[44px]">
            + 업로드
          </button>
        </div>
      </header>

      {/* 카테고리 필터 */}
      <div
        role="group"
        aria-label="카테고리 필터"
        className="flex gap-2 overflow-x-auto border-b border-[var(--border)] bg-[var(--card)] px-6 py-3 scrollbar-hide"
      >
        {TEMPLATE_CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            aria-pressed={activeCategory === cat}
            className={[
              'shrink-0 rounded-[var(--radius-md)] px-3 py-1.5 text-sm font-medium transition-colors',
              'focus-visible:outline-2 focus-visible:outline-[var(--accent)]',
              'min-h-[44px]',
              activeCategory === cat
                ? 'bg-[var(--accent)] text-white'
                : 'text-[var(--toss-gray-4)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]',
            ].join(' ')}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* 결과 수 */}
      <div className="px-6 pt-4">
        <p className="text-xs text-[var(--toss-gray-4)]" aria-live="polite">
          {filtered.length}개 템플릿
          {debounced && ` — "${debounced}" 검색 결과`}
        </p>
      </div>

      {/* 카드 그리드 */}
      <main className="flex-1 overflow-y-auto px-6 pb-6 pt-3">
        {filtered.length === 0 ? (
          <div className="empty-state" role="status">
            <p className="text-sm text-[var(--toss-gray-4)]">검색 결과가 없습니다.</p>
          </div>
        ) : (
          <ul
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
            aria-label="템플릿 목록"
          >
            {filtered.map((t) => (
              <li key={t.id}>
                <TemplateCard template={t} onPreview={handlePreview} />
              </li>
            ))}
          </ul>
        )}
      </main>

      {/* 미리보기 모달 */}
      {preview && <PreviewModal template={preview} onClose={handleClose} />}
    </div>
  );
}
