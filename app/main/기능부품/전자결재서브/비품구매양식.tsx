'use client';

/**
 * 전자결재 §3-5 — 물품신청 양식 (렌더링 호스트)
 *
 * 비즈니스 로직(state/fetch/effects)은 useSuppliesForm 훅으로 분리.
 * 이 파일은 분할 컴포넌트 조립에만 집중. (JM: 한 파일 = 한 책임)
 *
 * 분할 구성:
 *  - useSuppliesForm         state/fetch/effects/콜백
 *  - SuppliesContextBar      신청부서 + 임시저장/재고0 chip
 *  - SuppliesStatPicker      최근 30일 추천 8개 카드
 *  - SuppliesPurchaseGrid    데스크탑 그리드 (자동완성·스테퍼)
 *  - SuppliesMobileCard      모바일 한 행 카드
 *  - SuppliesSummary         요약 row + 기타 + 첨부
 *  - supplies-helpers        타입·헬퍼·상수
 *
 * ApprovalComposerView와의 props 계약은 유지 (setExtraData/initialItems/user).
 */

import SuppliesPurchaseGrid from './비품구매양식Grid';
import SuppliesContextBar from './SuppliesContextBar';
import SuppliesStatPicker from './SuppliesStatPicker';
import SuppliesSummary from './SuppliesSummary';
import SuppliesMobileCard from './SuppliesMobileCard';
import { useSuppliesForm } from './useSuppliesForm';

// 호환을 위해 타입 재export.
export type { InventoryCatalogItem, SupplyRow } from './supplies-helpers';

type SuppliesFormProps = {
  setExtraData: (value: Record<string, unknown>) => void;
  initialItems?: unknown[];
  user?: Record<string, unknown> | null;
};

export default function SuppliesForm({ setExtraData, initialItems, user }: SuppliesFormProps) {
  const form = useSuppliesForm({ setExtraData, initialItems, user });

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm animate-in fade-in duration-300">
      {/* 카드 헤더 */}
      <div className="flex flex-col gap-2 border-b border-[var(--border)] px-3 py-2.5 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-black text-[var(--foreground)]">
            본문 — 물품신청
          </span>
          <span className="inline-flex items-center rounded-full bg-[var(--accent-light)] px-2 py-0.5 text-[10px] font-black text-[var(--accent)]">
            기본 양식
          </span>
          {form.visibleMonthlySuggestions.length > 0 ? (
            <span className="inline-flex items-center rounded-full bg-[var(--muted)] px-2 py-0.5 text-[10px] font-bold text-[var(--toss-gray-4)]">
              최근 작성
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            data-testid="supplies-add-row-button"
            onClick={form.addItemRow}
            className="inline-flex items-center gap-1 rounded-full bg-[var(--card)] px-2.5 py-1 text-[10px] font-bold text-[var(--foreground)] shadow-sm transition-colors hover:bg-[var(--accent-light)]/60"
          >
            <span className="inline-flex h-3 w-3 items-center justify-center rounded-full border border-current text-[10px] leading-none">
              +
            </span>
            항목 추가
          </button>
          <button
            type="button"
            data-testid="supplies-stats-fill-button"
            aria-pressed={form.statsExpanded}
            onClick={() => form.setStatsExpanded((prev) => !prev)}
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold shadow-sm transition-colors ${
              form.statsExpanded
                ? 'bg-[var(--accent)] text-white'
                : 'bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--accent-light)]/60'
            }`}
          >
            통계치 입력
          </button>
        </div>
      </div>

      <SuppliesContextBar
        requesterDepartment={form.requesterDepartment}
        inventoryLabel={form.requesterInventoryLabel}
        draftSavedAt={form.draftSavedAt}
        outOfStockCount={form.outOfStockCount}
      />

      <SuppliesStatPicker
        expanded={form.statsExpanded}
        onToggle={() => form.setStatsExpanded((prev) => !prev)}
        loading={form.statsLoading}
        summaryText={form.statsSummaryText}
        suggestions={form.visibleMonthlySuggestions}
        stockByName={form.departmentStockByName}
        onPick={form.insertSuggestionRow}
      />

      <div className="bg-[var(--tab-bg)]/20 p-2 md:p-3">
        {/* 모바일 카드 */}
        <div className="space-y-3 md:hidden">
          {form.items.map((item, index) => (
            <SuppliesMobileCard
              key={`mobile-${index}`}
              index={index}
              item={item}
              disableRemove={form.items.length <= 1}
              onSearch={(value) => form.handleSearch(index, value)}
              onSelect={(suggestion) => form.selectItem(index, suggestion)}
              onChangeField={(key, value) => form.updateItemField(index, key, value)}
              onRemove={() => form.removeItemAt(index)}
            />
          ))}
        </div>

        {/* 데스크탑 그리드 */}
        <SuppliesPurchaseGrid
          items={form.items}
          inputRefs={form.inputRefs}
          dropdownPos={form.dropdownPos}
          activeDropdownIndex={form.activeDropdownIndex}
          setActiveDropdownIndex={form.setActiveDropdownIndex}
          sortKey={form.sortKey}
          sortAsc={form.sortAsc}
          handleSearch={form.handleSearch}
          selectItem={form.selectItem}
          updateItemField={form.updateItemField}
          updateDropdownPosition={form.updateDropdownPosition}
          handleSort={form.handleSort}
          removeItemAt={form.removeItemAt}
        />

        {/* 행 추가 dashed (데스크탑 footer) */}
        <div className="mt-2 hidden md:block">
          <button
            type="button"
            data-testid="supplies-add-row-footer"
            onClick={form.addItemRow}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[11px] font-bold text-[var(--toss-gray-4)] transition-colors hover:border-[var(--accent)]/60 hover:bg-[var(--accent-light)]/40 hover:text-[var(--accent)]"
          >
            <span className="inline-flex h-3 w-3 items-center justify-center rounded-full border border-current text-[10px] leading-none">
              +
            </span>
            품목 행 추가
          </button>
        </div>

        {/* 모바일 마지막 행 삭제 */}
        <div className="mt-2 flex justify-end md:hidden">
          <button
            type="button"
            data-testid="supplies-remove-row-button"
            onClick={form.removeLastItemRow}
            disabled={form.items.length <= 1}
            className="inline-flex items-center rounded-full bg-red-500/10 px-3 py-1.5 text-[11px] font-bold text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
          >
            마지막 행 삭제
          </button>
        </div>
      </div>

      <SuppliesSummary
        itemCount={form.filledItemCount}
        totalQty={form.totalQty}
        outOfStockCount={form.outOfStockCount}
        note={form.note}
        onNoteChange={form.setNote}
        attachments={form.attachments}
        onAttachmentsChange={form.setAttachments}
      />
    </div>
  );
}
