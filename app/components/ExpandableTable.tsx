'use client';

import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { EmptyState } from '@/app/components/StatePanel';

export type ExpandableColumn<T> = {
  key: keyof T | string;
  label: string;
  render?: (row: T) => ReactNode;
  align?: 'left' | 'right' | 'center';
  showOnMobile?: boolean;
  primary?: boolean;
  filterable?: boolean;
  filterOptions?: { value: string; label: string }[];
};

export type ExpandableTableProps<T> = {
  columns: ExpandableColumn<T>[];
  rows: T[];
  keyField: keyof T;
  renderExpanded: (row: T) => ReactNode;
  defaultExpandedIds?: string[];
  onFilterChange?: (filters: Record<string, string>) => void;
  emptyMessage?: string;
  className?: string;
  hasExpandable?: (row: T) => boolean;
};

const alignClass: Record<NonNullable<ExpandableColumn<unknown>['align']>, string> = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
};

function getCellValue<T>(row: T, col: ExpandableColumn<T>): ReactNode {
  if (col.render) return col.render(row);
  const key = col.key as keyof T;
  const val = row[key];
  if (val === null || val === undefined) return '—';
  return String(val);
}

type FilterDropdownProps = {
  colKey: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
};

function FilterDropdown({ colKey, label, value, options, onChange }: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const active = !!value;
  return (
    <span data-col-menu className="relative inline-flex items-center gap-1">
      <span>{label}</span>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`${label} 필터`}
        aria-expanded={open}
        className={`inline-flex h-4 w-4 items-center justify-center rounded text-[9px] leading-none transition-colors ${active ? 'text-[var(--accent)]' : 'text-[var(--toss-gray-3)] hover:text-[var(--foreground)]'}`}
      >
        ▾
      </button>
      {open && (
        <div
          className="absolute left-0 top-full z-20 mt-1 min-w-[120px] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-1 shadow-lg"
          role="listbox"
          aria-label={`${label} 필터 옵션`}
        >
          <button
            key={`${colKey}-all`}
            type="button"
            onClick={() => { onChange(''); setOpen(false); }}
            className={`w-full rounded-[var(--radius-md)] px-3 py-1.5 text-left text-[11px] font-bold transition-colors ${!value ? 'bg-[var(--accent)] text-white' : 'text-[var(--toss-gray-4)] hover:bg-[var(--muted)]'}`}
          >
            전체
          </button>
          {options.map((opt) => (
            <button
              key={`${colKey}-${opt.value}`}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full rounded-[var(--radius-md)] px-3 py-1.5 text-left text-[11px] font-bold transition-colors ${value === opt.value ? 'bg-[var(--accent)] text-white' : 'text-[var(--toss-gray-4)] hover:bg-[var(--muted)]'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

export function ExpandableTable<T>({
  columns,
  rows,
  keyField,
  renderExpanded,
  defaultExpandedIds = [],
  onFilterChange,
  emptyMessage = '표시할 데이터가 없습니다.',
  className = '',
  hasExpandable,
}: ExpandableTableProps<T>) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set(defaultExpandedIds));
  const [filters, setFilters] = useState<Record<string, string>>({});

  const filteredRows = useMemo(() => {
    const activeFilters = Object.entries(filters).filter(([, v]) => v !== '');
    if (activeFilters.length === 0) return rows;
    return rows.filter((row) =>
      activeFilters.every(([key, val]) => {
        const cell = (row as Record<string, unknown>)[key];
        return String(cell ?? '') === val;
      }),
    );
  }, [rows, filters]);

  const rowKeyValue = (row: T) => String(row[keyField]);

  const toggleRow = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const setFilter = (key: string, value: string) => {
    const next = { ...filters, [key]: value };
    setFilters(next);
    onFilterChange?.(next);
  };

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
  const canExpandRow = (row: T) => (hasExpandable ? hasExpandable(row) : true);

  return (
    <div className={className}>
      {/* 데스크탑 */}
      <div className="hidden md:block">
        <table className="w-full border-collapse text-sm" role="table">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--muted)]">
              <th scope="col" className="w-8 px-2 py-2.5" aria-label="펼침" />
              {columns.map((col) => (
                <th
                  key={String(col.key)}
                  scope="col"
                  className={['px-3 py-2.5 text-xs font-black text-[var(--toss-gray-4)]', alignClass[col.align ?? 'left']].join(' ')}
                >
                  {col.filterable && col.filterOptions ? (
                    <FilterDropdown
                      colKey={String(col.key)}
                      label={col.label}
                      value={filters[String(col.key)] ?? ''}
                      options={col.filterOptions}
                      onChange={(v) => setFilter(String(col.key), v)}
                    />
                  ) : (
                    col.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => {
              const id = rowKeyValue(row);
              const isExpanded = expandedIds.has(id);
              const expandable = canExpandRow(row);
              const panelId = `expand-panel-${id}`;
              return (
                <Fragment key={id}>
                  <tr
                    className={['border-b border-[var(--border)] transition-colors', expandable ? 'cursor-pointer hover:bg-[var(--muted)]/50' : '', isExpanded ? 'bg-[var(--muted)]/30' : ''].join(' ')}
                    onClick={expandable ? () => toggleRow(id) : undefined}
                    tabIndex={expandable ? 0 : undefined}
                    role={expandable ? 'button' : undefined}
                    aria-expanded={expandable ? isExpanded : undefined}
                    aria-controls={expandable ? panelId : undefined}
                    onKeyDown={
                      expandable
                        ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              toggleRow(id);
                            }
                          }
                        : undefined
                    }
                  >
                    <td className="w-8 px-2 py-3 text-[var(--toss-gray-3)]" aria-hidden="true">
                      {expandable ? (
                        isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
                      ) : null}
                    </td>
                    {columns.map((col) => (
                      <td
                        key={String(col.key)}
                        onClick={(e) => { if (expandable) e.stopPropagation(); }}
                        className={['px-3 py-3 text-sm text-[var(--foreground)]', alignClass[col.align ?? 'left']].join(' ')}
                      >
                        {getCellValue(row, col)}
                      </td>
                    ))}
                  </tr>
                  {expandable && isExpanded && (
                    <tr className="border-b border-[var(--border)] bg-[var(--muted)]/20">
                      <td colSpan={columns.length + 1} id={panelId} className="px-4 py-3">
                        {renderExpanded(row)}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 모바일 */}
      <div className="flex flex-col gap-2 md:hidden" role="list">
        {filteredRows.map((row) => {
          const id = rowKeyValue(row);
          const isExpanded = expandedIds.has(id);
          const expandable = canExpandRow(row);
          const panelId = `expand-panel-m-${id}`;
          return (
            <div
              key={id}
              role="listitem"
              className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)]"
            >
              <button
                type="button"
                onClick={expandable ? () => toggleRow(id) : undefined}
                aria-expanded={expandable ? isExpanded : undefined}
                aria-controls={expandable ? panelId : undefined}
                disabled={!expandable}
                className={[
                  'w-full rounded-[var(--radius-lg)] px-4 py-3 text-left',
                  expandable ? 'cursor-pointer transition-colors hover:bg-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]' : 'cursor-default',
                ].join(' ')}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    {primaryCol ? (
                      <div className="mb-2 text-base font-black text-[var(--foreground)]">
                        {getCellValue(row, primaryCol)}
                      </div>
                    ) : null}
                    <dl className="flex flex-col gap-1">
                      {mobileBodyColumns.map((col) => (
                        <div key={String(col.key)} className="flex items-start gap-2">
                          <dt className="w-20 shrink-0 text-xs font-bold text-[var(--toss-gray-4)]">{col.label}</dt>
                          <dd className={['flex-1 text-xs font-medium text-[var(--foreground)]', alignClass[col.align ?? 'left']].join(' ')}>
                            {getCellValue(row, col)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                  {expandable ? (
                    <span className="mt-1 shrink-0 text-[var(--toss-gray-3)]" aria-hidden="true">
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </span>
                  ) : null}
                </div>
              </button>
              {expandable && isExpanded && (
                <div id={panelId} className="border-t border-[var(--border)] px-4 py-3">
                  {renderExpanded(row)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
