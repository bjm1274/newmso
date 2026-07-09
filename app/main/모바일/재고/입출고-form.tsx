'use client';

/**
 * 입출고 폼 — 재고 SSOT (stock-post API)
 * 품목 선택 → 수량 → 서버에서 quantity+stock+logs 원자 처리
 */

import { useEffect, useMemo, useState } from 'react';
import { toast } from '@/lib/toast';
import { db } from '@/lib/db-client';
import { formatStockApiError, postStockMovement } from '@/lib/inventory-stock-client';
import {
  MFormHeader,
  MField,
  MInput,
  MSegRow,
  useFieldIdPrefix,
} from '../인사관리/form-helpers';
import type { StockMutateUser } from './data-hooks';

type IOKind = '입고' | '출고';

type InvItem = {
  id: string;
  name?: string | null;
  item_name?: string | null;
  quantity?: number | null;
  stock?: number | null;
  company?: string | null;
  department?: string | null;
  location?: string | null;
  unit_price?: number | null;
};

export function IORecordForm({
  user,
  onClose,
}: {
  user: StockMutateUser | null;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<IOKind>('입고');
  const [itemId, setItemId] = useState('');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [items, setItems] = useState<InvItem[]>([]);
  const [saving, setSaving] = useState(false);
  const fid = useFieldIdPrefix('io');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const u = user as unknown as Record<string, unknown> | null;
      const company = typeof u?.company === 'string' ? u.company : null;
      let q = db.from('inventory').select('id, name, item_name, quantity, stock, company, department, location, unit_price').order('item_name').limit(500);
      if (company) q = q.eq('company', company);
      const { data } = await q;
      if (!cancelled && data) setItems(data as InvItem[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const selected = useMemo(
    () => items.find((i) => String(i.id) === String(itemId)) || null,
    [items, itemId],
  );
  const onHand = selected
    ? Number(selected.quantity ?? selected.stock ?? 0) || 0
    : 0;

  const handleSave = async () => {
    if (saving) return;
    if (!selected) {
      toast('품목을 선택해 주세요.', 'error');
      return;
    }
    const n = Number(qty);
    if (!Number.isFinite(n) || n <= 0) {
      toast('수량은 1 이상이어야 합니다.', 'error');
      return;
    }
    if (kind === '출고' && onHand < n) {
      toast(`재고 부족 (현재 ${onHand}개)`, 'error');
      return;
    }

    const u = user as unknown as Record<string, unknown>;
    setSaving(true);
    try {
      const result = await postStockMovement({
        itemId: String(selected.id),
        mode: 'delta',
        delta: kind === '입고' ? Math.trunc(n) : -Math.trunc(n),
        type: kind,
        notes: reason.trim() || `${kind} (모바일)`,
        company:
          selected.company ||
          (typeof u?.company === 'string' ? u.company : null),
        department:
          selected.department ||
          (typeof u?.department === 'string' ? u.department : null),
        location: selected.location ?? null,
        unitPrice: selected.unit_price != null ? Number(selected.unit_price) : null,
      });
      if (!result.ok) {
        toast(formatStockApiError(result.error, result.code), 'error');
        return;
      }
      toast(
        `${kind} 완료 · 재고 ${result.data?.prev_qty} → ${result.data?.next_qty}`,
        'success',
      );
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="m-screen">
      <MFormHeader
        title="입출고 기록"
        onCancel={onClose}
        onSave={() => {
          void handleSave();
        }}
        saveDisabled={!itemId || saving}
        saveLabel={saving ? '저장 중…' : '저장'}
      />
      <div className="m-scroll">
        <div className="m-card flush" style={{ borderRadius: 0, border: 'none' }}>
          <MField label="유형">
            <MSegRow
              ariaLabel="입출고 유형"
              value={kind}
              onPick={(k) => setKind(k as IOKind)}
              options={[
                { id: '입고', label: '입고' },
                { id: '출고', label: '출고' },
              ]}
            />
          </MField>
          <MField label="품목" required htmlFor={fid('item')}>
            <select
              id={fid('item')}
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              className="w-full h-11 px-3 rounded-lg border border-[var(--border)] bg-[var(--card)] text-sm font-semibold"
            >
              <option value="">품목 선택…</option>
              {items.map((it) => {
                const label = it.item_name || it.name || it.id;
                const q = Number(it.quantity ?? it.stock ?? 0) || 0;
                return (
                  <option key={it.id} value={it.id}>
                    {label} (재고 {q})
                  </option>
                );
              })}
            </select>
            {selected && (
              <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">
                현재 재고 <strong>{onHand}</strong> · {selected.department || selected.company || ''}
              </p>
            )}
          </MField>
          <MField label="수량" required htmlFor={fid('qty')}>
            <MInput
              id={fid('qty')}
              value={qty}
              onChange={(val) => setQty(val)}
              placeholder="예: 10"
            />
          </MField>
          <MField label="사유/비고" htmlFor={fid('reason')}>
            <MInput
              id={fid('reason')}
              value={reason}
              onChange={(val) => setReason(val)}
              placeholder="선택"
            />
          </MField>
        </div>
      </div>
    </div>
  );
}

export function KpiCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="m-card p-3">
      <p className="text-[10px] font-bold text-[var(--toss-gray-3)] uppercase">{label}</p>
      <p className="text-lg font-black text-[var(--foreground)]">{value}</p>
      {sub ? <p className="text-[10px] text-[var(--toss-gray-3)]">{sub}</p> : null}
    </div>
  );
}
