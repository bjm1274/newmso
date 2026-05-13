'use client';

import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { SupplyRequestMonthlySuggestion } from '@/app/main/inventory-utils';
import SuppliesItemTable from './SuppliesItemTable';
import SuppliesMetaSection from './SuppliesMetaSection';
import type { InventoryCatalogItem, SupplyRow } from './비품구매양식';

type SuppliesInventorySectionProps = {
  requesterInventoryLabel: string;
  requesterDepartment: string;
  items: SupplyRow[];
  setItems: Dispatch<SetStateAction<SupplyRow[]>>;
  statsExpanded: boolean;
  setStatsExpanded: Dispatch<SetStateAction<boolean>>;
  statsLoading: boolean;
  monthlySuggestions: SupplyRequestMonthlySuggestion[];
  inventoryCatalog: InventoryCatalogItem[];
  departmentStockByName: Map<string, number>;
  addItemRow: () => void;
  removeLastItemRow: () => void;
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

export default function SuppliesInventorySection({
  requesterInventoryLabel,
  requesterDepartment,
  items,
  setItems,
  statsExpanded,
  setStatsExpanded,
  statsLoading,
  monthlySuggestions,
  inventoryCatalog,
  departmentStockByName,
  addItemRow,
  removeLastItemRow,
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
}: SuppliesInventorySectionProps) {
  return (
    <div className="erp-panel overflow-hidden animate-in fade-in duration-300">
      <SuppliesMetaSection
        requesterInventoryLabel={requesterInventoryLabel}
        requesterDepartment={requesterDepartment}
        itemsLength={items.length}
        statsExpanded={statsExpanded}
        setStatsExpanded={setStatsExpanded}
        statsLoading={statsLoading}
        monthlySuggestions={monthlySuggestions}
        inventoryCatalog={inventoryCatalog}
        departmentStockByName={departmentStockByName}
        setItems={setItems}
        addItemRow={addItemRow}
        removeLastItemRow={removeLastItemRow}
      />
      <SuppliesItemTable
        items={items}
        inputRefs={inputRefs}
        dropdownPos={dropdownPos}
        activeDropdownIndex={activeDropdownIndex}
        setActiveDropdownIndex={setActiveDropdownIndex}
        sortKey={sortKey}
        sortAsc={sortAsc}
        handleSearch={handleSearch}
        selectItem={selectItem}
        updateItemField={updateItemField}
        updateDropdownPosition={updateDropdownPosition}
        handleSort={handleSort}
        removeItemRow={removeItemRow}
      />
    </div>
  );
}
