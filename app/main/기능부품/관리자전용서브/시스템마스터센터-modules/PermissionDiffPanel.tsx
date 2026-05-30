import type { SystemMasterPermissionDiffLog } from './types';
import { formatDateTime, prettyJson } from './utils';

type PermissionDiffPanelProps = {
  auditKeyword: string;
  setAuditKeyword: (value: string) => void;
  onSearch: () => void;
  permissionDiffLogs: SystemMasterPermissionDiffLog[];
  loading: boolean;
};

export function PermissionDiffPanel({
  auditKeyword,
  setAuditKeyword,
  onSearch,
  permissionDiffLogs,
  loading,
}: PermissionDiffPanelProps) {
  return (
    <section className="space-y-4">
      <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <input
            value={auditKeyword}
            onChange={(event) => setAuditKeyword(event.target.value)}
            placeholder="직원명, 역할, 권한 키로 검색"
            className="h-11 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 text-sm font-medium text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
          />
          <button
            type="button"
            onClick={onSearch}
            className="h-11 rounded-[var(--radius-lg)] bg-[var(--accent)] px-5 text-sm font-bold text-white"
          >
            조회
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {permissionDiffLogs.length === 0 && !loading && (
          <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] px-4 py-10 text-center text-sm text-[var(--toss-gray-3)]">
            조회된 권한 변경 이력이 없습니다.
          </div>
        )}

        {permissionDiffLogs.map((log) => (
          <article key={log.id} className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-[var(--radius-md)] bg-[var(--toss-blue-light)] px-2.5 py-1 text-[10px] font-bold text-[var(--accent)]">{log.target_label}</span>
                  <span className="rounded-[var(--radius-md)] bg-[var(--muted)] px-2.5 py-1 text-[10px] font-bold text-[var(--toss-gray-4)]">{log.actor_label || '-'}</span>
                </div>
                <p className="mt-3 text-[11px] text-[var(--toss-gray-3)]">{formatDateTime(log.created_at)}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(log.permission_summary?.enabled || []).map((key: string) => (
                    <span key={`on-${key}`} className="rounded-full bg-success/20 px-2.5 py-1 text-[10px] font-bold text-success">+ {key}</span>
                  ))}
                  {(log.permission_summary?.disabled || []).map((key: string) => (
                    <span key={`off-${key}`} className="rounded-full bg-danger/20 px-2.5 py-1 text-[10px] font-bold text-danger">- {key}</span>
                  ))}
                </div>
                {(log.permission_summary?.beforeRole || log.permission_summary?.afterRole) && (
                  <p className="mt-3 text-[11px] text-[var(--toss-gray-3)]">
                    역할: {log.permission_summary?.beforeRole || '-'} → {log.permission_summary?.afterRole || '-'}
                  </p>
                )}
              </div>
              <details className="w-full rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--page-bg)] px-4 py-3 xl:max-w-[460px]">
                <summary className="cursor-pointer text-[11px] font-bold text-[var(--foreground)]">세부 diff 보기</summary>
                <pre className="mt-3 max-h-[260px] overflow-auto whitespace-pre-wrap break-all text-[11px] text-[var(--toss-gray-4)]">{prettyJson(log.details)}</pre>
              </details>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
