'use client';

/**
 * 비품구매양식 — 모바일 한 행 카드.
 *
 * 데스크탑은 EditableGrid 기반 표(비품구매양식Grid)를 쓰고,
 * 모바일은 카드 1행 = 한 항목으로 풀어쓴다. 부모(비품구매양식)가 행 단위로
 * 콜백을 클로저로 묶어 넘긴다.
 *
 * JM6: 모든 입력은 label, 드롭다운은 role="listbox"/role="option".
 */

import { memo } from 'react';
import { SUPPLY_REQUEST_CATEGORY_OPTIONS } from '@/app/main/inventory-utils';
import type { InventoryCatalogItem, SupplyRow } from './supplies-helpers';

type SuppliesMobileCardProps = {
  index: number;
  item: SupplyRow;
  disableRemove: boolean;
  onSearch: (value: string) => void;
  onSelect: (suggestion: InventoryCatalogItem) => void;
  onChangeField: (key: 'qty' | 'category' | 'purpose' | 'unit', value: unknown) => void;
  onRemove: () => void;
};

function SuppliesMobileCardImpl({
  index,
  item,
  disableRemove,
  onSearch,
  onSelect,
  onChangeField,
  onRemove }: SuppliesMobileCardProps) {
  return (
    <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-[12px] font-black text-[var(--foreground)]">
          항목 {index + 1}
        </span>
        <button
          type="button"
          data-testid={`supplies-item-remove-mobile-${index}`}
          onClick={onRemove}
          disabled={disableRemove}
          aria-label={`항목 ${index + 1} 삭제`}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)] text-[var(--toss-gray-4)] transition-colors hover:border-red-300 hover:bg-red-500/10 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
        >
          −
        </button>
      </div>

      <div className="space-y-2.5">
        <label className="block space-y-1">
          <span className="text-[10px] font-bold text-[var(--toss-gray-4)]">물품명</span>
          <input
            data-testid={`supplies-item-name-mobile-${index}`}
            value={item.name}
            onChange={(event) => onSearch(event.target.value)}
            onFocus={(event) => onSearch(event.target.value)}
            className="h-10 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 text-[13px] font-bold text-[var(--foreground)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
            placeholder="물품명을 입력하세요"
          />
          {item.suggestions.length > 0 ? (
            <div
              role="listbox"
              className="mt-1 overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] shadow-sm"
            >
              {item.suggestions.slice(0, 4).map((suggestion, suggestionIndex) => (
                <button
                  key={`${suggestion.name}-${suggestionIndex}`}
                  type="button"
                  role="option"
                  aria-selected={false}
                  onMouseDown={() => onSelect(suggestion)}
                  className="flex w-full items-center justify-between gap-3 border-b border-[var(--border)] px-3 py-2 text-left text-[12px] font-bold transition-colors last:border-none hover:bg-[var(--accent-light)]/60"
                >
                  <span className="min-w-0 truncate text-[var(--foreground)]">
                    {suggestion.name}
                  </span>
                  <span className="text-[10px] font-semibold text-[var(--toss-gray-3)]">
                    재고 {suggestion.stock} {suggestion.unit}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="block space-y-1">
            <span className="text-[10px] font-bold text-[var(--toss-gray-4)]">품목구분</span>
            <select
              data-testid={`supplies-item-category-mobile-${index}`}
              value={item.category}
              onChange={(event) => onChangeField('category', event.target.value)}
              className="h-10 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 text-[12px] font-bold text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
            >
              <option value="">선택</option>
              {SUPPLY_REQUEST_CATEGORY_OPTIONS.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-[10px] font-bold text-[var(--toss-gray-4)]">수량</span>
            <div className="flex items-center gap-1">
              <input
                data-testid={`supplies-item-qty-mobile-${index}`}
                type="number"
                min={1}
                value={item.qty}
                onChange={(event) => onChangeField('qty', event.target.value)}
                className="h-10 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 text-center text-[14px] font-black tabular-nums text-[var(--accent)] outline-none focus:border-[var(--accent)]"
              />
              <select
                aria-label="단위 선택"
                value={item.unit}
                onChange={(event) => onChangeField('unit', event.target.value)}
                className="h-10 shrink-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-1 text-[10px] font-black text-[var(--accent)]"
              >
                <option value="EA">EA</option>
                <option value="BOX">BOX</option>
              </select>
            </div>
          </label>
        </div>

        <label className="block space-y-1">
          <span className="text-[10px] font-bold text-[var(--toss-gray-4)]">용도</span>
          <input
            data-testid={`supplies-item-purpose-mobile-${index}`}
            value={item.purpose}
            onChange={(event) => onChangeField('purpose', event.target.value)}
            placeholder="사용 용도"
            className="h-10 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 text-[12px] font-semibold text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
          />
        </label>
      </div>
    </div>
  );
}

const SuppliesMobileCard = memo(SuppliesMobileCardImpl);
export default SuppliesMobileCard;
