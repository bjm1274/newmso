'use client';

import { EditableGrid, type EditableGridField } from '@/app/components/EditableGrid';

/**
 * 마감보고 수납 내역 그리드 — 단일 책임: 수납 항목 표 렌더링 + 셀별 편집 위임.
 * 부모(마감보고.tsx)가 items 상태/핸들러를 소유하고 여기에 props로 주입한다.
 */

export interface ClosureGridItem {
  id?: string;
  patient_name: string;
  amount: number;
  payment_method: string;
  receipt_type: string;
  memo: string;
}

type Props = {
  items: ClosureGridItem[];
  updateItem: (index: number, field: keyof ClosureGridItem, value: unknown) => void;
  removeItem: (index: number) => void;
};

const PAYMENT_METHODS = ['카드', '현금', '계좌이체'] as const;
const RECEIPT_TYPES = ['진료비', '제증명', '기타'] as const;

export default function ClosureItemsGrid({ items, updateItem, removeItem }: Props) {
  const fields: EditableGridField<ClosureGridItem>[] = [
    {
      id: 'patient_name',
      label: '환자명',
      width: '20%',
      render: (item, idx) => (
        <>
          <label htmlFor={`daily-closure-item-patient-${idx}`} className="sr-only">
            환자명
          </label>
          <input
            id={`daily-closure-item-patient-${idx}`}
            data-testid={`daily-closure-item-patient-${idx}`}
            type="text"
            value={item.patient_name}
            onChange={(e) => updateItem(idx, 'patient_name', e.target.value)}
            className="w-full bg-transparent outline-none font-medium"
            placeholder="환자명"
          />
        </>
      ) },
    {
      id: 'amount',
      label: '금액',
      align: 'right',
      width: '15%',
      render: (item, idx) => (
        <>
          <label htmlFor={`daily-closure-item-amount-${idx}`} className="sr-only">
            금액
          </label>
          <input
            id={`daily-closure-item-amount-${idx}`}
            data-testid={`daily-closure-item-amount-${idx}`}
            type="number"
            inputMode="decimal"
            value={item.amount}
            onChange={(e) => {
              const raw = e.target.value;
              const next = raw === '' ? 0 : Number(raw);
              updateItem(idx, 'amount', Number.isFinite(next) ? next : 0);
            }}
            className="w-full bg-transparent outline-none font-bold text-blue-600 text-right"
          />
        </>
      ) },
    {
      id: 'payment_method',
      label: '수납방식',
      width: '15%',
      render: (item, idx) => (
        <>
          <label htmlFor={`daily-closure-item-method-${idx}`} className="sr-only">
            수납방식
          </label>
          <select
            id={`daily-closure-item-method-${idx}`}
            value={item.payment_method}
            onChange={(e) => updateItem(idx, 'payment_method', e.target.value)}
            className="bg-transparent outline-none w-full"
          >
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </>
      ) },
    {
      id: 'receipt_type',
      label: '항목',
      width: '15%',
      render: (item, idx) => (
        <>
          <label htmlFor={`daily-closure-item-type-${idx}`} className="sr-only">
            항목 종류
          </label>
          <select
            id={`daily-closure-item-type-${idx}`}
            value={item.receipt_type}
            onChange={(e) => updateItem(idx, 'receipt_type', e.target.value)}
            className="bg-transparent outline-none w-full"
          >
            {RECEIPT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </>
      ) },
    {
      id: 'memo',
      label: '메모',
      width: '35%',
      render: (item, idx) => (
        <>
          <label htmlFor={`daily-closure-item-memo-${idx}`} className="sr-only">
            메모
          </label>
          <input
            id={`daily-closure-item-memo-${idx}`}
            type="text"
            value={item.memo}
            onChange={(e) => updateItem(idx, 'memo', e.target.value)}
            className="w-full bg-transparent outline-none text-[var(--toss-gray-3)]"
            placeholder="비고"
          />
        </>
      ) },
  ];

  return (
    <EditableGrid<ClosureGridItem>
      rows={items}
      fields={fields}
      rowKey={(item, idx) => item.id ?? `new-${idx}`}
      rowTone={(item) => {
        const invalidAmount = !Number.isFinite(item.amount) || item.amount < 0;
        const missingPatient = !item.patient_name.trim();
        return invalidAmount || missingPatient ? 'error' : 'normal';
      }}
      mobileTitle={(item, idx) => item.patient_name.trim() || `항목 ${idx + 1}`}
      actions={(_item, idx) => (
        <button
          type="button"
          onClick={() => removeItem(idx)}
          aria-label={`수납 내역 ${idx + 1} 삭제`}
          className="text-red-400 hover:text-red-600 text-base font-bold px-2"
        >
          ✕
        </button>
      )}
      emptyMessage="수납 내역을 추가해 주세요."
    />
  );
}
