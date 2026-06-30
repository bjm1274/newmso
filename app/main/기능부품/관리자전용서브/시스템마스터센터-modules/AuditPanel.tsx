import type { SystemMasterAuditLog } from './types';
import { formatDateTime, prettyJson } from './utils';

type AuditPanelProps = {
  auditCategory: string;
  setAuditCategory: (value: string) => void;
  auditKeyword: string;
  setAuditKeyword: (value: string) => void;
  onSearch: () => void;
  auditLogs: SystemMasterAuditLog[];
  loading: boolean;
};

export function AuditPanel({
  auditCategory,
  setAuditCategory,
  auditKeyword,
  setAuditKeyword,
  onSearch,
  auditLogs,
  loading }: AuditPanelProps) {
  return (
    <section className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
      <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)_auto]">
        <select
          value={auditCategory}
          onChange={(event) => setAuditCategory(event.target.value)}
          className="h-11 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 text-sm font-semibold text-[var(--foreground)]"
        >
          <option value="all">전체 카테고리</option>
          <option value="staff">직원 / 민감정보</option>
          <option value="payroll">급여 / 정산</option>
          <option value="chat">채팅 / 메시지</option>
          <option value="general">기타</option>
        </select>
        <input
          value={auditKeyword}
          onChange={(event) => setAuditKeyword(event.target.value)}
          placeholder="직원명, 액션, 변경 필드로 검색"
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

      <div className="mt-5 space-y-4">
        {auditLogs.length === 0 && !loading && (
          <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] px-4 py-10 text-center text-sm text-[var(--toss-gray-3)]">
            조회된 변경 이력이 없습니다.
          </div>
        )}

        {auditLogs.map((log) => (
          <article key={log.id} className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--page-bg)] p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-[var(--radius-md)] bg-[var(--toss-blue-light)] px-2.5 py-1 text-[10px] font-bold text-[var(--accent)]">{log.action}</span>
                  <span className="rounded-[var(--radius-md)] bg-[var(--card)] px-2.5 py-1 text-[10px] font-bold text-[var(--toss-gray-4)]">{log.category}</span>
                </div>
                <h4 className="mt-3 text-sm font-bold text-[var(--foreground)]">{log.target_label}</h4>
                <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">
                  실행자 {log.actor_label || '-'} · {formatDateTime(log.created_at)}
                </p>
                {(log.changed_fields?.length ?? 0) > 0 && (
                  <p className="mt-2 text-[11px] font-semibold text-[var(--foreground)]">
                    변경 필드: {log.changed_fields?.join(', ')}
                  </p>
                )}
              </div>
              <div className="max-w-full lg:max-w-[420px]">
                <details className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 py-3">
                  <summary className="cursor-pointer text-[11px] font-bold text-[var(--foreground)]">세부 내역 보기</summary>
                  <pre className="mt-3 max-h-[260px] overflow-auto whitespace-pre-wrap break-all text-[11px] text-[var(--toss-gray-4)]">
                    {prettyJson(log.details)}
                  </pre>
                </details>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
