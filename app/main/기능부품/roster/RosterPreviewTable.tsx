'use client';

type RosterPreviewTableProps = Record<string, any>;

export default function RosterPreviewTable(props: RosterPreviewTableProps) {
  if (props.variant === 'simple') {
    return <RosterPreviewTableSimple {...props} />;
  }

  return <RosterPreviewTableCoverage {...props} />;
}

function RosterPreviewTableCoverage(props: RosterPreviewTableProps) {
  const {
    WEEKDAY_LABELS,
    getDepartmentName,
    handleManualCellClick,
    highlightedRosterTarget,
    manualEditMode,
    monthDates,
    previewDailyCoverage,
    previewRows,
    setManualAssignments,
    setManualEditMode,
    summary,
    targetStaffs,
    workingShifts,
  } = props;
  return (
<div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h4 className="text-base font-bold text-[var(--foreground)]">월간 근무표 미리보기</h4>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setManualEditMode((prev: any) => !prev)}
                className={`rounded-[var(--radius-md)] px-3 py-1 text-[11px] font-bold ${manualEditMode ? 'bg-orange-500/20 text-orange-700' : 'bg-[var(--muted)] text-[var(--toss-gray-4)]'}`}
              >
                {manualEditMode ? '수동 수정 중' : '수동 수정'}
              </button>
              <button
                type="button"
                onClick={() => setManualAssignments({})}
                disabled={summary.manualCount === 0}
                className="rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-1 text-[11px] font-bold text-[var(--toss-gray-4)] disabled:opacity-40"
              >
                수정 초기화
              </button>
              <span className="rounded-[var(--radius-md)] bg-[var(--toss-blue-light)] px-3 py-1 text-[11px] font-bold text-[var(--accent)]">
                {previewRows.length}명 표시 · 수동 수정 {summary.manualCount}건
              </span>
            </div>
          </div>

          {workingShifts.length === 0 ? (
            <div className="mt-4 rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] bg-[var(--muted)] p-4 text-sm font-semibold text-[var(--toss-gray-3)]">
              등록된 근무형태가 없습니다.
            </div>
          ) : targetStaffs.length === 0 ? (
            <div className="mt-4 rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] bg-[var(--muted)] p-4 text-sm font-semibold text-[var(--toss-gray-3)]">
              선택한 팀에 직원이 없습니다.
            </div>
          ) : previewRows.length === 0 ? (
            <div className="mt-4 rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] bg-[var(--muted)] p-4 text-sm font-semibold text-[var(--toss-gray-3)]">
              표시할 근무표가 없습니다.
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="border-collapse" style={{ minWidth: `${260 + monthDates.length * 64}px` }}>
                <thead>
                  <tr>
                    <th className="sticky left-0 z-20 min-w-[260px] border-b border-[var(--border)] bg-[var(--card)] px-4 py-3 text-left text-[11px] font-bold text-[var(--toss-gray-3)]">
                      직원
                    </th>
                    {monthDates.map((date: any, index: any) => {
                      const day = Number(date.slice(-2));
                      const weekday = WEEKDAY_LABELS[new Date(`${date}T00:00:00`).getDay()];
                      const coverage = previewDailyCoverage[index] || {
                        date,
                        day: 0,
                        evening: 0,
                        night: 0,
                        status: 'balanced' as const,
                        statusLabel: '충족',
                        statusDetail: '기준 충족',
                      };
                      const coverageToneClass =
                        coverage.status === 'warning'
                          ? 'border-red-500/20 bg-red-500/10 text-red-700'
                          : coverage.status === 'extra'
                            ? 'border-[var(--success-light)] bg-[var(--success-light)] text-[var(--success)]'
                            : 'border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300';
                      return (
                        <th
                          key={date}
                          className="min-w-[64px] border-b border-[var(--border)] bg-[var(--card)] px-2 py-3 text-center text-[10px] font-bold text-[var(--toss-gray-3)]"
                        >
                          <div>{day}</div>
                          <div className="mt-1 text-[9px]">{weekday}</div>
                          <div className={`mt-2 rounded-[var(--radius-md)] border px-2 py-0.5 text-[8px] font-bold ${coverageToneClass}`}>
                            {coverage.statusLabel}
                          </div>
                          <div
                            className={`mt-2 rounded-[var(--radius-md)] border px-1 py-1 text-[9px] font-semibold leading-4 shadow-sm transition-all ${
                              highlightedRosterTarget === `roster-preview-coverage-${date}`
                                ? 'border-[var(--accent)] bg-[var(--toss-blue-light)] ring-2 ring-[var(--accent)]/30'
                                : 'border-[var(--border)] bg-[var(--card)]'
                            }`}
                            data-testid={`roster-preview-coverage-${date}`}
                          >
                            <div className="text-[var(--accent)]">데이 {coverage.day}</div>
                            <div className="text-orange-600">이브닝 {coverage.evening}</div>
                            <div className="text-purple-600">나이트 {coverage.night}</div>
                            <div className="mt-1 border-t border-[var(--border)] pt-1 text-[8px] text-[var(--toss-gray-3)]">
                              {coverage.statusDetail}
                            </div>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row: any) => (
                    <tr
                      key={row.staff.id}
                      className={`border-b border-[var(--border)] last:border-b-0 ${
                        highlightedRosterTarget === `roster-preview-row-${row.staff.id}`
                          ? 'bg-[var(--toss-blue-light)]/40'
                          : ''
                      }`}
                      data-testid={`roster-preview-row-${row.staff.id}`}
                    >
                      <td className="sticky left-0 z-10 bg-[var(--card)] px-4 py-3">
                        <p className="text-sm font-bold text-[var(--foreground)]">{row.staff.name}</p>
                        <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">
                          {row.config.pattern} · {getDepartmentName(row.staff)}
                        </p>
                        <p className="mt-1 text-[10px] font-semibold text-[var(--toss-gray-3)]">
                          근무 {row.counts.work} · 휴무 {row.counts.off} · 나이트 {row.counts.night}
                        </p>
                      </td>
                      {row.cells.map((cell: any) => (
                        <td key={cell.date} className="px-1 py-2 text-center">
                          <button
                            type="button"
                            disabled={!manualEditMode}
                            onClick={() =>
                              handleManualCellClick({
                                staffId: String(row.staff.id),
                                date: cell.date,
                                currentShiftId: cell.shiftId,
                                baseShiftId: cell.baseShiftId,
                              })
                            }
                            className={`inline-flex min-h-8 min-w-[56px] items-center justify-center rounded-[var(--radius-md)] border px-1 py-0.5 text-center text-[10px] font-black leading-tight break-keep transition-all ${cell.badgeClass} ${manualEditMode ? 'cursor-pointer hover:scale-105' : 'cursor-default'} ${cell.isManual ? 'ring-2 ring-[var(--accent)] ring-offset-1' : ''}`}
                            title={`${row.staff.name} ${cell.date} ${cell.shiftName}${manualEditMode ? ' · 클릭해서 변경' : ''}`}
                          >
                            {cell.displayLabel || cell.code}
                          </button>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
  );
}

function RosterPreviewTableSimple(props: RosterPreviewTableProps) {
  const {
    WEEKDAY_LABELS,
    getDepartmentName,
    handleManualCellClick,
    manualEditMode,
    monthDates,
    previewRows,
    setManualAssignments,
    setManualEditMode,
    summary,
  } = props;
  return (
(
<div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h4 className="text-base font-bold text-[var(--foreground)]">월간 미리보기</h4>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setManualEditMode((prev: any) => !prev)}
              className={`rounded-[var(--radius-md)] px-3 py-1 text-[11px] font-bold ${manualEditMode ? 'bg-orange-500/20 text-orange-700' : 'bg-[var(--muted)] text-[var(--toss-gray-4)]'}`}
            >
              {manualEditMode ? '수동 수정 중' : '수동 수정'}
            </button>
            <button
              type="button"
              onClick={() => setManualAssignments({})}
              disabled={summary.manualCount === 0}
              className="rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-1 text-[11px] font-bold text-[var(--toss-gray-4)] disabled:opacity-40"
            >
              수정 초기화
            </button>
            <span className="rounded-[var(--radius-md)] bg-[var(--toss-blue-light)] px-3 py-1 text-[11px] font-bold text-[var(--accent)]">
              {previewRows.length}명 표시 · 수동 수정 {summary.manualCount}건
            </span>
          </div>
        </div>

        {previewRows.length === 0 ? (
          <div className="mt-4 rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] bg-[var(--muted)] p-4 text-sm font-semibold text-[var(--toss-gray-3)]">
            표시할 근무표가 없습니다.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="border-collapse" style={{ minWidth: `${260 + monthDates.length * 50}px` }}>
              <thead>
                <tr>
                  <th className="sticky left-0 z-20 min-w-[260px] border-b border-[var(--border)] bg-[var(--card)] px-4 py-3 text-left text-[11px] font-bold text-[var(--toss-gray-3)]">
                    직원
                  </th>
                  {monthDates.map((date: any) => {
                    const day = Number(date.slice(-2));
                    const weekday = WEEKDAY_LABELS[new Date(`${date}T00:00:00`).getDay()];
                    return (
                      <th
                        key={date}
                        className="min-w-[50px] border-b border-[var(--border)] bg-[var(--card)] px-2 py-3 text-center text-[10px] font-bold text-[var(--toss-gray-3)]"
                      >
                        <div>{day}</div>
                        <div className="mt-1 text-[9px]">{weekday}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row: any) => (
                  <tr key={row.staff.id} className="border-b border-[var(--border)] last:border-b-0">
                    <td className="sticky left-0 z-10 bg-[var(--card)] px-4 py-3">
                      <p className="text-sm font-bold text-[var(--foreground)]">{row.staff.name}</p>
                      <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">
                        {row.config.pattern} · {getDepartmentName(row.staff)}
                      </p>
                      <p className="mt-1 text-[10px] font-semibold text-[var(--toss-gray-3)]">
                        근무 {row.counts.work} · 휴무 {row.counts.off} · 나이트 {row.counts.night}
                      </p>
                    </td>
                    {row.cells.map((cell: any) => (
                      <td key={cell.date} className="px-1 py-2 text-center">
                        <button
                          type="button"
                          disabled={!manualEditMode}
                          onClick={() => handleManualCellClick({
                            staffId: String(row.staff.id),
                            date: cell.date,
                            currentShiftId: cell.shiftId,
                            baseShiftId: cell.baseShiftId,
                          })}
                          className={`inline-flex min-h-8 min-w-[56px] items-center justify-center rounded-[var(--radius-md)] border px-1 py-0.5 text-center text-[10px] font-black leading-tight break-keep transition-all ${cell.badgeClass} ${manualEditMode ? 'cursor-pointer hover:scale-105' : 'cursor-default'} ${cell.isManual ? 'ring-2 ring-[var(--accent)] ring-offset-1' : ''}`}
                          title={`${row.staff.name} ${cell.date} ${cell.shiftName}${manualEditMode ? ' · 클릭하여 변경' : ''}`}
                        >
                          {cell.displayLabel || cell.code}
                        </button>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
  )
  );
}
