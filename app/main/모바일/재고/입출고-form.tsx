'use client';

/**
 * IORecordForm + KpiCard — 입출고.tsx에서 분리된 서브 컴포넌트.
 * JM: ~120줄
 */

import { useState } from 'react';
import { toast } from '@/lib/toast';
import { enqueueSupabaseMutation } from '@/lib/offline-queue-supabase';
import {
  MFormHeader,
  MField,
  MInput,
  MSegRow,
  useFieldIdPrefix,
} from '../인사관리/form-helpers';
import type { StockMutateUser } from './data-hooks';

type IOKind = '입고' | '출고';

type IOFormState = {
  kind: IOKind;
  item: string;
  qty: string;
  reason: string;
};

const IO_FORM_INITIAL: IOFormState = { kind: '입고', item: '', qty: '', reason: '' };

export function IORecordForm({
  user,
  onClose,
}: {
  user: StockMutateUser | null;
  onClose: () => void;
}) {
  const [v, setV] = useState<IOFormState>(IO_FORM_INITIAL);
  const [saving, setSaving] = useState(false);
  const fid = useFieldIdPrefix('io');

  const set = <K extends keyof IOFormState>(k: K, val: IOFormState[K]) =>
    setV((prev) => ({ ...prev, [k]: val }));

  const handleSave = async () => {
    if (saving) return;
    const item = v.item.trim();
    if (!item) { toast('품목명을 입력해 주세요.', 'error'); return; }
    const qty = Number(v.qty);
    if (!Number.isFinite(qty) || qty <= 0) { toast('수량은 1 이상이어야 합니다.', 'error'); return; }

    // StockMutateUser에 id/company 없으므로 unknown 경유로 안전하게 읽기
    const u = user as unknown as Record<string, unknown>;

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        item_name: item,
        transaction_type: v.kind === '입고' ? 'in' : 'out',
        quantity: qty,
        reason: v.reason.trim() || null,
        staff_id: typeof u?.id === 'string' ? u.id : null,
        company: typeof u?.company === 'string' ? u.company : null,
        created_at: new Date().toISOString(),
      };

      const { queued, error } = await enqueueSupabaseMutation({
        kind: 'insert',
        table: 'inventory_transactions',
        payload,
        retryable: true,
      });

      if (error) { toast(`저장 실패: ${error}`, 'error'); return; }
      if (queued) { toast('오프라인 — 입출고 기록 대기 중', 'info'); onClose(); return; }
      toast(`${v.kind} 기록이 저장되었습니다.`, 'success');
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
        onSave={() => { void handleSave(); }}
        saveDisabled={!v.item.trim() || saving}
        saveLabel={saving ? '저장 중…' : '저장'}
      />
      <div className="m-scroll">
        <div className="m-card flush" style={{ borderRadius: 0, border: 'none' }}>
          <MField label="유형">
            <MSegRow
              ariaLabel="입출고 유형"
              value={v.kind}
              onPick={(k) => set('kind', k as IOKind)}
              options={[
                { id: '입고', label: '입고' },
                { id: '출고', label: '출고' },
              ]}
            />
          </MField>
          <MField label="품목명" required htmlFor={fid('item')}>
            <MInput
              id={fid('item')}
              value={v.item}
              onChange={(val) => set('item', val)}
              placeholder="예: 카테터 18Ga"
              autoFocus
            />
          </MField>
          <MField label="수량" required htmlFor={fid('qty')}>
            <MInput
              id={fid('qty')}
              value={v.qty}
              onChange={(val) => set('qty', val)}
              placeholder="예: 10"
              kind="numeric"
            />
          </MField>
          <MField label="사유" htmlFor={fid('reason')}>
            <MInput
              id={fid('reason')}
              value={v.reason}
              onChange={(val) => set('reason', val)}
              placeholder="예: 수술실 긴급 출고"
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
  unit,
  tone,
}: {
  label: string;
  value: number;
  unit: string;
  tone: 'accent' | 'success' | 'warning' | 'danger';
}) {
  const color =
    tone === 'accent'
      ? 'var(--m-accent)'
      : tone === 'success'
        ? 'var(--m-success)'
        : tone === 'warning'
          ? 'var(--m-warning)'
          : 'var(--m-danger)';
  return (
    <div className="m-card" style={{ padding: '12px 14px' }}>
      <div style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 700 }}>{label}</div>
      <div
        className="m-tnum"
        style={{
          fontSize: 22,
          fontWeight: 800,
          letterSpacing: '-0.025em',
          marginTop: 4,
          color,
        }}
      >
        {value}
        <span style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 700, marginLeft: 3 }}>
          {unit}
        </span>
      </div>
    </div>
  );
}
