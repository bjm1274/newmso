'use client';

import { createPortal } from 'react-dom';
import type { Dispatch, MutableRefObject, SetStateAction, WheelEvent } from 'react';
import { SUPPLY_REQUEST_CATEGORY_OPTIONS } from '@/app/main/inventory-utils';
import { EditableGrid, type EditableGridField } from '@/app/components/EditableGrid';
import type { InventoryCatalogItem, SupplyRow } from './비품구매양식';

type SuppliesGridProps = {
  items: SupplyRow[];
  inputRefs: MutableRefObject<Map<number, HTMLInputElement>>;
  dropdownPos: { top: number; left: number; width: number } | null;
  activeDropdownIndex: number | null;
  setActiveDropdownIndex: Dispatch<SetStateAction<number | null>>;
  sortKey: 'category' | 'name' | null;
  sortAsc: boolean;
  handleSearch: (index: number, value: string) => void;
  selectItem: (index: number, selected: InventoryCatalogItem) => void;
  updateItemField: (index: number, key: 'qty' | 'category' | 'purpose' | 'unit', value: unknown) => void;
  updateDropdownPosition: (index: number) => void;
  handleSort: (key: 'category' | 'name') => void;
  removeItemAt: (index: number) => void;
};

function findScrollableParent(element: HTMLElement | null) {
  let current = element?.parentElement ?? null;
  while (current && current !== document.body) {
    const style = window.getComputedStyle(current);
    if (/(auto|scroll|overlay)/.test(style.overflowY) && current.scrollHeight > current.clientHeight) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

/**
 * 비품구매양식 데스크탑 그리드 — EditableGrid 기반.
 *
 * - 모바일 카드 분기는 부모(비품구매양식.tsx)가 이미 별도로 그리고 있으므로,
 *   본 컴포넌트는 외부 래퍼 `hidden md:block`로 감싸 EditableGrid 모바일 카드를 항상 숨긴다.
 * - thead의 정렬 인터랙티브 위젯은 EditableGrid 위 별도 헤더 바로 분리(aria-pressed 버튼).
 * - 물품명 셀 Portal 드롭다운(createPortal)은 fields.render 내부에 그대로 유지.
 * - 행 삭제 버튼은 actions prop.
 */
export default function SuppliesPurchaseGrid({
  items,
  inputRefs,
  dropdownPos,
  activeDropdownIndex,
  setActiveDropdownIndex,
  sortKey,
  sortAsc,
  handleSearch,
  selectItem,
  updateItemField,
  updateDropdownPosition,
  handleSort,
  removeItemAt,
}: SuppliesGridProps) {
  const handleDropdownWheel = (index: number, event: WheelEvent<HTMLDivElement>) => {
    const dropdown = event.currentTarget;
    const deltaY = event.deltaY;
    const hasDropdownScroll = dropdown.scrollHeight > dropdown.clientHeight;
    const canScrollDown = dropdown.scrollTop + dropdown.clientHeight < dropdown.scrollHeight - 1;
    const canScrollUp = dropdown.scrollTop > 0;

    if (hasDropdownScroll && ((deltaY > 0 && canScrollDown) || (deltaY < 0 && canScrollUp))) {
      return;
    }

    const pageScroller = findScrollableParent(inputRefs.current.get(index) ?? null);
    if (!pageScroller) {
      return;
    }

    event.preventDefault();
    pageScroller.scrollBy({ top: deltaY, behavior: 'auto' });
  };

  const fields: EditableGridField<SupplyRow>[] = [
    {
      id: 'category',
      label: '품목구분',
      width: '13%',
      render: (item, index) => (
        <>
          <label htmlFor={`supplies-item-category-${index}`} className="sr-only">
            품목구분
          </label>
          <select
            id={`supplies-item-category-${index}`}
            data-testid={`supplies-item-category-${index}`}
            value={item.category}
            onChange={(event) => updateItemField(index, 'category', event.target.value)}
            className="h-10 w-full rounded-[var(--radius-md)] border-none bg-[var(--muted)] px-2 text-[10px] font-bold text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
          >
            <option value="">구분 선택</option>
            {SUPPLY_REQUEST_CATEGORY_OPTIONS.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </>
      ),
    },
    {
      id: 'name',
      label: '물품명',
      width: '30%',
      render: (item, index) => (
        <div>
          <label htmlFor={`supplies-item-name-${index}`} className="sr-only">
            물품명
          </label>
          <input
            id={`supplies-item-name-${index}`}
            data-supply-input
            data-testid={`supplies-item-name-${index}`}
            type="text"
            ref={(el) => {
              if (el) {
                inputRefs.current.set(index, el);
                return;
              }
              inputRefs.current.delete(index);
            }}
            value={item.name}
            onChange={(event) => {
              handleSearch(index, event.target.value);
              updateDropdownPosition(index);
            }}
            onFocus={(event) => {
              handleSearch(index, event.target.value);
              updateDropdownPosition(index);
            }}
            onBlur={() => {
              setTimeout(
                () => setActiveDropdownIndex((prev) => (prev === index ? null : prev)),
                200,
              );
            }}
            className="h-10 w-full rounded-[var(--radius-md)] border-none bg-[var(--muted)] px-2.5 text-xs font-bold text-[var(--foreground)] outline-none transition-all focus:bg-[var(--card)] focus:ring-2 focus:ring-[var(--accent)]/20"
            placeholder="물품명을 입력하세요"
          />
          {activeDropdownIndex === index && item.suggestions.length > 0 && dropdownPos
            ? createPortal(
                <div
                  data-supply-dropdown
                  onWheel={(event) => handleDropdownWheel(index, event)}
                  className="fixed z-[9999] max-h-[240px] overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] shadow-lg"
                  style={{ top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width }}
                >
                  {item.suggestions.map((suggestion, suggestionIndex) => (
                    <div
                      key={`${suggestion.name}-${suggestionIndex}`}
                      data-testid={`supplies-item-suggestion-${index}-${suggestionIndex}`}
                      onMouseDown={() => selectItem(index, suggestion)}
                      className="flex cursor-pointer items-center justify-between gap-3 border-b p-3 text-[11px] font-bold transition-colors last:border-none hover:bg-[var(--muted)]"
                    >
                      <div className="min-w-0">
                        <span className="block truncate text-[var(--foreground)]">{suggestion.name}</span>
                        {suggestion.spec ? (
                          <span className="mt-1 block truncate text-[10px] font-semibold text-[var(--toss-gray-3)]">
                            {suggestion.spec}
                          </span>
                        ) : null}
                      </div>
                      <span
                        className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                          suggestion.stock <= suggestion.min_stock
                            ? 'bg-red-500/20 text-red-600'
                            : 'bg-green-500/20 text-green-600'
                        }`}
                      >
                        재고 {suggestion.stock} {suggestion.unit}
                      </span>
                    </div>
                  ))}
                </div>,
                document.body,
              )
            : null}
        </div>
      ),
    },
    {
      id: 'currentStock',
      label: '현재 재고',
      width: '15%',
      render: (item, index) => (
        <div
          data-testid={`supplies-item-current-stock-${index}`}
          className={`inline-flex min-h-[40px] min-w-[88px] items-center justify-center rounded-[var(--radius-md)] px-2.5 text-[11px] font-black ${
            item.currentStock === null
              ? 'bg-[var(--muted)] text-[var(--toss-gray-3)]'
              : item.currentStock <= 5
                ? 'bg-red-500/10 text-red-600'
                : 'bg-blue-500/10 text-blue-600'
          }`}
        >
          {item.currentStock === null ? '-' : `${item.currentStock} ${item.unit}`}
        </div>
      ),
    },
    {
      id: 'qty',
      label: '신청 수량',
      width: '15%',
      render: (item, index) => (
        <div className="flex items-center gap-2">
          <label htmlFor={`supplies-item-qty-${index}`} className="sr-only">
            신청 수량
          </label>
          <input
            id={`supplies-item-qty-${index}`}
            data-testid={`supplies-item-qty-${index}`}
            type="number"
            inputMode="numeric"
            min="1"
            value={item.qty}
            onChange={(event) => updateItemField(index, 'qty', event.target.value)}
            className="h-10 w-full min-w-[64px] rounded-[var(--radius-md)] border-none bg-[var(--toss-blue-light)]/50 px-2.5 text-center text-sm font-black tabular-nums tracking-tight text-[var(--accent)] outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
          />
          <span
            data-testid={`supplies-item-unit-${index}`}
            className="shrink-0 rounded-full bg-[var(--muted)] px-2.5 py-1 text-[10px] font-black text-[var(--accent)]"
          >
            {item.unit}
          </span>
        </div>
      ),
    },
    {
      id: 'purpose',
      label: '용도',
      width: '21%',
      render: (item, index) => (
        <>
          <label htmlFor={`supplies-item-purpose-${index}`} className="sr-only">
            용도
          </label>
          <input
            id={`supplies-item-purpose-${index}`}
            data-testid={`supplies-item-purpose-${index}`}
            type="text"
            value={item.purpose}
            onChange={(event) => updateItemField(index, 'purpose', event.target.value)}
            className="h-10 w-full rounded-[var(--radius-md)] border-none bg-[var(--muted)] px-2.5 text-xs font-semibold text-[var(--foreground)] outline-none transition-all focus:bg-[var(--card)] focus:ring-2 focus:ring-[var(--accent)]/20"
            placeholder="사용 용도를 입력하세요"
          />
        </>
      ),
    },
  ];

  return (
    <div className="hidden rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] shadow-sm md:block">
      <div className="flex items-center gap-4 border-b border-[var(--border)] px-3 py-2 text-[11px] font-bold text-[var(--toss-gray-4)]">
        <button
          type="button"
          onClick={() => handleSort('category')}
          aria-pressed={sortKey === 'category'}
          className="cursor-pointer select-none rounded-[var(--radius-md)] px-2 py-1 hover:text-[var(--accent)]"
        >
          품목구분 {sortKey === 'category' ? (sortAsc ? '▲' : '▼') : ''}
        </button>
        <button
          type="button"
          onClick={() => handleSort('name')}
          aria-pressed={sortKey === 'name'}
          className="cursor-pointer select-none rounded-[var(--radius-md)] px-2 py-1 hover:text-[var(--accent)]"
        >
          물품명 {sortKey === 'name' ? (sortAsc ? '▲' : '▼') : ''}
        </button>
      </div>
      <EditableGrid<SupplyRow>
        rows={items}
        fields={fields}
        rowKey={(_item, index) => `desktop-reordered-${index}`}
        actions={(_item, index) => (
          <button
            type="button"
            data-testid={`supplies-item-remove-${index}`}
            onClick={() => removeItemAt(index)}
            disabled={items.length <= 1}
            aria-label={`항목 ${index + 1} 삭제`}
            title="이 항목 삭제"
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)] text-[var(--toss-gray-4)] transition-colors hover:border-red-300 hover:bg-red-500/10 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        )}
        emptyMessage="신청할 비품을 추가해 주세요."
      />
    </div>
  );
}
