'use client';

import { createPortal } from 'react-dom';
import type { Dispatch, MutableRefObject, SetStateAction, WheelEvent } from 'react';
import { SUPPLY_REQUEST_CATEGORY_OPTIONS } from '@/app/main/inventory-utils';
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

      <div className="erp-table-card hidden md:block">
        <table className="erp-table w-full max-w-full table-fixed">
          <colgroup>
            <col className="w-[12%]" />
            <col className="w-[29%]" />
            <col className="w-[12%]" />
            <col className="w-[6%]" />
            <col className="w-[36%]" />
            <col className="w-[5%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th
                className="cursor-pointer select-none px-2.5 py-2 text-left text-[11px] font-bold text-[var(--toss-gray-4)] hover:text-[var(--accent)]"
                onClick={() => handleSort('category')}
              >
                품목구분 {sortKey === 'category' ? (sortAsc ? '▲' : '▼') : ''}
              </th>
              <th
                className="cursor-pointer select-none px-2.5 py-2 text-left text-[11px] font-bold text-[var(--toss-gray-4)] hover:text-[var(--accent)]"
                onClick={() => handleSort('name')}
              >
                물품명 {sortKey === 'name' ? (sortAsc ? '▲' : '▼') : ''}
              </th>
              <th className="pl-1.5 pr-0 py-2 text-left text-[11px] font-bold text-[var(--toss-gray-4)]">현재 재고</th>
              <th className="pl-0 pr-0 py-2 text-left text-[11px] font-bold text-[var(--toss-gray-4)]">신청 수량</th>
              <th className="pl-1.5 pr-0.5 py-2 text-left text-[11px] font-bold text-[var(--toss-gray-4)]">용도</th>
              <th
                aria-label="삭제"
                className="pl-0 pr-0 py-2 text-right text-[11px] font-bold text-[var(--toss-gray-4)]"
              />
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={`desktop-reordered-${index}`} className="border-b border-[var(--border)] last:border-b-0">
                <td className="px-1 py-1.5 align-middle">
                  <select
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
                </td>
                <td className="px-1.5 py-1.5 align-middle">
                  <div>
                    <input
                      data-supply-input
                      data-testid={`supplies-item-name-${index}`}
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
                        setTimeout(() => setActiveDropdownIndex((prev) => prev === index ? null : prev), 200);
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
                </td>
                <td className="pl-1 pr-0 py-1.5 align-middle">
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
                </td>
                <td className="pl-0 pr-0 py-1.5 align-middle">
                  <div className="flex min-w-0 items-center gap-1">
                    <input
                      data-testid={`supplies-item-qty-${index}`}
                      type="number"
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
                </td>
                <td className="pl-1.5 pr-0.5 py-1.5 align-middle">
                  <input
                    data-testid={`supplies-item-purpose-${index}`}
                    value={item.purpose}
                    onChange={(event) => updateItemField(index, 'purpose', event.target.value)}
                    className="h-9 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] px-2 text-xs font-semibold text-[var(--foreground)] outline-none transition-all focus:bg-[var(--card)] focus:ring-2 focus:ring-[var(--accent)]/20"
                    placeholder="사용 용도를 입력하세요"
                  />
                </td>
                <td className="pl-0 pr-0 py-1.5 align-middle text-right">
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
