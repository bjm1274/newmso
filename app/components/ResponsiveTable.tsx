'use client';

import { type ReactNode } from 'react';
import { EmptyState } from '@/app/components/StatePanel';

export type Column<T> = {
  key: keyof T | string;
  label: string;
  render?: (row: T) => ReactNode;
  align?: 'left' | 'right' | 'center';
  showOnMobile?: boolean;
  primary?: boolean;
};

export type ResponsiveTableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  keyField: keyof T;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  className?: string;
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

export function ResponsiveTable<T>({
  columns,
  rows,
  keyField,
  onRowClick,
  emptyMessage = '표시할 데이터가 없습니다.',
  className = '',
}: ResponsiveTableProps<T>) {
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

  return (
    <div className={className}>
      {/* 데스크탑 테이블 — md 이상에서만 표시 */}
      <div className="hidden md:block">
        <table
          className="w-full border-collapse text-sm"
          role="table"
        >
          <thead>
            <tr className="border-b border-[var(--border)]">
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
            {rows.map((row) => (
              <tr
                key={rowKeyValue(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                role={onRowClick ? 'button' : undefined}
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
                ].join(' ')}
              >
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
            ))}
          </tbody>
        </table>
      </div>

      {/* 모바일 카드 목록 — md 미만에서만 표시 */}
      <div className="flex flex-col gap-2 md:hidden" role="list">
        {rows.map((row) => {
          const CardEl = onRowClick ? 'button' : 'div';
          return (
            <CardEl
              key={rowKeyValue(row)}
              type={onRowClick ? 'button' : undefined}
              role={onRowClick ? undefined : 'listitem'}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={[
                'w-full rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-left',
                onRowClick
                  ? 'cursor-pointer transition-colors hover:bg-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]'
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
          );
        })}
      </div>
    </div>
  );
}
