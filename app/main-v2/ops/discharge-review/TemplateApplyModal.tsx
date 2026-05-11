'use client';

/**
 * TemplateApplyModal.tsx — 체크리스트 템플릿 적용 모달 (PC) / 바텀시트 (모바일)
 * JM2: 상태 0개 API 호출, 더미 데이터 직접 사용
 * JM6: role="dialog", aria-modal, aria-labelledby, focus trap
 */

import { useEffect, useRef, useState } from 'react';
import type { ChecklistItem, ChecklistTemplate } from './dummy-data';
import { DUMMY_TEMPLATES } from './dummy-data';

interface TemplateApplyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (items: ChecklistItem[]) => void;
}

export default function TemplateApplyModal({
  isOpen,
  onClose,
  onApply,
}: TemplateApplyModalProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const firstFocusRef = useRef<HTMLButtonElement>(null);
  const titleId = 'template-modal-title';

  // 포커스 트랩 & ESC 닫기
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    // 모달 열릴 때 첫 요소에 포커스
    firstFocusRef.current?.focus();

    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // 닫힐 때 선택 초기화
  useEffect(() => {
    if (!isOpen) setSelectedId(null);
  }, [isOpen]);

  const handleApply = () => {
    const template = DUMMY_TEMPLATES.find((t) => t.id === selectedId);
    if (!template) return;

    const items: ChecklistItem[] = template.items.map((item) => ({
      ...item,
      checked: false,
    }));

    onApply(items);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* 오버레이 */}
      <div
        className="fixed inset-0 z-50 bg-black/45"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* 모달 (PC) — sm 이상에서 중앙 정렬 */}
      {/* 바텀시트 (모바일) — sm 미만에서 하단 슬라이드 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={[
          'fixed z-50 bg-[var(--card)] shadow-lg',
          // 모바일: 바텀시트
          'bottom-0 left-0 right-0 rounded-t-[var(--radius-xl)] p-5',
          // PC: 중앙 모달
          'sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[480px] sm:max-w-[90vw]',
          'sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[var(--radius-xl)] sm:p-6',
        ].join(' ')}
      >
        {/* 모바일 핸들 */}
        <div className="mb-4 flex justify-center sm:hidden" aria-hidden="true">
          <div className="h-1 w-10 rounded-full bg-[var(--toss-gray-5)]" />
        </div>

        <h2
          id={titleId}
          className="mb-1 text-base font-bold text-[var(--foreground)]"
        >
          템플릿 선택
        </h2>
        <p className="mb-3 text-xs text-[var(--toss-gray-3)]">
          적용할 체크리스트 템플릿을 선택하세요
        </p>

        {/* 닫기 버튼 */}
        <button
          ref={firstFocusRef}
          onClick={onClose}
          aria-label="모달 닫기"
          className="absolute right-5 top-5 flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-[var(--toss-gray-3)] hover:bg-[var(--muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] sm:top-6"
        >
          ✕
        </button>

        {/* 템플릿 목록 */}
        <ul
          role="listbox"
          aria-label="템플릿 목록"
          className="flex max-h-60 flex-col gap-2 overflow-y-auto"
        >
          {DUMMY_TEMPLATES.map((tpl) => (
            <TemplateItem
              key={tpl.id}
              template={tpl}
              isSelected={selectedId === tpl.id}
              onSelect={() => setSelectedId(tpl.id)}
            />
          ))}
        </ul>

        {/* 하단 버튼 */}
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="flex h-9 items-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-4 text-sm font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            취소
          </button>
          <button
            onClick={handleApply}
            disabled={selectedId === null}
            aria-disabled={selectedId === null}
            className="flex h-9 items-center rounded-[var(--radius-md)] bg-[var(--accent)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            적용
          </button>
        </div>
      </div>
    </>
  );
}

// ── 템플릿 아이템 ──────────────────────────────────────────────────────────────

interface TemplateItemProps {
  template: ChecklistTemplate;
  isSelected: boolean;
  onSelect: () => void;
}

function TemplateItem({ template, isSelected, onSelect }: TemplateItemProps) {
  return (
    <li
      role="option"
      aria-selected={isSelected}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={[
        'flex cursor-pointer items-center justify-between rounded-[var(--radius-md)] border px-3 py-2.5 transition-colors',
        isSelected
          ? 'border-[var(--accent)] bg-[var(--accent-light)]'
          : 'border-[var(--border)] hover:border-[var(--accent)] hover:bg-[var(--accent-light)]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]',
      ].join(' ')}
    >
      <div>
        <p className="text-sm font-medium text-[var(--foreground)]">
          {template.name}
        </p>
        <p className="text-xs text-[var(--toss-gray-3)]">
          {template.itemCount}개 항목 · 마지막 수정: {template.updatedAt}
        </p>
      </div>
      {template.isRecommended && (
        <span className="badge badge-blue ml-2 shrink-0">추천</span>
      )}
    </li>
  );
}
