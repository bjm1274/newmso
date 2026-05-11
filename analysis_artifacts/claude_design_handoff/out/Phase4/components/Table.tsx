'use client';

/**
 * Table.tsx — Phase 4 데이터 테이블
 *
 * responsive prop: 모바일에서 카드 뷰로 전환
 * JM4: 제네릭 Table<T extends Record<string, unknown>>
 * JM6: role="table/row/columnheader/cell", scope, aria-label
 */

import React from 'react';

export interface ColumnDef<T extends Record<string, unknown>> {
  key: keyof T & string;
  header: string;
  width?: string;
  align?: 'left' | 'center' | 'right';
  render?: (value: T[keyof T], row: T, index: number) => React.ReactNode;
}

export interface TableProps<T extends Record<string, unknown>> {
  columns: ColumnDef<T>[];
  data: T[];
  rowKey: (row: T, index: number) => string | number;
  responsive?: boolean;
  ariaLabel?: string;
  emptyText?: string;
  stickyHeader?: boolean;
  onRowClick?: (row: T) => void;
  className?: string;
}

// ── 빈 상태 ───────────────────────────────────────────────────────────────────

function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="py-10 text-center text-sm text-[var(--toss-gray-4)]"
      >
        {text}
      </td>
    </tr>
  );
}

// ── 모바일 카드 뷰 ────────────────────────────────────────────────────────────

function CardView<T extends Record<string, unknown>>({
  columns,
  data,
  rowKey,
  onRowClick,
  emptyText,
}: Pick<TableProps<T>, 'columns' | 'data' | 'rowKey' | 'onRowClick' | 'emptyText'>) {
  if (data.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-[var(--toss-gray-4)]">
        {emptyText ?? '데이터가 없습니다.'}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {data.map((row, index) => (
        <li
          key={rowKey(row, index)}
          onClick={() => onRowClick?.(row)}
          className={[
            'rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 py-3',
            onRowClick ? 'cursor-pointer hover:bg-[var(--muted)] active:opacity-80' : '',
          ].join(' ')}
        >
          {columns.map((col) => {
            const rawValue = row[col.key];
            const rendered = col.render ? col.render(rawValue, row, index) : String(rawValue ?? '');
            return (
              <div key={col.key} className="flex items-start justify-between py-0.5 gap-4">
                <span className="text-xs text-[var(--toss-gray-4)] shrink-0">{col.header}</span>
                <span className="text-sm text-[var(--foreground)] text-right">{rendered}</span>
              </div>
            );
          })}
        </li>
      ))}
    </ul>
  );
}

// ── 데스크톱 테이블 뷰 ────────────────────────────────────────────────────────

function DesktopTable<T extends Record<string, unknown>>({
  columns,
  data,
  rowKey,
  ariaLabel,
  emptyText,
  stickyHeader,
  onRowClick,
}: Omit<TableProps<T>, 'responsive' | 'className'>) {
  return (
    <div className="overflow-x-auto">
      <table
        role="table"
        aria-label={ariaLabel}
        className="w-full text-sm border-collapse"
      >
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                style={{ width: col.width, textAlign: col.align ?? 'left' }}
                className={[
                  'h-9 px-3 text-xs font-semibold text-[var(--toss-gray-4)]',
                  'border-b border-[var(--border)] bg-[var(--muted)] first:rounded-tl-[var(--radius-md)] last:rounded-tr-[var(--radius-md)]',
                  stickyHeader ? 'sticky top-0 z-10' : '',
                ].join(' ')}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <EmptyRow colSpan={columns.length} text={emptyText ?? '데이터가 없습니다.'} />
          ) : (
            data.map((row, index) => (
              <tr
                key={rowKey(row, index)}
                onClick={() => onRowClick?.(row)}
                className={[
                  'border-b border-[var(--border-subtle)] last:border-0',
                  onRowClick ? 'cursor-pointer hover:bg-[var(--muted)] transition-colors' : '',
                ].join(' ')}
              >
                {columns.map((col) => {
                  const rawValue = row[col.key];
                  const rendered = col.render ? col.render(rawValue, row, index) : String(rawValue ?? '');
                  return (
                    <td
                      key={col.key}
                      style={{ textAlign: col.align ?? 'left' }}
                      className="h-10 px-3 text-[var(--foreground)]"
                    >
                      {rendered}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export default function Table<T extends Record<string, unknown>>({
  columns,
  data,
  rowKey,
  responsive = false,
  ariaLabel,
  emptyText,
  stickyHeader = false,
  onRowClick,
  className = '',
}: TableProps<T>) {
  return (
    <div className={className}>
      {responsive ? (
        <>
          {/* 모바일: 카드 / 데스크톱: 테이블 */}
          <div className="block sm:hidden">
            <CardView
              columns={columns}
              data={data}
              rowKey={rowKey}
              onRowClick={onRowClick}
              emptyText={emptyText}
            />
          </div>
          <div className="hidden sm:block">
            <DesktopTable
              columns={columns}
              data={data}
              rowKey={rowKey}
              ariaLabel={ariaLabel}
              emptyText={emptyText}
              stickyHeader={stickyHeader}
              onRowClick={onRowClick}
            />
          </div>
        </>
      ) : (
        <DesktopTable
          columns={columns}
          data={data}
          rowKey={rowKey}
          ariaLabel={ariaLabel}
          emptyText={emptyText}
          stickyHeader={stickyHeader}
          onRowClick={onRowClick}
        />
      )}
    </div>
  );
}
