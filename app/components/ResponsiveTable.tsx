'use client';

import { useRef, useEffect, type ReactNode } from 'react';
import { EmptyState } from '@/app/components/StatePanel';

export type Column<T> = {
  key: keyof T | string;
  label: string;
  render?: (row: T) => ReactNode;
  align?: 'left' | 'right' | 'center';
  showOnMobile?: boolean;
  primary?: boolean;
};

export type ResponsiveTableSelection = {
  /** 선택된 행 key (rowKey 문자열) */
  selected: Set<string>;
  /** 단일 행 토글 */
  onToggle: (key: string) => void;
  /** 전체 선택/해제 (전달 시 thead 체크박스 표시) */
  onToggleAll?: () => void;
  /** 전체 선택 상태 */
  allSelected?: boolean;
  /** 일부 선택 상태 (thead 체크박스 indeterminate) */
  indeterminate?: boolean;
  /** 체크박스 노출 여부 판단 (false면 해당 행 체크박스 숨김) */
  isRowSelectable?: (key: string) => boolean;
  /** 체크박스 접근성 라벨 */
  getRowAriaLabel?: (key: string) => string;
};

export type ResponsiveTableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  keyField: keyof T;
  onRowClick?: (row: T) => void;
  onRowDoubleClick?: (row: T) => void;
  emptyMessage?: string;
  className?: string;
  selection?: ResponsiveTableSelection;
};

const alignClass: Record<NonNullable<Column<unknown>['align']>, string> = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
};

function getCellValue<T>(row: T, col: Column<T>): ReactNode {
  if (col.render) return col.render(row);
  const key = col.key as keyof T;
  const val = row[key];
  if (val === null || val === undefined) return '—';
  return String(val);
}

/** thead 체크박스 indeterminate 동기화 — DOM-only 속성이라 ref 필요. */
function useIndeterminate(ref: React.RefObject<HTMLInputElement | null>, value: boolean) {
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = value;
  }, [ref, value]);
}

export function ResponsiveTable<T>({
  columns,
  rows,
  keyField,
  onRowClick,
  onRowDoubleClick,
  emptyMessage = '표시할 데이터가 없습니다.',
  className = '',
  selection,
}: ResponsiveTableProps<T>) {
  const headerCheckboxRef = useRef<HTMLInputElement | null>(null);
  useIndeterminate(headerCheckboxRef, Boolean(selection?.indeterminate));

  if (rows.length === 0) {
    return (
      <div className={className}>
        <EmptyState title={emptyMessage} compact />
      </div>
    );
  }

  const primaryCol = columns.find((c) => c.primary);
  const mobileColumns = columns.filter((c) => c.showOnMobile !== false);
  const mobileBodyColumns = mobileColumns.filter((c) => !c.primary);

  const rowKeyValue = (row: T) => String(row[keyField]);
  const isRowSelectable = (key: string) =>
    selection ? (selection.isRowSelectable ? selection.isRowSelectable(key) : true) : false;
  const rowAriaLabel = (key: string) =>
    selection?.getRowAriaLabel ? selection.getRowAriaLabel(key) : `행 ${key} 선택`;

  return (
    <div className={className}>
      {/* 데스크탑 테이블 — md 이상에서만 표시 */}
      <div className="hidden md:block">
        <table className="w-full border-collapse text-sm" role="table">
          <thead>
            <tr className="border-b border-[var(--border)]">
              {selection && (
                <th scope="col" className="w-10 px-3 py-2.5 text-center">
                  {selection.onToggleAll ? (
                    <input
                      ref={headerCheckboxRef}
                      type="checkbox"
                      checked={Boolean(selection.allSelected)}
                      onChange={selection.onToggleAll}
                      aria-label="전체 선택"
                      className="h-4 w-4 rounded accent-[var(--accent)] cursor-pointer"
                    />
                  ) : null}
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={String(col.key)}
                  scope="col"
                  className={[
                    'px-3 py-2.5 text-xs font-black text-[var(--toss-gray-4)]',
                    alignClass[col.align ?? 'left'],
                  ].join(' ')}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const key = rowKeyValue(row);
              const isSelected = selection ? selection.selected.has(key) : false;
              const canSelect = isRowSelectable(key);
              return (
                <tr
                  key={key}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onDoubleClick={onRowDoubleClick ? () => onRowDoubleClick(row) : undefined}
                  tabIndex={onRowClick || onRowDoubleClick ? 0 : undefined}
                  role={onRowClick || onRowDoubleClick ? 'button' : undefined}
                  aria-selected={selection ? isSelected : undefined}
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onRowClick(row);
                          }
                        }
                      : undefined
                  }
                  className={[
                    'border-b border-[var(--border)] transition-colors',
                    onRowClick
                      ? 'cursor-pointer hover:bg-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-inset'
                      : '',
                    isSelected ? 'bg-[var(--accent-light,var(--muted))]' : '',
                  ].join(' ')}
                >
                  {selection && (
                    <td className="w-10 px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      {canSelect ? (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => selection.onToggle(key)}
                          aria-label={rowAriaLabel(key)}
                          className="h-4 w-4 rounded accent-[var(--accent)] cursor-pointer"
                        />
                      ) : null}
                    </td>
                  )}
                  {columns.map((col) => (
                    <td
                      key={String(col.key)}
                      className={[
                        'px-3 py-3 text-sm text-[var(--foreground)]',
                        alignClass[col.align ?? 'left'],
                      ].join(' ')}
                    >
                      {getCellValue(row, col)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 모바일 카드 목록 — md 미만에서만 표시 */}
      <div className="flex flex-col gap-2 md:hidden" role="list">
        {rows.map((row) => {
          const key = rowKeyValue(row);
          const isSelected = selection ? selection.selected.has(key) : false;
          const canSelect = isRowSelectable(key);
          const CardEl = onRowClick ? 'button' : 'div';
          return (
            <div
              key={key}
              className={[
                'relative rounded-[var(--radius-lg)] border bg-[var(--card)]',
                isSelected ? 'border-[var(--accent)]' : 'border-[var(--border)]',
              ].join(' ')}
            >
              {selection && canSelect && (
                <label
                  className="absolute left-2 top-2 z-10 flex h-11 w-11 cursor-pointer items-center justify-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => selection.onToggle(key)}
                    aria-label={rowAriaLabel(key)}
                    className="h-5 w-5 rounded accent-[var(--accent)]"
                  />
                </label>
              )}
              <CardEl
                type={onRowClick || onRowDoubleClick ? 'button' : undefined}
                role={onRowClick || onRowDoubleClick ? undefined : 'listitem'}
                aria-selected={selection ? isSelected : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onDoubleClick={onRowDoubleClick ? () => onRowDoubleClick(row) : undefined}
                className={[
                  'block w-full px-4 py-3 text-left',
                  selection && canSelect ? 'pl-12' : '',
                  onRowClick
                    ? 'cursor-pointer rounded-[var(--radius-lg)] transition-colors hover:bg-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]'
                    : '',
                ].join(' ')}
              >
                {/* primary 컬럼 */}
                {primaryCol ? (
                  <div className="mb-2 text-base font-black text-[var(--foreground)]">
                    {getCellValue(row, primaryCol)}
                  </div>
                ) : null}

                {/* 나머지 컬럼 — label · value 쌍 */}
                <dl className="flex flex-col gap-1">
                  {mobileBodyColumns.map((col) => (
                    <div key={String(col.key)} className="flex items-start gap-2">
                      <dt className="w-20 shrink-0 text-xs font-bold text-[var(--toss-gray-4)]">
                        {col.label}
                      </dt>
                      <dd
                        className={[
                          'flex-1 text-xs font-medium text-[var(--foreground)]',
                          alignClass[col.align ?? 'left'],
                        ].join(' ')}
                      >
                        {getCellValue(row, col)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </CardEl>
            </div>
          );
        })}
      </div>
    </div>
  );
}
