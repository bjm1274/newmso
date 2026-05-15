'use client';

import { useMemo } from 'react';
import { MatrixTable, type MatrixColumn } from '@/app/components/MatrixTable';

type RosterPreviewTableProps = Record<string, unknown>;

type PreviewCellShape = {
  date: string;
  baseShiftId: string;
  shiftId: string;
  shiftName: string;
  code: string;
  displayLabel?: string;
  badgeClass: string;
  isManual: boolean;
};

type PreviewRowShape = {
  staff: { id: string | number; name: string };
  config: { pattern: string };
  cells: PreviewCellShape[];
  counts: { work: number; off: number; night: number };
};

type PreviewCoverageShape = {
  date: string;
  day: number;
  evening: number;
  night: number;
  status: 'warning' | 'balanced' | 'extra';
  statusLabel: string;
  statusDetail: string;
};

type ColumnDataCoverage = {
  date: string;
  index: number;
  coverage: PreviewCoverageShape;
};

type ColumnDataSimple = {
  date: string;
  index: number;
};

export default function RosterPreviewTable(props: RosterPreviewTableProps) {
  if (props.variant === 'simple') {
    return <RosterPreviewTableSimple {...props} />;
  }
  return <RosterPreviewTableCoverage {...props} />;
}

// ---------------------------------------------------------------------------
// Coverage variant (with daily coverage badges in header)
// ---------------------------------------------------------------------------
function RosterPreviewTableCoverage(props: RosterPreviewTableProps) {
  const WEEKDAY_LABELS = props.WEEKDAY_LABELS as string[];
  const getDepartmentName = props.getDepartmentName as (staff: PreviewRowShape['staff']) => string;
  const handleManualCellClick = props.handleManualCellClick as (args: {
    staffId: string;
    date: string;
    currentShiftId: string;
    baseShiftId: string;
  }) => void;
  const highlightedRosterTarget = props.highlightedRosterTarget as string | null | undefined;
  const manualEditMode = Boolean(props.manualEditMode);
  const monthDates = (props.monthDates ?? []) as string[];
  const previewDailyCoverage = (props.previewDailyCoverage ?? []) as PreviewCoverageShape[];
  const previewRows = (props.previewRows ?? []) as PreviewRowShape[];
  const setManualAssignments = props.setManualAssignments as (
    next: Record<string, unknown> | ((prev: Record<string, unknown>) => Record<string, unknown>)
  ) => void;
  const setManualEditMode = props.setManualEditMode as (
    next: boolean | ((prev: boolean) => boolean)
  ) => void;
  const summary = props.summary as { manualCount: number };
  const targetStaffs = (props.targetStaffs ?? []) as unknown[];
  const workingShifts = (props.workingShifts ?? []) as unknown[];

  const columns = useMemo<MatrixColumn<ColumnDataCoverage>[]>(
    () =>
      monthDates.map((date, index) => {
        const day = Number(date.slice(-2));
        const weekday = WEEKDAY_LABELS[new Date(`${date}T00:00:00`).getDay()];
        const coverage: PreviewCoverageShape = previewDailyCoverage[index] || {
          date,
          day: 0,
          evening: 0,
          night: 0,
          status: 'balanced',
          statusLabel: '충족',
          statusDetail: '기준 충족',
        };
        const coverageToneClass =
          coverage.status === 'warning'
            ? 'border-red-500/20 bg-red-500/10 text-red-700'
            : coverage.status === 'extra'
              ? 'border-[var(--success-light)] bg-[var(--success-light)] text-[var(--success)]'
              : 'border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300';
        const isHighlighted = highlightedRosterTarget === `roster-preview-coverage-${date}`;
        return {
          id: `day-${date}`,
          label: <span>{day}</span>,
          shortLabel: <span>{day}</span>,
          subLabel: (
            <div className="flex flex-col items-center gap-1">
              <span className="text-[9px]">{weekday}</span>
              <span
                className={`rounded-[var(--radius-md)] border px-2 py-0.5 text-[8px] font-bold ${coverageToneClass}`}
              >
                {coverage.statusLabel}
              </span>
              <span
                className={`rounded-[var(--radius-md)] border px-1 py-1 text-[9px] font-semibold leading-4 shadow-sm transition-all ${
                  isHighlighted
                    ? 'border-[var(--accent)] bg-[var(--toss-blue-light)] ring-2 ring-[var(--accent)]/30'
                    : 'border-[var(--border)] bg-[var(--card)]'
                }`}
                data-testid={`roster-preview-coverage-${date}`}
              >
                <span className="block text-[var(--accent)]">데이 {coverage.day}</span>
                <span className="block text-orange-600">이브닝 {coverage.evening}</span>
                <span className="block text-purple-600">나이트 {coverage.night}</span>
                <span className="mt-1 block border-t border-[var(--border)] pt-1 text-[8px] text-[var(--toss-gray-3)]">
                  {coverage.statusDetail}
                </span>
              </span>
            </div>
          ),
          data: { date, index, coverage },
        };
      }),
    [WEEKDAY_LABELS, highlightedRosterTarget, monthDates, previewDailyCoverage]
  );

  const blockingReason = workingShifts.length === 0
    ? '등록된 근무형태가 없습니다.'
    : targetStaffs.length === 0
      ? '선택한 팀에 직원이 없습니다.'
      : previewRows.length === 0
        ? '표시할 근무표가 없습니다.'
        : null;

  return (
    <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
      <PreviewHeader
        title="월간 근무표 미리보기"
        manualEditMode={manualEditMode}
        manualCount={summary.manualCount}
        previewCount={previewRows.length}
        onToggleEdit={() => setManualEditMode((prev) => !prev)}
        onReset={() => setManualAssignments({})}
      />

      {blockingReason ? (
        <div className="mt-4 rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] bg-[var(--muted)] p-4 text-sm font-semibold text-[var(--toss-gray-3)]">
          {blockingReason}
        </div>
      ) : (
        <div className="mt-4">
          <MatrixTable<PreviewRowShape, ColumnDataCoverage>
            rows={previewRows}
            columns={columns}
            rowKey={(r) => String(r.staff.id)}
            rowHeaderLabel="직원"
            rowHeader={(row) => (
              <span
                data-testid={`roster-preview-row-${row.staff.id}`}
                className={
                  highlightedRosterTarget === `roster-preview-row-${row.staff.id}`
                    ? 'block rounded-[var(--radius-md)] bg-[var(--toss-blue-light)]/40 px-2 py-1'
                    : 'block'
                }
              >
                <span className="block text-sm font-bold text-[var(--foreground)]">{row.staff.name}</span>
                <span className="mt-1 block text-[11px] text-[var(--toss-gray-3)]">
                  {row.config.pattern} · {getDepartmentName(row.staff)}
                </span>
                <span className="mt-1 block text-[10px] font-semibold text-[var(--toss-gray-3)]">
                  근무 {row.counts.work} · 휴무 {row.counts.off} · 나이트 {row.counts.night}
                </span>
              </span>
            )}
            renderCell={(row, col) => {
              const cell = row.cells[col.data.index];
              if (!cell) return null;
              return (
                <CellButton
                  cell={cell}
                  staffName={row.staff.name}
                  staffId={String(row.staff.id)}
                  manualEditMode={manualEditMode}
                  onClick={handleManualCellClick}
                />
              );
            }}
            minWidth={260 + monthDates.length * 64}
            ariaLabel="근무표 미리보기"
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Simple variant (no coverage badges)
// ---------------------------------------------------------------------------
function RosterPreviewTableSimple(props: RosterPreviewTableProps) {
  const WEEKDAY_LABELS = props.WEEKDAY_LABELS as string[];
  const getDepartmentName = props.getDepartmentName as (staff: PreviewRowShape['staff']) => string;
  const handleManualCellClick = props.handleManualCellClick as (args: {
    staffId: string;
    date: string;
    currentShiftId: string;
    baseShiftId: string;
  }) => void;
  const manualEditMode = Boolean(props.manualEditMode);
  const monthDates = (props.monthDates ?? []) as string[];
  const previewRows = (props.previewRows ?? []) as PreviewRowShape[];
  const setManualAssignments = props.setManualAssignments as (
    next: Record<string, unknown> | ((prev: Record<string, unknown>) => Record<string, unknown>)
  ) => void;
  const setManualEditMode = props.setManualEditMode as (
    next: boolean | ((prev: boolean) => boolean)
  ) => void;
  const summary = props.summary as { manualCount: number };

  const columns = useMemo<MatrixColumn<ColumnDataSimple>[]>(
    () =>
      monthDates.map((date, index) => {
        const day = Number(date.slice(-2));
        const weekday = WEEKDAY_LABELS[new Date(`${date}T00:00:00`).getDay()];
        return {
          id: `day-${date}`,
          label: <span>{day}</span>,
          shortLabel: <span>{day}</span>,
          subLabel: <span className="text-[9px]">{weekday}</span>,
          data: { date, index },
        };
      }),
    [WEEKDAY_LABELS, monthDates]
  );

  return (
    <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
      <PreviewHeader
        title="월간 미리보기"
        manualEditMode={manualEditMode}
        manualCount={summary.manualCount}
        previewCount={previewRows.length}
        onToggleEdit={() => setManualEditMode((prev) => !prev)}
        onReset={() => setManualAssignments({})}
      />

      {previewRows.length === 0 ? (
        <div className="mt-4 rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] bg-[var(--muted)] p-4 text-sm font-semibold text-[var(--toss-gray-3)]">
          표시할 근무표가 없습니다.
        </div>
      ) : (
        <div className="mt-4">
          <MatrixTable<PreviewRowShape, ColumnDataSimple>
            rows={previewRows}
            columns={columns}
            rowKey={(r) => String(r.staff.id)}
            rowHeaderLabel="직원"
            rowHeader={(row) => (
              <span className="block">
                <span className="block text-sm font-bold text-[var(--foreground)]">{row.staff.name}</span>
                <span className="mt-1 block text-[11px] text-[var(--toss-gray-3)]">
                  {row.config.pattern} · {getDepartmentName(row.staff)}
                </span>
                <span className="mt-1 block text-[10px] font-semibold text-[var(--toss-gray-3)]">
                  근무 {row.counts.work} · 휴무 {row.counts.off} · 나이트 {row.counts.night}
                </span>
              </span>
            )}
            renderCell={(row, col) => {
              const cell = row.cells[col.data.index];
              if (!cell) return null;
              return (
                <CellButton
                  cell={cell}
                  staffName={row.staff.name}
                  staffId={String(row.staff.id)}
                  manualEditMode={manualEditMode}
                  onClick={handleManualCellClick}
                />
              );
            }}
            minWidth={260 + monthDates.length * 50}
            ariaLabel="월간 미리보기"
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared subcomponents
// ---------------------------------------------------------------------------
type PreviewHeaderProps = {
  title: string;
  manualEditMode: boolean;
  manualCount: number;
  previewCount: number;
  onToggleEdit: () => void;
  onReset: () => void;
};

function PreviewHeader({
  title,
  manualEditMode,
  manualCount,
  previewCount,
  onToggleEdit,
  onReset,
}: PreviewHeaderProps) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <h4 className="text-base font-bold text-[var(--foreground)]">{title}</h4>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onToggleEdit}
          className={`rounded-[var(--radius-md)] px-3 py-1 text-[11px] font-bold ${manualEditMode ? 'bg-orange-500/20 text-orange-700' : 'bg-[var(--muted)] text-[var(--toss-gray-4)]'}`}
        >
          {manualEditMode ? '수동 수정 중' : '수동 수정'}
        </button>
        <button
          type="button"
          onClick={onReset}
          disabled={manualCount === 0}
          className="rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-1 text-[11px] font-bold text-[var(--toss-gray-4)] disabled:opacity-40"
        >
          수정 초기화
        </button>
        <span className="rounded-[var(--radius-md)] bg-[var(--toss-blue-light)] px-3 py-1 text-[11px] font-bold text-[var(--accent)]">
          {previewCount}명 표시 · 수동 수정 {manualCount}건
        </span>
      </div>
    </div>
  );
}

type CellButtonProps = {
  cell: PreviewCellShape;
  staffName: string;
  staffId: string;
  manualEditMode: boolean;
  onClick: (args: {
    staffId: string;
    date: string;
    currentShiftId: string;
    baseShiftId: string;
  }) => void;
};

function CellButton({ cell, staffName, staffId, manualEditMode, onClick }: CellButtonProps) {
  return (
    <button
      type="button"
      disabled={!manualEditMode}
      onClick={() =>
        onClick({
          staffId,
          date: cell.date,
          currentShiftId: cell.shiftId,
          baseShiftId: cell.baseShiftId,
        })
      }
      className={`inline-flex min-h-8 min-w-[56px] items-center justify-center rounded-[var(--radius-md)] border px-1 py-0.5 text-center text-[10px] font-black leading-tight break-keep transition-all ${cell.badgeClass} ${manualEditMode ? 'cursor-pointer hover:scale-105' : 'cursor-default'} ${cell.isManual ? 'ring-2 ring-[var(--accent)] ring-offset-1' : ''}`}
      title={`${staffName} ${cell.date} ${cell.shiftName}${manualEditMode ? ' · 클릭해서 변경' : ''}`}
    >
      {cell.displayLabel || cell.code}
    </button>
  );
}
