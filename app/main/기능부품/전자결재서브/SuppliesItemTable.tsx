'use client';

import { createPortal } from 'react-dom';
import type { Dispatch, MutableRefObject, SetStateAction, WheelEvent } from 'react';
import { SUPPLY_REQUEST_CATEGORY_OPTIONS } from '@/app/main/inventory-utils';
import { EditableGrid, type EditableGridField } from '@/app/components/EditableGrid';
import type { InventoryCatalogItem, SupplyRow } from './비품구매양식';

type SuppliesItemTableProps = {
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
  removeItemRow: (index: number) => void;
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

export default function SuppliesItemTable({
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
  removeItemRow,
}: SuppliesItemTableProps) {
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

  // 데스크탑 EditableGrid 컬럼 정의 — 모바일 카드는 별도 커스텀 UI를 그대로 사용하므로
  // 외부 래퍼에서 hidden md:block 처리해 EditableGrid 모바일 카드는 숨긴다.
  const fields: EditableGridField<SupplyRow>[] = [
    {
      id: 'category',
      label: '품목구분',
      width: '12%',
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
            className="h-9 w-full min-w-0 cursor-pointer appearance-none border-0 bg-transparent px-1 text-[12px] font-bold text-[var(--foreground)] shadow-none outline-none transition-colors hover:text-[var(--accent)] focus:text-[var(--accent)] focus:ring-0"
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
      width: '29%',
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
              setTimeout(() => setActiveDropdownIndex((prev) => (prev === index ? null : prev)), 200);
            }}
            className="h-9 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 text-[13px] font-bold text-[var(--foreground)] outline-none transition-all focus:bg-[var(--card)] focus:ring-2 focus:ring-[var(--accent)]/20"
            placeholder="물품명을 입력하세요"
          />
          {activeDropdownIndex === index && item.suggestions.length > 0 && dropdownPos
            ? createPortal(
                <div
                  data-supply-dropdown
                  onWheel={(event) => handleDropdownWheel(index, event)}
                  className="fixed z-[9999] max-h-[240px] overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-dropdown)]"
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
                        className={`erp-chip shrink-0 ${
                          suggestion.stock <= suggestion.min_stock
                            ? 'erp-status-red'
                            : 'erp-status-green'
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
      width: '12%',
      render: (item, index) => (
        <div
          data-testid={`supplies-item-current-stock-${index}`}
          className={`inline-flex min-h-9 min-w-[64px] items-center justify-center rounded-[var(--radius-md)] border px-1.5 text-[10px] font-black ${
            item.currentStock === null
              ? 'border-[var(--border)] bg-[var(--surface-muted)] text-[var(--toss-gray-3)]'
              : item.currentStock <= 5
                ? 'border-[var(--danger-light)] bg-[var(--danger-light)] text-[var(--danger)]'
                : 'border-[var(--accent-selected-subtle)] bg-[var(--accent-selected-subtle)] text-[var(--accent)]'
          }`}
        >
          {item.currentStock === null ? '-' : `${item.currentStock} ${item.unit}`}
        </div>
      ),
    },
    {
      id: 'qty',
      label: '신청 수량',
      width: '12%',
      render: (item, index) => (
        <div className="flex min-w-0 items-center gap-1">
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
            className="h-9 w-9 min-w-0 rounded-[var(--radius-md)] border border-[var(--accent-selected-subtle)] bg-[var(--accent-selected-subtle)] px-0.5 text-center text-[13px] font-black tabular-nums text-[var(--accent)] outline-none [appearance:textfield] focus:ring-2 focus:ring-[var(--accent)]/30 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <button
            type="button"
            data-testid={`supplies-item-unit-${index}`}
            onClick={() => updateItemField(index, 'unit', item.unit === 'EA' ? 'BOX' : 'EA')}
            aria-label={`단위 ${item.unit} — 클릭하여 ${item.unit === 'EA' ? 'BOX' : 'EA'}로 변경`}
            title="클릭하여 EA/BOX 전환"
            className="erp-chip erp-chip-active shrink-0 cursor-pointer text-[9px] hover:opacity-80 transition-opacity"
          >
            {item.unit}
          </button>
        </div>
      ),
    },
    {
      id: 'purpose',
      label: '용도',
      width: '35%',
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
            className="h-9 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] px-2 text-xs font-semibold text-[var(--foreground)] outline-none transition-all focus:bg-[var(--card)] focus:ring-2 focus:ring-[var(--accent)]/20"
            placeholder="사용 용도를 입력하세요"
          />
        </>
      ),
    },
  ];

  return (
    <div className="bg-[var(--surface-subtle)] p-2 md:p-3">
      <div className="space-y-3 md:hidden">
        {items.map((item, index) => (
          <div
            key={`mobile-reordered-${index}`}
            className="erp-panel p-3 shadow-none"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <button
                type="button"
                data-testid={`supplies-item-delete-mobile-${index}`}
                aria-label={`Delete supply row ${index + 1}`}
                onClick={() => removeItemRow(index)}
                disabled={items.length <= 1}
                className="order-2 inline-flex min-h-7 items-center justify-center rounded-[var(--radius-md)] border border-[var(--danger-light)] bg-[var(--danger-light)] px-3 py-1 text-[11px] font-bold text-[var(--danger)] transition-colors hover:border-[var(--danger)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                항목 삭제
              </button>
              <span className="text-[12px] font-black text-[var(--foreground)]">항목 {index + 1}</span>
            </div>

            <div className="space-y-3">
              <label className="block space-y-1.5">
                <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">물품명</span>
                <div className="relative">
                  <input
                    data-testid={`supplies-item-name-mobile-${index}`}
                    type="text"
                    value={item.name}
                    onChange={(event) => handleSearch(index, event.target.value)}
                    onFocus={(event) => handleSearch(index, event.target.value)}
                    className="h-10 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] px-3 text-sm font-bold text-[var(--foreground)] outline-none transition-all focus:bg-[var(--card)] focus:ring-2 focus:ring-[var(--accent)]/20"
                    placeholder="물품명을 입력하세요"
                  />
                  {item.suggestions.length > 0 ? (
                    <div
                      data-supply-dropdown
                      onWheel={(event) => handleDropdownWheel(index, event)}
                      className="absolute left-0 top-full z-[100] mt-1 max-h-[240px] w-full overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-dropdown)]"
                    >
                      {item.suggestions.map((suggestion, suggestionIndex) => (
                        <div
                          key={`${suggestion.name}-${suggestionIndex}`}
                          data-testid={`supplies-item-suggestion-mobile-${index}-${suggestionIndex}`}
                          onClick={() => selectItem(index, suggestion)}
                          className="flex cursor-pointer items-center justify-between gap-3 border-b p-3 text-[12px] font-bold transition-colors last:border-none hover:bg-[var(--muted)]"
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
                            className={`erp-chip ${
                              suggestion.stock <= suggestion.min_stock
                                ? 'erp-status-red'
                                : 'erp-status-green'
                            }`}
                          >
                            재고 {suggestion.stock} {suggestion.unit}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1.5">
                  <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">품목구분</span>
                  <select
                    data-testid={`supplies-item-category-mobile-${index}`}
                    value={item.category}
                    onChange={(event) => updateItemField(index, 'category', event.target.value)}
                    className="h-10 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] px-3 text-sm font-bold text-[var(--foreground)] outline-none focus:bg-[var(--card)] focus:ring-2 focus:ring-[var(--accent)]/20"
                  >
                    <option value="">품목구분 선택</option>
                    {SUPPLY_REQUEST_CATEGORY_OPTIONS.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-1.5">
                  <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">현재 재고</span>
                  <div
                    data-testid={`supplies-item-current-stock-mobile-${index}`}
                    className={`flex h-10 items-center justify-center rounded-[var(--radius-md)] border px-3 text-sm font-black ${
                      item.currentStock === null
                        ? 'border-[var(--border)] bg-[var(--surface-muted)] text-[var(--toss-gray-3)]'
                        : item.currentStock <= 5
                          ? 'border-[var(--danger-light)] bg-[var(--danger-light)] text-[var(--danger)]'
                          : 'border-[var(--accent-selected-subtle)] bg-[var(--accent-selected-subtle)] text-[var(--accent)]'
                    }`}
                  >
                    {item.currentStock === null ? '-' : `${item.currentStock} ${item.unit}`}
                  </div>
                </label>
              </div>

              <label className="block space-y-1.5">
                <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">신청 수량 ({item.unit})</span>
                <div className="flex items-center gap-2">
                  <input
                    data-testid={`supplies-item-qty-mobile-${index}`}
                    type="number"
                    inputMode="numeric"
                    min="1"
                    value={item.qty}
                    onChange={(event) => updateItemField(index, 'qty', event.target.value)}
                    className="h-10 w-1/2 rounded-[var(--radius-md)] border border-[var(--accent-selected-subtle)] bg-[var(--accent-selected-subtle)] px-3 text-center text-lg font-black tabular-nums text-[var(--accent)] outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                  />
                  <button
                    type="button"
                    data-testid={`supplies-item-unit-mobile-${index}`}
                    onClick={() => updateItemField(index, 'unit', item.unit === 'EA' ? 'BOX' : 'EA')}
                    aria-label={`단위 ${item.unit} — 클릭하여 ${item.unit === 'EA' ? 'BOX' : 'EA'}로 변경`}
                    title="클릭하여 EA/BOX 전환"
                    className="erp-chip erp-chip-active shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                  >
                    {item.unit}
                  </button>
                </div>
              </label>

              <label className="block space-y-1.5">
                <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">용도</span>
                <input
                  data-testid={`supplies-item-purpose-mobile-${index}`}
                  type="text"
                  value={item.purpose}
                  onChange={(event) => updateItemField(index, 'purpose', event.target.value)}
                  className="h-10 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] px-3 text-sm font-semibold text-[var(--foreground)] outline-none transition-all focus:bg-[var(--card)] focus:ring-2 focus:ring-[var(--accent)]/20"
                  placeholder="사용 용도를 입력하세요"
                />
              </label>
            </div>
          </div>
        ))}
      </div>

      {/* 데스크탑 — 외부 정렬 헤더 + EditableGrid */}
      <div className="erp-table-card hidden md:block">
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
              data-testid={`supplies-item-delete-${index}`}
              aria-label={`Delete supply row ${index + 1}`}
              onClick={() => removeItemRow(index)}
              disabled={items.length <= 1}
              className="inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] border border-[var(--danger-light)] bg-[var(--danger-light)] text-sm font-black leading-none text-[var(--danger)] transition-colors hover:border-[var(--danger)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              -
            </button>
          )}
          emptyMessage="신청할 비품을 추가해 주세요."
        />
      </div>
    </div>
  );
}
