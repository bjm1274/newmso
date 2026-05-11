'use client';

/**
 * Step2Checklist.tsx — 퇴원심사 스텝 2: 항목 체크 + 항목 설정
 * mockup: step-2 (#19 새심사(b) + #20 기본항목설정 흡수)
 * JM6: fieldset/legend, label, aria-describedby
 * JM3: 항목 추가 시 빈 값 방어
 */

import { useRef, useState } from 'react';
import type { ChecklistItem } from '../dummy-data';

interface Step2Props {
  items: ChecklistItem[];
  onToggle: (id: string) => void;
  onAddItem: (title: string) => void;
  onOpenTemplate: () => void;
  /** 결재(스텝3) 진입 시 미완료 에러 표시 */
  submitError?: string;
}

export default function Step2Checklist({
  items,
  onToggle,
  onAddItem,
  onOpenTemplate,
  submitError,
}: Step2Props) {
  const [newItemText, setNewItemText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const checkedCount = items.filter((i) => i.checked).length;

  const handleAdd = () => {
    const text = newItemText.trim();
    if (!text) {
      inputRef.current?.focus();
      return;
    }
    onAddItem(text);
    setNewItemText('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className="space-y-4">
      {/* 체크리스트 */}
      <div className="app-card p-5">
        <h3 className="section-title mb-3">
          <span aria-hidden="true">✅</span> 퇴원 체크리스트
        </h3>

        {/* 템플릿 적용 버튼 */}
        <button
          type="button"
          onClick={onOpenTemplate}
          className="mb-3 inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-dashed border-[var(--accent)] bg-transparent px-3 py-1.5 text-xs font-medium text-[var(--accent)] transition-colors hover:bg-[var(--accent-light)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          aria-label="저장된 체크리스트 템플릿 적용"
        >
          <span aria-hidden="true">📋</span> 템플릿 적용
        </button>

        {/* 에러 메시지 */}
        {submitError && (
          <p
            role="alert"
            aria-live="assertive"
            className="mb-3 rounded-[var(--radius-md)] bg-red-50 px-3 py-2.5 text-sm text-red-600"
          >
            {submitError}
          </p>
        )}

        <fieldset>
          <legend className="sr-only">퇴원 체크리스트 항목</legend>
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <CheckItem
                key={item.id}
                item={item}
                onToggle={() => onToggle(item.id)}
              />
            ))}
          </ul>
        </fieldset>

        {/* 진행률 */}
        <div className="mt-3 border-t border-[var(--border)] pt-3">
          <p
            aria-live="polite"
            aria-atomic="true"
            className="text-xs text-[var(--toss-gray-3)]"
          >
            진행률: {checkedCount} / {items.length} 완료
          </p>
          {/* 진행률 바 */}
          <div
            className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--toss-gray-5)]"
            role="progressbar"
            aria-valuenow={checkedCount}
            aria-valuemin={0}
            aria-valuemax={items.length}
            aria-label={`체크리스트 진행률 ${checkedCount}/${items.length}`}
          >
            <div
              className="h-full rounded-full bg-[var(--accent)] transition-all"
              style={{
                width: items.length > 0 ? `${(checkedCount / items.length) * 100}%` : '0%',
              }}
            />
          </div>
        </div>
      </div>

      {/* 항목 설정 */}
      <div className="app-card p-5">
        <h3 className="section-title mb-3">
          <span aria-hidden="true">⚙️</span> 항목 설정
        </h3>
        <div className="flex gap-2">
          <label htmlFor="new-item-input" className="sr-only">
            새 체크 항목 이름
          </label>
          <input
            id="new-item-input"
            ref={inputRef}
            className="form-input min-w-0 flex-1"
            value={newItemText}
            onChange={(e) => setNewItemText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="새 체크 항목 입력"
            aria-label="새 체크 항목 이름"
          />
          <button
            type="button"
            onClick={handleAdd}
            className="flex h-9 shrink-0 items-center rounded-[var(--radius-md)] bg-[var(--accent)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            추가
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 체크 아이템 ───────────────────────────────────────────────────────────────

interface CheckItemProps {
  item: ChecklistItem;
  onToggle: () => void;
}

function CheckItem({ item, onToggle }: CheckItemProps) {
  const descId = `ci-desc-${item.id}`;

  return (
    <li>
      <label
        className={[
          'flex cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border px-3 py-2.5 transition-colors',
          item.checked
            ? 'border-[var(--accent)] bg-[var(--accent-light)]'
            : 'border-[var(--border)] hover:bg-[var(--muted)]',
        ].join(' ')}
      >
        <input
          type="checkbox"
          checked={item.checked}
          onChange={onToggle}
          aria-describedby={item.description ? descId : undefined}
          className="h-[18px] w-[18px] shrink-0 accent-[var(--accent)]"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[var(--foreground)]">
            {item.title}
          </p>
          {item.description && (
            <p id={descId} className="text-xs text-[var(--toss-gray-3)]">
              {item.description}
            </p>
          )}
        </div>
        <span
          className={[
            'badge shrink-0',
            item.checked ? 'badge-green' : 'badge-gray',
          ].join(' ')}
          aria-label={item.checked ? '완료' : '미완료'}
        >
          {item.checked ? '완료' : '미완료'}
        </span>
      </label>
    </li>
  );
}
