import type { SystemMasterIntegrityPayload } from './types';
import { formatDateTime } from './utils';

type IntegrityPanelProps = {
  integrityReport: SystemMasterIntegrityPayload | null;
  onReload: () => void;
};

export function IntegrityPanel({ integrityReport, onReload }: IntegrityPanelProps) {
  return (
    <section className="space-y-4">
      <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-[var(--foreground)]">DB 정합성 점검 도구</h3>
            <p className="mt-1 text-xs text-[var(--toss-gray-3)]">
              마지막 점검 시각: {formatDateTime(integrityReport?.checkedAt)}
            </p>
          </div>
          <button
            type="button"
            onClick={onReload}
            className="rounded-[var(--radius-md)] border border-[var(--border)] px-4 py-2 text-[11px] font-bold text-[var(--foreground)] hover:bg-[var(--muted)]"
          >
            다시 점검
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {(integrityReport?.issues || []).map((issue) => (
          <article
            key={issue.id}
            className={`rounded-[var(--radius-xl)] border p-5 shadow-sm ${
              issue.severity === 'critical'
                ? 'border-red-500/20 bg-red-500/10'
                : issue.severity === 'warning'
                  ? 'border-warning/20 bg-warning/10'
                  : 'border-[var(--border)] bg-[var(--card)]'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold text-[var(--foreground)]">{issue.title}</h4>
                <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">{issue.description}</p>
              </div>
              <span className="rounded-[var(--radius-md)] bg-[var(--card)] px-2.5 py-1 text-[10px] font-bold text-[var(--toss-gray-4)]">
                {Number(issue.count || 0).toLocaleString('ko-KR')}건
              </span>
            </div>
            {Array.isArray(issue.samples) && issue.samples.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {issue.samples.map((sample: string, index: number) => (
                  <span key={`${issue.id}-${index}`} className="rounded-full bg-[var(--page-bg)] px-2.5 py-1 text-[10px] font-semibold text-[var(--toss-gray-4)]">
                    {sample}
                  </span>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
