'use client';

type StatusTabOption = {
  value: string;
  count: number;
};

type ScheduleListItem = {
  id: string;
  patient_name: string;
  surgery_name: string;
  chart_no: string;
  schedule_room: string;
  schedule_time: string;
  surgery_fasting?: boolean | null;
};

function getScheduleAccentClass(status: string, layout: 'stack' | 'row') {
  const isRowLayout = layout === 'row';
  if (status === '수술중') return isRowLayout ? 'border-t-orange-400' : 'border-l-orange-400';
  if (status === '완료') return isRowLayout ? 'border-t-emerald-400' : 'border-l-emerald-400';
  if (status === '준비완료') return isRowLayout ? 'border-t-[var(--accent)]' : 'border-l-[var(--accent)]';
  return isRowLayout ? 'border-t-[var(--border)]' : 'border-l-[var(--border)]';
}

function getScheduleBadgeClass(status: string) {
  if (status === '수술중') return 'bg-orange-50 text-orange-700';
  if (status === '완료') return 'bg-emerald-50 text-emerald-700';
  if (status === '준비완료') return 'bg-[var(--accent)]/10 text-[var(--accent)]';
  return 'bg-[var(--muted)] text-[var(--toss-gray-4)]';
}

export function OpCheckStatusFilterTabs({
  className = 'mb-2 flex flex-wrap gap-1',
  activeTab,
  options,
  onChange,
}: {
  className?: string;
  activeTab: string;
  options: StatusTabOption[];
  onChange: (value: string) => void;
}) {
  return (
    <div className={className}>
      {options.map((option) => {
        const isActive = activeTab === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`rounded-[var(--radius-md)] px-2 py-1 text-[10px] font-bold transition-colors ${
              isActive
                ? option.value === '수술중'
                  ? 'bg-orange-500 text-white'
                  : option.value === '완료'
                    ? 'bg-emerald-500 text-white'
                    : 'bg-[var(--accent)] text-white'
                : 'border border-[var(--border)] text-[var(--toss-gray-4)] hover:bg-[var(--muted)]'
            }`}
          >
            {option.value} {option.count > 0 && <span className="opacity-80">({option.count})</span>}
          </button>
        );
      })}
    </div>
  );
}

export function OpCheckScheduleList<T extends ScheduleListItem>({
  items,
  containerClassName,
  emptyMessage,
  openWorkspaceOnSelect,
  layout = 'stack',
  testIdPrefix,
  selectedScheduleId,
  statusByScheduleId,
  sanitizeText,
  onSelect,
}: {
  items: T[];
  containerClassName: string;
  emptyMessage: string;
  openWorkspaceOnSelect: boolean;
  layout?: 'stack' | 'row';
  testIdPrefix: string;
  selectedScheduleId: string | null;
  statusByScheduleId: Record<string, string>;
  sanitizeText: (value: unknown) => string;
  onSelect: (item: T, openWorkspaceOnSelect: boolean) => void;
}) {
  return (
    <div className={containerClassName}>
      {items.length === 0 ? (
        <div className="empty-state rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--muted)]/40 p-6 text-center">
          <p className="text-sm font-semibold text-[var(--toss-gray-3)]">{emptyMessage}</p>
        </div>
      ) : (
        items.map((item) => {
          const currentStatus = statusByScheduleId[item.id] || '준비중';
          const selected = item.id === selectedScheduleId;
          const isRowLayout = layout === 'row';
          const displayChartNo = sanitizeText(item.chart_no);
          const displayScheduleRoom = sanitizeText(item.schedule_room || '');
          const statusAccentClass = getScheduleAccentClass(currentStatus, layout);
          const statusBadgeClass = getScheduleBadgeClass(currentStatus);

          return (
            <button
              key={item.id}
              type="button"
              data-testid={`${testIdPrefix}-${item.id}`}
              onClick={() => onSelect(item, openWorkspaceOnSelect)}
              className={
                isRowLayout
                  ? `min-w-[172px] max-w-[172px] flex-none snap-start rounded-[var(--radius-lg)] border border-t-4 px-3 py-2.5 text-left transition-all ${statusAccentClass} ${
                      selected
                        ? 'border-[var(--accent)] bg-[var(--toss-blue-light)]/70 shadow-sm'
                        : 'border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]/35 hover:bg-[var(--muted)]/40'
                    }`
                  : `w-full rounded-[var(--radius-lg)] border border-l-4 p-3 text-left transition-all ${statusAccentClass} ${
                      selected
                        ? 'border-[var(--accent)] bg-[var(--toss-blue-light)]/60 shadow-sm'
                        : 'border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]/35 hover:bg-[var(--muted)]/40'
                    }`
              }
            >
              <div className={`flex ${isRowLayout ? 'items-center justify-between gap-1.5' : 'items-start justify-between gap-2'}`}>
                <div className="min-w-0 flex-1">
                  <p className={`truncate font-bold text-[var(--foreground)] ${isRowLayout ? 'text-[15px]' : 'text-sm'}`}>
                    {item.patient_name}
                  </p>
                  <p
                    className={`truncate font-medium text-[var(--toss-gray-3)] ${
                      isRowLayout ? 'mt-1 text-[10px]' : 'mt-0.5 text-[11px]'
                    }`}
                  >
                    {item.surgery_name}
                  </p>
                </div>
                <div className={`flex shrink-0 ${isRowLayout ? 'flex-col items-end gap-1.5' : 'flex-col items-end gap-1'}`}>
                  <span className={`font-bold text-[var(--toss-gray-4)] ${isRowLayout ? 'text-[10px]' : 'text-[11px]'}`}>
                    {item.schedule_time || '시간 미정'}
                  </span>
                  <span
                    className={`rounded-[var(--radius-md)] font-bold ${statusBadgeClass} ${
                      isRowLayout ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]'
                    }`}
                  >
                    {statusByScheduleId[item.id] ? currentStatus : '신규'}
                  </span>
                </div>
              </div>
              <div
                className={`flex flex-wrap items-center gap-1.5 font-medium text-[var(--toss-gray-3)] ${
                  isRowLayout ? 'mt-2 text-[10px]' : 'mt-1.5 text-[11px]'
                }`}
              >
                <span>{displayScheduleRoom || '방 미정'}</span>
                {displayChartNo ? <span>· 차트 {displayChartNo}</span> : null}
                {item.surgery_fasting ? (
                  <span
                    className={`rounded-[var(--radius-md)] bg-rose-50 font-bold text-rose-600 ${
                      isRowLayout ? 'px-1.5 py-0.5 text-[9px]' : 'px-1.5 py-0.5 text-[10px]'
                    }`}
                  >
                    금식
                  </span>
                ) : null}
              </div>
            </button>
          );
        })
      )}
    </div>
  );
}
