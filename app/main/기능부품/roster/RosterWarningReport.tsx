type RosterWarningItem = {
  id: string;
  tone: 'red' | 'amber' | 'yellow';
  targetTestId: string;
  title: string;
  detail: string;
};

type RosterWarningReportProps = {
  report: {
    items: RosterWarningItem[];
    headcountCount: number;
    coverageCount: number;
    nightRangeCount: number;
    offDaysCount: number;
    restrictionCount: number;
    pairRuleCount: number;
  };
  onJumpToTarget: (targetTestId: string) => void;
};

export default function RosterWarningReport({
  report,
  onJumpToTarget,
}: RosterWarningReportProps) {
  return (
    <div
      className="mt-4 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm"
      data-testid="roster-warning-report"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h5 className="text-base font-bold text-[var(--foreground)]">
            {'\uC0DD\uC131 \uACBD\uACE0 \uB9AC\uD3EC\uD2B8'}
          </h5>
          <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
            {'\uB0A0\uC9DC\uBCC4 \uCEE4\uBC84\uB9AC\uC9C0, \uAC1C\uC778 \uC81C\uD55C, \uD398\uC5B4 \uADDC\uCE59, \uB098\uC774\uD2B8 \uBC94\uC704, \uCD5C\uC18C OFF \uBBF8\uB2EC \uC5EC\uBD80\uB97C \uD55C \uBC88\uC5D0 \uD655\uC778\uD569\uB2C8\uB2E4.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-[var(--radius-md)] border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-semibold text-rose-700">
            {'\uC778\uC6D0 \uBD80\uC871 '}
            {report.headcountCount}
            {'\uAC74'}
          </span>
          <span className="rounded-[var(--radius-md)] border border-red-500/20 bg-red-500/10 px-3 py-1 text-[11px] font-semibold text-red-700">
            {'\uCEE4\uBC84\uB9AC\uC9C0 \uBD80\uC871 '}
            {report.coverageCount}
            {'\uAC74'}
          </span>
          <span className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-700">
            {'\uB098\uC774\uD2B8 \uBC94\uC704 '}
            {report.nightRangeCount}
            {'\uAC74'}
          </span>
          <span className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--tab-bg)] px-3 py-1 text-[11px] font-semibold text-[var(--toss-gray-5)]">
            {'OFF \uBBF8\uB2EC '}
            {report.offDaysCount}
            {'\uAC74'}
          </span>
          <span className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-700">
            {'\uAC1C\uC778 \uC81C\uD55C '}
            {report.restrictionCount}
            {'\uAC74'}
          </span>
          <span className="rounded-[var(--radius-md)] border border-yellow-500/20 bg-yellow-500/10 px-3 py-1 text-[11px] font-semibold text-yellow-700">
            {'\uD398\uC5B4 \uADDC\uCE59 '}
            {report.pairRuleCount}
            {'\uAC74'}
          </span>
        </div>
      </div>

      {report.items.length === 0 ? (
        <div className="mt-4 rounded-[var(--radius-xl)] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          {'\uD604\uC7AC \uAE30\uC900\uC73C\uB85C \uC0DD\uC131 \uACBD\uACE0\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.'}
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {report.items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onJumpToTarget(item.targetTestId)}
              className={`w-full rounded-[var(--radius-xl)] border px-4 py-3 text-left transition-colors ${
                item.tone === 'red'
                  ? 'border-red-500/20 bg-red-500/10'
                  : item.tone === 'amber'
                    ? 'border-amber-200 bg-amber-50'
                    : 'border-yellow-500/20 bg-yellow-500/10'
              }`}
              data-testid={`roster-warning-item-${item.id}`}
            >
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <p
                  className={`text-sm font-bold ${
                    item.tone === 'red'
                      ? 'text-red-700'
                      : item.tone === 'amber'
                        ? 'text-amber-700'
                        : 'text-yellow-700'
                  }`}
                >
                  {item.title}
                </p>
                <p className="text-[12px] font-semibold text-[var(--foreground)]">{item.detail}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
