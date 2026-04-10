'use client';

type ManualImpactOption = {
  shiftId: string;
  label: string;
  code: string;
  hours: string;
  allowed: boolean;
  reason: string;
  isCurrent: boolean;
  isBase: boolean;
};

export default function RosterManualImpactPanel({
  staffName,
  date,
  currentShiftName,
  baseShiftName,
  manualOverride,
  options,
  explanations,
  onSelect,
  onClose,
}: {
  staffName: string;
  date: string;
  currentShiftName: string;
  baseShiftName: string;
  manualOverride: boolean;
  options: ManualImpactOption[];
  explanations: string[];
  onSelect: (shiftId: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="mt-4 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm"
      data-testid="roster-manual-impact-panel"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
            Manual Impact
          </p>
          <h5 className="mt-1 text-base font-bold text-[var(--foreground)]">
            {staffName} · {date}
          </h5>
          <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
            현재 {currentShiftName}
            {manualOverride ? ' · 수동 수정 반영' : ''}
            {' · '}
            기본 {baseShiftName}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-[11px] font-bold text-[var(--toss-gray-4)]"
        >
          선택 닫기
        </button>
      </div>

      {explanations.length > 0 ? (
        <div className="mt-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] p-4">
          <div className="text-[12px] font-bold text-[var(--foreground)]">자동편성 설명</div>
          <div className="mt-2 space-y-2">
            {explanations.map((explanation, index) => (
              <div
                key={`${date}-explanation-${index}`}
                className="rounded-[var(--radius-md)] bg-[var(--card)] px-3 py-2 text-[12px] font-semibold text-[var(--toss-gray-3)]"
              >
                {explanation}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
        {options.map((option) => {
          const testId =
            option.shiftId === '__OFF__'
              ? 'roster-manual-option-off'
              : `roster-manual-option-${option.shiftId}`;

          return (
            <button
              key={option.shiftId}
              type="button"
              onClick={() => onSelect(option.shiftId)}
              disabled={!option.allowed || option.isCurrent}
              className={`rounded-[var(--radius-lg)] border px-4 py-3 text-left transition-all ${
                option.isCurrent
                  ? 'border-[var(--accent)] bg-[var(--toss-blue-light)]/70'
                  : option.allowed
                    ? 'border-[var(--border)] bg-[var(--muted)] hover:border-[var(--accent)] hover:bg-[var(--toss-blue-light)]/40'
                    : 'border-red-500/20 bg-red-500/5 opacity-70'
              }`}
              data-testid={testId}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-[var(--foreground)]">{option.label}</div>
                  <div className="mt-1 text-[11px] font-semibold text-[var(--toss-gray-3)]">
                    {option.hours}
                  </div>
                </div>
                <span className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-[10px] font-black text-[var(--foreground)]">
                  {option.code}
                </span>
              </div>
              <div className="mt-2 text-[11px] font-semibold text-[var(--toss-gray-3)]">
                {option.isCurrent
                  ? '현재 배치'
                  : option.isBase
                    ? '기본 배치로 되돌리기'
                    : option.allowed
                      ? '이 배치로 적용'
                      : option.reason}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
