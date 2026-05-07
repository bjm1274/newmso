'use client';
import type { ReactNode } from 'react';

export interface DataTableColumn<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  className?: string;
  headerClassName?: string;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  rowKey: (row: T) => string;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  overflowX?: boolean;
}

export function DataTable<T>({
  columns,
  data,
  rowKey,
  emptyMessage = '데이터 없음',
  onRowClick,
  overflowX = false,
}: DataTableProps<T>) {
  const wrapperClass = `bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] shadow-sm ${overflowX ? 'overflow-x-auto' : 'overflow-hidden'}`;

  return (
    <div className={wrapperClass}>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="bg-[var(--muted)] border-b border-[var(--border)]">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-4 py-3 text-left font-bold text-[var(--toss-gray-4)] ${col.headerClassName ?? ''}`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-10 text-center text-[var(--toss-gray-3)] font-bold"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row) => (
              <tr
                key={rowKey(row)}
                className={`border-b border-[var(--border)] hover:bg-[var(--muted)]/50 ${onRowClick ? 'cursor-pointer' : ''}`}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-4 py-3 ${col.className ?? ''}`}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
