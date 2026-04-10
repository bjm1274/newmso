import type { StoredRosterSnapshot } from '@/lib/roster-snapshot-history';

type RosterSnapshotComparison = {
  changedCellCount: number;
  changedStaffCount: number;
  changedDateCount: number;
  changedStaffPreview: string[];
};

type RosterSnapshotPanelProps<TRecommendation = unknown> = {
  snapshots: StoredRosterSnapshot<TRecommendation>[];
  selectedSnapshotId: string;
  selectedSnapshot: StoredRosterSnapshot<TRecommendation> | null;
  comparison: RosterSnapshotComparison | null;
  onSelectSnapshot: (snapshotId: string) => void;
  onRestoreSnapshot: (snapshot: StoredRosterSnapshot<TRecommendation>) => void;
};

export default function RosterSnapshotPanel<TRecommendation = unknown>({
  snapshots,
  selectedSnapshotId,
  selectedSnapshot,
  comparison,
  onSelectSnapshot,
  onRestoreSnapshot,
}: RosterSnapshotPanelProps<TRecommendation>) {
  return (
    <div className="mt-4 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h5 className="text-base font-bold text-[var(--foreground)]">
            {'\uC0DD\uC131 \uC804\uD6C4 \uBE44\uAD50 \u00B7 \uC218\uC815 \uC774\uB825'}
          </h5>
          <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
            {
              '\uCD5C\uADFC \uC0DD\uC131\uBCF8\uACFC \uC800\uC7A5\uBCF8\uC744 \uBE44\uAD50\uD558\uACE0 \uD604\uC7AC \uCD08\uC548\uACFC \uCC28\uC774\uB97C \uBE60\uB974\uAC8C \uD655\uC778\uD569\uB2C8\uB2E4.'
            }
          </p>
        </div>
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-[11px] font-semibold text-[var(--toss-gray-4)]">
          {'\uCD5C\uADFC \uC774\uB825 '}
          {snapshots.length}
          {'\uAC74'}
        </div>
      </div>

      {snapshots.length === 0 ? (
        <div className="mt-4 rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--muted)] px-4 py-3 text-sm text-[var(--toss-gray-3)]">
          {
            '\uC544\uC9C1 \uC800\uC7A5\uB41C \uADFC\uBB34\uD45C \uC774\uB825\uC774 \uC5C6\uC2B5\uB2C8\uB2E4. \uC790\uB3D9 \uC0DD\uC131 \uB610\uB294 \uC800\uC7A5 \uD6C4 \uCD5C\uADFC \uAE30\uB85D\uC774 \uC774\uACF3\uC5D0 \uC313\uC785\uB2C8\uB2E4.'
          }
        </div>
      ) : (
        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(260px,0.9fr)_minmax(0,1.1fr)]">
          <div className="space-y-2">
            {snapshots.map((snapshot) => (
              <button
                key={snapshot.id}
                type="button"
                onClick={() => onSelectSnapshot(snapshot.id)}
                className={`w-full rounded-[var(--radius-lg)] border px-4 py-3 text-left transition-colors ${
                  snapshot.id === selectedSnapshotId
                    ? 'border-[var(--accent)] bg-blue-500/10'
                    : 'border-[var(--border)] bg-[var(--muted)] hover:border-[var(--accent)]/40'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-[var(--foreground)]">{snapshot.label}</div>
                    <div className="mt-1 text-[11px] text-[var(--toss-gray-3)]">
                      {new Date(snapshot.createdAt).toLocaleString('ko-KR')}
                    </div>
                  </div>
                  <span className="rounded-full border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-[10px] font-semibold text-[var(--toss-gray-4)]">
                    {snapshot.source === 'saved'
                      ? '\uC800\uC7A5\uBCF8'
                      : '\uC0DD\uC131\uBCF8'}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[var(--toss-gray-4)]">
                  <span>
                    {snapshot.summary.staffCount}
                    {'\uBA85'}
                  </span>
                  <span>
                    {'\uC218\uC815 '}
                    {snapshot.summary.manualCount}
                    {'\uAC74'}
                  </span>
                  <span>
                    {'\uACBD\uACE0 '}
                    {snapshot.summary.warningCount}
                    {'\uAC74'}
                  </span>
                </div>
              </button>
            ))}
          </div>

          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] p-4">
            {!selectedSnapshot ? (
              <div className="text-sm text-[var(--toss-gray-3)]">
                {'\uBE44\uAD50\uD560 \uC774\uB825\uC744 \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.'}
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="text-sm font-bold text-[var(--foreground)]">
                      {selectedSnapshot.label}
                    </div>
                    <div className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
                      {selectedSnapshot.month}
                      {' \u00B7 '}
                      {selectedSnapshot.department}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRestoreSnapshot(selectedSnapshot)}
                    className="rounded-[var(--radius-md)] border border-[var(--accent)] bg-[var(--card)] px-3 py-2 text-xs font-bold text-[var(--accent)]"
                  >
                    {'\uC774 \uC774\uB825\uC73C\uB85C \uB418\uB3CC\uB9AC\uAE30'}
                  </button>
                </div>

                {comparison ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-4 py-3">
                      <div className="text-[11px] font-semibold text-[var(--toss-gray-3)]">
                        {'\uBCC0\uACBD\uB41C \uC140'}
                      </div>
                      <div className="mt-1 text-lg font-bold text-[var(--foreground)]">
                        {comparison.changedCellCount}
                        {'\uAC74'}
                      </div>
                    </div>
                    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-4 py-3">
                      <div className="text-[11px] font-semibold text-[var(--toss-gray-3)]">
                        {'\uC601\uD5A5 \uC9C1\uC6D0'}
                      </div>
                      <div className="mt-1 text-lg font-bold text-[var(--foreground)]">
                        {comparison.changedStaffCount}
                        {'\uBA85'}
                      </div>
                    </div>
                    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-4 py-3">
                      <div className="text-[11px] font-semibold text-[var(--toss-gray-3)]">
                        {'\uBCC0\uACBD \uB0A0\uC9DC'}
                      </div>
                      <div className="mt-1 text-lg font-bold text-[var(--foreground)]">
                        {comparison.changedDateCount}
                        {'\uC77C'}
                      </div>
                    </div>
                  </div>
                ) : null}

                {comparison?.changedStaffPreview?.length ? (
                  <div className="mt-3 text-[12px] text-[var(--toss-gray-3)]">
                    {'\uC8FC\uC694 \uBCC0\uACBD \uC9C1\uC6D0: '}
                    {comparison.changedStaffPreview.join(', ')}
                  </div>
                ) : (
                  <div className="mt-3 text-[12px] text-[var(--toss-gray-3)]">
                    {
                      '\uD604\uC7AC \uCD08\uC548\uACFC \uC120\uD0DD\uD55C \uC774\uB825\uC774 \uB3D9\uC77C\uD558\uAC70\uB098 \uC544\uC9C1 \uBE44\uAD50\uD560 \uCD08\uC548\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.'
                    }
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
