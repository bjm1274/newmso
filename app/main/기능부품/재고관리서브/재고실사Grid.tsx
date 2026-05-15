'use client';

import { EditableGrid, type EditableGridField } from '@/app/components/EditableGrid';
import { validateInventoryQuantity } from '@/app/main/inventory-utils';

export type CountRow = {
  id: string;
  item_name: string;
  category: string;
  company: string;
  expected: number;
  actual: string; // 입력값 (string)
};

type InventoryCountGridProps = {
  rows: CountRow[];
  onChangeActual: (id: string, value: string) => void;
};

type RowMeta = {
  actualNum: number | null;
  actualError: string | null;
  diff: number | null;
  hasError: boolean;
  hasDiff: boolean;
};

function evaluateRow(row: CountRow): RowMeta {
  const { quantity, error } = validateInventoryQuantity(row.actual, {
    label: '실물 수량',
    allowEmpty: true,
  });
  const diff = quantity !== null ? quantity - row.expected : null;
  return {
    actualNum: quantity,
    actualError: error ?? null,
    diff,
    hasError: Boolean(error),
    hasDiff: diff !== null && diff !== 0,
  };
}

export default function InventoryCountGrid({
  rows,
  onChangeActual,
}: InventoryCountGridProps) {
  const fields: EditableGridField<CountRow>[] = [
    {
      id: 'company',
      label: '회사/분류',
      width: '140px',
      render: (row) => (
        <div className="flex flex-col leading-tight">
          <span className="text-xs font-bold text-[var(--accent)]">{row.company}</span>
          <span className="text-[10px] text-[var(--toss-gray-3)]">{row.category}</span>
        </div>
      ),
    },
    {
      id: 'item_name',
      label: '품목명',
      showOnMobile: false,
      render: (row) => (
        <span className="text-sm font-semibold text-[var(--foreground)]">
          {row.item_name}
        </span>
      ),
    },
    {
      id: 'expected',
      label: '장부 수량',
      align: 'center',
      width: '90px',
      render: (row) => (
        <span className="text-sm font-bold text-[var(--toss-gray-4)]">
          {row.expected}
        </span>
      ),
    },
    {
      id: 'actual',
      label: '실물 수량 입력',
      align: 'center',
      width: '160px',
      render: (row) => {
        const { actualError, hasError, hasDiff } = evaluateRow(row);
        const inputId = `inventory-count-actual-${row.id}`;
        return (
          <div className="flex flex-col items-center gap-1">
            <input
              id={inputId}
              type="number"
              inputMode="decimal"
              min={0}
              step={1}
              value={row.actual}
              onChange={(event) => onChangeActual(row.id, event.target.value)}
              placeholder="실물 수량"
              aria-label={`${row.item_name} 실물 수량`}
              aria-invalid={hasError ? true : undefined}
              className={[
                'w-24 sm:w-28 rounded-[var(--radius-md)] border px-2 py-2 text-center text-sm font-bold outline-none focus:ring-2 focus:ring-[var(--accent)]/20',
                hasError
                  ? 'border-[var(--danger)] bg-[color:color-mix(in_oklab,var(--danger)_10%,transparent)]'
                  : hasDiff
                  ? 'border-[var(--accent)] bg-[color:color-mix(in_oklab,var(--accent)_8%,transparent)]'
                  : 'border-[var(--border)] bg-[var(--card)]',
              ].join(' ')}
            />
            {actualError ? (
              <p className="text-[10px] font-semibold text-[var(--danger)]">
                {actualError}
              </p>
            ) : null}
          </div>
        );
      },
    },
    {
      id: 'diff',
      label: '차이',
      align: 'center',
      width: '80px',
      render: (row) => {
        const { diff, hasError } = evaluateRow(row);
        if (hasError || diff === null) {
          return <span className="text-sm text-[var(--toss-gray-3)]">-</span>;
        }
        if (diff === 0) {
          return (
            <span className="text-sm font-bold text-[var(--success,#16a34a)]">
              ✓
            </span>
          );
        }
        return (
          <span
            className={`text-sm font-bold ${
              diff > 0 ? 'text-[var(--success,#16a34a)]' : 'text-[var(--danger)]'
            }`}
          >
            {diff > 0 ? '+' : ''}
            {diff}
          </span>
        );
      },
    },
  ];

  return (
    <EditableGrid<CountRow>
      rows={rows}
      fields={fields}
      rowKey={(row) => row.id}
      rowTone={(row) => {
        const meta = evaluateRow(row);
        if (meta.hasError) return 'error';
        if (meta.hasDiff) return 'changed';
        return 'normal';
      }}
      mobileTitle={(row) => (
        <div className="flex flex-col leading-tight">
          <span className="text-base font-black text-[var(--foreground)]">
            {row.item_name}
          </span>
          <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">
            {row.company} · {row.category}
          </span>
        </div>
      )}
      emptyMessage="검색 조건에 맞는 실사 품목이 없습니다."
    />
  );
}
