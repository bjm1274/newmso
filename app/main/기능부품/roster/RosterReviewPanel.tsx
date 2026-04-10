'use client';

type ReviewWarningItem = {
  id: string;
  title: string;
  detail: string;
  priority: 'fatal' | 'warning' | 'info';
  targetTestId: string;
};

type ReviewFairnessRow = {
  staffId: string;
  staffName: string;
  fairnessScore: number;
  note: string;
  nightCount: number;
  weekendWorkCount: number;
  holidayWorkCount: number;
  diversityScore?: number;
};

type SnapshotComparison = {
  changedCellCount: number;
  changedStaffCount: number;
  changedDateCount: number;
  changedStaffPreview: string[];
};

type ReviewSuggestionItem = {
  id: string;
  title: string;
  detail: string;
  targetTestId: string;
};

type PlanComparison = {
  id: string;
  title: string;
  description: string;
  fairnessScore: number;
  diversityScore: number;
  warningCount: number;
  changedCells: number;
  recommendation: string;
};

export default function RosterReviewPanel({
  enabledCount,
  manualCount,
  blockingCount,
  warningCount,
  warnings,
  suggestions,
  fairnessRows,
  snapshotComparison,
  comparisons,
  onJumpToWarning,
}: {
  enabledCount: number;
  manualCount: number;
  blockingCount: number;
  warningCount: number;
  warnings: ReviewWarningItem[];
  suggestions: ReviewSuggestionItem[];
  fairnessRows: ReviewFairnessRow[];
  snapshotComparison: SnapshotComparison | null;
  comparisons: PlanComparison[];
  onJumpToWarning: (targetTestId: string) => void;
}) {
  return (
    <div
      className="mt-4 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm"
      data-testid="roster-review-panel"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
            Review
          </p>
          <h5 className="mt-1 text-base font-bold text-[var(--foreground)]">확정 전 검토판</h5>
          <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
            바로 봐야 할 경고와 편중 직원을 한 번에 확인합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] px-3 py-1 text-[11px] font-semibold text-[var(--foreground)]">
            편성 {enabledCount}명
          </span>
          <span className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] px-3 py-1 text-[11px] font-semibold text-[var(--foreground)]">
            수동 수정 {manualCount}건
          </span>
          <span className="rounded-[var(--radius-md)] border border-red-500/20 bg-red-500/10 px-3 py-1 text-[11px] font-semibold text-red-700">
            차단 경고 {blockingCount}건
          </span>
          <span className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-700">
            전체 경고 {warningCount}건
          </span>
        </div>
      </div>

      {comparisons.length > 0 ? (
        <div className="mt-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] p-4">
          <div className="flex items-center justify-between gap-3">
            <h6 className="text-sm font-bold text-[var(--foreground)]">생성안 비교</h6>
            <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">
              성향별 비교 가이드
            </span>
          </div>
          <div className="mt-3 grid gap-3 xl:grid-cols-4">
            {comparisons.map((comparison) => (
              <div
                key={comparison.id}
                className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-3"
                data-testid={`roster-review-comparison-${comparison.id}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-[var(--foreground)]">{comparison.title}</div>
                    <div className="mt-1 text-[11px] font-semibold text-[var(--toss-gray-3)]">
                      {comparison.description}
                    </div>
                  </div>
                  <span className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] px-2 py-1 text-[10px] font-bold text-[var(--foreground)]">
                    변화 {comparison.changedCells}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <div className="rounded-[var(--radius-md)] bg-[var(--muted)] px-2 py-2 text-center">
                    <div className="text-[10px] font-bold text-[var(--toss-gray-3)]">균형</div>
                    <div className="mt-1 text-sm font-bold text-[var(--foreground)]">
                      {comparison.fairnessScore}
                    </div>
                  </div>
                  <div className="rounded-[var(--radius-md)] bg-[var(--muted)] px-2 py-2 text-center">
                    <div className="text-[10px] font-bold text-[var(--toss-gray-3)]">다양성</div>
                    <div className="mt-1 text-sm font-bold text-[var(--foreground)]">
                      {comparison.diversityScore}
                    </div>
                  </div>
                  <div className="rounded-[var(--radius-md)] bg-[var(--muted)] px-2 py-2 text-center">
                    <div className="text-[10px] font-bold text-[var(--toss-gray-3)]">경고</div>
                    <div className="mt-1 text-sm font-bold text-[var(--foreground)]">
                      {comparison.warningCount}
                    </div>
                  </div>
                </div>
                <div className="mt-3 text-[12px] font-semibold text-[var(--toss-gray-3)]">
                  {comparison.recommendation}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] p-4">
          <div className="flex items-center justify-between gap-3">
            <h6 className="text-sm font-bold text-[var(--foreground)]">우선 확인 경고</h6>
            <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">
              상위 {warnings.length}건
            </span>
          </div>
          {warnings.length === 0 ? (
            <div className="mt-3 rounded-[var(--radius-md)] border border-emerald-200 bg-emerald-50 px-3 py-3 text-[12px] font-semibold text-emerald-700">
              현재 즉시 확인이 필요한 경고가 없습니다.
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {warnings.map((warning) => (
                <button
                  key={warning.id}
                  type="button"
                  onClick={() => onJumpToWarning(warning.targetTestId)}
                  className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-left transition-colors hover:border-[var(--accent)]"
                  data-testid={`roster-review-warning-${warning.id}`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        warning.priority === 'fatal'
                          ? 'bg-red-500/10 text-red-700'
                          : warning.priority === 'warning'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-yellow-500/10 text-yellow-700'
                      }`}
                    >
                      {warning.priority === 'fatal'
                        ? '치명'
                        : warning.priority === 'warning'
                          ? '수정 필요'
                          : '참고'}
                    </span>
                    <span className="text-sm font-bold text-[var(--foreground)]">{warning.title}</span>
                  </div>
                  <div className="mt-1 text-[12px] font-semibold text-[var(--toss-gray-3)]">
                    {warning.detail}
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-3">
            <div className="flex items-center justify-between gap-3">
              <h6 className="text-[12px] font-bold text-[var(--foreground)]">자동 보강 제안</h6>
              <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">
                상위 {suggestions.length}건
              </span>
            </div>
            {suggestions.length === 0 ? (
              <div className="mt-2 text-[12px] font-semibold text-[var(--toss-gray-3)]">
                현재는 추가 보강 제안이 없습니다.
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion.id}
                    type="button"
                    onClick={() => onJumpToWarning(suggestion.targetTestId)}
                    className="w-full rounded-[var(--radius-md)] border border-sky-200 bg-sky-50 px-3 py-3 text-left transition-colors hover:border-[var(--accent)]"
                    data-testid={`roster-review-suggestion-${suggestion.id}`}
                  >
                    <div className="text-sm font-bold text-[var(--foreground)]">{suggestion.title}</div>
                    <div className="mt-1 text-[12px] font-semibold text-[var(--toss-gray-3)]">
                      {suggestion.detail}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] p-4">
            <div className="flex items-center justify-between gap-3">
              <h6 className="text-sm font-bold text-[var(--foreground)]">편중 가능 직원</h6>
              <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">
                상위 {fairnessRows.length}명
              </span>
            </div>
            {fairnessRows.length === 0 ? (
              <div className="mt-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-[12px] font-semibold text-[var(--toss-gray-3)]">
                아직 비교할 편성 결과가 없습니다.
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                {fairnessRows.map((row) => (
                  <div
                    key={row.staffId}
                    className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-3"
                    data-testid={`roster-review-fairness-${row.staffId}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-bold text-[var(--foreground)]">{row.staffName}</div>
                        <div className="mt-1 text-[11px] font-semibold text-[var(--toss-gray-3)]">
                          N {row.nightCount} · 주말 {row.weekendWorkCount} · 공휴일 {row.holidayWorkCount}
                          {typeof row.diversityScore === 'number' ? ` · 다양성 ${row.diversityScore}` : ''}
                        </div>
                      </div>
                      <span className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-bold text-amber-700">
                        {row.fairnessScore}점
                      </span>
                    </div>
                    <div className="mt-2 text-[12px] font-semibold text-[var(--toss-gray-3)]">{row.note}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {snapshotComparison ? (
            <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] p-4">
              <h6 className="text-sm font-bold text-[var(--foreground)]">최근 스냅샷 비교</h6>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-3">
                  <div className="text-[11px] font-semibold text-[var(--toss-gray-3)]">변경 셀</div>
                  <div className="mt-1 text-base font-bold text-[var(--foreground)]">
                    {snapshotComparison.changedCellCount}건
                  </div>
                </div>
                <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-3">
                  <div className="text-[11px] font-semibold text-[var(--toss-gray-3)]">영향 직원</div>
                  <div className="mt-1 text-base font-bold text-[var(--foreground)]">
                    {snapshotComparison.changedStaffCount}명
                  </div>
                </div>
                <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-3">
                  <div className="text-[11px] font-semibold text-[var(--toss-gray-3)]">변경 날짜</div>
                  <div className="mt-1 text-base font-bold text-[var(--foreground)]">
                    {snapshotComparison.changedDateCount}일
                  </div>
                </div>
              </div>
              {snapshotComparison.changedStaffPreview.length > 0 ? (
                <div className="mt-3 text-[12px] font-semibold text-[var(--toss-gray-3)]">
                  주요 변경 직원: {snapshotComparison.changedStaffPreview.join(', ')}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
