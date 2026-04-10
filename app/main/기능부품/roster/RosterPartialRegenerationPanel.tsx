'use client';

type StaffOption = {
  staffId: string;
  staffName: string;
};

type PartialModeOption = {
  value: 'minimize_changes' | 'preserve_pattern' | 'rebalance_fairness';
  label: string;
  detail: string;
};

export default function RosterPartialRegenerationPanel({
  staffOptions,
  selectedStaffId,
  monthDates,
  startDate,
  endDate,
  mode,
  modeOptions,
  loading,
  disabled,
  onStaffChange,
  onStartDateChange,
  onEndDateChange,
  onModeChange,
  onSubmit,
}: {
  staffOptions: StaffOption[];
  selectedStaffId: string;
  monthDates: string[];
  startDate: string;
  endDate: string;
  mode: 'minimize_changes' | 'preserve_pattern' | 'rebalance_fairness';
  modeOptions: readonly PartialModeOption[];
  loading: boolean;
  disabled: boolean;
  onStaffChange: (staffId: string) => void;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  onModeChange: (mode: 'minimize_changes' | 'preserve_pattern' | 'rebalance_fairness') => void;
  onSubmit: () => void;
}) {
  const activeMode = modeOptions.find((option) => option.value === mode) || modeOptions[0];

  return (
    <div
      className="mt-4 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--muted)] p-4"
      data-testid="roster-partial-regeneration-panel"
    >
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h5 className="text-sm font-bold text-[var(--foreground)]">부분 재생성</h5>
          <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
            전체 초안은 유지하고 선택한 직원과 날짜 범위만 다시 계산합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={onSubmit}
          disabled={disabled}
          className="rounded-[var(--radius-md)] bg-[var(--accent)] px-4 py-2 text-[11px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="roster-partial-regenerate"
        >
          {loading ? '부분 재생성 중...' : '선택 범위 다시 생성'}
        </button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">대상 직원</span>
          <select
            value={selectedStaffId}
            onChange={(event) => onStaffChange(event.target.value)}
            className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
            data-testid="roster-partial-staff-select"
          >
            <option value="">전체 직원</option>
            {staffOptions.map((option) => (
              <option key={option.staffId} value={option.staffId}>
                {option.staffName}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">시작 날짜</span>
          <select
            value={startDate}
            onChange={(event) => onStartDateChange(event.target.value)}
            className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
            data-testid="roster-partial-start-date"
          >
            {monthDates.map((date) => (
              <option key={date} value={date}>
                {date}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">종료 날짜</span>
          <select
            value={endDate}
            onChange={(event) => onEndDateChange(event.target.value)}
            className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
            data-testid="roster-partial-end-date"
          >
            {monthDates.map((date) => (
              <option key={date} value={date}>
                {date}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">재편성 방식</span>
          <select
            value={mode}
            onChange={(event) =>
              onModeChange(
                event.target.value as 'minimize_changes' | 'preserve_pattern' | 'rebalance_fairness'
              )
            }
            className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
            data-testid="roster-partial-mode-select"
          >
            {modeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-3">
        <div className="text-[11px] font-bold text-[var(--foreground)]">{activeMode.label}</div>
        <div className="mt-1 text-[11px] font-semibold text-[var(--toss-gray-3)]">
          {activeMode.detail}
        </div>
      </div>

      <p className="mt-3 text-[11px] font-semibold text-[var(--toss-gray-3)]">
        수동 수정과 다른 직원 배치는 최대한 유지하고, 선택한 범위만 새 규칙으로 다시 계산합니다.
      </p>
    </div>
  );
}
