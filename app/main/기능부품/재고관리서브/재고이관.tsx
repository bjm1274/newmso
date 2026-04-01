'use client';
import { toast } from '@/lib/toast';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { withMissingColumnsFallback } from '@/lib/supabase-compat';
import {
  getItemName,
  getItemQuantity,
  validateInventoryQuantity,
  validateInventoryTransfer,
} from '@/app/main/inventory-utils';

const EMPTY_TRANSFER_FORM = {
  item_id: '',
  quantity: 1,
  to_company: '',
  to_dept: '',
  reason: '',
};

function normalizeInventoryText(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

function findDestinationInventoryItem(
  inventory: any[],
  selectedItem: any,
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
  user: any;
  inventory: any[];
  fetchInventory: () => void | Promise<void>;
}) {
  const [transfers, setTransfers] = useState<any[]>([]);
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
      const { error: sourceUpdateError } = await supabase
        .from('inventory')
        .update({ quantity: sourceNextQty, stock: sourceNextQty })
        .eq('id', form.item_id);
      if (sourceUpdateError) {
        throw sourceUpdateError;
      }

      let destinationInventoryId = destinationItem?.id ?? null;

      if (destinationItem) {
        const { error: destinationUpdateError } = await supabase
          .from('inventory')
          .update({ quantity: destinationNextQty, stock: destinationNextQty })
          .eq('id', destinationItem.id);
        if (destinationUpdateError) {
          throw destinationUpdateError;
        }
      } else {
        const baseDestinationPayload: Record<string, any> = {
          item_name: getItemName(selectedItem),
          category: selectedItem?.category || null,
          quantity: transferQuantity,
          stock: transferQuantity,
          min_quantity: selectedItem?.min_quantity ?? selectedItem?.min_stock ?? 0,
          unit_price: selectedItem?.unit_price ?? selectedItem?.price ?? 0,
          expiry_date: selectedItem?.expiry_date || null,
          lot_number: selectedItem?.lot_number || null,
          serial_number: selectedItem?.serial_number || null,
          is_udi: Boolean(selectedItem?.is_udi),
          company: form.to_company,
          department: form.to_dept || '',
          location: selectedItem?.location || null,
        };

        if (selectedItem?.spec) baseDestinationPayload.spec = selectedItem.spec;
        if (selectedItem?.insurance_code) baseDestinationPayload.insurance_code = selectedItem.insurance_code;
        if (selectedItem?.udi_code) baseDestinationPayload.udi_code = selectedItem.udi_code;
        if (selectedItem?.supplier_name) baseDestinationPayload.supplier_name = selectedItem.supplier_name;
        if (selectedItem?.supplier) baseDestinationPayload.supplier = selectedItem.supplier;

        const { data: insertedDestination, error: destinationInsertError } =
          await withMissingColumnsFallback<Record<string, any>>(
            (omittedColumns) => {
              const destinationPayload: Record<string, any> = { ...baseDestinationPayload };

              if (destinationCompanyId && !omittedColumns.has('company_id')) {
                destinationPayload.company_id = destinationCompanyId;
              }

              if (omittedColumns.has('department')) {
                delete destinationPayload.department;
              }

              return supabase
                .from('inventory')
                .insert([destinationPayload])
                .select('*')
                .single();
            },
            ['company_id', 'department'],
          );
        if (destinationInsertError) {
          throw destinationInsertError;
        }

        destinationInventoryId = insertedDestination?.id ?? null;
      }

      const transferPayload: Record<string, unknown> = {
        item_id: form.item_id,
        item_name: getItemName(selectedItem),
        quantity: transferQuantity,
        from_company: sourceCompany,
        from_department: sourceDept,
        to_company: form.to_company,
        to_department: form.to_dept,
        reason: form.reason,
        serial_number: selectedItem?.serial_number || null,
        transferred_by: user?.name,
        transferred_by_id: user?.id,
        status: '완료',
      };

      const { error: transferError } = await withMissingColumnsFallback(
        (omittedColumns) => {
          const nextPayload = { ...transferPayload };
          if (omittedColumns.has('serial_number')) {
            delete nextPayload.serial_number;
          }
          return supabase.from('inventory_transfers').insert([nextPayload]);
        },
        ['serial_number'],
      );
      if (transferError) {
        throw transferError;
      }

      const logRows = [
        {
          item_id: form.item_id,
          inventory_id: form.item_id,
          type: '이관',
          change_type: '이관출고',
          quantity: transferQuantity,
          prev_quantity: maxQty,
          next_quantity: sourceNextQty,
          serial_number: selectedItem?.serial_number || null,
          actor_name: user?.name,
          company: sourceCompany,
          notes: sourceNotes,
        },
      ];

      if (destinationInventoryId) {
        logRows.push({
          item_id: destinationInventoryId,
          inventory_id: destinationInventoryId,
          type: '이관',
          change_type: '이관입고',
          quantity: transferQuantity,
          prev_quantity: destinationPrevQty,
          next_quantity: destinationNextQty,
          serial_number: selectedItem?.serial_number || null,
          actor_name: user?.name,
          company: form.to_company,
          notes: destinationNotes,
        });
      }

      const { error: logError } = await withMissingColumnsFallback(
        (omittedColumns) => {
          const nextRows = logRows.map((row) => {
            const nextRow = { ...row };
            if (omittedColumns.has('serial_number')) {
              delete nextRow.serial_number;
            }
            return nextRow;
          });
          return supabase.from('inventory_logs').insert(nextRows);
        },
        ['serial_number'],
      );
      if (logError) {
        throw logError;
      }

      resetForm();
      setActiveTab('history');
      await Promise.all([Promise.resolve(fetchInventory()), fetchTransfers()]);
      toast('이관이 완료되었습니다.', 'success');
    } catch {
      toast('이관 처리 실패', 'error');
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
                className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-md)] text-sm bg-[var(--card)] outline-none"
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
                className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-md)] text-sm bg-[var(--card)] outline-none"
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
                className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-md)] text-sm bg-[var(--card)] outline-none"
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
                className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-md)] text-sm bg-[var(--card)] outline-none"
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
                className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-md)] text-sm bg-[var(--card)] outline-none"
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
            <p data-testid="inventory-transfer-error" className="text-xs font-semibold text-red-500">
              {validationMessage}
            </p>
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
            <div key={transfer.id} className="flex items-center justify-between p-3 bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-md)]">
              <div>
                <p className="text-sm font-bold text-[var(--foreground)]">{transfer.item_name}</p>
                <p className="text-[10px] text-[var(--toss-gray-3)]">
                  {transfer.from_company} {transfer.from_department} → {transfer.to_company} {transfer.to_department} · {transfer.quantity}개 · {transfer.transferred_by}
                </p>
                {transfer.serial_number && (
                  <p className="text-[10px] text-[var(--toss-gray-3)]">시리얼: {transfer.serial_number}</p>
                )}
                {transfer.reason && <p className="text-[10px] text-[var(--toss-gray-3)]">사유: {transfer.reason}</p>}
              </div>
              <div className="text-right">
                <span className="px-2 py-0.5 rounded-[var(--radius-md)] text-[9px] font-bold bg-green-100 text-green-700">{transfer.status || '완료'}</span>
                <p className="text-[9px] text-[var(--toss-gray-3)] mt-0.5">{transfer.created_at?.slice(0, 10)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
