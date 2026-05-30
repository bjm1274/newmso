'use client';
import { toast } from '@/lib/toast';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { StaffMember, InventoryItem } from '@/types';
import {
  getItemName,
  getItemQuantity,
  normalizeInventoryText,
  validateInventoryQuantity,
  validateInventoryTransfer,
} from '@/app/main/inventory-utils';
import { InventorySummaryStrip, InventoryStepSummary } from './InventoryDesignPanels';

const EMPTY_TRANSFER_FORM = {
  item_id: '',
  quantity: 1,
  to_company: '',
  to_dept: '',
  reason: '',
};

function findDestinationInventoryItem(
  inventory: InventoryItem[],
  selectedItem: InventoryItem | null,
  toCompany: string,
  toDept: string,
) {
  if (!selectedItem || !toCompany.trim()) {
    return null;
  }

  return (
    inventory.find((candidate) => {
      if (String(candidate.id) === String(selectedItem.id)) {
        return false;
      }

      return (
        normalizeInventoryText(getItemName(candidate)) === normalizeInventoryText(getItemName(selectedItem)) &&
        normalizeInventoryText(candidate.category) === normalizeInventoryText(selectedItem.category) &&
        normalizeInventoryText(candidate.spec) === normalizeInventoryText(selectedItem.spec) &&
        normalizeInventoryText(candidate.lot_number) === normalizeInventoryText(selectedItem.lot_number) &&
        normalizeInventoryText(candidate.serial_number) === normalizeInventoryText(selectedItem.serial_number) &&
        normalizeInventoryText(candidate.company) === normalizeInventoryText(toCompany) &&
        normalizeInventoryText(candidate.department) === normalizeInventoryText(toDept)
      );
    }) || null
  );
}

export default function InventoryTransfer({
  user,
  inventory = [],
  fetchInventory,
}: {
  user?: StaffMember;
  inventory: InventoryItem[];
  fetchInventory: () => void | Promise<void>;
}) {
  const [transfers, setTransfers] = useState<Record<string, unknown>[]>([]);
  const [form, setForm] = useState(EMPTY_TRANSFER_FORM);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'request' | 'history'>('request');
  const [destinationItem, setDestinationItem] = useState<any | null>(null);
  const [companyOptions, setCompanyOptions] = useState<string[]>(() =>
    Array.from(
      new Set(
        inventory
          .map((item) => String(item.company || '').trim())
          .filter(Boolean),
      ),
    ).sort(),
  );

  const resetForm = useCallback(() => {
    setForm(EMPTY_TRANSFER_FORM);
  }, []);

  const fetchTransfers = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('inventory_transfers')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) {
        throw error;
      }
      setTransfers(data || []);
    } catch {
      setTransfers([]);
    }
  }, []);

  useEffect(() => {
    fetchTransfers();
  }, [fetchTransfers]);

  useEffect(() => {
    const inventoryCompanies = Array.from(
      new Set(
        inventory
          .map((item) => String(item.company || '').trim())
          .filter(Boolean),
      ),
    ).sort();
    let cancelled = false;

    const loadCompanies = async () => {
      try {
        const { data, error } = await supabase
          .from('companies')
          .select('name')
          .eq('is_active', true);

        if (cancelled) {
          return;
        }

        const remoteCompanies =
          !error && Array.isArray(data)
            ? data
                .map((company: any) => String(company?.name || '').trim())
                .filter(Boolean)
            : [];

        setCompanyOptions(Array.from(new Set([...inventoryCompanies, ...remoteCompanies])).sort());
      } catch {
        if (!cancelled) {
          setCompanyOptions(inventoryCompanies);
        }
      }
    };

    loadCompanies();

    return () => {
      cancelled = true;
    };
  }, [inventory]);

  const selectedItem = useMemo(
    () => inventory.find((item) => String(item.id) === String(form.item_id)) || null,
    [form.item_id, inventory],
  );
  const sourceCompany = String(selectedItem?.company || '').trim();
  const sourceDept = String(selectedItem?.department || '').trim();
  const maxQty = selectedItem ? getItemQuantity(selectedItem) : 0;
  const quantityValidation = validateInventoryQuantity(form.quantity, {
    label: '이관 수량',
    min: 1,
    max: maxQty,
  });
  const validationMessage = validateInventoryTransfer({
    item: selectedItem,
    quantity: form.quantity,
    toCompany: form.to_company,
    fromCompany: sourceCompany,
    toDept: form.to_dept,
    fromDept: sourceDept,
  });
  const destinationPrevQty = destinationItem ? getItemQuantity(destinationItem) : 0;
  const requestedQuantity = quantityValidation.quantity ?? 0;
  const sourceNextQty = selectedItem ? Math.max(maxQty - requestedQuantity, 0) : 0;
  const destinationNextQty = destinationPrevQty + requestedQuantity;
  const destinationDepartments = useMemo(() => {
    if (!form.to_company.trim()) {
      return [];
    }

    return Array.from(
      new Set(
        inventory
          .filter(
            (item) =>
              normalizeInventoryText(item.company) === normalizeInventoryText(form.to_company),
          )
          .map((item) => String(item.department || '').trim())
          .filter(Boolean),
      ),
    ).sort();
  }, [form.to_company, inventory]);
  const shouldShowValidation = Boolean(
    form.item_id || form.to_company || form.to_dept || form.reason || form.quantity !== 1,
  );

  useEffect(() => {
    const localDestinationItem = findDestinationInventoryItem(
      inventory,
      selectedItem,
      form.to_company,
      form.to_dept,
    );

    if (!selectedItem || !form.to_company.trim()) {
      setDestinationItem(null);
      return;
    }

    if (localDestinationItem) {
      setDestinationItem(localDestinationItem);
      return;
    }

    let cancelled = false;

    const loadDestinationItem = async () => {
      try {
        const { data, error } = await supabase
          .from('inventory')
          .select('*')
          .eq('company', form.to_company)
          .eq('item_name', getItemName(selectedItem));

        if (error) {
          throw error;
        }

        if (cancelled) {
          return;
        }

        setDestinationItem(
          findDestinationInventoryItem(data || [], selectedItem, form.to_company, form.to_dept),
        );
      } catch {
        if (!cancelled) {
          setDestinationItem(null);
        }
      }
    };

    loadDestinationItem();

    return () => {
      cancelled = true;
    };
  }, [form.to_company, form.to_dept, inventory, selectedItem]);

  const handleTransfer = async () => {
    if (validationMessage || !selectedItem || quantityValidation.quantity === null) {
      toast(validationMessage || '이관 정보를 다시 확인하세요.', 'warning');
      return;
    }

    const destinationCompanyId =
      inventory.find(
        (item) =>
          normalizeInventoryText(item.company) === normalizeInventoryText(form.to_company) &&
          item.company_id,
      )?.company_id ??
      (normalizeInventoryText(sourceCompany) === normalizeInventoryText(form.to_company)
        ? selectedItem.company_id ?? null
        : null);
    const transferQuantity = quantityValidation.quantity;
    const sourceNotes = `→ ${form.to_company}${form.to_dept ? ` ${form.to_dept}` : ''} (사유: ${form.reason || '없음'})`;
    const destinationNotes = `${sourceCompany}${sourceDept ? ` ${sourceDept}` : ''} → ${form.to_company}${form.to_dept ? ` ${form.to_dept}` : ''} (사유: ${form.reason || '없음'})`;

    setSaving(true);
    try {
      // 출발지 차감 + 목적지 증가/생성 + 이력 + 로그를 서버에서 단일
      // D1 batch(all-or-nothing)로 처리한다. 중간 실패 시 재고가 증발하던
      // 기존 다단계 클라 쓰기를 제거하고 원자성을 보장한다.
      const requestBody: Record<string, unknown> = {
        sourceId: form.item_id,
        quantity: transferQuantity,
        meta: {
          item_name: getItemName(selectedItem),
          from_company: sourceCompany || null,
          from_department: sourceDept || null,
          to_company: form.to_company || null,
          to_department: form.to_dept || null,
          reason: form.reason || null,
          serial_number: selectedItem?.serial_number || null,
          source_notes: sourceNotes,
          dest_notes: destinationNotes,
        },
      };

      if (destinationItem) {
        requestBody.destId = String(destinationItem.id);
      } else {
        const newDest: Record<string, unknown> = {
          item_name: getItemName(selectedItem),
          category: selectedItem?.category || null,
          min_quantity: selectedItem?.min_quantity ?? selectedItem?.min_stock ?? 0,
          unit_price: selectedItem?.unit_price ?? selectedItem?.price ?? 0,
          expiry_date: selectedItem?.expiry_date || null,
          lot_number: selectedItem?.lot_number || null,
          serial_number: selectedItem?.serial_number || null,
          is_udi: Boolean(selectedItem?.is_udi),
          company: form.to_company,
          company_id: destinationCompanyId || null,
          department: form.to_dept || '',
          location: selectedItem?.location || null,
          spec: selectedItem?.spec || null,
          insurance_code: selectedItem?.insurance_code || null,
          udi_code: selectedItem?.udi_code || null,
          supplier_name: selectedItem?.supplier_name || null,
          supplier: selectedItem?.supplier || null,
        };
        requestBody.newDest = newDest;
      }

      const response = await fetch('/api/inventory/stock-transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(requestBody),
      });

      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) {
        const code = result?.code;
        let message = '이관 처리 실패';
        if (code === 'INSUFFICIENT_STOCK') message = '출발지 재고가 부족합니다.';
        else if (code === 'SOURCE_NOT_FOUND') message = '출발지 품목을 찾을 수 없습니다.';
        else if (code === 'DEST_NOT_FOUND') message = '목적지 품목을 찾을 수 없습니다.';
        throw new Error(message);
      }

      resetForm();
      setActiveTab('history');
      await Promise.all([Promise.resolve(fetchInventory()), fetchTransfers()]);
      toast('이관이 완료되었습니다.', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : '이관 처리 실패', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 space-y-4" data-testid="inventory-transfer-view">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-[var(--foreground)]">부서간 재고 이관</h2>
          <p className="text-xs text-[var(--toss-gray-3)] mt-1">출발 위치 재고를 차감하고 목적지 재고를 자동으로 합산합니다.</p>
        </div>
        <button
          data-testid="inventory-transfer-reset-button"
          aria-label="새 요청"
          onClick={() => {
            resetForm();
            setActiveTab('request');
          }}
          className="px-4 py-2 bg-[var(--accent)] text-white rounded-[var(--radius-md)] text-sm font-bold shadow-sm hover:opacity-90"
        >
          + 새 이관 요청
        </button>
      </div>

      <InventorySummaryStrip
        items={[
          { label: '선택 품목', value: selectedItem ? getItemName(selectedItem) : '미선택', detail: selectedItem ? `${sourceCompany || '회사 미지정'} ${sourceDept || ''}` : '이관할 품목을 먼저 선택합니다.', tone: selectedItem ? 'info' : 'default' },
          { label: '이관 수량', value: requestedQuantity || '-', detail: selectedItem ? `현재고 ${maxQty.toLocaleString('ko-KR')}` : '선택 후 수량 제한이 적용됩니다.', tone: quantityValidation.error ? 'danger' : requestedQuantity > 0 ? 'success' : 'default' },
          { label: '출발지 결과', value: selectedItem ? `${maxQty} -> ${sourceNextQty}` : '-', detail: '실행 시 출발지 재고가 차감됩니다.', tone: selectedItem ? 'warning' : 'default' },
          { label: '목적지 결과', value: form.to_company ? `${destinationPrevQty} -> ${destinationNextQty}` : '-', detail: destinationItem ? '기존 목적지 품목에 합산' : '없으면 새 품목 카드 생성', tone: form.to_company ? 'success' : 'default' },
        ]}
      />

      <InventoryStepSummary
        steps={[
          { label: '품목 선택', detail: selectedItem ? getItemName(selectedItem) : '이관할 재고를 선택합니다.', state: selectedItem ? 'done' : 'active' },
          { label: '목적지 입력', detail: form.to_company ? `${form.to_company}${form.to_dept ? ` / ${form.to_dept}` : ''}` : '이관 받을 회사와 부서를 지정합니다.', state: form.to_company ? 'done' : 'pending' },
          { label: '변경 결과 확인', detail: validationMessage || '출발지 차감과 목적지 증가를 확인한 뒤 실행합니다.', state: validationMessage ? 'warning' : selectedItem && form.to_company ? 'active' : 'pending' },
        ]}
      />

      <div className="flex gap-1 bg-[var(--muted)] rounded-[var(--radius-md)] p-1 w-fit">
        {[{ key: 'request', label: '이관 신청' }, { key: 'history', label: '이관 이력' }].map((tab) => (
          <button
            key={tab.key}
            aria-label={tab.key === 'request' ? '요청 탭' : '이력 탭'}
            onClick={() => setActiveTab(tab.key as 'request' | 'history')}
            className={`px-4 py-1.5 rounded-[var(--radius-md)] text-xs font-bold transition-all ${activeTab === tab.key ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm' : 'text-[var(--toss-gray-3)]'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'request' && (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4 shadow-sm space-y-4">
          <p className="text-sm font-bold text-[var(--foreground)]">이관 신청서 작성</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">이관 물품 *</label>
              <select
                data-testid="inventory-transfer-item-select"
                value={form.item_id}
                onChange={(event) => setForm((prev) => ({ ...prev, item_id: event.target.value }))}
                className="w-full px-3 py-2.5 border border-[var(--border)] rounded-[var(--radius-md)] text-sm bg-[var(--card)] outline-none"
              >
                <option value="">물품 선택</option>
                {inventory.map((item) => (
                  <option key={item.id} value={item.id}>
                    {getItemName(item)} ({getItemQuantity(item)}개 · {item.company || '회사 미지정'})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">이관 수량 *</label>
              <input
                data-testid="inventory-transfer-quantity-input"
                type="number"
                value={form.quantity}
                min={1}
                step={1}
                max={maxQty || undefined}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    quantity: event.target.value === '' ? 0 : Number(event.target.value),
                  }))
                }
                className="w-full px-3 py-2.5 border border-[var(--border)] rounded-[var(--radius-md)] text-sm bg-[var(--card)] outline-none"
              />
              {selectedItem && (
                <p className="text-[10px] text-[var(--toss-gray-3)] mt-0.5">현재 재고: {maxQty}개</p>
              )}
            </div>

            <div className="md:col-span-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)]/60 p-3">
              <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] mb-2">출발 위치</p>
              <p data-testid="inventory-transfer-source-location" className="text-sm font-bold text-[var(--foreground)]">
                {selectedItem ? `${sourceCompany || '회사 미지정'} ${sourceDept || '부서 미지정'}` : '물품을 선택하면 현재 위치가 표시됩니다.'}
              </p>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">이관 대상 법인 *</label>
              <select
                data-testid="inventory-transfer-to-company-select"
                value={form.to_company}
                onChange={(event) => setForm((prev) => ({ ...prev, to_company: event.target.value }))}
                className="w-full px-3 py-2.5 border border-[var(--border)] rounded-[var(--radius-md)] text-sm bg-[var(--card)] outline-none"
              >
                <option value="">선택</option>
                {companyOptions.map((company) => (
                  <option key={company} value={company}>
                    {company}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">이관 대상 부서</label>
              <input
                data-testid="inventory-transfer-to-dept-input"
                value={form.to_dept}
                list="inventory-transfer-departments"
                onChange={(event) => setForm((prev) => ({ ...prev, to_dept: event.target.value }))}
                placeholder="예: 원무팀"
                className="w-full px-3 py-2.5 border border-[var(--border)] rounded-[var(--radius-md)] text-sm bg-[var(--card)] outline-none"
              />
              <datalist id="inventory-transfer-departments">
                {destinationDepartments.map((department) => (
                  <option key={department} value={department} />
                ))}
              </datalist>
            </div>

            <div className="md:col-span-2">
              <label className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">이관 사유</label>
              <input
                data-testid="inventory-transfer-reason-input"
                value={form.reason}
                onChange={(event) => setForm((prev) => ({ ...prev, reason: event.target.value }))}
                placeholder="예: 부서 재배치"
                className="w-full px-3 py-2.5 border border-[var(--border)] rounded-[var(--radius-md)] text-sm bg-[var(--card)] outline-none"
              />
            </div>
          </div>

          {selectedItem && (
            <div
              data-testid="inventory-transfer-preview"
              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)]/70 p-3"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] font-semibold text-[var(--toss-gray-3)]">출발지 예상 재고</p>
                  <p className="text-sm font-bold text-[var(--foreground)]">
                    {maxQty}개 → {sourceNextQty}개
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-[var(--toss-gray-3)]">목적지 예상 재고</p>
                  <p className="text-sm font-bold text-[var(--foreground)]">
                    {destinationPrevQty}개 → {destinationNextQty}개
                  </p>
                </div>
              </div>
              <p className="mt-3 text-[11px] text-[var(--toss-gray-3)]">
                {destinationItem
                  ? '목적지에 같은 품목이 있어 기존 재고에 합산됩니다.'
                  : '목적지에 같은 품목이 없어 새 재고 카드가 생성됩니다.'}
              </p>
            </div>
          )}

          {shouldShowValidation && validationMessage && (
            <div data-testid="inventory-transfer-error" className="flex items-start gap-2 bg-red-500/5 border-l-4 border-red-500 px-4 py-3 rounded-[var(--radius-md)]">
              <p className="text-xs font-bold text-red-600">{validationMessage}</p>
            </div>
          )}

          <button
            data-testid="inventory-transfer-submit"
            aria-label="재고 이동 실행"
            onClick={handleTransfer}
            disabled={saving}
            className="px-4 py-2 bg-[var(--accent)] text-white rounded-[var(--radius-md)] text-sm font-bold disabled:opacity-50 hover:opacity-90"
          >
            {saving ? '처리 중...' : '이관 실행'}
          </button>
        </div>
      )}

      {activeTab === 'history' && (
        <div data-testid="inventory-transfer-history" className="space-y-2">
          {transfers.length === 0 ? (
            <div className="text-center py-10 text-[var(--toss-gray-3)] font-bold text-sm">이관 이력이 없습니다.</div>
          ) : transfers.map((transfer) => (
            <div key={String(transfer.id ?? '')} className="flex items-center justify-between p-3 bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-md)]">
              <div>
                <p className="text-sm font-bold text-[var(--foreground)]">{String(transfer.item_name ?? '')}</p>
                <p className="text-[10px] text-[var(--toss-gray-3)]">
                  {String(transfer.from_company ?? '')} {String(transfer.from_department ?? '')} → {String(transfer.to_company ?? '')} {String(transfer.to_department ?? '')} · {String(transfer.quantity ?? '')}개 · {String(transfer.transferred_by ?? '')}
                </p>
                {Boolean(transfer.serial_number) && (
                  <p className="text-[10px] text-[var(--toss-gray-3)]">시리얼: {String(transfer.serial_number)}</p>
                )}
                {Boolean(transfer.reason) && <p className="text-[10px] text-[var(--toss-gray-3)]">사유: {String(transfer.reason)}</p>}
              </div>
              <div className="text-right">
                <span className="px-2 py-0.5 rounded-[var(--radius-md)] text-[9px] font-bold bg-green-100 text-green-700">{String(transfer.status || '완료')}</span>
                <p className="text-[9px] text-[var(--toss-gray-3)] mt-0.5">{String(transfer.created_at ?? '').slice(0, 10)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
